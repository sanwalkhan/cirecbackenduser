// File: src/routes/statdb/handlers/getChartReport.ts
import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const getChartReportOptions: RouteOptions = {
    description: "Get Chart Report Data",
    tags: ["api", "StatDB", "Reports"],
    notes: "Generates chart report data based on selected products, companies, and date range",
    validate: {
        headers: Joi.object({}).unknown(),
        params: Joi.object({
            type: Joi.number().valid(1, 2, 3).required()
                .description("Chart type: 1 = Product by Company, 2 = Company by Product, 3 = Product Trend")
        }),
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
                chartData: Joi.array().items(Joi.object())
            })
        }),
    },
    handler: async (request, h) => {
        try {
            const { type } = request.params;
            const { productIds, companyIds, fromPeriod, toPeriod } = request.payload as any;
            
            let query = "";
            const params: any[] = [];
            
            // Different queries based on chart type
            if (type === 1) {
                // Chart 1: Product by Company
                query = `
                    SELECT 
                        p.pr_name as product_name,
                        c.comp_name as company_name,
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
                    WHERE c.comp_id = @companyId
                `;
                
                // For chart 1, we expect a single company
                if (Array.isArray(companyIds) && companyIds.length > 0) {
                    params.push({ name: "companyId", value: companyIds[0] });
                } else {
                    throw new Error("Chart 1 requires a single company selection");
                }
                
            } else if (type === 2) {
                // Chart 2: Company by Product
                query = `
                    SELECT 
                        p.pr_name as product_name,
                        c.comp_name as company_name,
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
                    WHERE p.pr_id = @productId
                `;
                
                // For chart 2, we expect a single product
                if (Array.isArray(productIds) && productIds.length > 0) {
                    params.push({ name: "productId", value: productIds[0] });
                } else {
                    throw new Error("Chart 2 requires a single product selection");
                }
                
            } else if (type === 3) {
                // Chart 3: Product Trend
                query = `
                    SELECT 
                        p.pr_name as product_name,
                        period.period_year,
                        period.period_quarter,
                        SUM(period.period_amount) as total_period_amount,
                        SUM(capacity.cap_amount) as total_cap_amount
                    FROM and_cirec.cr_rep_products p
                    JOIN and_cirec.cr_rep_period period ON p.pr_id = period.pro_id
                    JOIN and_cirec.cr_rep_capacity capacity ON 
                        period.pro_id = capacity.cap_pr_id AND
                        period.comp_id = capacity.cap_comp_id AND
                        period.period_year = capacity.cap_year AND
                        period.period_quarter = capacity.cap_quarter
                    WHERE p.pr_id = @productId
                    GROUP BY p.pr_name, period.period_year, period.period_quarter
                `;
                
                // For chart 3, we expect a single product
                if (Array.isArray(productIds) && productIds.length > 0) {
                    params.push({ name: "productId", value: productIds[0] });
                } else {
                    throw new Error("Chart 3 requires a single product selection");
                }
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
            
            // Add order by clause
            if (type === 1) {
                query += ` ORDER BY p.pr_name, period.period_year, period.period_quarter`;
            } else if (type === 2) {
                query += ` ORDER BY c.comp_name, period.period_year, period.period_quarter`;
            } else if (type === 3) {
                query += ` ORDER BY period.period_year, period.period_quarter`;
            }
            
            const result = await executeQuery(query, params);
            
            return h.response({
                success: true,
                data: {
                    chartData: result.recordset
                }
            }).code(200);
            
        } catch (error) {
            logger.error("chart-report", `Failed to generate chart report: ${error}`);
            return h.response({
                success: false,
                message: `Failed to generate chart report: ${error instanceof Error ? error.message : "Unknown error"}`,
            }).code(500);
        }
    },
};