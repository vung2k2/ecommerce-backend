import { AUDIT_ACTIONS, ROLES, type Permission } from '../../../constants/index.js';
import { prisma } from '../../../database/prisma.js';
import type { Prisma } from '../../../generated/prisma/client.js';
import { AppError } from '../../../utils/app-error.js';
import { auditRepository } from '../../audit/audit.repository.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

export interface FindStaffParams {
  page?: number | undefined;
  limit?: number | undefined;
  search?: string | undefined;
  isActive?: boolean | undefined;
}

export interface CreateStaffData {
  email: string;
  passwordHash: string;
  fullName: string;
  permissions: Permission[];
  actorId: string;
}

export interface UpdateStaffStatusData {
  isActive: boolean;
  fullName?: string | undefined;
}

const staffSelect = {
  id: true,
  email: true,
  fullName: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
  permissions: {
    select: {
      permission: true,
    },
  },
} as const;

type StaffWithPermissionsRecord = Prisma.UserGetPayload<{
  select: typeof staffSelect;
}>;

function toStaffResult(user: StaffWithPermissionsRecord) {
  return {
    ...user,
    permissions: user.permissions.map((p) => p.permission),
  };
}

export const staffRepository = {
  lockAdminProtection(tx: Prisma.TransactionClient) {
    return tx.$queryRaw<Array<{ locked: string }>>`
      SELECT pg_advisory_xact_lock(hashtextextended('admin-role-protection', 0))::text AS locked
    `;
  },

  lockUserSessions(userId: string, tx: Prisma.TransactionClient) {
    return tx.$queryRaw<Array<{ locked: string }>>`
      SELECT pg_advisory_xact_lock(hashtextextended(${`auth-user:${userId}`}, 0))::text AS locked
    `;
  },

  async findStaffList(params: FindStaffParams, tx: PrismaClientOrTx = prisma) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.UserWhereInput = {
      role: ROLES.STAFF,
      ...(params.isActive !== undefined ? { isActive: params.isActive } : {}),
      ...(params.search
        ? {
            OR: [
              { email: { contains: params.search, mode: 'insensitive' } },
              { fullName: { contains: params.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const [staffList, total] = await Promise.all([
      tx.user.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        select: staffSelect,
      }),
      tx.user.count({ where }),
    ]);

    return [staffList.map(toStaffResult), total] as const;
  },

  async findUserById(id: string, tx: PrismaClientOrTx = prisma) {
    const user = await tx.user.findUnique({
      where: { id },
      select: staffSelect,
    });

    return user ? toStaffResult(user) : null;
  },

  findUserByEmail(email: string, tx: PrismaClientOrTx = prisma) {
    return tx.user.findUnique({
      where: { email },
    });
  },

  async createStaffWithPermissions(data: CreateStaffData) {
    return prisma.$transaction(async (tx) => {
      const user = await tx.user.create({
        data: {
          email: data.email,
          passwordHash: data.passwordHash,
          fullName: data.fullName,
          role: ROLES.STAFF,
          isActive: true,
        },
      });

      if (data.permissions.length > 0) {
        await tx.userPermission.createMany({
          data: data.permissions.map((perm) => ({
            userId: user.id,
            permission: perm,
          })),
        });
      }

      await auditRepository.createAuditLog(
        {
          actorId: data.actorId,
          action: AUDIT_ACTIONS.STAFF_CREATED,
          targetType: 'USER',
          targetId: user.id,
          payload: {
            email: user.email,
            fullName: user.fullName,
            permissions: data.permissions,
          },
        },
        tx,
      );

      const createdStaff = await tx.user.findUniqueOrThrow({
        where: { id: user.id },
        select: staffSelect,
      });

      return toStaffResult(createdStaff);
    });
  },

  async updateStaffStatus(
    id: string,
    data: UpdateStaffStatusData,
    actorId: string,
  ) {
    return prisma.$transaction(async (tx) => {
      // Lock serialize toàn bộ thao tác bảo vệ Admin và lock phiên làm việc của user đích
      await staffRepository.lockAdminProtection(tx);
      await staffRepository.lockUserSessions(id, tx);

      const targetUser = await tx.user.findUnique({ where: { id } });

      if (!targetUser) {
        throw new AppError(404, 'USER_NOT_FOUND', 'Staff account not found');
      }

      if (targetUser.role === ROLES.CUSTOMER) {
        throw new AppError(
          400,
          'INVALID_TARGET_ROLE',
          'Cannot manage customer accounts through staff endpoints',
        );
      }

      // Invariant: Không cho phép vô hiệu hóa Admin cuối cùng
      if (targetUser.role === ROLES.ADMIN && data.isActive === false) {
        const activeAdmins = await tx.user.count({
          where: {
            role: ROLES.ADMIN,
            isActive: true,
          },
        });

        if (activeAdmins <= 1) {
          throw new AppError(
            400,
            'CANNOT_DEACTIVATE_LAST_ADMIN',
            'Cannot deactivate the last active admin account',
          );
        }
      }

      await tx.user.update({
        where: { id },
        data: {
          isActive: data.isActive,
          ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
        },
      });

      // Nếu vô hiệu hóa tài khoản, thu hồi toàn bộ refresh token hiện có
      if (!data.isActive) {
        await tx.refreshToken.updateMany({
          where: { userId: id, isRevoked: false },
          data: { isRevoked: true },
        });
      }

      await auditRepository.createAuditLog(
        {
          actorId,
          action: AUDIT_ACTIONS.STAFF_STATUS_UPDATED,
          targetType: 'USER',
          targetId: id,
          payload: {
            isActive: data.isActive,
            fullName: data.fullName,
          },
        },
        tx,
      );

      const updatedStaff = await tx.user.findUniqueOrThrow({
        where: { id },
        select: staffSelect,
      });

      return toStaffResult(updatedStaff);
    });
  },

  async replaceStaffPermissions(id: string, permissions: Permission[], actorId: string) {
    return prisma.$transaction(async (tx) => {
      // Lock phiên của user để chống race condition với luồng refresh
      await staffRepository.lockUserSessions(id, tx);

      const targetUser = await tx.user.findUnique({ where: { id } });

      if (!targetUser) {
        throw new AppError(404, 'USER_NOT_FOUND', 'Staff account not found');
      }

      if (targetUser.role !== ROLES.STAFF) {
        throw new AppError(
          400,
          'INVALID_TARGET_ROLE',
          'Permissions can only be directly assigned to staff accounts',
        );
      }

      // Xóa permissions cũ
      await tx.userPermission.deleteMany({
        where: { userId: id },
      });

      // Thêm permissions mới
      if (permissions.length > 0) {
        await tx.userPermission.createMany({
          data: permissions.map((perm) => ({
            userId: id,
            permission: perm,
          })),
        });
      }

      // Thu hồi refresh token để bắt buộc token mới được cấp đồng bộ
      await tx.refreshToken.updateMany({
        where: { userId: id, isRevoked: false },
        data: { isRevoked: true },
      });

      await auditRepository.createAuditLog(
        {
          actorId,
          action: AUDIT_ACTIONS.STAFF_PERMISSIONS_UPDATED,
          targetType: 'USER',
          targetId: id,
          payload: {
            permissions,
          },
        },
        tx,
      );

      const user = await tx.user.findUniqueOrThrow({
        where: { id },
        select: staffSelect,
      });

      return toStaffResult(user);
    });
  },
};
