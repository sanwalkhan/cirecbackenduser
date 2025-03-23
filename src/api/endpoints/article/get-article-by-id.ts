import { ResponseToolkit, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const getArticleByIdOptions: RouteOptions = {
  description: "Retrieve Article Details",
  tags: ["api", "Articles"],
  notes: "Fetches article content with authentication check",
  validate: {
    query: Joi.object({
      ar: Joi.number().required(), // Article ID
      url: Joi.string().optional(), // Optional redirect URL
    }),
  },
  plugins: {
    "hapi-swagger": {
      order: 4,
    },
  },
  response: {
    schema: Joi.object({
      success: Joi.boolean(),
      article: Joi.object({
        id: Joi.number(),
        title: Joi.string(),
        issueNumber: Joi.number(),
        content: Joi.string(),
        postedDate: Joi.date(),
        formattedDate: Joi.string(),
      }).optional(),
      message: Joi.string().optional(),
      redirectUrl: Joi.string().optional(),
    }),
  },
  handler: async (request, h: ResponseToolkit) => {
    //@todo work on the authentication either using jwt or session cookies
    // Authenticate session
    const session = request.auth.credentials as {
      CRAUTHLOGGED?: string;
      CRAUTHSEA?: string;
    } | null;

    //@todo uncomment when session is set and up
    // // Check if user is logged in
    // if (!session?.CRAUTHLOGGED) {
    //   // Return redirect information instead of using h.redirect
    //   return h
    //     .response({
    //       success: false,
    //       redirectUrl: `/login?url=article?ar=${request.query.ar}`,
    //       message: "Authentication required",
    //     })
    //     .code(401);
    // }

    // // Check search access permission
    // if (session.CRAUTHSEA !== "YES") {
    //   //@todo work on error page
    //   // Return redirect information for error page
    //   return h
    //     .response({
    //       success: false,
    //       redirectUrl: "/error?er=2",
    //       message: "Insufficient permissions",
    //     })
    //     .code(403);
    // }

    try {
      // Validate and parse article ID
      const articleId = request.query.ar;

      // Fetch article details
      const articleQuery = `
        SELECT 
          ar_id, 
          ar_issueno, 
          ar_title, 
          ar_content, 
          ar_year, 
          ar_month,
          ar_datetime
        FROM and_cirec.cr_articles 
        WHERE ar_id = @articleId
      `;

      const result = await executeQuery(articleQuery, { articleId });

      // Check if article exists
      if (result.recordset.length === 0) {
        return h
          .response({
            success: false,
            message: "File not found at Server.",
          })
          .code(404);
      }

      // Extract article details
      const article = result.recordset[0];
      const postedDate = new Date(article.ar_datetime);
      const formattedDate = `issue ${article.ar_issue} Posted ${postedDate.toLocaleString("default", {
        month: "long",
      })} ${article.ar_year}`;

      return h
        .response({
          success: true,
          article: {
            id: article.ar_id,
            title: article.ar_title,
            issueNumber: article.ar_issueno,
            content: article.ar_content,
            postedDate: article.ar_datetime,
            formattedDate: formattedDate,
          },
        })
        .code(200);
    } catch (error) {
      logger.error("article-route", `Article retrieval failed: ${error}`);
      return h
        .response({
          success: false,
          message: "Error retrieving article",
        })
        .code(500);
    }
  },
};
