/* eslint-disable @typescript-eslint/no-explicit-any */
import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const getAboutUsPageContent: RouteOptions = {
    description: "About Us Page Content",
    tags: ["api", "AboutUs"],
    notes: "Returns Content for the AboutUs Page",
    plugins: {
        "hapi-swagger": {
            order: 1,
        },
    },
    response: {
        schema: Joi.object({
            success: Joi.boolean().optional(),
            content: Joi.string().allow("").optional(),
            message: Joi.string().optional(),
            error: Joi.string().optional(),
        }).or("content", "error", "message"),
    },
    handler: async (request, h) => {
        // // Simulating session management with cookies
        // const session = request.state.session || {};
        // session.SITEPAGE = "1";

        // Query the database
        const query = `SELECT pgc_content 
        FROM dbo.cr_pagecontent 
        WHERE pg_id = '2'`;
        let content = "";

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
                content += row.pgc_content;
            });
        } catch (error) {
            logger.error("get-about-us-page-content", `Database query failed: ${error}`);
            return h.response({ error: "Failed to load content" }).code(500);
        }

        // Set session cookie
        // return h.response({ homeContent }).state("session", session, { isHttpOnly: true });
        return h.response({ success: true, content }).code(200);
    },
};
