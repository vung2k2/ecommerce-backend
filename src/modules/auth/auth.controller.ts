import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/response.js';
import type { LoginInput, LogoutInput, RefreshTokenInput, RegisterInput } from './auth.schema.js';
import { authService } from './auth.service.js';

export const authController = {
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
  register: (async (request, response) => {
    const user = await authService.register(request.body);

    return sendSuccess(response, { user }, 201);
  }) as RequestHandler<Record<string, never>, unknown, RegisterInput>,

  /**
   * @openapi
   * /auth/login:
   *   post:
   *     summary: Login to the application
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
   *             properties:
   *               email:
   *                 type: string
   *                 format: email
   *                 example: alice@example.com
   *               password:
   *                 type: string
   *                 example: password123
   *     responses:
   *       200:
   *         description: Login successful
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: object
   *                   properties:
   *                     accessToken:
   *                       type: string
   *                       example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
   *                     refreshToken:
   *                       type: string
   *                       example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4gRG9lIiwiaWF0IjoxNTE2MjM5MDIyfQ.SflKxwRJSMeKKF2QT4fwpMeJf36POk6yJV_adQssw5c
   *       401:
   *         description: Invalid credentials or inactive account
   *       422:
   *         description: Validation error (invalid input)
   */
  login: (async (request, response) => {
    const result = await authService.login(request.body);

    return sendSuccess(response, result, 200);
  }) as RequestHandler<Record<string, never>, unknown, LoginInput>,

  /**
   * @openapi
   * /auth/refresh:
   *   post:
   *     summary: Refresh access token with token rotation & reuse detection
   *     tags:
   *       - Auth
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - refreshToken
   *             properties:
   *               refreshToken:
   *                 type: string
   *     responses:
   *       200:
   *         description: Tokens refreshed successfully
   *       401:
   *         description: Invalid/expired refresh token or reuse detected
   */
  refreshToken: (async (request, response) => {
    const result = await authService.refreshToken(request.body);
    return sendSuccess(response, result, 200);
  }) as RequestHandler<Record<string, never>, unknown, RefreshTokenInput>,

  /**
   * @openapi
   * /auth/logout:
   *   post:
   *     summary: Logout from current device
   *     tags:
   *       - Auth
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - refreshToken
   *             properties:
   *               refreshToken:
   *                 type: string
   *     responses:
   *       200:
   *         description: Logged out successfully
   */
  logout: (async (request, response) => {
    await authService.logout(request.body);
    return sendSuccess(response, { message: 'Logged out successfully' }, 200);
  }) as RequestHandler<Record<string, never>, unknown, LogoutInput>,

  /**
   * @openapi
   * /auth/logout-all:
   *   post:
   *     summary: Logout from all devices
   *     tags:
   *       - Auth
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Logged out from all devices successfully
   *       401:
   *         description: Unauthorized (Invalid or missing access token)
   */
  logoutAll: (async (request, response) => {
    await authService.logoutAll(request.user.userId);
    return sendSuccess(response, { message: 'Logged out from all devices successfully' }, 200);
  }) as RequestHandler,
};
