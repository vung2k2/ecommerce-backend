import type { RequestHandler } from 'express';
import { sendSuccess } from '../../../utils/response.js';
import type {
  CreateStaffDto,
  GetStaffQueryDto,
  UpdateStaffPermissionsDto,
  UpdateStaffStatusDto,
} from './staff.schema.js';
import { staffService } from './staff.service.js';

export const staffController = {
  /**
   * @openapi
   * /admin/staff:
   *   get:
   *     summary: Get paginated list of staff accounts (Admin only)
   *     tags:
   *       - Admin Staff
   *     security:
   *       - bearerAuth: []
   *     parameters:
   *       - in: query
   *         name: page
   *         schema:
   *           type: integer
   *           default: 1
   *       - in: query
   *         name: limit
   *         schema:
   *           type: integer
   *           default: 20
   *       - in: query
   *         name: search
   *         schema:
   *           type: string
   *       - in: query
   *         name: isActive
   *         schema:
   *           type: boolean
   *     responses:
   *       200:
   *         description: Staff list retrieved successfully
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden (Admin only)
   */
  getStaffList: (async (req, res) => {
    const query = req.query as unknown as GetStaffQueryDto;
    const result = await staffService.getStaffList(query);
    return sendSuccess(res, result, 200);
  }) as RequestHandler,

  /**
   * @openapi
   * /admin/staff:
   *   post:
   *     summary: Create a new staff account (Admin only)
   *     tags:
   *       - Admin Staff
   *     security:
   *       - bearerAuth: []
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
   *               password:
   *                 type: string
   *                 minLength: 8
   *               fullName:
   *                 type: string
   *               permissions:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       201:
   *         description: Staff created successfully
   *       400:
   *         description: Validation error
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden (Admin only)
   *       409:
   *         description: Email already exists
   */
  createStaff: (async (req, res) => {
    const staff = await staffService.createStaff(req.user.userId, req.body);
    return sendSuccess(res, { staff }, 201);
  }) as RequestHandler<Record<string, never>, unknown, CreateStaffDto>,

  /**
   * @openapi
   * /admin/staff/{id}:
   *   patch:
   *     summary: Update staff status or profile (Admin only)
   *     tags:
   *       - Admin Staff
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
   *             required:
   *               - isActive
   *             properties:
   *               isActive:
   *                 type: boolean
   *               fullName:
   *                 type: string
   *     responses:
   *       200:
   *         description: Staff updated successfully
   *       400:
   *         description: Cannot deactivate last admin or validation error
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden (Admin only)
   *       404:
   *         description: Staff not found
   */
  updateStaffStatus: (async (req, res) => {
    const staff = await staffService.updateStaffStatus(
      req.user.userId,
      req.params.id,
      req.body,
    );
    return sendSuccess(res, { staff }, 200);
  }) as RequestHandler<{ id: string }, unknown, UpdateStaffStatusDto>,

  /**
   * @openapi
   * /admin/staff/{id}/permissions:
   *   put:
   *     summary: Update staff permissions (Admin only)
   *     tags:
   *       - Admin Staff
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
   *             required:
   *               - permissions
   *             properties:
   *               permissions:
   *                 type: array
   *                 items:
   *                   type: string
   *     responses:
   *       200:
   *         description: Staff permissions updated successfully
   *       400:
   *         description: Invalid target role or validation error
   *       401:
   *         description: Unauthorized
   *       403:
   *         description: Forbidden (Admin only)
   *       404:
   *         description: Staff not found
   */
  updateStaffPermissions: (async (req, res) => {
    const staff = await staffService.updateStaffPermissions(
      req.user.userId,
      req.params.id,
      req.body,
    );
    return sendSuccess(res, { staff }, 200);
  }) as RequestHandler<{ id: string }, unknown, UpdateStaffPermissionsDto>,
};
