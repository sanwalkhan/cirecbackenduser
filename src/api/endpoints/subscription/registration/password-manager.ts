/* eslint-disable @typescript-eslint/no-explicit-any */
import { RouteOptions } from "@hapi/hapi";
import { executeQuery } from "../../../../common/db";

import Joi from "joi";
import { EmailType, sendEmail } from "../../../../common/handlers";
import { config } from "../../../../common/index";

export const passwordManagerOptions: RouteOptions = {
  description: "Reset Password",
  tags: ["api", "Users"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    payload: Joi.object({
      email: Joi.string().email().required(),
    }),
  },
  handler: async (request, h) => {
    const { email } = request.payload as { email: string };

    try {
      // @todo do we need this check Sanitize the email input
      const sanitizedEmail = email.replace("'", " ").replace(";", " ").replace(" or ", " ").replace("#", "");

      // Check if the email exists in the database
      const countQuery = `SELECT COUNT(*) AS count FROM and_cirec.cr_user WHERE us_email = '${sanitizedEmail}'`;
      const countResult = await executeQuery(countQuery);

      if (countResult.recordset[0]?.count === 0) {
        return h
          .response({
            success: false,
            message: "Sorry! Email not found in our database.",
          })
          .code(404);
      }

      // Fetch username and password
      const userQuery = `SELECT us_username, us_pass, us_lname, us_fname from and_cirec.cr_user where us_email = '${sanitizedEmail}'`;
      const userResult = await executeQuery(userQuery);

      const { us_username: username, us_pass: password, us_lname: lname, us_fname: fname } = userResult.recordset[0];

      try {
        await sendEmail(
          config.enviornment === "development" ? config.supportEmailReceiver : email as string,
          "Developemt Test Mail: Password of Cirec Account",
          "forget-password-resend-credientials-email",
          EmailType.FORGOT_PASSWORD_CREDIENTIALS_RESEND,
          {
            user: fname + lname,
            username,
            password
          }
        );
      } catch (error) {
        return h.response({ success: false, message: "Invalid email address No such User" }).code(400);
      }

      return h
        .response({
          success: true,
          message: `Information has been sent to ${sanitizedEmail}.`,
        })
        .code(200);
    } catch (error) {
      console.error("Error during password reset:", error);
      return h
        .response({
          success: false,
          message: "An error occurred while processing your request.",
        })
        .code(500);
    }
  },
  response: {
    schema: Joi.object({
      user: Joi.object().unknown(),
      error: Joi.string(),
    }),
  },
};
