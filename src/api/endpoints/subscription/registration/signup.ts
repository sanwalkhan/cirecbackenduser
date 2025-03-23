/* eslint-disable @typescript-eslint/no-explicit-any */
import { Request, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../../common/db";
import { logger } from "../../../../common/logger";

export const signUpUserIncompleteOptions: RouteOptions = {
  description: "User Subscription Sign Up",
  tags: ["api", "Users"],
  plugins: {
    "hapi-swagger": {
      order: 1,
    },
  },
  validate: {
    payload: Joi.object({
      title: Joi.string().max(50).optional().trim().messages({
        "string.max": "Title cannot exceed 50 characters.",
      }),

      firstName: Joi.string().max(50).required().trim().messages({
        "string.max": "First Name cannot exceed 50 characters.",
        "any.required": "First Name is required.",
      }),

      lastName: Joi.string().max(50).required().trim().messages({
        "string.max": "Last Name cannot exceed 50 characters.",
        "any.required": "Last Name is required.",
      }),

      company: Joi.string().max(100).optional().trim().messages({
        "string.max": "Company name cannot exceed 100 characters.",
      }),

      telephoneNumber: Joi.string()
        .pattern(/^\+?[0-9]{7,15}$/)
        .optional()
        .messages({
          "string.pattern.base": "Telephone number must be valid, containing 7 to 15 digits.",
        }),

      emailAddress: Joi.string().email().required().lowercase().trim().messages({
        "string.email": "E-Mail address must be a valid email.",
        "any.required": "E-Mail address is required.",
      }),

      userName: Joi.string().min(3).max(30).required().trim().messages({
        "string.min": "User Name must be at least 3 characters.",
        "string.max": "User Name cannot exceed 30 characters.",
        "any.required": "User Name is required.",
      }),

      password: Joi.string().min(8).max(200).required().messages({
        "string.min": "Password must be at least 8 characters.",
        "string.max": "Password cannot exceed 200 characters.",
        "any.required": "Password is required.",
      }),

      retypePassword: Joi.string().required().valid(Joi.ref("password")).messages({
        "any.only": "Passwords do not match.",
        "any.required": "Retype Password is required.",
      }),

      accountType: Joi.string().valid("Corporate", "Single").required().messages({
        "any.only": "Please select a valid account type.",
        "any.required": "Account Type is required.",
      }),

      monthlyNews: Joi.when("accountType", {
        is: "Corporate",
        then: Joi.string().valid("1 year", "2 years").default("1 year").required().messages({
          "any.only": "Monthly News must be 1 year or 2 years.",
          "any.required": "Monthly News selection is required for Corporate accounts.",
        }),
        otherwise: Joi.string().valid("1 year", "2 years").optional().messages({
          "any.only": "Monthly News must be 1 year or 2 years.",
        }),
      }),

      searchEngineAccess: Joi.when("accountType", {
        is: "Corporate",
        then: Joi.string()
          .valid("3 months", "6 months", "12 months", "24 months")
          .default("3 months")
          .required()
          .messages({
            "any.only": "Search Engine Access must be one of the available options.",
            "any.required": "Search Engine Access is required for Corporate accounts.",
          }),
        otherwise: Joi.string().valid("3 months", "6 months", "12 months", "24 months").optional().messages({
          "any.only": "Search Engine Access must be one of the available options.",
        }),
      }),

      statisticalDatabaseAccess: Joi.when("accountType", {
        is: "Corporate",
        then: Joi.string().valid("1 year", "2 years").default("1 year").required().messages({
          "any.only": "Statistical Database Access must be 1 year or 2 years.",
          "any.required": "Statistical Database Access is required for Corporate accounts.",
        }),
        otherwise: Joi.string().valid("1 year", "2 years").optional().messages({
          "any.only": "Statistical Database Access must be 1 year or 2 years.",
        }),
      }),

      additionalCopiesForNews: Joi.number().integer().min(1).max(4).optional().messages({
        "number.base": "Additional Copies for News must be a number.",
        "number.min": "Additional Copies for News must be at least 1.",
        "number.max": "Additional Copies for News cannot exceed 4.",
      }),

      additionalCopiesEmails: Joi.array()
        .items(
          Joi.string().email().required().messages({
            "string.email": "Each email address must be valid.",
          })
        )
        .when("additionalCopiesForNews", {
          is: Joi.number().greater(0),
          then: Joi.array().length(Joi.ref("additionalCopiesForNews")).required().messages({
            "array.length": "The number of email addresses must match the number of additional copies selected.",
            "any.required": "Email addresses are required when additional copies are selected.",
          }),
          otherwise: Joi.forbidden(),
        }),

      otherReports: Joi.when("accountType", {
        is: "Corporate",
        then: Joi.array()
          .items(Joi.string().valid("Central European Olefins & Polyolefin Production", "Polish Chemical Production"))
          .optional()
          .messages({
            "array.base": "Other Reports must be an array.",
            "any.only": "Invalid report selected.",
          }),
        otherwise: Joi.array()
          .items(Joi.string().valid("Central European Olefins & Polyolefin Production", "Polish Chemical Production"))
          .optional()
          .messages({
            "array.base": "Other Reports must be an array.",
            "any.only": "Invalid report selected.",
          }),
      }),

      paymentType: Joi.string().valid("Credit card", "Through invoice").required().messages({
        "any.only": "Payment Type must be Credit card or Through invoice.",
        "any.required": "Payment Type selection is required.",
      }),
    }).unknown(false),
  },

  response: {
    schema: Joi.object({
      token: Joi.string(),
      user: Joi.object().unknown(),
      error: Joi.string(),
      message: Joi.string(),
    }),
  },
  handler: async (request: Request, h) => {
    try {
      const {
        title,
        firstName,
        lastName,
        company,
        telephoneNumber,
        emailAddress,
        userName,
        password,
        retypePassword,
        accountType,
        monthlyNews,
        searchEngineAccess,
        statisticalDatabaseAccess,
        additionalCopiesForNews,
        additionalCopiesEmails,
        otherReports,
        paymentType,
      } = request.payload as {
        title?: string;
        firstName: string;
        lastName: string;
        company?: string;
        telephoneNumber?: string;
        emailAddress: string;
        userName: string;
        password: string;
        retypePassword: string;
        accountType: "Corporate" | "Single";
        monthlyNews?: "1 year" | "2 years";
        searchEngineAccess?: "3 months" | "6 months" | "12 months" | "24 months";
        statisticalDatabaseAccess?: "1 year" | "2 years";
        additionalCopiesForNews?: number;
        additionalCopiesEmails?: string[];
        otherReports?: string[];
        paymentType: "Credit card" | "Through invoice";
      };

      // Check if passwords match
      if (password !== retypePassword) {
        return h.response({ error: "Passwords do not match!" }).code(400);
      }

      // Check username for spaces
      if (/\s/.test(userName)) {
        return h.response({ error: "User Name should not contain any spaces!" }).code(400);
      }

      // Validate additional copies email addresses
      if (additionalCopiesForNews && additionalCopiesEmails) {
        if (additionalCopiesEmails.length !== additionalCopiesForNews) {
          return h
            .response({
              error: `Please provide exactly ${additionalCopiesForNews} email address(es) for the additional copies.`,
            })
            .code(400);
        }
      }

      // Validate options for Corporate Account
      if (accountType === "Corporate") {
        if (!monthlyNews || !searchEngineAccess || !statisticalDatabaseAccess) {
          return h
            .response({
              error:
                "Corporate account requires Monthly News, Search Engine Access, and Statistical Database Access to be selected.",
            })
            .code(400);
        }
      }

      // Check if the username or email already exists
      const uscntResult = await executeQuery(
        "SELECT COUNT(*) as count FROM and_cirec.cr_user WHERE us_username = @username",
        { username: userName }
      );
      const uscnt = uscntResult.recordset[0].count;

      const emailcntResult = await executeQuery(
        "SELECT COUNT(*) as count FROM and_cirec.cr_user WHERE us_email = @email",
        { email: emailAddress }
      );
      const emailcnt = emailcntResult.recordset[0].count;

      // Handle errors based on username and email existence
      if (uscnt !== 0 || emailcnt !== 0) {
        if (uscnt !== 0 && emailcnt !== 0) {
          return { error: "User name and Email already exist in the database" };
        } else if (uscnt !== 0) {
          return { error: "User name already exists in the database" };
        } else {
          return { error: "Email already exists in the database" };
        }
      }

      // Generate the next user ID
      const maxIdResult = await executeQuery("SELECT ISNULL(MAX(us_id), 0) + 1 as maxId FROM and_cirec.cr_user");
      const maxId = maxIdResult.recordset[0].maxId;

      // Insert the new user into the database
      await executeQuery(
        `
          INSERT INTO and_cirec.cr_user (us_id, us_title, us_fname, us_lname, us_comp, us_phone, us_email, us_username, us_pass)
          VALUES (@id, @title, @firstName, @lastName, @company, @phone, @email, @username, @password)
          `,
        {
          id: maxId,
          title: title,
          firstName: firstName,
          lastName: lastName,
          company: company,
          phone: telephoneNumber,
          email: emailAddress,
          username: userName,
          password: password,
        }
      );

      //@todo send mail functionality here implementation
      // // Simulate session variables
      // const session = {
      //   RegStep: "1",
      //   RegUserName: txtUsname,
      // };

      // return { success: true, session };

      // // Password encryption
      // const encryptedPassword = await bcrypt.hash(password + config.passwordSalt, config.saltRound);

      // // Save user
      // const _user = await createUserByEmail({
      //     title,
      //     firstName,
      //     lastName,
      //     company,
      //     telephoneNumber,
      //     email: emailAddress,
      //     userName,
      //     password: encryptedPassword,
      //     accountType,
      //     monthlyNews,
      //     searchEngineAccess,
      //     statisticalDatabaseAccess,
      //     additionalCopiesForNews,
      //     otherReports,
      //     paymentType,
      // });

      // // Business logic for sending email verification
      // try {
      //     await sendEmailVerificationCode(emailAddress);
      // } catch (error: any) {
      //     return h.response({ error: error.message }).code(400);
      // }

      //@todo complete the remaining functionality

      // // Response
      return {
        user: {
          firstName: firstName,
          // lastName: _user.lastName,
          // email: _user.email,
          // accountType: _user.accountType,
          // createdAt: _user.createdAt,
        },
        message: "Success! Email verification code has been sent to your email address.",
      };
    } catch (error) {
      logger.error(`new-account-handler`, `Handler failure: ${error}`);
      throw error;
    }
  },
};
