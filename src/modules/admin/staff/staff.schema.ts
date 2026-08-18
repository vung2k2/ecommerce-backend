import { z } from 'zod';
import { PERMISSIONS } from '../../../constants/index.js';

const permissionValues = [
  PERMISSIONS.CATALOG_READ,
  PERMISSIONS.CATALOG_WRITE,
  PERMISSIONS.INVENTORY_READ,
  PERMISSIONS.INVENTORY_WRITE,
  PERMISSIONS.ORDER_READ,
  PERMISSIONS.ORDER_UPDATE,
  PERMISSIONS.COUPON_MANAGE,
  PERMISSIONS.REVIEW_MODERATE,
  PERMISSIONS.REPORT_READ,
] as const;

export const staffIdParamSchema = z.object({
  id: z.string().uuid('Invalid staff ID'),
});

export const createStaffBodySchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(255)),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
      message: 'Password must not exceed 72 bytes',
    }),
  fullName: z.string().trim().min(1, 'Full name is required').max(100),
  permissions: z
    .array(z.enum(permissionValues))
    .transform((perms) => Array.from(new Set(perms)))
    .default([]),
});

export const updateStaffStatusBodySchema = z.object({
  isActive: z.boolean(),
  fullName: z.string().trim().min(1).max(100).optional(),
});

export const updateStaffPermissionsBodySchema = z.object({
  permissions: z
    .array(z.enum(permissionValues))
    .transform((perms) => Array.from(new Set(perms))),
});

export const getStaffQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional(),
});

export type StaffIdParamDto = z.infer<typeof staffIdParamSchema>;
export type CreateStaffDto = z.infer<typeof createStaffBodySchema>;
export type UpdateStaffStatusDto = z.infer<typeof updateStaffStatusBodySchema>;
export type UpdateStaffPermissionsDto = z.infer<typeof updateStaffPermissionsBodySchema>;
export type GetStaffQueryDto = z.infer<typeof getStaffQuerySchema>;
