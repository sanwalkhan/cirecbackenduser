import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

interface QuarterlyData {
    amount: number | 'n/s';
    quarter: string;
    year: string;
}

interface CountryBreakdown {
    countryId: string;
    countryName: string;
    quarterlyData: QuarterlyData[];
    yearlyTotals: { [key: string]: number };
}

interface ProductBreakdown {
    productId: string;
    productName: string;
    quarterlyData: QuarterlyData[];
    yearlyTotals: { [key: string]: number };
    countryBreakdowns: CountryBreakdown[];
}

export const getOlefinsPolyolefinReportOptions: RouteOptions = {
    description: "Central European Olefins & Polyolefin Report Generation",
    tags: ["api", "Reports"],
    notes: "Generates quarterly and yearly production data for olefins and polyolefin products with country breakdowns",
    validate: {
        headers: Joi.object({
            authorization: Joi.string().required(),
        }).unknown(),
        query: Joi.object({
            fromYear: Joi.number().optional(),
            toYear: Joi.number().optional(),
            fromQuarter: Joi.number().min(1).max(4).optional(),
            toQuarter: Joi.number().min(1).max(4).optional(),
            productIds: Joi.string().optional(),
            includeCountryBreakdown: Joi.boolean().default(true)
        }),
    },
    plugins: {
        "hapi-swagger": {
            order: 5,
        },
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

            if (session.CRAUTH_SEP !== "YES") {
                return h.response({
                    success: false,
                    message: "Access denied: SEP permission required",
                }).code(403);
            }

            if (!session.ReportGen || session.ReportGen !== "true") {
                return h.response({
                    success: false,
                    message: "Report generation not initialized",
                }).code(403);
            }

            // Get date ranges
            const { maxYear, minYear } = await getYearRange();
            const {
                fromYear = minYear,
                toYear = maxYear,
                fromQuarter = 1,
                toQuarter = 4,
                productIds = session.ProSelectedValue,
                includeCountryBreakdown = true
            } = request.query;

            // Build period condition
            const periodCondition = buildPeriodCondition(fromYear, toYear, fromQuarter, toQuarter);

            // Get product data
            const productSummary = await getProductSummary(productIds, periodCondition);

            // Get country breakdowns if requested
            let countryBreakdowns = null;
            if (includeCountryBreakdown) {
                countryBreakdowns = await getCountryBreakdowns(productIds, periodCondition);
            }

            const response = {
                success: true,
                data: {
                    title: "Central European Olefins & Polyolefin Production Report",
                    period: `Q${fromQuarter} ${fromYear} to Q${toQuarter} ${toYear}`,
                    summary: {
                        products: productSummary.products,
                        aggregateTonnage: productSummary.aggregateTonnage
                    },
                    ...(includeCountryBreakdown && { countryBreakdowns })
                }
            };

            return h.response(response).code(200);

        } catch (error) {
            logger.error("olefins-polyolefin-route", `Failed to generate report: ${error}`);
            return h.response({
                success: false,
                message: "Failed to generate olefins & polyolefin report",
            }).code(500);
        }
    },
};

async function getYearRange() {
    const maxYearResult = await executeQuery(
        "SELECT MAX(op_year) as maxYear FROM cr_rep_olypoly"
    );
    const minYearResult = await executeQuery(
        "SELECT MIN(op_year) as minYear FROM cr_rep_olypoly"
    );

    return {
        maxYear: maxYearResult.recordset[0].maxYear,
        minYear: minYearResult.recordset[0].minYear
    };
}

function buildPeriodCondition(fromYear: number, toYear: number, fromQuarter: number, toQuarter: number): string {
    if (toYear === fromYear) {
        return `op_year = '${fromYear}' AND op_quarter >= 'Q${fromQuarter}' AND op_quarter <= 'Q${toQuarter}'`;
    } else if ((toYear - fromYear) > 1) {
        return `(
            (op_year = '${fromYear}' AND op_quarter >= 'Q${fromQuarter}') OR 
            (op_year = '${toYear}' AND op_quarter <= 'Q${toQuarter}') OR 
            (op_year > '${fromYear}' AND op_year < '${toYear}')
        )`;
    } else {
        return `(
            (op_year = '${fromYear}' AND op_quarter >= 'Q${fromQuarter}') OR 
            (op_year = '${toYear}' AND op_quarter <= 'Q${toQuarter}')
        )`;
    }
}

async function getProductSummary(productIds: string, periodCondition: string) {
    const query = `
        SELECT 
            p.pr_name,
            op.op_year,
            op.op_quarter,
            ISNULL(SUM(op.op_amount), 0) as total_amount
        FROM and_cirec.cr_rep_products p
        LEFT JOIN cr_rep_olypoly op ON p.pr_id = op.pro_id
        WHERE p.pr_id IN (${productIds})
        AND ${periodCondition}
        GROUP BY p.pr_name, op.op_year, op.op_quarter
        ORDER BY p.pr_name, op.op_year, op.op_quarter
    `;

    const result = await executeQuery(query);
    const products: any[] = [];
    const aggregateTonnage: { [key: string]: number } = {};

    let currentProduct: any = null;

    for (const row of result.recordset) {
        if (!currentProduct || currentProduct.productName !== row.pr_name) {
            currentProduct = {
                productName: row.pr_name,
                quarterlyData: [],
                yearlyTotals: {}
            };
            products.push(currentProduct);
        }

        const amount = parseFloat(row.total_amount);
        const formattedAmount = amount === 0 ? 'n/s' : amount;

        currentProduct.quarterlyData.push({
            year: row.op_year,
            quarter: row.op_quarter,
            amount: formattedAmount
        });

        // Update yearly totals
        if (typeof formattedAmount === 'number') {
            currentProduct.yearlyTotals[row.op_year] =
                (currentProduct.yearlyTotals[row.op_year] || 0) + formattedAmount;
            aggregateTonnage[row.op_year] =
                (aggregateTonnage[row.op_year] || 0) + formattedAmount;
        }
    }

    return { products, aggregateTonnage };
}

async function getCountryBreakdowns(productIds: string, periodCondition: string) {
    const query = `
        SELECT 
            p.pr_name,
            p.pr_id,
            c.cu_id,
            c.cu_name,
            op.op_year,
            op.op_quarter,
            op.op_amount
        FROM and_cirec.cr_rep_products p
        JOIN cr_rep_olypoly op ON p.pr_id = op.pro_id
        JOIN cr_countries c ON op.cun_id = c.cu_id
        WHERE p.pr_id IN (${productIds})
        AND ${periodCondition}
        AND op.op_amount > 0
        ORDER BY p.pr_name, c.cu_name, op.op_year, op.op_quarter
    `;

    const result = await executeQuery(query);
    const breakdowns: ProductBreakdown[] = [];

    let currentProduct: ProductBreakdown | null = null;
    let currentCountry: CountryBreakdown | null = null;

    for (const row of result.recordset) {
        if (!currentProduct || currentProduct.productId !== row.pr_id) {
            currentProduct = {
                productId: row.pr_id,
                productName: row.pr_name,
                quarterlyData: [],
                yearlyTotals: {},
                countryBreakdowns: []
            };
            breakdowns.push(currentProduct);
        }

        if (!currentCountry || currentCountry.countryId !== row.cu_id) {
            currentCountry = {
                countryId: row.cu_id,
                countryName: row.cu_name,
                quarterlyData: [],
                yearlyTotals: {}
            };
            currentProduct.countryBreakdowns.push(currentCountry);
        }

        const amount = parseFloat(row.op_amount);
        const formattedAmount = amount === 0 ? 'n/s' : Number(amount.toFixed(2));

        currentCountry.quarterlyData.push({
            year: row.op_year,
            quarter: row.op_quarter,
            amount: formattedAmount
        });

        // Update yearly totals
        if (typeof formattedAmount === 'number') {
            currentCountry.yearlyTotals[row.op_year] =
                (currentCountry.yearlyTotals[row.op_year] || 0) + formattedAmount;
        }
    }

    return breakdowns;
}