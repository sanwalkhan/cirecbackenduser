import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const searchDatabaseOptions: RouteOptions = {
  description: "Search Articles Database",
  tags: ["api", "Search"],
  notes: "Handles article search with full-text and keyword matching",
  validate: {
    query: Joi.object({
      key: Joi.string().required(),
      page: Joi.number().optional().default(1),
      pageSize: Joi.number().optional().default(5), // Added pageSize as a query parameter
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
    const { key: findWord, page = 1, pageSize = 5, cb1 = false } = request.query;

    try {
      const sanitizedWord = findWord.replace(/[&<>"']/g, "");
      const offset = (Number(page) - 1) * pageSize;

      // Unified query with total count and pagination
      const searchQuery = `
        WITH RankedArticles AS (
          SELECT 
            ar_id, 
            ar_title, 
            ar_datetime,
            ${cb1 ? 'KEY_TBL.RANK,' : ''}
            ROW_NUMBER() OVER (ORDER BY ${cb1 ? 'KEY_TBL.RANK DESC' : 'ar_datetime DESC'}) AS RowNum,
            COUNT(*) OVER() AS TotalCount
          FROM and_cirec.cr_articles AS FT_TBL 
          ${cb1 ? `
            INNER JOIN CONTAINSTABLE(and_cirec.cr_articles, (ar_title, ar_content), @keyword) AS KEY_TBL 
            ON FT_TBL.ar_id = KEY_TBL.[KEY]
          ` : 'WHERE ar_title LIKE @keyword OR ar_content LIKE @keyword'}
        )
        SELECT ar_id, ar_title, ar_datetime${cb1 ? ', RANK' : ''}, TotalCount
        FROM RankedArticles
        WHERE RowNum BETWEEN @offset + 1 AND @offset + @pageSize
      `;

      const articlesResult = await executeQuery(searchQuery, {
        keyword: cb1 ? `"${sanitizedWord}"` : `%${sanitizedWord}%`,
        offset,
        pageSize,
      });

      const totalArticles = articlesResult.recordset[0]?.TotalCount || 0;

      // Check for suggested keywords
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

        // Insert the keyword for tracking if not exists
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

      return h
        .response({
          success: totalArticles > 0,
          totalArticles,
          articles: articlesResult.recordset.map(({ TotalCount, ...article }) => article), // Exclude TotalCount from the response
          pagination: {
            currentPage: Number(page),
            totalPages: Math.ceil(totalArticles / pageSize),
            pageSize: Number(pageSize),
          },
          suggestedKeyword,
        })
        .code(totalArticles > 0 ? 200 : 404);
    } catch (error) {
      logger.error("search-route", `Search process failed: ${error}`);
      return h
        .response({
          success: false,
          message: "Search process failed",
        })
        .code(500);
    }
  },
};

