/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../../common/db";
import { EmailType, sendEmail } from "../../../../common/handlers";
import { calculateBilling } from "../../../../common/helpers";
import { config } from "../../../../common/index";
import { logger } from "../../../../common/logger";

export const signUpUserOptions: RouteOptions = {
    description: "User Subscription Sign Up",
    tags: ["api", "Users"],
    plugins: {
        "hapi-swagger": {
            order: 1,
        },
    },
    validate: {
        payload: Joi.object({
            title: Joi.string().max(50).optional().trim(),
            firstName: Joi.string().max(50).required().trim(),
            lastName: Joi.string().max(50).required().trim(),
            company: Joi.string().max(100).optional().trim(),
            telephoneNumber: Joi.string().pattern(/^\+?[0-9]{7,15}$/).optional(),
            emailAddress: Joi.string().email().required().lowercase().trim(),
            userName: Joi.string().min(3).max(30).required().trim(),
            password: Joi.string().min(8).max(200).required(),
            retypePassword: Joi.string().required().valid(Joi.ref("password")),
            accountType: Joi.string().valid("Corporate", "Single").required(),
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
                    then: Joi.number().valid(1, 2, 3, 4).required(),
                    otherwise: Joi.forbidden()
                })
            }).optional(),
            additionalEmails: Joi.when('additionalCopies.selected', {
                is: true,
                then: Joi.array().items(Joi.string().email()).length(Joi.ref('additionalCopies.copies')).required(),
                otherwise: Joi.forbidden()
            }),
            searchEngineAccess: Joi.object({
                selected: Joi.boolean().required(),
                duration: Joi.when('selected', {
                    is: true,
                    then: Joi.string().valid("3 months", "6 months", "12 months", "24 months").required(),
                    otherwise: Joi.forbidden()
                })
            }).optional(),
            statisticalDatabaseAccess: Joi.object({
                selected: Joi.boolean().required(),
                duration: Joi.when('selected', {
                    is: true,
                    then: Joi.string().valid("1 year", "2 years").required(),
                    otherwise: Joi.forbidden()
                })
            }).optional(),
            otherReports: Joi.array().items(
                Joi.string().valid(
                    "Central European Olefins & Polyolefin Production",
                    "Polish Chemical Production"
                )
            ).optional(),
            paymentType: Joi.string().valid("Credit card", "Through invoice").required(),
        }).unknown(false),
    },
    handler: async (request: Request, h) => {
        try {
            const payload = request.payload as any;

            // Check if the username or email already exists
            const [uscntResult, emailcntResult] = await Promise.all([
                executeQuery("SELECT COUNT(*) as count FROM and_cirec.cr_user WHERE us_username = @username", { username: payload.userName }),
                executeQuery("SELECT COUNT(*) as count FROM and_cirec.cr_user WHERE us_email = @email", { email: payload.emailAddress })
            ]);

            const uscnt = uscntResult.recordset[0].count;
            const emailcnt = emailcntResult.recordset[0].count;

            if (uscnt !== 0 || emailcnt !== 0) {
                if (uscnt !== 0 && emailcnt !== 0) {
                    return h.response({ error: "User name and Email already exist in the database" }).code(400);
                } else if (uscnt !== 0) {
                    return h.response({ error: "User name already exists in the database" }).code(400);
                } else {
                    return h.response({ error: "Email already exists in the database" }).code(400);
                }
            }

            // Generate the next user ID
            const maxIdResult = await executeQuery("SELECT ISNULL(MAX(us_id), 0) + 1 as maxId FROM and_cirec.cr_user");
            const maxId = maxIdResult.recordset[0].maxId;

            // Calculate billing
            const { total, acType, mntot, seatot, sdatot, admntot, othretot, othretot1 } = await calculateBilling(payload);

            // Insert the new user into the database
            await executeQuery(
                `INSERT INTO and_cirec.cr_user (
                    us_id, us_title, us_fname, us_lname, us_comp, 
                    us_phone, us_email, us_username, us_pass, 
                    us_type, us_grp, us_pay
                ) VALUES (
                    @id, @title, @firstName, @lastName, @company, 
                    @phone, @email, @username, @password, 
                    @accountType, @userGroups, @totalPrice
                )`,
                {
                    id: maxId,
                    title: payload.title || null,
                    firstName: payload.firstName,
                    lastName: payload.lastName,
                    company: payload.company || null,
                    phone: payload.telephoneNumber || null,
                    email: payload.emailAddress,
                    username: payload.userName,
                    password: payload.password,
                    accountType: acType,
                    userGroups: "A,B,C,D,E,F,G",
                    totalPrice: total
                }
            );

            // Handle Monthly News Registration
            if (payload.monthlyNews?.selected) {
                const startDate = new Date();
                const mnEndDate = new Date(startDate);
                mnEndDate.setFullYear(startDate.getFullYear() + (payload.monthlyNews.duration === "1 year" ? 1 : 2));

                const maxMnId = await executeQuery("SELECT ISNULL(MAX(um_id), 0) + 1 as maxId FROM and_cirec.cr_user_mnews");

                await executeQuery(
                    `INSERT INTO and_cirec.cr_user_mnews (
                        um_id, um_us_username, um_extra_copies, 
                        um_start_date, um_end_date, um_mon_amount
                    ) VALUES (
                        @mnId, @username, @extraCopies, 
                        @startDate, @endDate, @mntotal
                    )`,
                    {
                        mnId: maxMnId.recordset[0].maxId,
                        username: payload.userName,
                        extraCopies: payload.additionalCopies?.copies || 0,
                        startDate: startDate,
                        endDate: mnEndDate,
                        mntotal: mntot
                    }
                );

                if (payload.additionalCopies?.selected) {
                    await executeQuery(
                        `UPDATE and_cirec.cr_user_mnews 
                        SET um_ext_amount = @admntot 
                        WHERE um_us_username = @username`,
                        {
                            admntot: admntot,
                            username: payload.userName
                        }
                    );
                }
            }

            // Handle Search Engine Access Registration
            if (payload.searchEngineAccess?.selected) {
                const startDate = new Date();
                const seaEndDate = new Date(startDate);
                switch (payload.searchEngineAccess.duration) {
                    case "3 months": seaEndDate.setMonth(startDate.getMonth() + 3); break;
                    case "6 months": seaEndDate.setMonth(startDate.getMonth() + 6); break;
                    case "12 months": seaEndDate.setFullYear(startDate.getFullYear() + 1); break;
                    case "24 months": seaEndDate.setFullYear(startDate.getFullYear() + 2); break;
                }

                const maxSeaId = await executeQuery("SELECT ISNULL(MAX(usea_id), 0) + 1 as maxId FROM and_cirec.cr_user_sea");

                await executeQuery(
                    `INSERT INTO and_cirec.cr_user_sea (
                        usea_id, usea_us_username, 
                        usea_start_date, usea_end_date, usea_amount
                    ) VALUES (
                        @seaId, @username, 
                        @startDate, @endDate, @seatotal
                    )`,
                    {
                        seaId: maxSeaId.recordset[0].maxId,
                        username: payload.userName,
                        startDate: startDate,
                        endDate: seaEndDate,
                        seatotal: seatot
                    }
                );
            }

            // Handle Statistical Database Access Registration
            if (payload.statisticalDatabaseAccess?.selected) {
                const startDate = new Date();
                const sdaEndDate = new Date(startDate);
                sdaEndDate.setFullYear(startDate.getFullYear() + (payload.statisticalDatabaseAccess.duration === "1 year" ? 1 : 2));

                const maxSdaId = await executeQuery("SELECT ISNULL(MAX(usda_id), 0) + 1 as maxId FROM and_cirec.cr_user_sda");

                await executeQuery(
                    `INSERT INTO and_cirec.cr_user_sda (
                        usda_id, usda_us_username, 
                        usda_start_date, usda_end_date, usda_amount
                    ) VALUES (
                        @sdaId, @username, 
                        @startDate, @endDate, @sdatotal
                    )`,
                    {
                        sdaId: maxSdaId.recordset[0].maxId,
                        username: payload.userName,
                        startDate: startDate,
                        endDate: sdaEndDate,
                        sdatotal: sdatot
                    }
                );
            }

            // Handle Other Reports
            if (payload.otherReports && payload.otherReports.length > 0) {
                const maxSeatId = await executeQuery("SELECT ISNULL(MAX(seat_id), 0) + 1 as maxId FROM and_cirec.cr_user_seat");

                await executeQuery(
                    `INSERT INTO and_cirec.cr_user_seat (
                        seat_id, seat_us_username, 
                        seat_sep, seat_rtpa
                    ) VALUES (
                        @seatId, @username, 
                        @sep, @rtpa
                    )`,
                    {
                        seatId: maxSeatId.recordset[0].maxId,
                        username: payload.userName,
                        sep: payload.otherReports.includes("Central European Olefins & Polyolefin Production") ? "Y" : "N",
                        rtpa: payload.otherReports.includes("Polish Chemical Production") ? "Y" : "N"
                    }
                );

                await executeQuery(
                    `UPDATE and_cirec.cr_user_seat 
                    SET seat_sep_amount = @othretot, 
                        seat_rtpa_amount = @othretot1 
                    WHERE seat_us_username = @username`,
                    {
                        othretot: othretot,
                        othretot1: othretot1,
                        username: payload.userName
                    }
                );
            }

            // Send confirmation email
            try {
                await sendEmail(
                    config.enviornment === "development" ? config.supportEmailReceiver : "andrew@cirec.net",
                    "New Cirec Account Registration",
                    "new-registration-alert",
                    EmailType.NEW_REGISTRATION_ALERT,
                    {
                        fname: payload.firstName,
                        lname: payload.lastName,
                    }
                );
            } catch (emailError) {
                logger.error('signup-handler', `Failed to send confirmation email: ${emailError}`);
            }

            return {
                user: {
                    userName: payload.userName,
                    firstName: payload.firstName,
                    lastName: payload.lastName,
                    email: payload.emailAddress,
                    accountType: payload.accountType,
                    totalBill: total
                },
                message: "Registration Successful!",
            };
        } catch (error) {
            logger.error(`signup-handler`, `Handler failure: ${error}`);
            return h.response({
                error: "Registration failed",
                message: error instanceof Error ? error.message : "Unknown error occurred"
            }).code(500);
        }
    },
};
