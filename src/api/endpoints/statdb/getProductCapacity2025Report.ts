// File: src/routes/statdb/handlers/getProductCapacity2025Report.ts
import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const getProductCapacity2025ReportOptions: RouteOptions = {
    description: "Get Product Capacity 2025 Report Data",
    tags: ["api", "StatDB", "Reports"],
    notes: "Generates product capacity report data up to 2025 based on selected products, companies, and date range",
    validate: {
        headers: Joi.object({}).unknown(),
        payload: Joi.object({
            productIds: Joi.alternatives().try(
                Joi.array().items(Joi.number()),
                Joi.string().valid("all")
            ).required(),
            companyIds: Joi.alternatives().try(
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
                reportData: Joi.array().items(
                    Joi.object({
                        product_name: Joi.string(),
                        company_name: Joi.string(),
                        company_location: Joi.string(),
                        period_year: Joi.number(),
                        period_quarter: Joi.number(),
                        period_amount: Joi.number(),
                        cap_amount: Joi.number()
                    })
                )
            })
        }),
    },
    handler: async (request, h) => {
        try {
            const { productIds, companyIds, fromPeriod, toPeriod } = request.payload as any;
            
            // Build the query with conditions
            let query = `
                SELECT 
                    p.pr_name as product_name,
                    c.comp_name as company_name,
                    c.comp_location as company_location,
                    period.period_year,
                    period.period_quarter,
                    period.period_amount,
                    capacity.cap_amount
                FROM and_cirec.cr_rep_products p
                JOIN and_cirec.cr_rep2_period period ON p.pr_id = period.pro_id
                JOIN and_cirec.cr_rep2_capacity capacity ON 
                    period.pro_id = capacity.cap_pr_id AND
                    period.comp_id = capacity.cap_comp_id AND
                    period.period_year = capacity.cap_year AND
                    period.period_quarter = capacity.cap_quarter
                JOIN and_cirec.cr_rep_companies c ON period.comp_id = c.comp_id
                WHERE 1=1
            `;
            
            // Use an object for parameters
            const params: Record<string, any> = {};
            
            // Add product filter
            if (productIds !== "all" && Array.isArray(productIds) && productIds.length > 0) {
                const placeholders: string[] = [];
                productIds.forEach((id: number, i: number) => {
                    const paramName = `product${i}`;
                    placeholders.push(`@${paramName}`);
                    params[paramName] = id;
                });
                query += ` AND p.pr_id IN (${placeholders.join(', ')})`;
            }
            
            // Add company filter
            if (companyIds !== "all" && Array.isArray(companyIds) && companyIds.length > 0) {
                const placeholders: string[] = [];
                companyIds.forEach((id: number, i: number) => {
                    const paramName = `company${i}`;
                    placeholders.push(`@${paramName}`);
                    params[paramName] = id;
                });
                query += ` AND c.comp_id IN (${placeholders.join(', ')})`;
            }
            
            // Add date range filters
            if (fromPeriod && fromPeriod.year && fromPeriod.quarter) {
                query += ` AND (period.period_year > @fromYear OR (period.period_year = @fromYear AND period.period_quarter >= @fromQuarter))`;
                params['fromYear'] = fromPeriod.year;
                params['fromQuarter'] = fromPeriod.quarter;
            }
            
            if (toPeriod && toPeriod.year && toPeriod.quarter) {
                query += ` AND (period.period_year < @toYear OR (period.period_year = @toYear AND period.period_quarter <= @toQuarter))`;
                params['toYear'] = toPeriod.year;
                params['toQuarter'] = toPeriod.quarter;
            }
            
            query += ` ORDER BY p.pr_name, c.comp_name, period.period_year, period.period_quarter`;
            
            // Debug logging
            logger.info("product-capacity-2025-report", `Executing query with params: ${JSON.stringify({query, params})}`);
            
            const result = await executeQuery(query, params);
            
            return h.response({
                success: true,
                data: {
                    reportData: result.recordset
                }
            }).code(200);
            
        } catch (error: any) {
            logger.error("product-capacity-2025-report", `Failed to generate report: ${error}`);
            return h.response({
                success: false,
                message: `Failed to generate product capacity 2025 report: ${error.message || error}`,
            }).code(500);
        }
    },
};