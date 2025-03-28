import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

// Interface for search result
interface SearchResult {
  ar_id: number;
  ar_title: string;
  ar_datetime: Date;
  ar_content?: string;
  rank?: number;
}

// Interface for pagination
interface PaginationInfo {
  currentPage: number;
  totalPages: number;
  pageSize: number;
  totalArticles: number;
}

// Recommended Database Indexes
/*
CREATE NONCLUSTERED INDEX IX_Articles_SearchOptimization ON and_cirec.cr_articles
(
    ar_datetime DESC,
    ar_title
)
INCLUDE (ar_id, ar_content)
WITH (ONLINE = ON, FILLFACTOR = 90);

CREATE NONCLUSTERED INDEX IX_Articles_FullTextSearch ON and_cirec.cr_articles
(
    ar_title,
    ar_content
)
WITH (ONLINE = ON, FILLFACTOR = 90);
*/

export const searchDatabaseOptions: RouteOptions = {
  description: "Search Articles Database",
  tags: ["api", "Search"],
  notes: "Handles article search with full-text and keyword matching",
  validate: {
    query: Joi.object({
      key: Joi.string().required().min(2).max(100),
      page: Joi.number().optional().default(1).min(1),
      pageSize: Joi.number().optional().default(20).min(5).max(100),
      searchType: Joi.string().optional().valid('fulltext', 'keyword').default('keyword')
    }),
  },
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  response: {
    schema: Joi.object({
      success: Joi.boolean().required(),
      totalArticles: Joi.number().required(),
      articles: Joi.array().items(
        Joi.object({
          ar_id: Joi.number().required(),
          ar_title: Joi.string().required(),
          ar_datetime: Joi.date().required(),
          ar_content: Joi.string().optional(),
          rank: Joi.number().optional(),
        })
      ),
      pagination: Joi.object({
        currentPage: Joi.number().required(),
        totalPages: Joi.number().required(),
        pageSize: Joi.number().required(),
        totalArticles: Joi.number().required(),
      }).required(),
      suggestedKeyword: Joi.string().optional().allow(null),
    }),
  },
  handler: async (request, h) => {
    const { 
      key: findWord, 
      page = 1, 
      pageSize = 20, 
      searchType = 'keyword' 
    } = request.query;

    try {
      // Validate input
      if (!findWord || findWord.trim() === '') {
        return h.response({
          success: false,
          message: "Search term is required",
          articles: [],
          totalArticles: 0,
          pagination: {
            currentPage: 1,
            totalPages: 0,
            pageSize: 20,
            totalArticles: 0
          }
        }).code(400);
      }

      // Sanitize input
      const sanitizedWord = findWord.replace(/[&<>"']/g, "");
      const offset = (Number(page) - 1) * pageSize;

      // Split the search words for more flexible matching
      const searchWords = sanitizedWord.split(/\s+/).map((word: any) => `%${word}%`);

      // Determine search query based on search type with optimized performance
      // Refactored full-text search query
const searchQuery = searchType === 'fulltext' 
? `
  WITH SearchResults AS (
    SELECT 
      FT_TBL.ar_id, 
      FT_TBL.ar_title, 
      FT_TBL.ar_datetime,
      FT_TBL.ar_content,
      KEY_TBL.RANK AS search_rank
    FROM and_cirec.cr_articles AS FT_TBL
    INNER JOIN CONTAINSTABLE(and_cirec.cr_articles, (ar_title, ar_content), @keyword) AS KEY_TBL
      ON FT_TBL.ar_id = KEY_TBL.[KEY]
  ), 
  RankedResults AS (
    SELECT 
      *, 
      ROW_NUMBER() OVER (ORDER BY search_rank DESC, ar_datetime DESC) AS RowNum,
      COUNT(*) OVER () AS TotalCount
    FROM SearchResults
  )
  SELECT 
    ar_id, 
    ar_title, 
    ar_datetime, 
    ar_content,
    search_rank,
    TotalCount
  FROM RankedResults
  WHERE RowNum BETWEEN @offset + 1 AND @offset + @pageSize;
`
: `
  WITH SearchResults AS (
    SELECT 
      ar_id, 
      ar_title, 
      ar_datetime,
      ar_content
    FROM and_cirec.cr_articles
    WHERE 
      ${searchWords.map((word: any, index: any) => `ar_title LIKE @word${index}`).join(' AND ')}
  ), 
  RankedResults AS (
    SELECT 
      *, 
      ROW_NUMBER() OVER (ORDER BY ar_datetime DESC) AS RowNum,
      COUNT(*) OVER () AS TotalCount
    FROM SearchResults
  )
  SELECT 
    ar_id, 
    ar_title, 
    ar_datetime, 
    ar_content,
    TotalCount
  FROM RankedResults
  WHERE RowNum BETWEEN @offset + 1 AND @offset + @pageSize;
`;

      // Prepare query parameters
      const queryParams: any = {
        offset,
        pageSize,
      };

      // Add each word as a parameter for keyword search
      if (searchType === 'keyword') {
        searchWords.forEach((word: any, index: any) => {
          queryParams[`word${index}`] = word;
        });
      } else {
        queryParams.keyword = `"${sanitizedWord}"`;
      }

      // Execute search query with optimized timeout
      const articlesResult = await executeQuery(searchQuery, queryParams);

      // Get total articles count
      const totalArticles = articlesResult.recordset[0]?.TotalCount || 0;

      // Check for suggested keywords if no results found
      let suggestedKeyword = null;
      if (totalArticles === 0) {
        const suggestedQuery = `
          SELECT TOP 1 sk_suggestedkey 
          FROM and_cirec.cr_searchkeyword 
          WHERE sk_userkey = @keyword 
            AND sk_display = 'True' 
            AND sk_suggestedkey != ''
        `;
        const suggestedResult = await executeQuery(suggestedQuery, {
          keyword: sanitizedWord,
        });

        if (suggestedResult.recordset.length > 0) {
          suggestedKeyword = suggestedResult.recordset[0].sk_suggestedkey;
        }

        // Log unsuccessful search keyword
        const insertQuery = `
          IF NOT EXISTS (
            SELECT 1 FROM and_cirec.cr_searchkeyword 
            WHERE sk_userkey = @keyword
          )
          BEGIN
            INSERT INTO and_cirec.cr_searchkeyword 
            (sk_id, sk_userkey, sk_suggestedkey, sk_display) 
            VALUES 
            ((SELECT ISNULL(MAX(sk_id), 0) + 1 FROM and_cirec.cr_searchkeyword), @keyword, '', 'False')
          END
        `;
        await executeQuery(insertQuery, { keyword: sanitizedWord });
      }

      // Prepare pagination info
      const pagination: PaginationInfo = {
        currentPage: Number(page),
        totalPages: Math.ceil(totalArticles / pageSize),
        pageSize: Number(pageSize),
        totalArticles
      };

      // Prepare response data
      const responseData = {
        success: totalArticles > 0,
        totalArticles,
        articles: articlesResult.recordset.map(({ TotalCount, ...article }) => ({
          ...article,
          ...(article.search_rank !== undefined && { rank: article.search_rank })
        })),
        pagination,
        suggestedKeyword,
      };

      // Return appropriate response
      return h
        .response(responseData)
        .code(totalArticles > 0 ? 200 : 404);

    } catch (error) {
      // Log and handle errors
      const err = error as Error;
      logger.error("search-route", `Search process failed: ${err.message}`);

      return h
        .response({
          success: false,
          message: "Search process failed",
          articles: [],
          totalArticles: 0,
          pagination: {
            currentPage: 1,
            totalPages: 0,
            pageSize: 20,
            totalArticles: 0
          }
        })
        .code(500);
    }
  },
};

// Products and Companies Endpoint (unchanged from original)
export const getProductsAndCompaniesOptions: RouteOptions = {
  description: "Fetch Displayed Products and Companies",
  tags: ["api", "Search"],
  validate: {
    query: Joi.object({
      limit: Joi.number().optional().default(50).min(1).max(200),
      offset: Joi.number().optional().default(0).min(0),
      type: Joi.string().optional().valid('product', 'company', 'all').default('all')
    })
  },
  handler: async (request, h) => {
    try {
      const { limit, offset, type } = request.query;

      const result = await executeQuery(
        `
        SELECT 
          pr_name AS name, 
          'product' AS type 
        FROM cr_rep_products 
        ${type !== 'company' ? 'WHERE pr_display = 1' : 'WHERE 1=0'}

        UNION

        SELECT 
          comp_name AS name, 
          'company' AS type 
        FROM cr_rep_companies 
        ${type !== 'product' ? 'WHERE comp_display = 1' : 'WHERE 1=0'}
        
        ORDER BY name
        OFFSET @offset ROWS
        FETCH NEXT @limit ROWS ONLY
        `,
        {
          limit,
          offset
        }
      );

      // Count total items for pagination
      const countQuery = 
        type === 'product' 
          ? `SELECT COUNT(*) AS total_count FROM cr_rep_products WHERE pr_display = 1`
          : type === 'company'
            ? `SELECT COUNT(*) AS total_count FROM cr_rep_companies WHERE comp_display = 1`
            : `
              SELECT 
                (SELECT COUNT(*) FROM cr_rep_products WHERE pr_display = 1) +
                (SELECT COUNT(*) FROM cr_rep_companies WHERE comp_display = 1) AS total_count
              `;

      const countResult = await executeQuery(countQuery);

      return h.response({
        success: true,
        data: result.recordset,
        total: countResult.recordset[0].total_count,
        limit,
        offset,
        type
      }).code(200);

    } catch (error) {
      logger.error("products-companies-fetch", `Fetch failed: ${error}`);
      return h.response({
        success: false,
        message: "Failed to fetch products and companies"
      }).code(500);
    }
  }
};

export default searchDatabaseOptions;