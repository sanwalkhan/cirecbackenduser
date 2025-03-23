
import { ResponseToolkit, RouteOptions } from "@hapi/hapi";
import * as fs from "fs";
import Joi from "joi";
import * as path from "path";
import { executeQuery } from "../../../common/db";
import { config } from "../../../common/index";
import { logger } from "../../../common/logger";

export const getPdfNewsOptions: RouteOptions = {
  description: "Retrieve News PDF",
  tags: ["api", "News"],
  notes: "Fetches PDF file for news with authentication check",
  validate: {
    query: Joi.object({
      pd: Joi.number().required(), // News ID
    }),
  },
  plugins: {
    "hapi-swagger": {
      order: 5,
    },
  },
  handler: async (request, h: ResponseToolkit) => {
    // Authenticate session
    const session = request.auth.credentials as {
      CRAUTHLOGGED?: string;
      CRAUTHNEWS?: string;
    } | null;

    //@todo authenticate implementation pending
    // // Check if user is logged in
    // if (!session?.CRAUTHLOGGED) {
    //   return h
    //     .response({
    //       success: false,
    //       redirectUrl: "/login",
    //       message: "Authentication required",
    //     })
    //     .code(401);
    // }

    // // Check news access permission
    // if (session.CRAUTHNEWS !== "YES") {
    //   return h
    //     .response({
    //       success: false,
    //       redirectUrl: "/error?er=1",
    //       message: "Insufficient permissions",
    //     })
    //     .code(403);
    // }

    try {
      // Validate and parse news ID
      const newsId = request.query.pd;

      // Fetch PDF link
      const pdfQuery = `
        SELECT nw_pdf_link 
        FROM cr_news 
        WHERE nw_id = @newsId
      `;

      const result = await executeQuery(pdfQuery, { newsId });

      // Check if PDF exists in database
      if (result.recordset.length === 0) {
        return h
          .response({
            success: false,
            message: "File not found at Server.",
          })
          .code(404);
      }

      // Get filename
      const filename = result.recordset[0].nw_pdf_link;
      
      // Updated file path to use public directory for production
      let filePath;
      if (config.enviornment === "development") {
        filePath = path.join(process.cwd(), 'src', 'utils', 'crpdfnet', filename);
      } else {
        filePath = path.join(process.cwd(), 'public', 'pdfs', filename);
      }

      // Check if file exists
      if (!fs.existsSync(filePath)) {
        return h
          .response({
            success: false,
            message: "File not found at Server.",
          })
          .code(404);
      }

      // Read file and send as response
      const fileStream = fs.readFileSync(filePath);

      return h
        .response(fileStream)
        .type("application/pdf")
        .header("Content-Disposition", `inline; filename="${filename}"`);
    } catch (error) {
      logger.error("news-pdf-route", `PDF retrieval failed: ${error}`);
      return h
        .response({
          success: false,
          message: "Error retrieving PDF",
        })
        .code(500);
    }
  },
};
