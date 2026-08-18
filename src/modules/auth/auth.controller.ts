import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/response.js';
import type { LoginDto, LogoutDto, RefreshTokenDto, RegisterDto } from './auth.schema.js';
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
   *       400:
   *         description: Validation error
   *       409:
   *         description: Email is already registered
   */
  register: (async (req, res) => {
    const user = await authService.register(req.body);
    return sendSuccess(res, { user }, 201);
  }) as RequestHandler<Record<string, never>, unknown, RegisterDto>,

  /**
   * @openapi
   * /auth/login:
   *   post:
   *     summary: Authenticate customer and obtain tokens
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
   *                     refreshToken:
   *                       type: string
   *       400:
   *         description: Validation error
   *       401:
   *         description: Invalid credentials
   *       403:
   *         description: Account is inactive
   */
  login: (async (req, res) => {
    const result = await authService.login(req.body);
    return sendSuccess(res, result, 200);
  }) as RequestHandler<Record<string, never>, unknown, LoginDto>,

  /**
   * @openapi
   * /auth/refresh:
   *   post:
   *     summary: Rotate refresh token and issue a new access token
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
   *         description: Token rotated successfully
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
   *                     refreshToken:
   *                       type: string
   *       401:
   *         description: Invalid/expired refresh token or reuse detected
   *       403:
   *         description: Account is inactive
   */
  refreshToken: (async (req, res) => {
    const result = await authService.refreshToken(req.body);
    return sendSuccess(res, result, 200);
  }) as RequestHandler<Record<string, never>, unknown, RefreshTokenDto>,

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
  logout: (async (req, res) => {
    await authService.logout(req.body);
    return sendSuccess(res, { message: 'Logged out successfully' }, 200);
  }) as RequestHandler<Record<string, never>, unknown, LogoutDto>,

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
  logoutAll: (async (req, res) => {
    await authService.logoutAll(req.user.userId);
    return sendSuccess(res, { message: 'Logged out from all devices successfully' }, 200);
  }) as RequestHandler,
};
