import { ResponseToolkit, RouteOptions } from "@hapi/hapi";
import { DateTime } from "luxon";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const getMonthlyNewsOptions: RouteOptions = {
  description: "Retrieve Monthly News for Two Columns",
  tags: ["api", "News"],
  notes: "Fetches news data grouped by year for two different news tables",
  validate: {
    // No query parameters needed
  },
  plugins: {
    "hapi-swagger": {
      order: 6,
    },
  },
  //@todo response schema validation
  //   response: {
  //     schema: Joi.object({
  //       success: Joi.boolean().required(),
  //       pageContent: Joi.string().optional(),
  //       column1: Joi.array()
  //         .items(
  //           Joi.object({
  //             year: Joi.string().required(),
  //             minIssue: Joi.number().required(),
  //             maxIssue: Joi.number().required(),
  //             newsItems: Joi.array().items(
  //               Joi.object({
  //                 id: Joi.number().required(),
  //                 year: Joi.string().required(),
  //                 issueNo: Joi.number().required(),
  //                 month: Joi.string().required(),
  //                 datetime: Joi.date().required(),
  //               })
  //             ),
  //           })
  //         )
  //         .required(),
  //       column2: Joi.array()
  //         .items(
  //           Joi.object({
  //             year: Joi.string().required(),
  //             minIssue: Joi.number().required(),
  //             maxIssue: Joi.number().required(),
  //             newsItems: Joi.array().items(
  //               Joi.object({
  //                 id: Joi.number().required(),
  //                 year: Joi.string().required(),
  //                 issueNo: Joi.number().required(),
  //                 month: Joi.string().required(),
  //                 datetime: Joi.date().required(),
  //               })
  //             ),
  //           })
  //         )
  //         .required(),
  //     }),
  //   },
  handler: async (request, h: ResponseToolkit) => {
    try {
      // Fetch page content
      const pageContentQuery = `
        SELECT pgc_content 
        FROM dbo.cr_pagecontent 
        WHERE pg_id = '3'
      `;
      const pageContentResult = await executeQuery(pageContentQuery, {});
      const pageContent = pageContentResult.recordset.length > 0 ? pageContentResult.recordset[0].pgc_content : "";

      // Query for column 1 news
      const column1Query = `
        SELECT nw_year,
               MAX(nw_issue_no) as maxisno,
               MIN(nw_issue_no) as minisno 
        FROM dbo.cr_news 
        GROUP BY nw_year 
        ORDER BY nw_year DESC
      `;
      const column1Result = await executeQuery(column1Query, {});

      // Prepare column 1 data
      const column1Data = await Promise.all(
        column1Result.recordset.map(async (yearRow) => {
          const newsQuery = `
          SELECT nw_year, nw_id, nw_datetime, nw_issue_no 
          FROM dbo.cr_news 
          WHERE nw_year = @year 
          ORDER BY nw_issue_no
        `;
          const newsResult = await executeQuery(newsQuery, { year: yearRow.nw_year });

          return {
            year: yearRow.nw_year,
            minIssue: yearRow.minisno,
            maxIssue: yearRow.maxisno,
            newsItems: newsResult.recordset.map((news) => ({
              id: news.nw_id,
              year: news.nw_year,
              issueNo: news.nw_issue_no,
              month: DateTime.fromISO(news.nw_datetime).toFormat("MMMM"),
              datetime: news.nw_datetime,
            })),
          };
        })
      );

      // Query for column 2 news
      const column2Query = `
        SELECT nw_year,
               MAX(nw_issue_no) as maxisno,
               MIN(nw_issue_no) as minisno 
        FROM dbo.cr_news2
        GROUP BY nw_year 
        ORDER BY nw_year DESC
      `;
      const column2Result = await executeQuery(column2Query, {});

      // Prepare column 2 data
      const column2Data = await Promise.all(
        column2Result.recordset.map(async (yearRow) => {
          const newsQuery = `
          SELECT nw_year, nw_id, nw_datetime, nw_issue_no 
          FROM dbo.cr_news2 
          WHERE nw_year = @year 
          ORDER BY nw_issue_no
        `;
          const newsResult = await executeQuery(newsQuery, { year: yearRow.nw_year });

          return {
            year: yearRow.nw_year,
            minIssue: yearRow.minisno,
            maxIssue: yearRow.maxisno,
            newsItems: newsResult.recordset.map((news) => ({
              id: news.nw_id,
              year: news.nw_year,
              issueNo: news.nw_issue_no,
              month: DateTime.fromISO(news.nw_datetime).toFormat("MMMM"),
              datetime: news.nw_datetime,
            })),
          };
        })
      );

      return h
        .response({
          success: true,
          pageContent: pageContent,
          column1: column1Data,
          column2: column2Data,
        })
        .code(200);
    } catch (error) {
      logger.error("monthly-news-route", `News retrieval failed: ${error}`);
      return h
        .response({
          success: false,
          message: "Error retrieving monthly news",
        })
        .code(500);
    }
  },
};
