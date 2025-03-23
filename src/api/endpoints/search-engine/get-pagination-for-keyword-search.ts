// /* eslint-disable @typescript-eslint/no-explicit-any */
// import { RouteOptions } from "@hapi/hapi";
// import Joi from "joi";
// import { executeQuery } from "../../../common/db";

// // export const getPaginationForKeywordSearchOptions: RouteOptions = {
// //   description: "Pagination for Keywords Search",
// //   tags: ["api", "Search Database"],
// //   notes: "Returns Pagination Details For Database Keayword Search",
// //   plugins: {
// //     "hapi-swagger": {
// //       order: 1,
// //     },
// //   },
// //   validate: {
// //     query: Joi.object({
// //       keywords: Joi.string().required().description("Keywords to look in db separated by spaces"),
// //       page: Joi.number().min(1).default(1),
// //       enableAdvanceSearch: Joi.string()
// //         .optional()
// //         .valid("true", "false")
// //         .description("Advance search to search words in descriptions too"), //option to enable advanced search results eg; search in descriptions too
// //     }),
// //   },
// //   response: {
// //     //@todo define return type schema here
// //     schema: Joi.object().unknown(),
// //   },
// //   handler: async (request, h) => {
// //     const { keywords, page = 1, enableAdvanceSearch } = request.query;
// //     const words = keywords.split(" ");

// //     try {
// //       // Build the base count query
// //       let countQuery = `
// //         SELECT COUNT(*) AS total FROM and_cirec.cr_articles
// //         WHERE ar_title LIKE '%${keywords}%'
// //            OR ar_content LIKE '%${keywords}%'
// //       `;

// //       // Handle checkbox logic (full-text search simulation)
// //       if (enableAdvanceSearch === "true") {
// //         countQuery = `
// //           SELECT COUNT(*) AS total FROM and_cirec.cr_articles AS FT_TBL
// //           LEFT OUTER JOIN FREETEXTTABLE(and_cirec.cr_articles, (ar_title, ar_content), '${keywords}') AS KEY_TBL
// //           ON FT_TBL.ar_id = KEY_TBL.[KEY]
// //           WHERE FREETEXT((ar_title, ar_content), 'FORMSOF(INFLECTIONAL, ${keywords})')
// //              OR ar_title LIKE '%${keywords}%'
// //         `;
// //       }

// //       // Get total count
// //       const countResult = await executeQuery(countQuery);
// //       const totalData = countResult.recordset[0]?.total || 0;
// //       console.log(totalData, "countQuery");

// //       //@todo encountered a query timeout error work on pagination to limit data in response

// //       // Pagination logic
// //       const itemsPerPage = 20;
// //       const offset = (page - 1) * itemsPerPage;

// //       // Build the search query
// //       let searchQuery = `
// //       SELECT ar_title, ar_id, ar_datetime, ar_content
// //       FROM and_cirec.cr_articles
// //       WHERE ar_title LIKE '%${keywords}%'
// //          OR ar_content LIKE '%${keywords}%'
// //       ORDER BY ar_datetime DESC
// //       OFFSET ${offset} ROWS
// //       FETCH NEXT ${itemsPerPage} ROWS ONLY
// //     `;

// //       if (enableAdvanceSearch === "true") {
// //         searchQuery = `
// //           SELECT KEY_TBL.RANK, ar_datetime, FT_TBL.ar_title, FT_TBL.ar_id
// //           FROM and_cirec.cr_articles AS FT_TBL
// //           LEFT OUTER JOIN FREETEXTTABLE(and_cirec.cr_articles, (ar_title, ar_content), '${keywords}') AS KEY_TBL
// //           ON FT_TBL.ar_id = KEY_TBL.[KEY]
// //           WHERE FREETEXT((ar_title, ar_content), 'FORMSOF(INFLECTIONAL, ${keywords})')
// //              OR ar_title LIKE '%${keywords}%'
// //           ORDER BY 1 DESC, 2 DESC
// //           OFFSET ${offset} ROWS
// //         `;
// //       }

// //       // Execute search query
// //       const searchResult = await executeQuery(searchQuery);
// //       const results = searchResult.recordset;

// //       // Pagination and response data
// //       const totalPages = Math.ceil(totalData / itemsPerPage);
// //       const paginationLinks = {
// //         currentPage: page,
// //         totalPages,
// //         nextPage: page < totalPages ? page + 1 : null,
// //         prevPage: page > 1 ? page - 1 : null,
// //       };

// //       // Check for suggested keywords
// //       let suggestedKeywords = [];
// //       const suggestionQuery = `
// //         SELECT sk_suggestedkey
// //         FROM and_cirec.cr_searchkeyword
// //         WHERE sk_userkey = '${keywords}'
// //           AND sk_display = 'True'
// //           AND sk_suggestedkey != ''
// //       `;
// //       const suggestionResult = await executeQuery(suggestionQuery);

// //       if (suggestionResult.recordset.length > 0) {
// //         suggestedKeywords = suggestionResult.recordset.map((row) => row.sk_suggestedkey);
// //       } else {
// //         // Insert new search keyword if none exist
// //         const keywordCheckQuery = `SELECT COUNT(*) AS total FROM and_cirec.cr_searchkeyword WHERE sk_userkey = '${keywords}'`;
// //         const keywordCheckResult = await executeQuery(keywordCheckQuery);

// //         if (keywordCheckResult.recordset[0]?.total === 0) {
// //           const maxIdQuery = `SELECT MAX(sk_id) + 1 AS maxId FROM and_cirec.cr_searchkeyword`;
// //           const maxIdResult = await executeQuery(maxIdQuery);
// //           const maxId = maxIdResult.recordset[0]?.maxId || 1;

// //           const insertQuery = `
// //             INSERT INTO and_cirec.cr_searchkeyword (sk_id, sk_userkey, sk_suggestedkey, sk_display)
// //             VALUES (${maxId}, '${keywords}', '', 'False')
// //           `;
// //           await executeQuery(insertQuery);
// //         }
// //       }

// //       return h.response({
// //         success: true,
// //         totalData,
// //         pagination: paginationLinks,
// //         results,
// //         suggestedKeywords,
// //       });
// //     } catch (err) {
// //       console.error("Error during database search:", err);
// //       return h.response({ success: false, message: "Server Error" }).code(500);
// //     }
// //   },
// // };

// // export const searchDatabaseOptions: RouteOptions = {
// //   description: "Pagination for Keywords Search",
// //   tags: ["api", "Search Database"],
// //   notes: "Returns Pagination Details For Database Keayword Search",
// //   validate: {
// //     query: Joi.object({
// //       key: Joi.string().required().description("Keywords to look in db separated by spaces"),
// //       cb1: Joi.boolean().default(false).description("Advance search to search words in descriptions too"),
// //       page: Joi.number().min(1).default(1),
// //     }),
// //   },
// //   handler: async (request, h) => {
// //     const { key, cb1, page } = request.query;
// //     const pageSize = 20;
// //     const offset = (page - 1) * pageSize;

// //     try {
// //       // Sanitize and prepare keyword
// //       const findWord = key.replace(/\+/g, " ");
// //       console.log(findWord, "findWord");
// //       const preparedKeyword = findWord.replace(/[&<>\"@]/g, "");
// //       console.log(preparedKeyword, "preparedKeyword");

// //       // Determine search query based on checkbox
// //       const searchQueries = cb1
// //         ? {
// //             countQuery: `
// //                 SELECT COUNT(*) as total
// //                 FROM and_cirec.cr_articles AS FT_TBL
// //                 LEFT OUTER JOIN FREETEXTTABLE(and_cirec.cr_articles, (ar_title, ar_content), CAST(@findWord AS NVARCHAR(4000))) AS KEY_TBL
// //                 ON FT_TBL.ar_id = KEY_TBL.[KEY]
// //                 WHERE FREETEXT((ar_title, ar_content), N'FORMSOF(INFLECTIONAL, @searchTerm)')
// //                   OR ar_title LIKE @titleSearch
// //               `,
// //             dataQuery: `
// //                 SELECT TOP (@pageSize) KEY_TBL.RANK, ar_datetime, FT_TBL.ar_title, FT_TBL.ar_id, FT_TBL.ar_content
// //                 FROM and_cirec.cr_articles AS FT_TBL
// //                 LEFT OUTER JOIN FREETEXTTABLE(and_cirec.cr_articles, (ar_title, ar_content), CAST(@findWord AS NVARCHAR(4000))) AS KEY_TBL
// //                 ON FT_TBL.ar_id = KEY_TBL.[KEY]
// //                 WHERE FREETEXT((ar_title, ar_content), N'FORMSOF(INFLECTIONAL, @searchTerm)')
// //                   OR ar_title LIKE @titleSearch
// //                 ORDER BY KEY_TBL.RANK DESC, ar_datetime DESC
// //                 OFFSET @offset ROWS
// //                 FETCH NEXT @pageSize ROWS ONLY
// //               `,
// //           }
// //         : {
// //             countQuery: `
// //                 SELECT COUNT(*) as total
// //                 FROM and_cirec.cr_articles AS FT_TBL
// //                 LEFT OUTER JOIN FREETEXTTABLE(and_cirec.cr_articles, (ar_title), @findWord) AS KEY_TBL
// //                 ON FT_TBL.ar_id = KEY_TBL.[KEY]
// //                 WHERE FREETEXT((ar_title), N'FORMSOF(INFLECTIONAL, @searchTerm)')
// //                   OR ar_title LIKE @titleSearch
// //               `,
// //             dataQuery: `
// //                 SELECT TOP (@pageSize) KEY_TBL.RANK, ar_datetime, FT_TBL.ar_title, FT_TBL.ar_id, FT_TBL.ar_content
// //                 FROM and_cirec.cr_articles AS FT_TBL
// //                 LEFT OUTER JOIN FREETEXTTABLE(and_cirec.cr_articles, (ar_title), @findWord) AS KEY_TBL
// //                 ON FT_TBL.ar_id = KEY_TBL.[KEY]
// //                 WHERE FREETEXT((ar_title), N'FORMSOF(INFLECTIONAL, @searchTerm)')
// //                   OR ar_title LIKE @titleSearch
// //                 ORDER BY KEY_TBL.RANK DESC, ar_datetime DESC
// //                 OFFSET @offset ROWS
// //                 FETCH NEXT @pageSize ROWS ONLY
// //               `,
// //           };

// //       // Execute count query
// //       const countResult = await executeQuery(searchQueries.countQuery, {
// //         findWord: preparedKeyword.substring(0, 4000), // Limit to 4000 characters
// //         searchTerm: preparedKeyword.substring(0, 4000), // Limit to 4000 characters
// //         titleSearch: `%${preparedKeyword}%`,
// //       });
// //       const totalResults = countResult.recordset[0].total;

// //       // Execute data query
// //       const dataResult = await executeQuery(searchQueries.dataQuery, {
// //         findWord: preparedKeyword,
// //         searchTerm: preparedKeyword,
// //         titleSearch: `%${preparedKeyword}%`,
// //         pageSize,
// //         offset,
// //       });

// //       // Check for suggested keywords
// //       let suggestedKeyword = null;
// //       if (totalResults === 0) {
// //         const suggestedQuery = `
// //             SELECT TOP 1 sk_suggestedkey
// //             FROM and_cirec.cr_searchkeyword
// //             WHERE sk_userkey = @findWord
// //               AND sk_display = 'True'
// //               AND sk_suggestedkey != ''
// //           `;
// //         const suggestedResult = await executeQuery(suggestedQuery, {
// //           findWord: preparedKeyword,
// //         });

// //         if (suggestedResult.recordset.length > 0) {
// //           suggestedKeyword = suggestedResult.recordset[0].sk_suggestedkey;
// //         }

// //         // If no suggested keyword exists, insert the search term
// //         if (!suggestedKeyword) {
// //           const insertQuery = `
// //               IF NOT EXISTS (SELECT 1 FROM and_cirec.cr_searchkeyword WHERE sk_userkey = @findWord)
// //               BEGIN
// //                 INSERT INTO and_cirec.cr_searchkeyword (sk_id, sk_userkey, sk_suggestedkey, sk_display)
// //                 VALUES ((SELECT ISNULL(MAX(sk_id), 0) + 1 FROM and_cirec.cr_searchkeyword), @findWord, '', 'False')
// //               END
// //             `;
// //           await executeQuery(insertQuery, { findWord: preparedKeyword });
// //         }
// //       }

// //       // Prepare pagination info
// //       const totalPages = Math.ceil(totalResults / pageSize);

// //       return h
// //         .response({
// //           success: true,
// //           data: {
// //             results: dataResult.recordset,
// //             pagination: {
// //               currentPage: page,
// //               pageSize,
// //               totalResults,
// //               totalPages,
// //             },
// //             searchTerm: findWord,
// //             suggestedKeyword,
// //             searchOptions: {
// //               fullContentSearch: cb1,
// //             },
// //           },
// //         })
// //         .code(200);
// //     } catch (error) {
// //       logger.error("search-route", `Search process failed: ${error}`);
// //       return h
// //         .response({
// //           success: false,
// //           message: "Search process failed",
// //           error: error instanceof Error ? error.message : String(error),
// //         })
// //         .code(500);
// //     }
// //   },
// // };

// export const getPaginationForKeywordSearchOptions: RouteOptions = {
//   description: "Pagination for Keywords Search",
//   tags: ["api", "Search Keyword Database Pagination Details"],
//   notes: "Returns Pagination Details For Database Keayword Search",
//   validate: {
//     query: Joi.object({
//       key: Joi.string().required(),
//       cb1: Joi.boolean().optional().default(false),
//     }),
//   },
//   plugins: {
//     "hapi-swagger": {
//       order: 3,
//     },
//   },
//   response: {
//     schema: Joi.object({
//       success: Joi.boolean(),
//       totalArticles: Joi.number(),
//       articles: Joi.array().items(
//         Joi.object({
//           ar_id: Joi.number(),
//           ar_title: Joi.string(),
//           ar_datetime: Joi.date(),
//           rank: Joi.number().optional(),
//         })
//       ),
//       pagination: Joi.object({
//         currentPage: Joi.number(),
//         totalPages: Joi.number(),
//         pageSize: Joi.number(),
//       }).optional(),
//       suggestedKeyword: Joi.string().optional().allow(null),
//     }),
//   },
//   handler: async (request, h) => {
//     const { key: findWord, page = 1, cb1 = false } = request.query;

//     try {
//       // Sanitize input
//       const sanitizedWord = findWord.replace(/[&<>"']/g, "");
//       const pageSize = 20;
//       const offset = (Number(page) - 1) * pageSize;

//       // Count total matching articles
//       let countQuery = `
//         SELECT COUNT(*) AS totalCount
//         FROM and_cirec.cr_articles
//         WHERE ar_title LIKE @keyword OR ar_content LIKE @keyword
//       `;

//       if (cb1) {
//         countQuery = `
//           SELECT COUNT(*) AS totalCount
//           FROM and_cirec.cr_articles AS FT_TBL
//           WHERE
//             FREETEXT((ar_title, ar_content), @keyword)
//             OR ar_title LIKE @keyword
//         `;
//       }

//       const countResult = await executeQuery(countQuery, {
//         keyword: `%${sanitizedWord}%`,
//       });
//       console.log(countResult, "countResult");
//       const totalArticles = countResult.recordset[0].totalCount;

//       // Search query
//       let searchQuery = `
//         WITH RankedArticles AS (
//           SELECT
//             ar_id,
//             ar_title,
//             ar_datetime,
//             ROW_NUMBER() OVER (ORDER BY ar_datetime DESC) AS RowNum
//           FROM and_cirec.cr_articles
//           WHERE ar_title LIKE @keyword OR ar_content LIKE @keyword
//         )
//         SELECT ar_id, ar_title, ar_datetime
//         FROM RankedArticles
//         WHERE RowNum BETWEEN @offset + 1 AND @offset + @pageSize
//       `;

//       if (cb1) {
//         searchQuery = `
//           WITH RankedArticles AS (
//             SELECT
//               FT_TBL.ar_id,
//               FT_TBL.ar_title,
//               FT_TBL.ar_datetime,
//               KEY_TBL.RANK,
//               ROW_NUMBER() OVER (ORDER BY KEY_TBL.RANK DESC) AS RowNum
//             FROM and_cirec.cr_articles AS FT_TBL
//             LEFT OUTER JOIN FREETEXTTABLE(and_cirec.cr_articles, (ar_title, ar_content), @keyword) AS KEY_TBL
//               ON FT_TBL.ar_id = KEY_TBL.[KEY]
//             WHERE
//               FREETEXT((ar_title, ar_content), @keyword)
//               OR ar_title LIKE @keyword
//           )
//           SELECT ar_id, ar_title, ar_datetime, RANK
//           FROM RankedArticles
//           WHERE RowNum BETWEEN @offset + 1 AND @offset + @pageSize
//         `;
//       }

//       const articlesResult = await executeQuery(searchQuery, {
//         keyword: `%${sanitizedWord}%`,
//         offset,
//         pageSize,
//       });

//       console.log(articlesResult.recordset.length, "articlesResult");

//       // Check for suggested keywords
//       let suggestedKeyword = null;
//       const suggestedQuery = `
//         SELECT TOP 1 sk_suggestedkey
//         FROM and_cirec.cr_searchkeyword
//         WHERE sk_userkey = @keyword
//           AND sk_display = 'True'
//           AND sk_suggestedkey != ''
//       `;
//       const suggestedResult = await executeQuery(suggestedQuery, {
//         keyword: sanitizedWord,
//       });
//       console.log(suggestedResult, "suggestedResult");

//       if (suggestedResult.recordset.length > 0) {
//         suggestedKeyword = suggestedResult.recordset[0].sk_suggestedkey;
//       }

//       // If no results, insert the keyword for tracking
//       if (totalArticles === 0) {
//         const insertQuery = `
//           IF NOT EXISTS (
//             SELECT 1 FROM and_cirec.cr_searchkeyword
//             WHERE sk_userkey = @keyword
//           )
//           BEGIN
//             INSERT INTO and_cirec.cr_searchkeyword
//             (sk_id, sk_userkey, sk_suggestedkey, sk_display)
//             VALUES
//             ((SELECT ISNULL(MAX(sk_id), 0) + 1 FROM and_cirec.cr_searchkeyword), @keyword, '', 'False')
//           END
//         `;
//         await executeQuery(insertQuery, { keyword: sanitizedWord });
//       }

//       return h
//         .response({
//           success: totalArticles > 0,
//           totalArticles,
//           articles: articlesResult.recordset,
//           pagination: {
//             currentPage: Number(page),
//             totalPages: Math.ceil(totalArticles / pageSize),
//             pageSize,
//           },
//           suggestedKeyword,
//         })
//         .code(totalArticles > 0 ? 200 : 404);
//     } catch (error) {
//       logger.error("search-route", `Search process failed: ${error}`);
//       return h
//         .response({
//           success: false,
//           message: "Search process failed",
//         })
//         .code(500);
//     }
//   },
// };
