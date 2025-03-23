/* eslint-disable @typescript-eslint/no-explicit-any */
import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const getDefaultPageContentOptions: RouteOptions = {
  description: "Get Default Page Content",
  tags: ["api", "Default"],
  notes: "Returns array having Content for the Default Page",
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  response: {
    schema: Joi.object({
      success: Joi.boolean().optional(),
      homeContent: Joi.string().allow("").optional(),
      message: Joi.string().optional(),
      error: Joi.string().optional(),
    }).or("homeContent", "error", "message"),
  },
  handler: async (request, h) => {
    // // Simulating session management with cookies
    // const session = request.state.session || {};
    // session.SITEPAGE = "1";

    // Query the database
    const query = `SELECT pgc_content FROM dbo.cr_pagecontent WHERE pg_id='1' ORDER BY pgc_id`;
    let homeContent = "";

    try {
      const result = (await executeQuery(query)) as any;
      // Check if issues exist
      if (result.recordset.length === 0) {
        return h
          .response({
            success: false,
            message: `No Content Found`,
          })
          .code(404);
      }
      result.recordset.forEach((row: any) => {
        homeContent += row.pgc_content;
      });
    } catch (error) {
      logger.error("get-default-page-content", `Database query failed: ${error}`);
      return h.response({ error: "Failed to load content" }).code(500);
    }

    // Set session cookie
    // return h.response({ homeContent }).state("session", session, { isHttpOnly: true });
    return h.response({ homeContent }).code(200);
  },
};
