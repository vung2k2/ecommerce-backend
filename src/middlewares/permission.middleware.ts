import type { RequestHandler } from 'express';
import { ROLES, type Permission, type Role } from '../constants/index.js';
import { prisma } from '../database/prisma.js';
import { AppError } from '../utils/app-error.js';

export function requireRole(...allowedRoles: Role[]): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: { isActive: true, role: true },
    });

    if (!user || !user.isActive) {
      throw new AppError(403, 'FORBIDDEN', 'Account is disabled');
    }

    if (!allowedRoles.includes(user.role)) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied');
    }

    next();
  };
}

export function requirePermission(requiredPermission: Permission): RequestHandler {
  return async (req, _res, next) => {
    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'Authentication required');
    }

    const user = await prisma.user.findUnique({
      where: { id: req.user.userId },
      select: {
        isActive: true,
        role: true,
        permissions: {
          where: { permission: requiredPermission },
          select: { id: true },
        },
      },
    });

    if (!user || !user.isActive) {
      throw new AppError(403, 'FORBIDDEN', 'Account is disabled');
    }

    // Role ADMIN toàn quyền, bypass mọi permission check
    if (user.role === ROLES.ADMIN) {
      return next();
    }

    // Role CUSTOMER không được gọi API quản trị
    if (user.role === ROLES.CUSTOMER) {
      throw new AppError(403, 'FORBIDDEN', 'Access denied');
    }

    // Role STAFF: kiểm tra có permission yêu cầu hay không
    if (user.role === ROLES.STAFF) {
      if (user.permissions.length === 0) {
        throw new AppError(403, 'FORBIDDEN', 'Insufficient permissions');
      }

      return next();
    }

    throw new AppError(403, 'FORBIDDEN', 'Access denied');
  };
}
