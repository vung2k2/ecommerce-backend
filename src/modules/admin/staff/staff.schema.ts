import { z } from '../../../utils/zod.js';
import { PERMISSIONS } from '../../../constants/index.js';
import { registry } from '../../../docs/registry.js';

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
  id: z
    .string()
    .uuid('validation.staffIdUuid')
    .openapi({ example: '7f4cddc1-d6fd-4bda-a66a-65d09f244bf9' }),
});
registry.register('StaffIdParamDto', staffIdParamSchema);

export const createStaffBodySchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(255))
    .openapi({ example: 'staff1@example.com' }),
  password: z
    .string()
    .min(8, 'validation.passwordMin8')
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
      message: 'validation.passwordMax72Bytes',
    })
    .openapi({ example: 'strongpass123' }),
  fullName: z
    .string()
    .trim()
    .min(1, 'validation.fullNameRequired')
    .max(100)
    .openapi({ example: 'Staff Name' }),
  permissions: z
    .array(z.enum(permissionValues))
    .transform((perms) => Array.from(new Set(perms)))
    .default([])
    .openapi({ example: ['catalog:read', 'catalog:write'] }),
});
registry.register('CreateStaffDto', createStaffBodySchema);

export const updateStaffStatusBodySchema = z.object({
  isActive: z.boolean().openapi({ example: true }),
  fullName: z.string().trim().min(1).max(100).optional().openapi({ example: 'Staff Name Updated' }),
});
registry.register('UpdateStaffStatusDto', updateStaffStatusBodySchema);

export const updateStaffPermissionsBodySchema = z.object({
  permissions: z
    .array(z.enum(permissionValues))
    .transform((perms) => Array.from(new Set(perms)))
    .openapi({ example: ['catalog:read', 'order:read'] }),
});
registry.register('UpdateStaffPermissionsDto', updateStaffPermissionsBodySchema);

export const getStaffQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).openapi({ example: 1 }),
  pageSize: z.coerce.number().int().positive().max(100).default(20).openapi({ example: 20 }),
  search: z.string().trim().optional().openapi({ example: 'Alice' }),
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional()
    .openapi({ example: true }),
});
registry.register('GetStaffQueryDto', getStaffQuerySchema);

export const staffResponseItemSchema = z.object({
  id: z.string().uuid().openapi({ example: '7f4cddc1-d6fd-4bda-a66a-65d09f244bf9' }),
  email: z.email().openapi({ example: 'staff1@example.com' }),
  fullName: z.string().openapi({ example: 'Staff Name' }),
  role: z.enum(['STAFF', 'ADMIN']).openapi({ example: 'STAFF' }),
  isActive: z.boolean().openapi({ example: true }),
  permissions: z.array(z.enum(permissionValues)).openapi({ example: ['catalog:read'] }),
  createdAt: z.string().datetime().openapi({ example: '2026-08-20T12:00:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-08-20T12:00:00.000Z' }),
});

export const staffResponseDataSchema = z.object({ staff: staffResponseItemSchema });

export type StaffIdParamDto = z.infer<typeof staffIdParamSchema>;
export type CreateStaffDto = z.infer<typeof createStaffBodySchema>;
export type UpdateStaffStatusDto = z.infer<typeof updateStaffStatusBodySchema>;
export type UpdateStaffPermissionsDto = z.infer<typeof updateStaffPermissionsBodySchema>;
export type GetStaffQueryDto = z.infer<typeof getStaffQuerySchema>;
