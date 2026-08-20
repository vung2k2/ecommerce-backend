import bcrypt from 'bcrypt';
import { AUTH_CONSTANTS, ERROR_CODES } from '../../../constants/index.js';
import { AppError } from '../../../utils/app-error.js';
import { staffRepository } from './staff.repository.js';
import type {
  CreateStaffDto,
  GetStaffQueryDto,
  UpdateStaffPermissionsDto,
  UpdateStaffStatusDto,
} from './staff.schema.js';

export const staffService = {
  async getStaffList(query: GetStaffQueryDto) {
    return staffRepository.findStaffList(query);
  },

  async createStaff(actorId: string, dto: CreateStaffDto) {
    const existingUser = await staffRepository.findUserByEmail(dto.email);

    if (existingUser) {
      throw new AppError(409, ERROR_CODES.EMAIL_ALREADY_EXISTS);
    }

    const passwordHash = await bcrypt.hash(dto.password, AUTH_CONSTANTS.BCRYPT_SALT_ROUNDS);

    return staffRepository.createStaffWithPermissions({
      email: dto.email,
      passwordHash,
      fullName: dto.fullName,
      permissions: dto.permissions,
      actorId,
    });
  },

  async updateStaffStatus(actorId: string, staffId: string, dto: UpdateStaffStatusDto) {
    return staffRepository.updateStaffStatus(staffId, dto, actorId);
  },

  async updateStaffPermissions(actorId: string, staffId: string, dto: UpdateStaffPermissionsDto) {
    return staffRepository.replaceStaffPermissions(staffId, dto.permissions, actorId);
  },
};
