import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const getUpcomingEventsOptions: RouteOptions = {
    description: "Retrieve Upcoming Events",
    tags: ["api", "Events"],
    notes: "Fetches a list of upcoming events with optional filtering",
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
            totalEvents: Joi.number(),
            events: Joi.array().items(Joi.object({
                ev_id: Joi.number(),
                ev_title: Joi.string(),
                ev_link: Joi.string().allow(null),
                ev_venue: Joi.string().allow(null),
                ev_display: Joi.boolean()
            }))
        })
    },
    handler: async (request, h) => {
        const { page, pageSize, category, status } = request.query;
        const offset = (page - 1) * pageSize;

        try {
            // Construct dynamic query with optional filters
            let query = `
                SELECT * FROM (
                SELECT 
                    ev_id, 
                    ev_title, 
                    ev_link,
                    ev_venue, 
                    ev_display,
                    ROW_NUMBER() OVER (ORDER BY ev_id) AS RowNum,
                    COUNT(*) OVER () AS TotalCount
                FROM dbo.cr_events
                WHERE 1=1
                ${status === 'active' ? "AND ev_display = 1" : status === 'inactive' ? "AND ev_display = 0" : ""}
                ) AS SubQuery
                WHERE RowNum BETWEEN @offset + 1 AND @offset + @pageSize
      `;

            const result = await executeQuery(query, {
                category: category || null,
                offset,
                pageSize
            });

            // If no events found
            if (!result.recordset.length) {
                return h.response({
                    success: true,
                    message: "No events found",
                    totalEvents: 0,
                    events: []
                }).code(200);
            }


            // Prepare response
            return h.response({
                success: true,
                message: "Events retrieved successfully",
                totalEvents: result.recordset[0]?.TotalCount || 0,
                events: result.recordset.map(event => ({
                    ev_id: event.ev_id,
                    ev_title: event.ev_title,
                    ev_link: event.ev_link,
                    ev_venue: event.ev_venue,
                    ev_display: event.ev_display
                }))
            }).code(200);
        } catch (error) {
            logger.error("events-route", `Events retrieval failed: ${error}`);
            return h.response({
                success: false,
                message: "Failed to retrieve events"
            }).code(500);
        }
    }
};
