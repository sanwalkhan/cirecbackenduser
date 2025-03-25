import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";
import NodeCache from 'node-cache';

// Initialize cache
const searchResultsCache = new NodeCache({ 
  stdTTL: 300, // 5 minutes cache
  checkperiod: 320 
});

export const searchDatabaseOptions: RouteOptions = {
  description: "Search Articles Database",
  tags: ["api", "Search"],
  notes: "Handles article search with full-text and keyword matching",
  validate: {
    query: Joi.object({
      key: Joi.string().required(),
      page: Joi.number().optional().default(1),
      pageSize: Joi.number().optional().default(20),
      cb1: Joi.boolean().optional().default(false),
    }),
  },
  plugins: {
    "hapi-swagger": {
      order: 3,
    },
  },
  response: {
    schema: Joi.object({
      success: Joi.boolean(),
      totalArticles: Joi.number(),
      articles: Joi.array().items(
        Joi.object({
          ar_id: Joi.number(),
          ar_title: Joi.string(),
          ar_datetime: Joi.date(),
          ar_content: Joi.string().optional(),
          rank: Joi.number().optional(),
        })
      ),
      pagination: Joi.object({
        currentPage: Joi.number(),
        totalPages: Joi.number(),
        pageSize: Joi.number(),
      }).optional(),
      suggestedKeyword: Joi.string().optional().allow(null),
    }),
  },
  handler: async (request, h) => {
    const { key: findWord, page = 1, pageSize = 20, cb1 = false } = request.query;

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
            pageSize: 20
          }
        }).code(400);
      }

      // Create a unique cache key
      const cacheKey = `search:${findWord}:${page}:${pageSize}:${cb1}`;
      
      // Check cache first
      const cachedResult = searchResultsCache.get(cacheKey);
      if (cachedResult) {
        return h.response(cachedResult).code(200);
      }

      const sanitizedWord = findWord.replace(/[&<>"']/g, "");
      const offset = (Number(page) - 1) * pageSize;

      // Optimized search query with performance improvements
      const searchQuery = `
        WITH RankedArticles AS (
          SELECT 
            ar_id, 
            ar_title, 
            ar_datetime,
            ar_content, 
            ${cb1 ? 'KEY_TBL.RANK,' : ''}
            ROW_NUMBER() OVER (ORDER BY ${cb1 ? 'KEY_TBL.RANK DESC' : 'ar_datetime DESC'}) AS RowNum,
            COUNT(*) OVER() AS TotalCount
          FROM and_cirec.cr_articles WITH (NOLOCK) 
          ${cb1 ? `
            INNER JOIN CONTAINSTABLE(and_cirec.cr_articles, (ar_title, ar_content), @keyword) AS KEY_TBL 
            ON FT_TBL.ar_id = KEY_TBL.[KEY]
            OPTION (RECOMPILE)
          ` : 'WHERE ar_title LIKE @keyword OR ar_content LIKE @keyword'}
        )
        SELECT TOP (@pageSize) ar_id, ar_title, ar_datetime, ar_content, 
               ${cb1 ? 'RANK,' : ''} TotalCount
        FROM RankedArticles
        WHERE RowNum BETWEEN @offset + 1 AND @offset + @pageSize
        OPTION (MAXDOP 2)
      `;

      // Execute query
      const articlesResult = await executeQuery(searchQuery, {
        keyword: cb1 ? `"${sanitizedWord}"` : `%${sanitizedWord}%`,
        offset,
        pageSize,
      });

      const totalArticles = articlesResult.recordset[0]?.TotalCount || 0;

      // Check for suggested keywords if no results
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

        // Insert new keyword for tracking
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

      // Prepare response data
      const responseData = {
        success: totalArticles > 0,
        totalArticles,
        articles: articlesResult.recordset.map(({ TotalCount, ...article }) => article),
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(totalArticles / pageSize),
          pageSize: Number(pageSize),
        },
        suggestedKeyword,
      };

      // Cache the result
      searchResultsCache.set(cacheKey, responseData);

      // Return response
      return h
        .response(responseData)
        .code(totalArticles > 0 ? 200 : 404);

    } catch (error) {
      // Error handling with detailed logging
      logger.error("search-route", `Search process failed: ${error}`);
      return h
        .response({
          success: false,
          message: "Search process failed",
          articles: [],
          totalArticles: 0,
          pagination: {
            currentPage: 1,
            totalPages: 0,
            pageSize: 20
          }
        })
        .code(500);
    }
  },
};

export default searchDatabaseOptions;