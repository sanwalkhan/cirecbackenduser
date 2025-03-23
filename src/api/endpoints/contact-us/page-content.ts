import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

// Content Route
export const getContactUsPageContent: RouteOptions = {

    description: "Contact Us Page Content",
    tags: ["api", "ContactUs"],
    validate: {
        query: Joi.object({
            lang: Joi.string().valid('en', 'es', 'fr').optional().default('en')
        })
    },
    response: {
        schema: Joi.object({
            success: Joi.boolean(),
            content: Joi.string().allow(""),
            countries: Joi.array().items(
                Joi.object({
                    id: Joi.number(),
                    name: Joi.string()
                })
            ).optional()
        })
    },
    handler: async (request, h) => {
        const lang = request.query.lang;

        try {
            // Fetch page content
            const contentQuery = `
                SELECT pgc_content 
                FROM dbo.cr_pagecontent 
                WHERE pg_id = '8' 
                ORDER BY pgc_id
            `;
            const contentResult = await executeQuery(contentQuery) as any;

            // Fetch countries
            const countriesQuery = `SELECT cu_id as id, cu_name as name FROM cr_countries`;
            const countriesResult = await executeQuery(countriesQuery) as any;

            // Combine content
            const content = contentResult.recordset
                .map((row: any) => row.pgc_content)
                .join('');

            return h.response({
                success: true,
                content,
                countries: countriesResult.recordset
            }).code(200);

        } catch (error) {
            logger.error("get-contact-us-content", `Database query failed: ${error}`);
            return h.response({
                success: false,
                error: "Failed to load contact us content"
            }).code(500);
        }
    }
};

