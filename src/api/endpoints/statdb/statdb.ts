import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const getStatDbOptions: RouteOptions = {
    description: "StatDB Page Data",
    tags: ["api", "StatDB"],
    notes: "Handles statistical database page data and operations",
    validate: {
        headers: Joi.object({
            // Removed authorization requirement
        }).unknown(),
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
                pageContent: Joi.array().items(Joi.string().allow(null)),
                products: Joi.array().items(
                    Joi.object({
                        pr_id: Joi.number(),
                        pr_name: Joi.string()
                    })
                ),
                companies: Joi.array().items(
                    Joi.object({
                        comp_id: Joi.number(),
                        comp_name: Joi.string()
                    })
                ),
                periods: Joi.array().items(
                    Joi.object({
                        value: Joi.string(),
                        text: Joi.string()
                    })
                ),
                tradeProducts: Joi.array().items(
                    Joi.object({
                        pr_id: Joi.number(),
                        pr_name: Joi.string()
                    })
                ),
                polishProducts: Joi.array().items(
                    Joi.object({
                        pr_id: Joi.number(),
                        pr_name: Joi.string()
                    })
                ),
                olyPolyProducts: Joi.array().items(
                    Joi.object({
                        pr_id: Joi.number(),
                        pr_name: Joi.string()
                    })
                )
            })
        }),
    },
    handler: async (request, h) => {
        try {
            // Removed session authentication checks

            // Get page content
            const pageContentResult = await executeQuery(
                "SELECT pgc_content FROM dbo.cr_pagecontent WHERE pg_id='7' ORDER BY pgc_id"
            );
            const pageContent = pageContentResult.recordset.map(row => row.pgc_content).filter(c => c);

            // Removed product filter based on session authorization
            // Get products
            const productsResult = await executeQuery(
                `SELECT pr_id, pr_name FROM and_cirec.cr_rep_products ORDER BY pr_name`
            );

            // Get companies
            const companiesResult = await executeQuery(
                `SELECT comp_id, CONCAT(comp_name, '[', comp_location, ']') as comp_name 
                 FROM and_cirec.cr_rep_companies ORDER BY comp_name`
            );

            // Get trade products
            const tradeProductsQuery = `
            SELECT DISTINCT p.pr_id, p.pr_name 
            FROM and_cirec.cr_rep_products p
            JOIN cr_rep_russia_domestic_sales cp ON p.pr_id = cp.pro_id
            ORDER BY p.pr_name
        `;
            const tradeProductsResult = await executeQuery(tradeProductsQuery);

            // Get polish chemical products
            const polishProductsQuery = `
            SELECT DISTINCT p.pr_id, p.pr_name 
            FROM and_cirec.cr_rep_products p
            JOIN cr_rep_polishchemical cp ON p.pr_id = cp.pro_id
            ORDER BY p.pr_name
        `;
            const polishProductsResult = await executeQuery(polishProductsQuery);

            // Get olypoly products
            const olyPolyProductsQuery = `
            SELECT DISTINCT p.pr_id, p.pr_name 
            FROM and_cirec.cr_rep_products p
            JOIN cr_rep_olypoly cp ON p.pr_id = cp.pro_id
            ORDER BY p.pr_name
        `;
            const olyPolyProductsResult = await executeQuery(olyPolyProductsQuery);

            // Generate periods data
            const currentYear = new Date().getFullYear();
            const periods = [];
            periods.push({ value: "0", text: "-All-" });

            for (let year = 2015; year <= currentYear; year++) {
                for (let quarter = 1; quarter <= 4; quarter++) {
                    const period = `${year}/${quarter}`;
                    periods.push({ value: period, text: period });
                }
            }

            return h.response({
                success: true,
                data: {
                    pageContent,
                    products: productsResult.recordset,
                    companies: companiesResult.recordset,
                    periods: periods,
                    tradeProducts: tradeProductsResult.recordset,
                    polishProducts: polishProductsResult.recordset,
                    olyPolyProducts: olyPolyProductsResult.recordset
                }
            }).code(200);

        } catch (error) {
            logger.error("statdb-route", `Failed to fetch StatDB data: ${error}`);
            return h.response({
                success: false,
                message: "Failed to fetch StatDB data",
            }).code(500);
        }
    },
};