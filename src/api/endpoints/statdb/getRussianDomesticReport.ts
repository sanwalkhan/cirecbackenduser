// File: src/routes/statdb/handlers/getRussianDomesticReport.ts
import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const getRussianDomesticReportOptions: RouteOptions = {
    description: "Get Russian Domestic Sales Report Data",
    tags: ["api", "StatDB", "Reports"],
    notes: "Generates Russian domestic sales report data based on selected products and date range",
    validate: {
        headers: Joi.object({}).unknown(),
        payload: Joi.object({
            productIds: Joi.alternatives().try(
                Joi.array().items(Joi.number()),
                Joi.string().valid("all")
            ).required(),
            fromPeriod: Joi.object({
                year: Joi.number(),
                quarter: Joi.number()
            }).allow(null),
            toPeriod: Joi.object({
                year: Joi.number(),
                quarter: Joi.number()
            }).allow(null)
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
            data: Joi.object({
                reportData: Joi.array().items(Joi.object())
            })
        }),
    },
    handler: async (request, h) => {
        try {
            const { productIds, fromPeriod, toPeriod } = request.payload as any;
            
            let query = `
                SELECT 
                    p.pr_name as product_name,
                    c.comp_name as company_name,
                    c.comp_location as company_location,
                    r.re_year as year,
                    r.re_quarter as quarter,
                    r.re_amount as amount
                FROM and_cirec.cr_rep_products p
                JOIN and_cirec.cr_rep_russia_domestic_sales r ON p.pr_id = r.pro_id
                JOIN and_cirec.cr_rep_companies c ON r.comp_id = c.comp_id
                WHERE 1=1
            `;
            
            const params: any[] = [];
            
            // Add product filter
            if (productIds !== "all") {
                const productPlaceholders = productIds.map((_:any, i : number) => `@product${i}`).join(", ");
                query += ` AND p.pr_id IN (${productPlaceholders})`;
                
                productIds.forEach((id: number, i: number) => {
                    params.push({ name: `product${i}`, value: id });
                });
            }
            
            // Add date range filters
            if (fromPeriod) {
                query += ` AND (r.re_year > @fromYear OR (r.re_year = @fromYear AND r.re_quarter >= @fromQuarter))`;
                params.push({ name: "fromYear", value: fromPeriod.year });
                params.push({ name: "fromQuarter", value: fromPeriod.quarter });
            }
            
            if (toPeriod) {
                query += ` AND (r.re_year < @toYear OR (r.re_year = @toYear AND r.re_quarter <= @toQuarter))`;
                params.push({ name: "toYear", value: toPeriod.year });
                params.push({ name: "toQuarter", value: toPeriod.quarter });
            }
            
            query += ` ORDER BY p.pr_name, c.comp_name, r.re_year, r.re_quarter`;
            
            const result = await executeQuery(query, params);
            
            return h.response({
                success: true,
                data: {
                    reportData: result.recordset
                }
            }).code(200);
            
        } catch (error) {
            logger.error("russian-domestic-report", `Failed to generate report: ${error}`);
            return h.response({
                success: false,
                message: "Failed to generate Russian domestic sales report",
            }).code(500);
        }
    },
};