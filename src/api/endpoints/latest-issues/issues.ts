import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const getLatestIssuesOptions: RouteOptions = {
  description: "Retrieve Latest News Issue",
  tags: ["api", "Latest Issues"],
  notes: "Fetches news issue for a specific month and year",
  validate: {
    query: Joi.object({
      m: Joi.string()
        .pattern(/^(0[1-9]|1[0-2])$/)
        .optional()
        .default(() => {
          const currentDate = new Date();
          return (currentDate.getMonth() + 1).toString().padStart(2, "0");
        }), // Month (01-12)
      y: Joi.string()
        .pattern(/^\d{4}$/)
        .optional()
        .default(() => {
          const currentDate = new Date();
          return currentDate.getFullYear().toString();
        }), // Year (4 digits)
    }),
  },
  handler: async (request, h) => {
    // Determine month and year
    const currentDate = new Date();
    const month = request.query.m || (currentDate.getMonth() + 1).toString().padStart(2, "0");
    const year = request.query.y || currentDate.getFullYear().toString();

    try {
      // Query to fetch issue content
      const issueQuery = `
        SELECT iss_content, iss_title 
        FROM dbo.cr_issue 
        WHERE iss_month = @month AND iss_year = @year
      `;

      const result = await executeQuery(issueQuery, {
        month: month,
        year: year,
      });

      // If no issue found
      if (result.recordset.length === 0) {
        return h
          .response({
            success: false,
            message: "No issue archived for this month",
            data: null,
          })
          .code(404);
      }

      // Return successful response
      return h
        .response({
          success: true,
          data: {
            title: result.recordset[0].iss_title,
            content: result.recordset[0].iss_content,
            pageTitle: `${result.recordset[0].iss_title} :: -Cirec-`,
          },
        })
        .code(200);
    } catch (error) {
      logger.error("latest-news-route", `Failed to fetch latest news: ${error}`);
      return h
        .response({
          success: false,
          message: "Error retrieving latest news",
          error: error instanceof Error ? error.message : String(error),
        })
        .code(500);
    }
  },
};
