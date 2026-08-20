import type { RequestHandler } from 'express';
import { sendPaginated, sendSuccess } from '../../../utils/response.js';
import type {
  CreateStaffDto,
  GetStaffQueryDto,
  UpdateStaffPermissionsDto,
  UpdateStaffStatusDto,
} from './staff.schema.js';
import { staffService } from './staff.service.js';

export const staffController = {
  getStaffList: (async (req, res) => {
    const query = req.query as unknown as GetStaffQueryDto;
    const [staffList, total] = await staffService.getStaffList(query);
    return sendPaginated(res, staffList, total, query, 200);
  }) as RequestHandler,

  createStaff: (async (req, res) => {
    const staff = await staffService.createStaff(req.user.userId, req.body);
    return sendSuccess(res, { staff }, 201);
  }) as RequestHandler<Record<string, never>, unknown, CreateStaffDto>,

  updateStaffStatus: (async (req, res) => {
    const staff = await staffService.updateStaffStatus(req.user.userId, req.params.id, req.body);
    return sendSuccess(res, { staff }, 200);
  }) as RequestHandler<{ id: string }, unknown, UpdateStaffStatusDto>,

  updateStaffPermissions: (async (req, res) => {
    const staff = await staffService.updateStaffPermissions(
      req.user.userId,
      req.params.id,
      req.body,
    );
    return sendSuccess(res, { staff }, 200);
  }) as RequestHandler<{ id: string }, unknown, UpdateStaffPermissionsDto>,
};
