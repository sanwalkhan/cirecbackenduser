/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { calculateBilling } from "../../../../common/helpers";
import { logger } from "../../../../common/logger";

export const getSubscriptionBillTotalOptions: RouteOptions = {
    description: "Calculate Bill for Subscription Account",
    tags: ["api", "Users"],
    plugins: {
        "hapi-swagger": {
            order: 1,
        },
    },
    validate: {
        payload: Joi.object({

            // Account and Service Details (with some modifications)
            accountType: Joi.string().valid("Corporate", "Single").required().messages({
                "any.only": "Please select a valid account type.",
                "any.required": "Account Type is required.",
            }),

            // Monthly News - allow more flexible selection
            monthlyNews: Joi.object({
                selected: Joi.boolean().required(),
                duration: Joi.when('selected', {
                    is: true,
                    then: Joi.string().valid("1 year", "2 years").required(),
                    otherwise: Joi.forbidden()
                })
            }).optional(),

            additionalCopies: Joi.object({
                selected: Joi.boolean().required(),
                copies: Joi.when('selected', {
                    is: true,
                    then: Joi.number().valid(1, 2, 3, 4).required(), // Accepts copies as strings
                    otherwise: Joi.forbidden()
                })
            }).optional(),

            additionalEmails: Joi.when('additionalCopies.selected', {
                is: true,
                then: Joi.array()
                    .items(Joi.string().email())
                    .length(Joi.ref('additionalCopies.copies'))
                    .required(),
                otherwise: Joi.forbidden()
            }),

            // Search Engine Access - modified to be more flexible
            searchEngineAccess: Joi.object({
                selected: Joi.boolean().required(),
                duration: Joi.when('selected', {
                    is: true,
                    then: Joi.string().valid("3 months", "6 months", "12 months", "24 months").required(),
                    otherwise: Joi.forbidden()
                })
            }).optional(),

            // Statistical Database Access - similar approach
            statisticalDatabaseAccess: Joi.object({
                selected: Joi.boolean().required(),
                duration: Joi.when('selected', {
                    is: true,
                    then: Joi.string().valid("1 year", "2 years").required(),
                    otherwise: Joi.forbidden()
                })
            }).optional(),

            // Other Reports - allow selecting multiple
            otherReports: Joi.array().items(
                Joi.string().valid(
                    "Central European Olefins & Polyolefin Production",
                    "Polish Chemical Production"
                )
            ).optional(),

        }).unknown(false),
    },

    response: {
        schema: Joi.object({
            token: Joi.string(),
            user: Joi.object().unknown(),
            error: Joi.string(),
            success: Joi.boolean(),
            message: Joi.string(),
            totalPrice: Joi.number(),
            accountType: Joi.string(),
            // @todo define return type schema
            // breakdown: {
            //     accountType: payload.accountType,
            //     monthlyNews: payload.monthlyNews,
            //     additionalCopies: payload.additionalCopies,
            //     searchEngineAccess: payload.searchEngineAccess,
            //     statisticalDatabaseAccess: payload.statisticalDatabaseAccess,
            //     otherReports: payload.otherReports
            // }
            breakdown: Joi.object()
        }),
    },
    handler: async (request: Request, h) => {
        try {
            const payload = request.payload as any;

            // @todo Calculate billing functionality is not working properly yet...
            const { total: totalPrice, acType } = await calculateBilling(payload);

            // Return the calculated bill
            return h.response({
                success: true,
                totalPrice,
                accountType: acType,
                breakdown: {
                    accountType: payload.accountType,
                    monthlyNews: payload.monthlyNews,
                    additionalCopies: payload.additionalCopies,
                    searchEngineAccess: payload.searchEngineAccess,
                    statisticalDatabaseAccess: payload.statisticalDatabaseAccess,
                    otherReports: payload.otherReports
                }
            }).code(200);

        } catch (error) {
            logger.error(`get-subscription-bill`, `Handler failure: ${error}`);
            return h.response({
                success: false,
                error: "Subscription bill calculation failed",
                message: error instanceof Error ? error.message : "Unknown error occurred"
            }).code(500);
        }
    },
};