import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/response.js';
import type { RegisterInput } from './auth.schema.js';
import { authService } from './auth.service.js';

/**
 * @openapi
 * /auth/register:
 *   post:
 *     summary: Register a new customer account
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *               - fullName
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: alice@example.com
 *               password:
 *                 type: string
 *                 example: password123
 *               fullName:
 *                 type: string
 *                 example: Alice Nguyen
 *     responses:
 *       201:
 *         description: Customer account registered successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 data:
 *                   type: object
 *                   properties:
 *                     user:
 *                       type: object
 *                       properties:
 *                         id:
 *                           type: string
 *                           example: cm6a8b123...
 *                         email:
 *                           type: string
 *                           example: alice@example.com
 *                         fullName:
 *                           type: string
 *                           example: Alice Nguyen
 *                         role:
 *                           type: string
 *                           example: CUSTOMER
 *                         createdAt:
 *                           type: string
 *                           example: "2026-08-13T10:00:00.000Z"
 *       409:
 *         description: Email is already registered
 *       422:
 *         description: Validation error (invalid input)
 */
export const authController = {
  register: (async (request, response) => {
    const user = await authService.register(request.body);

    return sendSuccess(response, { user }, 201);
  }) as RequestHandler<Record<string, never>, unknown, RegisterInput>,
};
