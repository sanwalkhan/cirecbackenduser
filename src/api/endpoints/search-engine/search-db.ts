import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const searchDatabaseOptions: RouteOptions = {
  description: "Search Articles Database",
  tags: ["api", "Search"],
  notes: "Handles article search with full-text and keyword matching, optimized for speed",
  validate: {
    query: Joi.object({
      key: Joi.string().required(),
      page: Joi.number().optional().default(1),
      pageSize: Joi.number().optional().default(20),
      cb1: Joi.boolean().optional().default(true), // Default to full-text search
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
    const { key: findWord, page = 1, pageSize = 20, cb1 = true } = request.query;

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

      const sanitizedWord = findWord.replace(/[&<>"']/g, "");
      const offset = (Number(page) - 1) * pageSize;

      // Optimized query with reduced data retrieval
      const searchQuery = `
        WITH RankedArticles AS (
          SELECT 
            ar_id, 
            ar_title, 
            ar_datetime,
            LEFT(ar_content, 200) AS ar_content, -- Limit content length
            ${cb1 ? 'KEY_TBL.RANK,' : ''}
            ROW_NUMBER() OVER (ORDER BY ${cb1 ? 'KEY_TBL.RANK DESC' : 'ar_datetime DESC'}) AS RowNum,
            COUNT(*) OVER() AS TotalCount
          FROM and_cirec.cr_articles AS FT_TBL 
          ${cb1 ? `
            INNER JOIN CONTAINSTABLE(and_cirec.cr_articles, (ar_title, ar_content), @keyword) AS KEY_TBL 
            ON FT_TBL.ar_id = KEY_TBL.[KEY]
          ` : 'WHERE ar_title LIKE @keyword OR ar_content LIKE @keyword'}
        )
        SELECT ar_id, ar_title, ar_datetime, ar_content, ${cb1 ? 'RANK,' : ''} TotalCount
        FROM RankedArticles
        WHERE RowNum BETWEEN @offset + 1 AND @offset + @pageSize
        OPTION (RECOMPILE, FAST 20) -- Query hint for faster execution
      `;

      const articlesResult = await executeQuery(searchQuery, {
        keyword: cb1 ? `"${sanitizedWord}"` : `%${sanitizedWord}%`,
        offset,
        pageSize,
      });

      const totalArticles = articlesResult.recordset[0]?.TotalCount || 0;

      // Simplified suggested keyword logic
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

        suggestedKeyword = suggestedResult.recordset[0]?.sk_suggestedkey || null;
      }

      // Prepare response
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

      // Always return a response
      return h
        .response(responseData)
        .code(totalArticles > 0 ? 200 : 404);

    } catch (error) {
      // Simplified error handling
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