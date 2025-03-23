import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

interface FinancialData {
    amount: number | 'n/s';
    quarter: string;
    year: string;
}

interface CompanyBreakdown {
    companyId: string;
    companyName: string;
    location: string;
    quarterlyTurnover: FinancialData[];
    quarterlyOperatingProfit: FinancialData[];
    yearlyTotals: {
        turnover: { [key: string]: number };
        operatingProfit: { [key: string]: number };
    };
}

export const getFinancialReportChart2Options: RouteOptions = {
    description: "Financial Report Generation for Turnover and Operating Profit",
    tags: ["api", "Reports"],
    notes: "Generates quarterly and yearly financial data including turnover and operating profit with company breakdowns",
    validate: {
        headers: Joi.object({
            authorization: Joi.string().required(),
        }).unknown(),
        query: Joi.object({
            fromYear: Joi.number().optional(),
            toYear: Joi.number().optional(),
            fromQuarter: Joi.number().min(1).max(4).optional(),
            toQuarter: Joi.number().min(1).max(4).optional(),
            companyIds: Joi.string().optional(),
            allCompanies: Joi.boolean().default(false)
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

            // Get date ranges
            const { maxYear, minYear } = await getYearRange();
            const {
                fromYear = minYear,
                toYear = maxYear,
                fromQuarter = 1,
                toQuarter = 4,
                companyIds = session.CompSelectedValue,
                allCompanies = false
            } = request.query;

            // Get company IDs
            const selectedCompanyIds = allCompanies ?
                await getAllCompanyIds() :
                companyIds;

            // Build period condition
            const periodCondition = buildPeriodCondition(fromYear, toYear, fromQuarter, toQuarter);

            // Get financial data
            const companyBreakdowns = await getCompanyFinancialData(selectedCompanyIds, periodCondition, {
                fromYear,
                toYear,
                fromQuarter,
                toQuarter
            });

            const response = {
                success: true,
                data: {
                    title: "Financial Performance Report",
                    period: `Q${fromQuarter} ${fromYear} to Q${toQuarter} ${toYear}`,
                    companyBreakdowns,
                    aggregateTotals: calculateAggregateTotals(companyBreakdowns)
                }
            };

            return h.response(response).code(200);

        } catch (error) {
            logger.error("financial-report-route", `Failed to generate report: ${error}`);
            return h.response({
                success: false,
                message: "Failed to generate financial report",
            }).code(500);
        }
    },
};

async function getYearRange() {
    const maxYearResult = await executeQuery(
        "SELECT MAX(tf_year) as maxYear FROM cr_rep_turnover_finance"
    );
    const minYearResult = await executeQuery(
        "SELECT MIN(tf_year) as minYear FROM cr_rep_turnover_finance"
    );

    return {
        maxYear: maxYearResult.recordset[0].maxYear,
        minYear: minYearResult.recordset[0].minYear
    };
}

async function getAllCompanyIds(): Promise<string> {
    const result = await executeQuery(
        "SELECT comp_id FROM and_cirec.cr_rep_companies"
    );
    return result.recordset.map(row => row.comp_id).join(',');
}

function buildPeriodCondition(fromYear: number, toYear: number, fromQuarter: number, toQuarter: number): string {
    if (toYear === fromYear) {
        return `year = ${fromYear} AND quarter >= 'Q${fromQuarter}' AND quarter <= 'Q${toQuarter}'`;
    } else if ((toYear - fromYear) > 1) {
        return `(year = ${fromYear} AND quarter >= 'Q${fromQuarter}') OR 
                (year = ${toYear} AND quarter <= 'Q${toQuarter}') OR 
                (year > ${fromYear} AND year < ${toYear})`;
    } else {
        return `(year = ${fromYear} AND quarter >= 'Q${fromQuarter}') OR 
                (year = ${toYear} AND quarter <= 'Q${toQuarter}')`;
    }
}

async function getCompanyFinancialData(
    companyIds: string,
    periodCondition: string,
    dateRange: { fromYear: number; toYear: number; fromQuarter: number; toQuarter: number }
) {
    // Query for turnover data
    const turnoverQuery = `
        SELECT 
            c.comp_id,
            c.comp_name,
            c.comp_location,
            tf.tf_year as year,
            tf.tf_quarter as quarter,
            SUM(tf.tf_amount) as turnover_amount
        FROM and_cirec.cr_rep_companies c
        LEFT JOIN cr_rep_turnover_finance tf ON c.comp_id = tf.comp_id
        WHERE (${companyIds ? `c.comp_id IN (${companyIds})` : '1=1'})
        AND (
            (tf.tf_year = ${dateRange.fromYear} AND tf.tf_quarter >= 'Q${dateRange.fromQuarter}') OR
            (tf.tf_year = ${dateRange.toYear} AND tf.tf_quarter <= 'Q${dateRange.toQuarter}') OR
            (tf.tf_year > ${dateRange.fromYear} AND tf.tf_year < ${dateRange.toYear})
        )
        GROUP BY c.comp_id, c.comp_name, c.comp_location, tf.tf_year, tf.tf_quarter
    `;

    // Query for operating profit data
    const profitQuery = `
        SELECT 
            c.comp_id,
            gf.gf_year as year,
            gf.gf_quarter as quarter,
            SUM(gf.gf_amount) as profit_amount
        FROM and_cirec.cr_rep_companies c
        LEFT JOIN cr_rep_gross_finance gf ON c.comp_id = gf.comp_id
        WHERE (${companyIds ? `c.comp_id IN (${companyIds})` : '1=1'})
        AND (
            (gf.gf_year = ${dateRange.fromYear} AND gf.gf_quarter >= 'Q${dateRange.fromQuarter}') OR
            (gf.gf_year = ${dateRange.toYear} AND gf.gf_quarter <= 'Q${dateRange.toQuarter}') OR
            (gf.gf_year > ${dateRange.fromYear} AND gf.gf_year < ${dateRange.toYear})
        )
        GROUP BY c.comp_id, gf.gf_year, gf.gf_quarter
    `;

    const [turnoverResult, profitResult] = await Promise.all([
        executeQuery(turnoverQuery),
        executeQuery(profitQuery)
    ]);

    const breakdowns: CompanyBreakdown[] = [];
    const companies = new Map<string, CompanyBreakdown>();

    // Process turnover data
    for (const row of turnoverResult.recordset) {
        if (!companies.has(row.comp_id)) {
            companies.set(row.comp_id, {
                companyId: row.comp_id,
                companyName: row.comp_name,
                location: row.comp_location,
                quarterlyTurnover: [],
                quarterlyOperatingProfit: [],
                yearlyTotals: {
                    turnover: {},
                    operatingProfit: {}
                }
            });
        }

        const company = companies.get(row.comp_id)!;
        const turnoverAmount = parseFloat(row.turnover_amount) || 0;

        company.quarterlyTurnover.push({
            year: row.year,
            quarter: row.quarter,
            amount: turnoverAmount || 'n/s'
        });

        if (turnoverAmount) {
            company.yearlyTotals.turnover[row.year] =
                (company.yearlyTotals.turnover[row.year] || 0) + turnoverAmount;
        }
    }

    // Process operating profit data
    for (const row of profitResult.recordset) {
        const company = companies.get(row.comp_id);
        if (company) {
            const profitAmount = parseFloat(row.profit_amount) || 0;

            company.quarterlyOperatingProfit.push({
                year: row.year,
                quarter: row.quarter,
                amount: profitAmount || 'n/s'
            });

            if (profitAmount) {
                company.yearlyTotals.operatingProfit[row.year] =
                    (company.yearlyTotals.operatingProfit[row.year] || 0) + profitAmount;
            }
        }
    }

    return Array.from(companies.values());
}

function calculateAggregateTotals(companyBreakdowns: CompanyBreakdown[]) {
    const aggregateTotals = {
        turnover: {} as { [key: string]: number },
        operatingProfit: {} as { [key: string]: number }
    };

    companyBreakdowns.forEach(company => {
        Object.entries(company.yearlyTotals.turnover).forEach(([year, amount]) => {
            aggregateTotals.turnover[year] = (aggregateTotals.turnover[year] || 0) + amount;
        });
        Object.entries(company.yearlyTotals.operatingProfit).forEach(([year, amount]) => {
            aggregateTotals.operatingProfit[year] = (aggregateTotals.operatingProfit[year] || 0) + amount;
        });
    });

    return aggregateTotals;
}