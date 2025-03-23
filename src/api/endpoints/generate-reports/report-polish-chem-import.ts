import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

interface ImportData {
    country: string;
    year: string;
    amount: number | 'n/s';
}

interface ProductSummary {
    productName: string;
    yearlyData: {
        [year: string]: number | 'n/s';
    };
}

interface CountryBreakdown {
    country: string;
    countryId: string;
    yearlyData: {
        [year: string]: number | 'n/s';
    };
}

interface ProductBreakdown {
    productName: string;
    yearlyData: {
        [year: string]: number;
    };
    countryBreakdowns: CountryBreakdown[];
}

export const getPolishChemicalImportOptions: RouteOptions = {
    description: "Polish Chemical Import Report Generation",
    tags: ["api", "Reports"],
    notes: "Generates Polish chemical import data by product and country with detailed breakdowns",
    validate: {
        headers: Joi.object({
            authorization: Joi.string().required(),
        }).unknown(),
        query: Joi.object({
            fromYear: Joi.number().optional(),
            toYear: Joi.number().optional(),
            productIds: Joi.string().optional(),
            includeCountryBreakdown: Joi.boolean().default(true)
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
                summary: Joi.object({
                    products: Joi.array().items(
                        Joi.object({
                            productName: Joi.string(),
                            yearlyData: Joi.object().pattern(
                                Joi.string(),
                                Joi.alternatives().try(
                                    Joi.number(),
                                    Joi.string().valid('n/s')
                                )
                            )
                        })
                    ),
                    aggregateTonnage: Joi.object().pattern(
                        Joi.string(),
                        Joi.number()
                    )
                }),
                countryBreakdowns: Joi.array().items(
                    Joi.object({
                        productName: Joi.string(),
                        yearlyData: Joi.object().pattern(
                            Joi.string(),
                            Joi.number()
                        ),
                        countryBreakdowns: Joi.array().items(
                            Joi.object({
                                country: Joi.string(),
                                countryId: Joi.string(),
                                yearlyData: Joi.object().pattern(
                                    Joi.string(),
                                    Joi.alternatives().try(
                                        Joi.number(),
                                        Joi.string().valid('n/s')
                                    )
                                )
                            })
                        )
                    })
                ).optional()
            }),
        }),
    },
    handler: async (request, h) => {
        try {
            // Check authentication
            const session = request.auth.credentials;
            if (session.CRAUTHLOGGED !== "YES") {
                return h.response({
                    success: false,
                    message: "Authentication required",
                }).code(401);
            }

            if (session.CRAUTHSDA !== "YES") {
                return h.response({
                    success: false,
                    message: "Access denied: SDA permission required",
                }).code(403);
            }

            if (!session.ReportGen || session.ReportGen !== "true") {
                return h.response({
                    success: false,
                    message: "Report generation not initialized",
                }).code(403);
            }

            // Get date range
            const { maxYear, minYear } = await getYearRange();
            const {
                fromYear = minYear,
                toYear = maxYear,
                productIds = session.ProSelectedValue,
                includeCountryBreakdown = true,
                format = 'json'
            } = request.query;

            // Build year condition
            let yearCondition = "";
            if (toYear === fromYear) {
                yearCondition = `pc_year = '${fromYear}'`;
            } else {
                yearCondition = `pc_year >= '${fromYear}' AND pc_year <= '${toYear}'`;
            }

            // Get summary data for all products
            const summaryData = await getSummaryData(productIds, yearCondition);

            // Get country breakdowns if requested
            let countryBreakdowns = null;
            if (includeCountryBreakdown) {
                countryBreakdowns = await getCountryBreakdowns(productIds, yearCondition);
            }

            const response = {
                success: true,
                data: {
                    title: "Polish Chemical Import Report",
                    fromPeriod: fromYear.toString(),
                    toPeriod: toYear.toString(),
                    summary: summaryData,
                    ...(includeCountryBreakdown && { countryBreakdowns })
                }
            };

            return h.response(response).code(200);

        } catch (error) {
            logger.error("polish-chemical-import-route", `Failed to generate Polish chemical import data: ${error}`);
            return h.response({
                success: false,
                message: "Failed to generate Polish chemical import data",
            }).code(500);
        }
    },
};

async function getSummaryData(productIds: string, yearCondition: string) {
    const summaryQuery = `
        SELECT 
            p.pr_name,
            pc.pc_year,
            SUM(pc.pc_amount) as total_amount
        FROM and_cirec.cr_rep_products p
        LEFT JOIN cr_rep_polishchemical_import pc ON p.pr_id = pc.pro_id
        WHERE p.pr_id IN (${productIds})
        AND ${yearCondition}
        GROUP BY p.pr_name, pc.pc_year
        ORDER BY p.pr_name, pc.pc_year
    `;

    const result = await executeQuery(summaryQuery);
    const products: ProductSummary[] = [];
    const aggregateTonnage: { [key: string]: number } = {};

    let currentProduct: ProductSummary | null = null;

    for (const row of result.recordset) {
        if (!currentProduct || currentProduct.productName !== row.pr_name) {
            currentProduct = {
                productName: row.pr_name,
                yearlyData: {}
            };
            products.push(currentProduct);
        }

        const amount = parseFloat(row.total_amount) || 0;
        const formattedAmount = amount === 0 ? 'n/s' : Number(amount.toFixed(2));

        currentProduct.yearlyData[row.pc_year] = formattedAmount;

        if (typeof formattedAmount === 'number') {
            aggregateTonnage[row.pc_year] = (aggregateTonnage[row.pc_year] || 0) + formattedAmount;
        }
    }

    return {
        products,
        aggregateTonnage
    };
}

async function getCountryBreakdowns(productIds: string, yearCondition: string) {
    const countryQuery = `
        SELECT 
            p.pr_name,
            pc.country,
            pc.pc_year,
            pc.pc_amount
        FROM and_cirec.cr_rep_products p
        LEFT JOIN cr_rep_polishchemical_import pc ON p.pr_id = pc.pro_id
        WHERE p.pr_id IN (${productIds})
        AND ${yearCondition}
        AND pc.pc_amount > 0
        ORDER BY p.pr_name, pc.country, pc.pc_year
    `;

    const result = await executeQuery(countryQuery);
    const breakdowns: ProductBreakdown[] = [];

    let currentProduct: ProductBreakdown | null = null;
    let currentCountry: CountryBreakdown | null = null;

    for (const row of result.recordset) {
        if (!currentProduct || currentProduct.productName !== row.pr_name) {
            currentProduct = {
                productName: row.pr_name,
                yearlyData: {},
                countryBreakdowns: []
            };
            breakdowns.push(currentProduct);
        }

        if (!currentCountry || currentCountry.country !== row.country) {
            currentCountry = {
                country: row.country,
                countryId: generateCountryId(row.country),
                yearlyData: {}
            };
            currentProduct.countryBreakdowns.push(currentCountry);
        }

        const amount = parseFloat(row.pc_amount) || 0;
        const formattedAmount = amount === 0 ? 'n/s' : Number(amount.toFixed(2));

        currentCountry.yearlyData[row.pc_year] = formattedAmount;
    }

    return breakdowns;
}

function generateCountryId(countryName: string): string {
    return countryName.toLowerCase().replace(/\s+/g, '-');
}

async function getYearRange() {
    const maxYearResult = await executeQuery(
        "SELECT MAX(pc_year) as maxYear FROM cr_rep_polishchemical_import"
    );
    const minYearResult = await executeQuery(
        "SELECT MIN(pc_year) as minYear FROM cr_rep_polishchemical_import"
    );

    return {
        maxYear: maxYearResult.recordset[0].maxYear,
        minYear: minYearResult.recordset[0].minYear
    };
}
