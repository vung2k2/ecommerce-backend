import type { RequestHandler } from 'express';
import { ERROR_CODES, ROLES, type Permission, type Role } from '../constants/index.js';
import { prisma } from '../database/prisma.js';
import { AppError } from '../utils/app-error.js';

export function requireRole(...allowedRoles: Role[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isActive: true, role: true },
    });

    if (!user || !user.isActive) {
      throw new AppError(403, ERROR_CODES.INACTIVE_ACCOUNT);
    }

    if (!allowedRoles.includes(user.role)) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN);
    }

    next();
  };
}

export function requirePermission(...requiredPermissions: Permission[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) {
      throw new AppError(401, ERROR_CODES.UNAUTHORIZED);
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        isActive: true,
        role: true,
        permissions: {
          where: { permission: { in: requiredPermissions } },
          select: { id: true },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new AppError(403, ERROR_CODES.INACTIVE_ACCOUNT);
    }

    // Role ADMIN toàn quyền, bypass mọi permission check
    if (user.role === ROLES.ADMIN) {
      return next();
    }

    // Role CUSTOMER không được gọi API quản trị
    if (user.role === ROLES.CUSTOMER) {
      throw new AppError(403, ERROR_CODES.FORBIDDEN);
    }

    // Role STAFF: kiểm tra có ít nhất 1 permission yêu cầu hay không
    if (user.role === ROLES.STAFF) {
      if (user.permissions.length === 0) {
        throw new AppError(403, ERROR_CODES.FORBIDDEN);
      }

      return next();
    }

    throw new AppError(403, ERROR_CODES.FORBIDDEN);
  };
}
