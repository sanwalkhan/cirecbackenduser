import { config } from "../../../common/index";
import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { EmailType, sendEmail } from "../../../common/handlers";
import { logger } from "../../../common/logger";

// Send Mail Route
export const sendContactUsMail: RouteOptions = {
    description: "Send Contact Us Email",
    tags: ["api", "ContactUs"],
    validate: {
        payload: Joi.object({
            firstName: Joi.string().required().max(50),
            lastName: Joi.string().required().max(60),
            country: Joi.string().required(),
            phone: Joi.string().required().max(60),
            email: Joi.string().email().required().max(80),
            subject: Joi.string().required().max(80),
            message: Joi.string().required().max(860)
        })
    },
    response: {
        schema: Joi.object({
            success: Joi.boolean(),
            message: Joi.string().optional()
        })
    },
    handler: async (request, h) => {
        const {
            firstName,
            lastName,
            country,
            phone,
            email,
            subject,
            message
        } = request.payload as any;

        try {
            // Prepare database insertion parameters
            const insertParams = [
                null, // Auto-generate contact_id
                firstName,
                lastName,
                country,
                phone,
                email,
                subject,
                message,
                new Date().toISOString()
            ];

            // Insert contact form submission
            const insertQuery = `
                INSERT INTO cr_contactus 
                (cr_contact_id, cr_name, cr_last_name, cr_company, 
                cr_phone, cr_email, cr_subject, cr_massage, cr_time) 
                VALUES (
                    (SELECT ISNULL(MAX(cr_contact_id), 0) + 1 FROM cr_contactus),
                    @p1, @p2, @p3, @p4, @p5, @p6, @p7, @p8
                )
            `;
            await executeQuery(insertQuery, insertParams);

            try {
                await sendEmail(
                    config.enviornment === "development" ? config.supportEmailReceiver : "als@cirec.net",
                    "Developemt Test Mail: New Contact Form Submission",
                    "contact-us-form-submission",
                    EmailType.CONTACT_US_FORM_SUBMISSION,
                    {
                        firstName: firstName,
                        lastName: lastName,
                        country,
                        phone,
                        email,
                        subject,
                        message
                    }
                );
            } catch (error) {
                return h.response({ success: false, message: "Sorry! Couldn't record your message. Try again later!" }).code(400);
            }

            return h.response({
                success: true,
                message: 'Thank you for contacting us! Your Message has been recorded Successfully.',
            }).code(200);

        } catch (error) {
            logger.error("contact-us-submission", `Submission failed: ${error}`);
            return h.response({
                success: false,
                message: 'Failed to process your submission'
            }).code(500);
        }
    }
};