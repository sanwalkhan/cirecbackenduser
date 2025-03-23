import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const getChemicalLinksOptions: RouteOptions = {
    description: "Retrieve Chemical Links",
    tags: ["api", "Links"],
    notes: "Fetches a list of chemical links with optional filtering",
    validate: {
        query: Joi.object({
            page: Joi.number().integer().min(1).default(1),
            pageSize: Joi.number().integer().min(1).max(100).default(10),
            status: Joi.string().valid('active', 'inactive').optional()
        })
    },
    plugins: {
        "hapi-swagger": {
            order: 3,
        },
    },
    response: {
        schema: Joi.object({
            success: Joi.boolean(),
            message: Joi.string().optional(),
            totalLinks: Joi.number(),
            links: Joi.array().items(Joi.object({
                lk_id: Joi.number(),
                lk_name: Joi.string(),
                lk_link: Joi.string().allow(null),
                lk_display: Joi.boolean()
            }))
        })
    },
    handler: async (request, h) => {
        const { page, pageSize, status } = request.query;
        const offset = (page - 1) * pageSize;

        try {
            // Construct dynamic query with optional filters
            let query = `
                SELECT * FROM (
                SELECT
                    lk_id,
                    lk_name,
                    lk_link,
                    lk_display,
                    ROW_NUMBER() OVER (ORDER BY lk_id) AS RowNum,
                    COUNT(*) OVER () AS TotalCount
                FROM dbo.cr_links
                WHERE 1=1
                ${status === 'active' ? "AND lk_display = 1" : status === 'inactive' ? "AND lk_display = 0" : ""}
                ) AS SubQuery
                WHERE RowNum BETWEEN @offset + 1 AND @offset + @pageSize
            `;

            const result = await executeQuery(query, {
                offset,
                pageSize
            });

            // If no links found
            if (!result.recordset.length) {
                return h.response({
                    success: true,
                    message: "No links found",
                    totalLinks: 0,
                    links: []
                }).code(200);
            }

            // Prepare response
            return h.response({
                success: true,
                message: "Links retrieved successfully",
                totalLinks: result.recordset[0]?.TotalCount || 0,
                links: result.recordset.map(link => ({
                    lk_id: link.lk_id,
                    lk_name: link.lk_name,
                    lk_link: link.lk_link,
                    lk_display: link.lk_display
                }))
            }).code(200);
        } catch (error) {
            logger.error("links-route", `Links retrieval failed: ${error}`);
            return h.response({
                success: false,
                message: "Failed to retrieve links"
            }).code(500);
        }
    }
};