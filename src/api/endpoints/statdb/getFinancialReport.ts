// File: src/routes/statdb/handlers/getFinancialReport.ts
import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const getFinancialReportOptions: RouteOptions = {
    description: "Get Financial Report Data",
    tags: ["api", "StatDB", "Reports"],
    notes: "Generates financial report data based on selected companies and date range",
    validate: {
        headers: Joi.object({}).unknown(),
        params: Joi.object({
            type: Joi.number().valid(1, 2, 3).required()
                .description("Financial report type: 1 = Turnover, 2 = Gross, 3 = Net")
        }),
        payload: Joi.object({
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
                reportData: Joi.array().items(Joi.object())
            })
        }),
    },
    handler: async (request, h) => {
        try {
            const { type } = request.params;
            const { companyIds, fromPeriod, toPeriod } = request.payload as any;
            
            let tableName = "";
            let idField = "";
            let yearField = "";
            let quarterField = "";
            let amountField = "";
            
            // Set table and field names based on report type
            if (type === 1) {
                // Turnover Finance
                tableName = "and_cirec.cr_rep_turnover_finance";
                idField = "tf_id";
                yearField = "tf_year";
                quarterField = "tf_quarter";
                amountField = "tf_amount";
            } else if (type === 2) {
                // Gross Finance
                tableName = "and_cirec.cr_rep_gross_finance";
                idField = "gf_id";
                yearField = "gf_year";
                quarterField = "gf_quarter";
                amountField = "gf_amount";
            } else if (type === 3) {
                // Net Finance
                tableName = "and_cirec.cr_rep_net_finance";
                idField = "nf_id";
                yearField = "nf_year";
                quarterField = "nf_quarter";
                amountField = "nf_amount";
            }
            
            let query = `
                SELECT 
                    c.comp_name as company_name,
                    c.comp_location as company_location,
                    f.${yearField} as year,
                    f.${quarterField} as quarter,
                    f.${amountField} as amount
                FROM ${tableName} f
                JOIN and_cirec.cr_rep_companies c ON f.comp_id = c.comp_id
                WHERE 1=1
            `;
            
            const params: any[] = [];
            
            // Add company filter
            if (companyIds !== "all") {
                const companyPlaceholders = companyIds.map((_ :any, i : number) => `@company${i}`).join(", ");
                query += ` AND c.comp_id IN (${companyPlaceholders})`;
                
                companyIds.forEach((id: number, i: number) => {
                    params.push({ name: `company${i}`, value: id });
                });
            }
            
            // Add date range filters
            if (fromPeriod) {
                query += ` AND (f.${yearField} > @fromYear OR (f.${yearField} = @fromYear AND f.${quarterField} >= @fromQuarter))`;
                params.push({ name: "fromYear", value: fromPeriod.year });
                params.push({ name: "fromQuarter", value: fromPeriod.quarter });
            }
            
            if (toPeriod) {
                query += ` AND (f.${yearField} < @toYear OR (f.${yearField} = @toYear AND f.${quarterField} <= @toQuarter))`;
                params.push({ name: "toYear", value: toPeriod.year });
                params.push({ name: "toQuarter", value: toPeriod.quarter });
            }
            
            query += ` ORDER BY c.comp_name, f.${yearField}, f.${quarterField}`;
            
            const result = await executeQuery(query, params);
            
            return h.response({
                success: true,
                data: {
                    reportData: result.recordset
                }
            }).code(200);
            
        } catch (error) {
            logger.error("financial-report", `Failed to generate financial report: ${error}`);
            return h.response({
                success: false,
                message: "Failed to generate financial report",
            }).code(500);
        }
    },
};