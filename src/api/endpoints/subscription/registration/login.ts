/* eslint-disable @typescript-eslint/no-explicit-any */
import { RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../../common/db";
import { logger } from "../../../../common/logger";

export const signInUserOptions: RouteOptions = {
  description: "User Login",
  tags: ["api", "Users"],
  notes: "Handles user login and authentication",
  validate: {
    payload: Joi.object({
      username: Joi.string().required(),
      password: Joi.string().required(),
    }),
    query: Joi.object({
      url: Joi.string().optional(),
    }),
  },
  plugins: {
    "hapi-swagger": {
      order: 2,
    },
  },
  response: {
    schema: Joi.object({
      success: Joi.boolean(),
      message: Joi.string().optional(),
      session: Joi.object({
        CRAUTHLOGGED: Joi.string().optional(),
        CRAUTHUSER: Joi.string().optional(),
        CRPROAUTH: Joi.string().optional(),
        CRAUTHNEWS: Joi.string().optional(),
        CRAUTHSEA: Joi.string().optional(),
        CRAUTHSDA: Joi.string().optional(),
        CRAUTH_SEP: Joi.string().optional(),
        CRAUTH_RTPA: Joi.string().optional(),
      }).optional(),
      redirectUrl: Joi.string().optional(),
    }),
  },
  handler: async (request, h) => {
    const { username, password } = request.payload as { username: string; password: string };

    try {
      const result = await executeQuery(
        `
        DECLARE @logged BIT,
                @monlog BIT,
                @sealog BIT,
                @sdalog BIT,
                @seat_sep VARCHAR(2),
                @seat_rtpa VARCHAR(2);
        EXEC and_cirec.cr_login
          @username = @username,
          @password = @password,
          @logged = @logged OUTPUT,
          @monlog = @monlog OUTPUT,
          @sealog = @sealog OUTPUT,
          @sdalog = @sdalog OUTPUT,
          @seat_sep = @seat_sep OUTPUT,
          @seat_rtpa = @seat_rtpa OUTPUT;
        SELECT @logged AS logged, @monlog AS monlog, @sealog AS sealog,
               @sdalog AS sdalog, @seat_sep AS seat_sep, @seat_rtpa AS seat_rtpa;
      `,
        {
          username: username,
          password: password,
        }
      );

      const outputs = result.recordset[0];

      // Check login status
      if (outputs.logged) {
        // Fetch user group
        const groupQuery = `SELECT us_grp FROM and_cirec.cr_user WHERE us_username = @username`;
        const groupResult = await executeQuery(groupQuery, { username });

        const groups = groupResult.recordset[0]?.us_grp?.split(",") || [];

        // Build product query based on groups
        const productQuery = `SELECT pr_id FROM and_cirec.cr_rep_products WHERE ${groups
          .map((g: any) => `pr_group LIKE '%${g}%'`)
          .join(" OR ")}`;
        const productResult = await executeQuery(productQuery);

        const productIds = productResult.recordset.map((row) => row.pr_id).join(",") || "0";

        // Prepare session data
        const session = {
          CRAUTHLOGGED: "YES",
          CRAUTHUSER: username,
          CRPROAUTH: productIds,
          CRAUTHNEWS: outputs.monlog ? "YES" : "NO",
          CRAUTHSEA: outputs.sealog ? "YES" : "NO",
          CRAUTHSDA: outputs.sdalog ? "YES" : "NO",
          CRAUTH_SEP: outputs.seat_sep === "Y" ? "YES" : "NO",
          CRAUTH_RTPA: outputs.seat_rtpa === "Y" ? "YES" : "NO",
        };

        // @todo Check for redirect URL in query parameters & confirm if correct or not
        const redirectUrl = request.query.url
          ? request.query.url.includes("article?ar=")
            ? request.query.url
            : "default"
          : "default";

        return h
          .response({
            success: true,
            message: "Login Successful",
            session,
            redirectUrl,
          })
          .code(200);
      } else {
        return h
          .response({
            success: false,
            message: "Invalid Username & Password",
          })
          .code(401);
      }
    } catch (error) {
      logger.error("login-route", `Login process failed: ${error}`);
      return h
        .response({
          success: false,
          message: "Login process failed",
        })
        .code(500);
    }
  },
};
