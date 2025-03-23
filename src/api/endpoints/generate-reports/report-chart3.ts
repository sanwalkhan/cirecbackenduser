import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

interface ChartData {
    period: string;
    amount: number;
}

interface CompanyChartData {
    companyName: string;
    companyLocation: string;
    data: ChartData[];
    color: string;
}

export const getReportChart3Options: RouteOptions = {
    description: "Stacked Column Chart Report Generation",
    tags: ["api", "Reports"],
    notes: "Generates stacked column chart data showing product data across multiple companies",
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
                chartHeight: Joi.number(),
                companies: Joi.array().items(
                    Joi.object({
                        companyName: Joi.string(),
                        companyLocation: Joi.string(),
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

            // Get companies based on selection
            const companiesQuery = ((session?.CompSelectAll as any)?.toUpperCase()) === "TRUE"
                ? "SELECT comp_id, comp_name, comp_location FROM and_cirec.cr_rep_companies"
                : `SELECT comp_id, comp_name, comp_location FROM and_cirec.cr_rep_companies WHERE comp_id IN (${session.CompSelectedValue})`;

            const companiesResult = await executeQuery(companiesQuery);

            // Get product name
            const productQuery = `
                SELECT pr_name 
                FROM and_cirec.cr_rep_products 
                WHERE pr_id IN (${session.ProSelectedValue})
            `;
            const productResult = await executeQuery(productQuery);
            const productName = productResult.recordset[0]?.pr_name;

            // Get date range
            const { maxYear, minYear } = await getYearRange();
            const {
                fromYear = minYear,
                fromQuarter = 1,
                toYear = maxYear,
                toQuarter = 4,
            } = request.query;

            const chartData: CompanyChartData[] = [];
            let maxDataPoints = 0;

            // Process data for each company
            for (const company of companiesResult.recordset) {
                let periodQuery = "";

                if (toYear === fromYear) {
                    periodQuery = `
                        SELECT period_year, period_quarter, period_amount 
                        FROM dbo.cr_rep_period 
                        WHERE pro_id IN (${session.ProSelectedValue})
                        AND comp_id = '${company.comp_id}'
                        AND period_year = '${fromYear}'
                        AND period_quarter >= 'Q${fromQuarter}'
                        AND period_quarter <= 'Q${toQuarter}'
                        ORDER BY period_year, period_quarter
                    `;
                } else if ((toYear - fromYear) > 1) {
                    periodQuery = `
                        SELECT period_year, period_quarter, period_amount 
                        FROM dbo.cr_rep_period 
                        WHERE pro_id IN (${session.ProSelectedValue})
                        AND comp_id = '${company.comp_id}'
                        AND (
                            (period_year = '${fromYear}' AND period_quarter >= 'Q${fromQuarter}')
                            OR (period_year = '${toYear}' AND period_quarter <= 'Q${toQuarter}')
                            OR (period_year > '${fromYear}' AND period_year < '${toYear}')
                        )
                        ORDER BY period_year, period_quarter
                    `;
                } else {
                    periodQuery = `
                        SELECT period_year, period_quarter, period_amount 
                        FROM dbo.cr_rep_period 
                        WHERE pro_id IN (${session.ProSelectedValue})
                        AND comp_id = '${company.comp_id}'
                        AND (
                            (period_year = '${fromYear}' AND period_quarter >= 'Q${fromQuarter}')
                            OR (period_year = '${toYear}' AND period_quarter <= 'Q${toQuarter}')
                        )
                        ORDER BY period_year, period_quarter
                    `;
                }

                const periodResult = await executeQuery(periodQuery);

                if (periodResult.recordset.length > 0) {
                    const companyData: ChartData[] = periodResult.recordset.map(row => ({
                        period: row.period_quarter === 'Q1'
                            ? `${row.period_year}/${row.period_quarter}`
                            : row.period_quarter,
                        amount: parseInt(row.period_amount)
                    }));

                    maxDataPoints = Math.max(maxDataPoints, companyData.length);

                    chartData.push({
                        companyName: company.comp_name,
                        companyLocation: company.comp_location,
                        data: companyData,
                        color: generateRandomColor()
                    });
                }
            }

            // Calculate chart dimensions
            const chartWidth = Math.max(800, maxDataPoints * 40);
            const chartHeight = Math.max(450, (chartData.length * 30) + 60);

            return h.response({
                success: true,
                data: {
                    title: productName,
                    xAxisTitle: "Quarter",
                    yAxisTitle: "Kilo Tons",
                    chartWidth,
                    chartHeight,
                    companies: chartData
                }
            }).code(200);

        } catch (error) {
            logger.error("report-chart3-route", `Failed to generate chart data: ${error}`);
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