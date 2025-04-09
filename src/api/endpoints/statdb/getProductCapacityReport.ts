// File: src/routes/statdb/handlers/getProductCapacityReport.ts
import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const getProductCapacityReportOptions: RouteOptions = {
    description: "Get Product Capacity Report Data",
    tags: ["api", "StatDB", "Reports"],
    notes: "Generates product capacity report data based on selected products, companies, and date range",
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
                JOIN and_cirec.cr_rep_period period ON p.pr_id = period.pro_id
                JOIN and_cirec.cr_rep_capacity capacity ON 
                    period.pro_id = capacity.cap_pr_id AND
                    period.comp_id = capacity.cap_comp_id AND
                    period.period_year = capacity.cap_year AND
                    period.period_quarter = capacity.cap_quarter
                JOIN and_cirec.cr_rep_companies c ON period.comp_id = c.comp_id
                WHERE 1=1
            `;
            
            const params: any[] = [];
            
            // Add product filter
            if (productIds !== "all") {
                const productPlaceholders = productIds.map((_: any, i : number) => `@product${i}`).join(", ");
                query += ` AND p.pr_id IN (${productPlaceholders})`;
                
                productIds.forEach((id: number, i: number) => {
                    params.push({ name: `product${i}`, value: id });
                });
            }
            
            // Add company filter
            if (companyIds !== "all") {
                const companyPlaceholders = companyIds.map((_: any, i: number) => `@company${i}`).join(", ");
                query += ` AND c.comp_id IN (${companyPlaceholders})`;
                
                companyIds.forEach((id: number, i: number) => {
                    params.push({ name: `company${i}`, value: id });
                });
            }
            
            // Add date range filters
            if (fromPeriod) {
                query += ` AND (period.period_year > @fromYear OR (period.period_year = @fromYear AND period.period_quarter >= @fromQuarter))`;
                params.push({ name: "fromYear", value: fromPeriod.year });
                params.push({ name: "fromQuarter", value: fromPeriod.quarter });
            }
            
            if (toPeriod) {
                query += ` AND (period.period_year < @toYear OR (period.period_year = @toYear AND period.period_quarter <= @toQuarter))`;
                params.push({ name: "toYear", value: toPeriod.year });
                params.push({ name: "toQuarter", value: toPeriod.quarter });
            }
            
            query += ` ORDER BY p.pr_name, c.comp_name, period.period_year, period.period_quarter`;
            
            const result = await executeQuery(query, params);
            
            return h.response({
                success: true,
                data: {
                    reportData: result.recordset
                }
            }).code(200);
            
        } catch (error) {
            logger.error("product-capacity-report", `Failed to generate report: ${error}`);
            return h.response({
                success: false,
                message: "Failed to generate product capacity report",
            }).code(500);
        }
    },
};