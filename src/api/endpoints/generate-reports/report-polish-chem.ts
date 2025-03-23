import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

interface ProductionData {
    period: string;
    amount: number;
}

interface ProductData {
    productName: string;
    data: ProductionData[];
    yearlyTotals: { [key: string]: number };
}

export const getPolishChemicalProductionOptions: RouteOptions = {
    description: "Polish Chemical Production Report Generation",
    tags: ["api", "Reports"],
    notes: "Generates Polish chemical production data by product",
    validate: {
        headers: Joi.object({
            authorization: Joi.string().required(),
        }).unknown(),
        query: Joi.object({
            fromYear: Joi.number().optional(),
            fromQuarter: Joi.number().optional(),
            toYear: Joi.number().optional(),
            toQuarter: Joi.number().optional(),
            productIds: Joi.string().optional(),
        }),
    },
    plugins: {
        "hapi-swagger": {
            order: 5,
        },
    },
    response: {
        schema: Joi.object({
            success: Joi.boolean(),
            message: Joi.string().optional(),
            data: Joi.object({
                title: Joi.string(),
                fromPeriod: Joi.string(),
                toPeriod: Joi.string(),
                products: Joi.array().items(
                    Joi.object({
                        productName: Joi.string(),
                        data: Joi.array().items(
                            Joi.object({
                                period: Joi.string(),
                                amount: Joi.alternatives().try(
                                    Joi.number(),
                                    Joi.string().valid('n/s')
                                ),
                            })
                        ),
                        yearlyTotals: Joi.object().pattern(
                            Joi.string(),
                            Joi.number()
                        ),
                    })
                ),
                totals: Joi.object().pattern(
                    Joi.string(),
                    Joi.number()
                ),
            }),
        }),
    },
    handler: async (request, h) => {
        try {
            // Authentication checks
            const session = request.auth.credentials;
            if (session.CRAUTHLOGGED !== "YES") {
                return h.response({
                    success: false,
                    message: "Authentication required",
                }).code(401);
            }

            if (session.CRAUTH_RTPA !== "YES") {
                return h.response({
                    success: false,
                    message: "Access denied: RTPA permission required",
                }).code(403);
            }

            if (!session.ReportGen || session.ReportGen !== "true") {
                return h.response({
                    success: false,
                    message: "Report generation not initialized",
                }).code(403);
            }

            // //@todo remove after testing
            // const session = {
            //     CRPROAUTH: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29",
            //     ProSelectAll: "TRUE",
            //     ProSelectedValue: "14",
            //     CompSelectedValue: "2"
            // }

            // Get date range
            const { maxYear, minYear } = await getYearRange();
            const {
                fromYear = minYear,
                fromQuarter = 1,
                toYear = maxYear,
                toQuarter = 4,
                productIds = session.ProSelectedValue,
            } = request.query;

            // Build period condition
            let periodCondition = "";
            if (toYear === fromYear) {
                periodCondition = `pc_year = '${fromYear}' 
                    AND pc_quarter >= 'Q${fromQuarter}' 
                    AND pc_quarter <= 'Q${toQuarter}'`;
            } else if ((toYear - fromYear) > 1) {
                periodCondition = `(
                    (pc_year = '${fromYear}' AND pc_quarter >= 'Q${fromQuarter}')
                    OR (pc_year = '${toYear}' AND pc_quarter <= 'Q${toQuarter}')
                    OR (pc_year > '${fromYear}' AND pc_year < '${toYear}')
                )`;
            } else {
                periodCondition = `(
                    (pc_year = '${fromYear}' AND pc_quarter >= 'Q${fromQuarter}')
                    OR (pc_year = '${toYear}' AND pc_quarter <= 'Q${toQuarter}')
                )`;
            }

            // Get products data
            const products: ProductData[] = [];
            const productsQuery = `
                SELECT 
                    p.pr_id,
                    p.pr_name,
                    pc.pc_year,
                    pc.pc_quarter,
                    pc.pc_amount
                FROM and_cirec.cr_rep_products p
                LEFT JOIN cr_rep_polishchemical pc ON p.pr_id = pc.pro_id
                WHERE p.pr_id IN (${productIds})
                AND ${periodCondition}
                ORDER BY p.pr_name, pc.pc_year, pc.pc_quarter
            `;

            const result = await executeQuery(productsQuery);
            const periodTotals: { [key: string]: number } = {};

            let currentProduct: ProductData | null = null;

            for (const row of result.recordset) {
                if (!currentProduct || currentProduct.productName !== row.pr_name) {
                    currentProduct = {
                        productName: row.pr_name,
                        data: [],
                        yearlyTotals: {}
                    };
                    products.push(currentProduct);
                }

                const period = `${row.pc_year}/Q${row.pc_quarter}`;
                const amount = parseFloat(row.pc_amount) || 0;

                // Handle special case for 0.00
                const formattedAmount: any = amount === 0 ? 'n/s' : amount;

                currentProduct.data.push({
                    period,
                    amount: formattedAmount
                });

                // Update yearly totals
                if (typeof formattedAmount === 'number') {
                    currentProduct.yearlyTotals[row.pc_year] =
                        (currentProduct.yearlyTotals[row.pc_year] || 0) + formattedAmount;

                    periodTotals[period] = (periodTotals[period] || 0) + formattedAmount;
                }
            }

            return h.response({
                success: true,
                data: {
                    title: "Polish Chemical Production Report",
                    fromPeriod: `Q${fromQuarter} ${fromYear}`,
                    toPeriod: `Q${toQuarter} ${toYear}`,
                    products,
                    totals: periodTotals
                }
            }).code(200);

        } catch (error) {
            logger.error("polish-chemical-route", `Failed to generate Polish chemical production data: ${error}`);
            return h.response({
                success: false,
                message: "Failed to generate Polish chemical production data",
            }).code(500);
        }
    },
};

async function getYearRange() {
    const maxYearResult = await executeQuery(
        "SELECT MAX(pc_year) as maxYear FROM cr_rep_polishchemical"
    );
    const minYearResult = await executeQuery(
        "SELECT MIN(pc_year) as minYear FROM cr_rep_polishchemical"
    );

    return {
        maxYear: maxYearResult.recordset[0].maxYear,
        minYear: minYearResult.recordset[0].minYear
    };
}