import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/response.js';
import type { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from './users.schema.js';
import { usersService } from './users.service.js';

export const usersController = {
  /**
   * @openapi
   * /users/me:
   *   get:
   *     summary: Get current user profile
   *     tags:
   *       - Users
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: Current user profile retrieved successfully
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
   *                           format: uuid
   *                           example: 123e4567-e89b-12d3-a456-426614174000
   *                         email:
   *                           type: string
   *                           format: email
   *                           example: alice@example.com
   *                         fullName:
   *                           type: string
   *                           example: Alice Nguyen
   *                         role:
   *                           type: string
   *                           example: CUSTOMER
   *                         isActive:
   *                           type: boolean
   *                           example: true
   *                         createdAt:
   *                           type: string
   *                           format: date-time
   *                         updatedAt:
   *                           type: string
   *                           format: date-time
   *       401:
   *         description: Unauthorized (Invalid or missing token)
   */
  getProfile: (async (req, res) => {
    const user = await usersService.getProfile(req.user.userId);
    return sendSuccess(res, { user }, 200);
  }) as RequestHandler,

  /**
   * @openapi
   * /users/me:
   *   patch:
   *     summary: Update current user profile
   *     tags:
   *       - Users
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               fullName:
   *                 type: string
   *                 minLength: 2
   *                 maxLength: 100
   *                 example: Alice Updated
   *     responses:
   *       200:
   *         description: User profile updated successfully
   *       401:
   *         description: Unauthorized
   *       422:
   *         description: Validation error
   */
  updateProfile: (async (req, res) => {
    const user = await usersService.updateProfile(req.user.userId, req.body);
    return sendSuccess(res, { user }, 200);
  }) as RequestHandler<Record<string, never>, unknown, UpdateProfileDto>,

  /**
   * @openapi
   * /users/me/addresses:
   *   get:
   *     summary: Get all shipping addresses of current user
   *     tags:
   *       - Users
   *     security:
   *       - bearerAuth: []
   *     responses:
   *       200:
   *         description: List of shipping addresses retrieved successfully
   *         content:
   *           application/json:
   *             schema:
   *               type: object
   *               properties:
   *                 data:
   *                   type: object
   *                   properties:
   *                     addresses:
   *                       type: array
   *                       items:
   *                         type: object
   *                         properties:
   *                           id:
   *                             type: string
   *                             format: uuid
   *                           recipientName:
   *                             type: string
   *                           phone:
   *                             type: string
   *                           province:
   *                             type: string
   *                           district:
   *                             type: string
   *                           ward:
   *                             type: string
   *                           streetAddress:
   *                             type: string
   *                           isDefault:
   *                             type: boolean
   *       401:
   *         description: Unauthorized
   */
  getAddresses: (async (req, res) => {
    const addresses = await usersService.getAddresses(req.user.userId);
    return sendSuccess(res, { addresses }, 200);
  }) as RequestHandler,

  /**
   * @openapi
   * /users/me/addresses:
   *   post:
   *     summary: Create a new shipping address
   *     tags:
   *       - Users
   *     security:
   *       - bearerAuth: []
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required:
   *               - recipientName
   *               - phone
   *               - province
   *               - district
   *               - ward
   *               - streetAddress
   *             properties:
   *               recipientName:
   *                 type: string
   *                 example: Alice Nguyen
   *               phone:
   *                 type: string
   *                 example: "0912345678"
   *               province:
   *                 type: string
   *                 example: Hà Nội
   *               district:
   *                 type: string
   *                 example: Cầu Giấy
   *               ward:
   *                 type: string
   *                 example: Dịch Vọng
   *               streetAddress:
   *                 type: string
   *                 example: 123 Đường Cầu Giấy
   *               isDefault:
   *                 type: boolean
   *                 default: false
   *     responses:
   *       201:
   *         description: Shipping address created successfully
   *       401:
   *         description: Unauthorized
   *       422:
   *         description: Validation error
   */
  createAddress: (async (req, res) => {
    const address = await usersService.createAddress(req.user.userId, req.body);
    return sendSuccess(res, { address }, 201);
  }) as RequestHandler<Record<string, never>, unknown, CreateAddressDto>,

  /**
   * @openapi
   * /users/me/addresses/{id}:
   *   patch:
   *     summary: Update a shipping address
   *     tags:
   *       - Users
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               recipientName:
   *                 type: string
   *               phone:
   *                 type: string
   *               province:
   *                 type: string
   *               district:
   *                 type: string
   *               ward:
   *                 type: string
   *               streetAddress:
   *                 type: string
   *               isDefault:
   *                 type: boolean
   *     responses:
   *       200:
   *         description: Shipping address updated successfully
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Address not found
   *       422:
   *         description: Validation error
   */
  updateAddress: (async (req, res) => {
    const address = await usersService.updateAddress(req.params.id, req.user.userId, req.body);
    return sendSuccess(res, { address }, 200);
  }) as RequestHandler<{ id: string }, unknown, UpdateAddressDto>,

  /**
   * @openapi
   * /users/me/addresses/{id}:
   *   delete:
   *     summary: Delete a shipping address
   *     tags:
   *       - Users
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Shipping address deleted successfully
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Address not found
   *       422:
   *         description: Validation error (invalid UUID format)
   */
  deleteAddress: (async (req, res) => {
    await usersService.deleteAddress(req.params.id, req.user.userId);
    return sendSuccess(res, { message: 'Address deleted successfully' }, 200);
  }) as RequestHandler<{ id: string }>,

  /**
   * @openapi
   * /users/me/addresses/{id}/default:
   *   patch:
   *     summary: Set a shipping address as default
   *     tags:
   *       - Users
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: path
   *         name: id
   *         required: true
   *         schema:
   *           type: string
   *           format: uuid
   *     responses:
   *       200:
   *         description: Address set as default successfully
   *       401:
   *         description: Unauthorized
   *       404:
   *         description: Address not found
   *       422:
   *         description: Validation error (invalid UUID format)
   */
  setDefaultAddress: (async (req, res) => {
    const address = await usersService.setDefaultAddress(req.params.id, req.user.userId);
    return sendSuccess(res, { address }, 200);
  }) as RequestHandler<{ id: string }>,
};
