import { Request, ResponseToolkit, RouteOptions } from "@hapi/hapi";
import Joi from "joi";
import { executeQuery } from "../../../common/db";
import { logger } from "../../../common/logger";

export const updateUserInfoOptions: RouteOptions = {
    description: "Update User Information",
    tags: ["api", "Users"],
    plugins: {
        "hapi-swagger": {
            order: 2,
        },
    },
    validate: {
        payload: Joi.object({
            username: Joi.string().required().trim().messages({
                "any.required": "Username is required to update user information",
            }),
            firstName: Joi.string().optional().trim().max(50),
            lastName: Joi.string().optional().trim().max(50),
            phone: Joi.string().optional().trim().regex(/^[0-9+\-().\s]+$/).max(20),
            department: Joi.string().optional().trim().max(100)
        }).or('firstName', 'lastName', 'phone', 'department').messages({
            "object.missing": "At least one field must be provided for update"
        })
    },
    handler: async (request: Request, h: ResponseToolkit) => {
        //@todo jwt auth check to update only related user profile
        try {
            const {
                username,
                firstName,
                lastName,
                phone,
                department
            } = request.payload as {
                username: string,
                firstName?: string,
                lastName?: string,
                phone?: string,
                department?: string
            };

            // Prepare update fields
            const updateFields: string[] = [];
            const queryParams: any = { username };

            if (firstName !== undefined) {
                updateFields.push('us_fname = @firstName');
                queryParams.firstName = firstName;
            }
            if (lastName !== undefined) {
                updateFields.push('us_lname = @lastName');
                queryParams.lastName = lastName;
            }
            if (phone !== undefined) {
                updateFields.push('us_phone = @phone');
                queryParams.phone = phone;
            }
            if (department !== undefined) {
                updateFields.push('us_dept = @department');
                queryParams.department = department;
            }

            // Check if there are any fields to update
            if (updateFields.length === 0) {
                return h.response({
                    success: false,
                    message: "No fields provided for update"
                }).code(400);
            }

            // Construct and execute update query
            const updateQuery = `
                UPDATE and_cirec.cr_user 
                SET ${updateFields.join(', ')}
                WHERE us_username = @username
            `;

            const result = await executeQuery(updateQuery, queryParams);

            // Check if any rows were affected
            if (result.rowsAffected[0] === 0) {
                return h.response({
                    success: false,
                    message: "User not found or no changes made"
                }).code(404);
            }

            // Fetch and return updated user information
            const userInfoQuery = `
                SELECT 
                    us_fname as firstName, 
                    us_lname as lastName, 
                    us_phone as phone, 
                    us_dept as department
                FROM and_cirec.cr_user
                WHERE us_username = @username
            `;

            const updatedUserResult = await executeQuery(userInfoQuery, { username });

            return h.response({
                success: true,
                message: "User information updated successfully",
                user: updatedUserResult.recordset[0]
            }).code(200);

        } catch (error) {
            logger.error(`update-user-info`, `Handler failure: ${error}`);
            return h.response({
                success: false,
                error: "Failed to update user information",
                message: error instanceof Error ? error.message : "Unknown error occurred"
            }).code(500);
        }
    }
};