import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

interface ChartData {
    period: string;
    amount: number;
}

interface ProductChartData {
    productName: string;
    data: ChartData[];
    color: string;
}

export const getReportChart1Options: RouteOptions = {
    description: "Report Chart Generation",
    tags: ["api", "Reports"],
    notes: "Generates chart data for products and companies",
    validate: {
        headers: Joi.object({
            authorization: Joi.string().required(),
        }).unknown(),
        query: Joi.object({
            fromYear: Joi.number().optional(),
            fromQuarter: Joi.number().optional(),
            toYear: Joi.number().optional(),
            toQuarter: Joi.number().optional(),
        }),
    },
    plugins: {
        "hapi-swagger": {
            order: 4,
        },
    },
    response: {
        schema: Joi.object({
            success: Joi.boolean(),
            message: Joi.string().optional(),
            data: Joi.object({
                title: Joi.string(),
                xAxisTitle: Joi.string(),
                yAxisTitle: Joi.string(),
                chartWidth: Joi.number(),
                products: Joi.array().items(
                    Joi.object({
                        productName: Joi.string(),
                        data: Joi.array().items(
                            Joi.object({
                                period: Joi.string(),
                                amount: Joi.number(),
                            })
                        ),
                        color: Joi.string(),
                    })
                ),
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

            //@todo remove after testing
            // const session = {
            //     CRPROAUTH: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29",
            //     ProSelectAll: "TRUE",
            //     ProSelectedValue: "14",
            //     CompSelectedValue: "2"
            // }

            // Get products based on selection
            const productsQuery = (session?.ProSelectAll as any)?.toUpperCase() === "TRUE"
                ? `SELECT pr_id from and_cirec.cr_rep_products WHERE pr_id in (${session.CRPROAUTH})`
                : `SELECT pr_id from and_cirec.cr_rep_products WHERE pr_id IN (${session.ProSelectedValue})`;

            const productsResult = await executeQuery(productsQuery);

            // Get company information
            const companyQuery = `
            SELECT comp_name, comp_location 
            FROM and_cirec.cr_rep_companies 
            WHERE comp_id IN (${session.CompSelectedValue})
        `;
            const companyResult = await executeQuery(companyQuery);
            const companyName = companyResult.recordset[0]?.comp_name +
                '[' + companyResult.recordset[0]?.comp_location + ']';

            // Get date range
            const { maxYear, minYear } = await getYearRange();
            const {
                fromYear = minYear,
                fromQuarter = 1,
                toYear = maxYear,
                toQuarter = 4,
            } = request.query;

            // Process each product
            const chartData: ProductChartData[] = [];

            for (const product of productsResult.recordset) {
                let periodQuery = "";

                if (toYear === fromYear) {
                    periodQuery = `
                SELECT T1.*, T2.pr_name 
                FROM (x
                SELECT * FROM dbo.cr_rep_period 
                WHERE comp_id IN (${session.CompSelectedValue}) 
                AND pro_id = '${product.pr_id}' 
                AND period_year = '${fromYear}' 
                AND period_quarter >= 'Q${fromQuarter}' 
                AND period_quarter <= 'Q${toQuarter}'
                ) as T1
                JOIN (SELECT pr_id, pr_name FROM and_cirec.cr_rep_products) as T2 
                ON T1.pro_id = T2.pr_id 
                ORDER BY period_year, period_quarter
            `;
                } else if ((toYear - fromYear) > 1) {
                    periodQuery = `
                SELECT T1.*, T2.pr_name 
                FROM (
                SELECT * FROM dbo.cr_rep_period 
                WHERE comp_id IN (${session.CompSelectedValue}) 
                AND pro_id = '${product.pr_id}'
                AND (
                    (period_year = '${fromYear}' AND period_quarter >= 'Q${fromQuarter}')
                    OR (period_year = '${toYear}' AND period_quarter <= 'Q${toQuarter}')
                    OR (period_year > '${fromYear}' AND period_year < '${toYear}')
                )
                ) as T1
                JOIN (SELECT pr_id, pr_name FROM and_cirec.cr_rep_products) as T2 
                ON T1.pro_id = T2.pr_id 
                ORDER BY period_year, period_quarter
            `;
                } else {
                    periodQuery = `
                SELECT T1.*, T2.pr_name 
                FROM (
                SELECT * FROM dbo.cr_rep_period 
                WHERE comp_id IN (${session.CompSelectedValue}) 
                AND pro_id = '${product.pr_id}'
                AND (
                    (period_year = '${fromYear}' AND period_quarter >= 'Q${fromQuarter}')
                    OR (period_year = '${toYear}' AND period_quarter <= 'Q${toQuarter}')
                )
                ) as T1
                JOIN (SELECT pr_id, pr_name FROM and_cirec.cr_rep_products) as T2 
                ON T1.pro_id = T2.pr_id 
                ORDER BY period_year, period_quarter
            `;
                }

                const periodResult = await executeQuery(periodQuery);

                if (periodResult.recordset.length > 0) {
                    const productData: ChartData[] = periodResult.recordset.map(row => ({
                        period: row.period_quarter === 'Q1'
                            ? `${row.period_year}/${row.period_quarter}`
                            : row.period_quarter,
                        amount: parseInt(row.period_amount)
                    }));

                    // Generate random color
                    const color = generateRandomColor();

                    chartData.push({
                        productName: periodResult.recordset[0].pr_name,
                        data: productData,
                        color
                    });
                }
            }

            // Calculate chart width
            const maxDataPoints = Math.max(...chartData.map(p => p.data.length));
            const chartWidth = Math.max(800, maxDataPoints * 40);

            return h.response({
                success: true,
                data: {
                    title: companyName,
                    xAxisTitle: "Quarter",
                    yAxisTitle: "Kilo Tons",
                    chartWidth,
                    products: chartData
                }
            }).code(200);

        } catch (error) {
            logger.error("report-chart-route", `Failed to generate chart data: ${error}`);
            return h.response({
                success: false,
                message: "Failed to generate chart data",
            }).code(500);
        }
    },
};

// Helper function to get year range
async function getYearRange() {
    const maxYearResult = await executeQuery(
        "SELECT MAX(period_year) as maxYear FROM dbo.cr_rep_period"
    );
    const minYearResult = await executeQuery(
        "SELECT MIN(period_year) as minYear FROM dbo.cr_rep_period"
    );

    return {
        maxYear: maxYearResult.recordset[0].maxYear,
        minYear: minYearResult.recordset[0].minYear
    };
}

// Helper function to generate random color
function generateRandomColor(): string {
    const r = Math.floor(Math.random() * 155) + 100; // 100-255
    const g = Math.floor(Math.random() * 100) + 100; // 100-200
    const b = Math.floor(Math.random() * 55) + 100;  // 100-155
    return `rgb(${r},${g},${b})`;
}