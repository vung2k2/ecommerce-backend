export const ROLES = {
  CUSTOMER: 'CUSTOMER',
  STAFF: 'STAFF',
  ADMIN: 'ADMIN',
} as const;

export type Role = (typeof ROLES)[keyof typeof ROLES];

export const PERMISSIONS = {
  CATALOG_READ: 'catalog:read',
  CATALOG_WRITE: 'catalog:write',
  INVENTORY_READ: 'inventory:read',
  INVENTORY_WRITE: 'inventory:write',
  ORDER_READ: 'order:read',
  ORDER_UPDATE: 'order:update',
  COUPON_MANAGE: 'coupon:manage',
  REVIEW_MODERATE: 'review:moderate',
  REPORT_READ: 'report:read',
} as const;

export type Permission = (typeof PERMISSIONS)[keyof typeof PERMISSIONS];

export const PERMISSION_LIST = Object.values(PERMISSIONS) as [Permission, ...Permission[]];

export const AUDIT_ACTIONS = {
  STAFF_CREATED: 'STAFF_CREATED',
  STAFF_STATUS_UPDATED: 'STAFF_STATUS_UPDATED',
  STAFF_PERMISSIONS_UPDATED: 'STAFF_PERMISSIONS_UPDATED',
} as const;

export type AuditAction = (typeof AUDIT_ACTIONS)[keyof typeof AUDIT_ACTIONS];

export const AUTH_CONSTANTS = {
  ACCESS_TOKEN_EXPIRES_IN: '15m',
  REFRESH_TOKEN_EXPIRES_IN: '30d',
  REFRESH_TOKEN_EXPIRES_IN_DAYS: 30,
  BCRYPT_SALT_ROUNDS: 12,
} as const;

export const PHONE_REGEX = /^(0|\+84)[35789][0-9]{8}$/;