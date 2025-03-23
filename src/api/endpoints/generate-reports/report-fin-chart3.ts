import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

// Helper function to get year range
interface ChartData {
    period: string;
    amount: number;
}

interface FinancialChartData {
    name: string;
    data: ChartData[];
    color: string;
}

export const getReportFinChart3Options: RouteOptions = {
    description: "Financial Report Chart Generation",
    tags: ["api", "Reports"],
    notes: "Generates financial chart data for turnover and operating profit",
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
                chartWidth: Joi.number(),
                series: Joi.array().items(
                    Joi.object({
                        name: Joi.string(),
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

            // //@todo remove after testing
            // const session = {
            //     CRPROAUTH: "1,2,3,4,5,6,7,8,9,10,11,12,13,14,15,16,17,18,19,20,21,22,23,24,25,26,27,28,29",
            //     ProSelectAll: "TRUE",
            //     ProSelectedValue: "14",
            //     CompSelectAll: "True",
            //     CompSelectedValue: "2"
            // }

            // Get companies based on selection
            const companiesQuery = session.CompSelectAll === "True"
                ? "SELECT comp_id from and_cirec.cr_rep_companies"
                : `SELECT comp_id from and_cirec.cr_rep_companies WHERE comp_id IN (${session.CompSelectedValue})`;

            const companiesResult = await executeQuery(companiesQuery);
            const companyIds = companiesResult.recordset.map(row => row.comp_id).join(',');

            // Get company names for title
            let chartTitle = "Summary Turnover in $ million";
            if (session.CompSelectAll !== "True") {
                const companyQuery = `
                    SELECT comp_name, comp_location 
                    FROM and_cirec.cr_rep_companies 
                    WHERE comp_id IN (${session.CompSelectedValue})
                `;
                const companyResult = await executeQuery(companyQuery);
                chartTitle = companyResult.recordset
                    .map(comp => `${comp.comp_name}[${comp.comp_location}]`)
                    .join(' / ');
            }

            // Get date range
            const { maxYear, minYear } = await getYearRange();
            const {
                fromYear = minYear,
                fromQuarter = 1,
                toYear = maxYear,
                toQuarter = 4,
            } = request.query;

            // Build turnover query based on date range
            let turnoverQuery = "";
            if (toYear === fromYear) {
                turnoverQuery = `
                    SELECT tf_year, tf_quarter, SUM(tf_amount) as AMT 
                    FROM dbo.cr_rep_turnover_finance
                    WHERE comp_id IN (${companyIds})
                    AND tf_year = '${fromYear}'
                    AND tf_quarter >= 'Q${fromQuarter}'
                    AND tf_quarter <= 'Q${toQuarter}'
                    GROUP BY tf_year, tf_quarter
                    ORDER BY tf_year, tf_quarter`;
            } else if ((toYear - fromYear) > 1) {
                turnoverQuery = `
                    SELECT tf_year, tf_quarter, SUM(tf_amount) as AMT 
                    FROM dbo.cr_rep_turnover_finance
                    WHERE comp_id IN (${companyIds})
                    AND (
                        (tf_year = '${fromYear}' AND tf_quarter >= 'Q${fromQuarter}')
                        OR (tf_year = '${toYear}' AND tf_quarter <= 'Q${toQuarter}')
                        OR (tf_year > '${fromYear}' AND tf_year < '${toYear}')
                    )
                    GROUP BY tf_year, tf_quarter
                    ORDER BY tf_year, tf_quarter`;
            } else {
                turnoverQuery = `
                    SELECT tf_year, tf_quarter, SUM(tf_amount) as AMT 
                    FROM dbo.cr_rep_turnover_finance
                    WHERE comp_id IN (${companyIds})
                    AND (
                        (tf_year = '${fromYear}' AND tf_quarter >= 'Q${fromQuarter}')
                        OR (tf_year = '${toYear}' AND tf_quarter <= 'Q${toQuarter}')
                    )
                    GROUP BY tf_year, tf_quarter
                    ORDER BY tf_year, tf_quarter`;
            }

            // Build gross finance query with same conditions
            let profitQuery = "";
            if (toYear === fromYear) {
                profitQuery = `
                    SELECT gf_year, gf_quarter, SUM(gf_amount) as AMT 
                    FROM dbo.cr_rep_gross_finance
                    WHERE comp_id IN (${companyIds})
                    AND gf_year = '${fromYear}'
                    AND gf_quarter >= 'Q${fromQuarter}'
                    AND gf_quarter <= 'Q${toQuarter}'
                    GROUP BY gf_year, gf_quarter
                    ORDER BY gf_year, gf_quarter`;
            } else if ((toYear - fromYear) > 1) {
                profitQuery = `
                    SELECT gf_year, gf_quarter, SUM(gf_amount) as AMT 
                    FROM dbo.cr_rep_gross_finance
                    WHERE comp_id IN (${companyIds})
                    AND (
                        (gf_year = '${fromYear}' AND gf_quarter >= 'Q${fromQuarter}')
                        OR (gf_year = '${toYear}' AND gf_quarter <= 'Q${toQuarter}')
                        OR (gf_year > '${fromYear}' AND gf_year < '${toYear}')
                    )
                    GROUP BY gf_year, gf_quarter
                    ORDER BY gf_year, gf_quarter`;
            } else {
                profitQuery = `
                    SELECT gf_year, gf_quarter, SUM(gf_amount) as AMT 
                    FROM dbo.cr_rep_gross_finance
                    WHERE comp_id IN (${companyIds})
                    AND (
                        (gf_year = '${fromYear}' AND gf_quarter >= 'Q${fromQuarter}')
                        OR (gf_year = '${toYear}' AND gf_quarter <= 'Q${toQuarter}')
                    )
                    GROUP BY gf_year, gf_quarter
                    ORDER BY gf_year, gf_quarter`;
            }

            const turnoverResult = await executeQuery(turnoverQuery);
            const profitResult = await executeQuery(profitQuery);

            // Process chart data
            const chartData: FinancialChartData[] = [];

            if (turnoverResult.recordset.length > 0) {
                const turnoverData: ChartData[] = turnoverResult.recordset.map(row => ({
                    period: row.tf_quarter === 'Q1'
                        ? `${row.tf_year}/${row.tf_quarter}`
                        : row.tf_quarter,
                    amount: parseFloat(row.AMT)
                }));

                chartData.push({
                    name: "TURNOVER",
                    data: turnoverData,
                    color: "rgb(0,0,255)" // Blue
                });
            }

            if (profitResult.recordset.length > 0) {
                const profitData: ChartData[] = profitResult.recordset.map(row => ({
                    period: row.gf_quarter === 'Q1'
                        ? `${row.gf_year}/${row.gf_quarter}`
                        : row.gf_quarter,
                    amount: parseFloat(row.AMT)
                }));

                chartData.push({
                    name: "OPERATING PROFIT",
                    data: profitData,
                    color: "rgb(255,0,0)" // Red
                });
            }

            // Calculate chart width
            const maxDataPoints = Math.max(
                turnoverResult.recordset.length,
                profitResult.recordset.length
            );
            const chartWidth = Math.max(800, maxDataPoints * 40);

            return h.response({
                success: true,
                data: {
                    title: chartTitle,
                    chartWidth,
                    series: chartData
                }
            }).code(200);

        } catch (error) {
            logger.error("report-chart2-route", `Failed to generate financial chart data: ${error}`);
            return h.response({
                success: false,
                message: "Failed to generate financial chart data",
            }).code(500);
        }
    },
};

// Helper function to get year range
async function getYearRange() {
    const maxYearResult = await executeQuery(
        "SELECT MAX(tf_year) as maxYear FROM dbo.cr_rep_turnover_finance"
    );
    const minYearResult = await executeQuery(
        "SELECT MIN(tf_year) as minYear FROM dbo.cr_rep_turnover_finance"
    );

    return {
        maxYear: maxYearResult.recordset[0].maxYear,
        minYear: minYearResult.recordset[0].minYear
    };
}
