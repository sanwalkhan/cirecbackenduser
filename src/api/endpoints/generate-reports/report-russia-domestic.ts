import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

interface SalesData {
    period: string;
    amount: number;
}

interface CompanyData {
    name: string;
    data: SalesData[];
    location?: string;
    startDate?: string;
    technology?: string;
    feedstock?: string;
}

interface ProductData {
    productName: string;
    companies: CompanyData[];
    totalSales: SalesData[];
}

export const getRussianDomesticSalesOptions: RouteOptions = {
    description: "Russian Domestic Sales Report Generation",
    tags: ["api", "Reports"],
    notes: "Generates Russian domestic sales data by product and company",
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
                        companies: Joi.array().items(
                            Joi.object({
                                name: Joi.string().empty(""),
                                location: Joi.string().empty(""),
                                startDate: Joi.string().optional().empty(""),
                                technology: Joi.string().optional().empty(""),
                                feedstock: Joi.string().optional().empty(""),
                                data: Joi.array().items(
                                    Joi.object({
                                        period: Joi.string(),
                                        amount: Joi.number(),
                                    })
                                ),
                            })
                        ),
                        totalSales: Joi.array().items(
                            Joi.object({
                                period: Joi.string(),
                                amount: Joi.number(),
                            })
                        ),
                    })
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
                fromQuarter = 1,
                toYear = maxYear,
                toQuarter = 4,
                productIds = session.ProSelectedValue, //@notice this default value here
            } = request.query;

            // Build period condition
            let periodCondition = "";
            if (toYear === fromYear) {
                periodCondition = `re_year = '${fromYear}' 
                    AND re_quarter >= 'Q${fromQuarter}' 
                    AND re_quarter <= 'Q${toQuarter}'`;
            } else if ((toYear - fromYear) > 1) {
                periodCondition = `(
                    (re_year = '${fromYear}' AND re_quarter >= 'Q${fromQuarter}')
                    OR (re_year = '${toYear}' AND re_quarter <= 'Q${toQuarter}')
                    OR (re_year > '${fromYear}' AND re_year < '${toYear}')
                )`;
            } else {
                periodCondition = `(
                    (re_year = '${fromYear}' AND re_quarter >= 'Q${fromQuarter}')
                    OR (re_year = '${toYear}' AND re_quarter <= 'Q${toQuarter}')
                )`;
            }

            // Get products data
            const products: ProductData[] = [];
            const productsQuery = `
                SELECT pr_id, pr_name 
                FROM and_cirec.cr_rep_products 
                WHERE pr_id IN (${productIds})
            `;
            const productsResult = await executeQuery(productsQuery);

            for (const product of productsResult.recordset) {
                // Get company data for each product
                const companiesQuery = `
                    SELECT 
                        c.comp_name,
                        c.comp_location,
                        cd.start_date,
                        cd.comp_tech,
                        cd.comp_feed_stock,
                        r.re_year,
                        r.re_quarter,
                        SUM(r.re_amount) as amount
                    FROM and_cirec.cr_rep_companies c
                    JOIN cr_rep_russia_domestic_sales r ON c.comp_id = r.comp_id
                    LEFT JOIN cr_rep_comp_desc cd ON c.comp_id = cd.comp_id AND cd.pr_id = '${product.pr_id}'
                    WHERE r.pro_id = '${product.pr_id}'
                    AND ${periodCondition}
                    GROUP BY c.comp_name, c.comp_location, cd.start_date, cd.comp_tech, 
                            cd.comp_feed_stock, r.re_year, r.re_quarter
                    ORDER BY c.comp_name, r.re_year, r.re_quarter
                `;

                const companiesResult = await executeQuery(companiesQuery);
                const companies: CompanyData[] = [];
                let currentCompany: CompanyData | null = null;

                // Process company data
                for (const row of companiesResult.recordset) {
                    if (!currentCompany || currentCompany.name !== row.comp_name) {
                        currentCompany = {
                            name: row.comp_name,
                            location: row.comp_location,
                            startDate: row.start_date,
                            technology: row.comp_tech,
                            feedstock: row.comp_feed_stock,
                            data: []
                        };
                        companies.push(currentCompany);
                    }

                    currentCompany.data.push({
                        period: `${row.re_year}/Q${row.re_quarter}`,
                        amount: parseFloat(row.amount) || 0
                    });
                }

                // Calculate total sales for the product
                const totalSales: SalesData[] = [];
                const uniquePeriods = [...new Set(companiesResult.recordset.map(
                    row => `${row.re_year}/Q${row.re_quarter}`
                ))];

                for (const period of uniquePeriods) {
                    const total = companiesResult.recordset
                        .filter(row => `${row.re_year}/Q${row.re_quarter}` === period)
                        .reduce((sum, row) => sum + (parseFloat(row.amount) || 0), 0);

                    totalSales.push({ period, amount: total });
                }

                products.push({
                    productName: product.pr_name,
                    companies,
                    totalSales
                });
            }

            return h.response({
                success: true,
                data: {
                    title: "Russian Petrochemical Domestic Sales Report",
                    fromPeriod: `Q${fromQuarter} ${fromYear}`,
                    toPeriod: `Q${toQuarter} ${toYear}`,
                    products
                }
            }).code(200);

        } catch (error) {
            logger.error("russian-sales-route", `Failed to generate Russian domestic sales data: ${error}`);
            return h.response({
                success: false,
                message: "Failed to generate Russian domestic sales data",
            }).code(500);
        }
    },
};

async function getYearRange() {
    const maxYearResult = await executeQuery(
        "SELECT MAX(re_year) as maxYear FROM cr_rep_russia_domestic_sales"
    );
    const minYearResult = await executeQuery(
        "SELECT MIN(re_year) as minYear FROM cr_rep_russia_domestic_sales"
    );

    return {
        maxYear: maxYearResult.recordset[0].maxYear,
        minYear: minYearResult.recordset[0].minYear
    };
}