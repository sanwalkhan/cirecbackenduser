import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";
import NodeCache from "node-cache";

// Implement a more aggressive caching strategy
const searchResultCache = new NodeCache({ 
  stdTTL: 3600, // 1-hour cache
  checkperiod: 300, // Check for expired keys every 5 minutes
  maxKeys: 1000 // Limit total cached items
});

export const searchDatabaseOptions: RouteOptions = {
  description: "Optimized Articles Search",
  tags: ["api", "Search"],
  notes: "Ultra-fast article search with minimal latency",
  validate: {
    query: Joi.object({
      key: Joi.string().required().min(2).max(100),
      page: Joi.number().optional().default(1).min(1).max(50),
      pageSize: Joi.number().optional().default(20).max(50),
      cb1: Joi.boolean().optional().default(false),
    }),
  },
  handler: async (request, h) => {
    const { 
      key: findWord, 
      page = 1, 
      pageSize = 20, 
      cb1 = false 
    } = request.query;

    // Aggressive early validation
    if (!findWord || findWord.trim().length < 2) {
      return h.response({
        success: false,
        message: "Search term too short",
        articles: [],
        totalArticles: 0,
        pagination: {
          currentPage: 1,
          totalPages: 0,
          pageSize: 20
        }
      }).code(400);
    }

    // Generate cache key
    const cacheKey = `search:${findWord.toLowerCase()}:${page}:${pageSize}:${cb1}`;
    
    // Check cache first
    const cachedResult = searchResultCache.get(cacheKey);
    if (cachedResult) {
      return h.response(cachedResult).code(200);
    }

    try {
      // Sanitize and prepare search input
      const sanitizedWord = findWord.replace(/[&<>"']/g, "").trim();
      const offset = (Number(page) - 1) * pageSize;

      // Optimized search query with strict timeout and performance hints
      const searchQuery = `
        WITH RankedResults AS (
          SELECT 
            ar_id,
            ar_title,
            ar_datetime,
            SUBSTRING(ar_content, 1, 1000) as ar_content, -- Limit content length to reduce data transfer
            ar_year,
            ar_month,
            ROW_NUMBER() OVER (
              ORDER BY 
                CASE 
                  WHEN ar_title LIKE @exactMatch THEN 1 
                  WHEN ar_title LIKE @partialMatch THEN 2 
                  ELSE 3 
                END, 
              ar_datetime DESC
            ) AS RowNum,
            COUNT(*) OVER () AS TotalCount
          FROM and_cirec.cr_articles
          WHERE 
            ar_title LIKE @partialMatch OR 
            ar_content LIKE @partialMatch
        )
        SELECT 
          ar_id,
          ar_title,
          ar_datetime,
          ar_content,
          ar_year,
          ar_month,
          TotalCount AS total_articles
        FROM RankedResults
        WHERE RowNum BETWEEN @offset + 1 AND @offset + @pageSize
        OPTION (MAXDOP 2, OPTIMIZE FOR UNKNOWN)
      `;

      // Execute query with explicit timeout
      const result = await executeQuery(searchQuery, {
        exactMatch: `%${sanitizedWord}%`,
        partialMatch: `%${sanitizedWord}%`,
        offset: offset,
        pageSize: pageSize
      }); // Removed timeout argument

      // Process results
      const articles = result.recordset || [];
      const totalArticles = articles.length > 0 ? articles[0].total_articles : 0;

      const responseData = {
        success: totalArticles > 0,
        totalArticles,
        articles: articles.map(a => ({
          ar_id: a.ar_id,
          ar_title: a.ar_title,
          ar_datetime: a.ar_datetime,
          ar_content: a.ar_content,
          ar_year: a.ar_year,
          ar_month: a.ar_month
        })),
        pagination: {
          currentPage: Number(page),
          totalPages: Math.ceil(totalArticles / pageSize),
          pageSize: Number(pageSize)
        },
        message: totalArticles > 0 
          ? `Found ${totalArticles} Articles` 
          : `No records found for: '${findWord}'`
      };

      // Cache successful result
      searchResultCache.set(cacheKey, responseData);

      return h.response(responseData).code(200);

    } catch (error) {
      // Check specifically for timeout errors
      const isTimeout = error instanceof Error && (
        error.message.includes('timeout') || 
        error.message.includes('timed out') ||
        error.message.includes('exceeded') ||
        error.message.includes('connection')
      );
      
      // Detailed error logging
      logger.error("search-route", `Search Error: ${JSON.stringify(error)}`);

      return h.response({
        success: false,
        message: isTimeout 
          ? "Search timed out. Please refine your search criteria." 
          : "Search failed",
        articles: [],
        totalArticles: 0,
        pagination: {
          currentPage: 1,
          totalPages: 0,
          pageSize: 20
        },
        errorDetails: (error instanceof Error ? error.toString() : String(error))
      }).code(isTimeout ? 408 : 500);
    }
  }
};

export default searchDatabaseOptions;