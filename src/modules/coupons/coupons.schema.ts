import { registry } from '../../docs/registry.js';
import { z } from '../../utils/zod.js';

// ==================== Request Schemas ====================

export const couponIdParamSchema = z.object({
  id: z
    .string()
    .uuid('validation.invalidValue')
    .openapi({ example: '7f4cddc1-d6fd-4bda-a66a-65d09f244bf9', description: 'Coupon UUID' }),
});
registry.register('CouponIdParamDto', couponIdParamSchema);
export type CouponIdParamDto = z.infer<typeof couponIdParamSchema>;

export const createCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, 'validation.valueTooSmall')
      .max(50, 'validation.valueTooLarge')
      .regex(/^[A-Za-z0-9_-]+$/, 'validation.invalidFormat')
      .transform((val) => val.toUpperCase())
      .openapi({ example: 'SUMMER2026', description: 'Unique coupon code' }),
    description: z.string().trim().max(1000).nullable().optional().openapi({ example: 'Giảm 20% đơn từ 500k' }),
    discountType: z
      .enum(['PERCENTAGE', 'FIXED_AMOUNT'])
      .openapi({ example: 'PERCENTAGE', description: 'PERCENTAGE or FIXED_AMOUNT' }),
    discountValue: z.coerce
      .bigint()
      .refine((val) => val > 0n, { message: 'validation.valueTooSmall' })
      .openapi({ example: 20, description: 'Percentage discount (e.g. 20) or Fixed amount in VND' }),
    maxDiscountAmount: z.coerce
      .bigint()
      .refine((val) => val > 0n, { message: 'validation.valueTooSmall' })
      .nullable()
      .optional()
      .openapi({ example: 100000, description: 'Max discount amount cap for PERCENTAGE' }),
    minOrderAmount: z.coerce
      .bigint()
      .refine((val) => val >= 0n, { message: 'validation.valueTooSmall' })
      .optional()
      .openapi({ example: 500000, description: 'Minimum order subtotal to apply coupon' }),
    usageLimit: z
      .number({ message: 'validation.quantityPositive' })
      .int()
      .positive('validation.quantityPositive')
      .nullable()
      .optional()
      .openapi({ example: 100, description: 'Total global usage quota, null for unlimited' }),
    usageLimitPerUser: z
      .number({ message: 'validation.quantityPositive' })
      .int()
      .positive('validation.quantityPositive')
      .nullable()
      .optional()
      .default(1)
      .openapi({ example: 1, description: 'Per user usage quota, null for unlimited' }),
    startDate: z.coerce
      .date()
      .openapi({ example: '2026-08-01T00:00:00.000Z', description: 'Start datetime (UTC)' }),
    endDate: z.coerce
      .date()
      .openapi({ example: '2026-08-31T23:59:59.999Z', description: 'End datetime (UTC)' }),
    isActive: z.boolean().default(true).openapi({ example: true }),
  })
  .superRefine((data, ctx) => {
    if (data.startDate > data.endDate) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'errors.invalidCouponDates',
        path: ['endDate'],
      });
    }

    if (data.discountType === 'PERCENTAGE' && data.discountValue > 100n) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.valueTooLarge',
        path: ['discountValue'],
      });
    }

    if (data.discountType === 'FIXED_AMOUNT' && data.maxDiscountAmount != null) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'validation.invalidValue',
        path: ['maxDiscountAmount'],
      });
    }
  });

registry.register('CreateCouponDto', createCouponSchema);
export type CreateCouponDto = z.infer<typeof createCouponSchema>;

export const updateCouponSchema = z
  .object({
    code: z
      .string()
      .trim()
      .min(3, 'validation.valueTooSmall')
      .max(50, 'validation.valueTooLarge')
      .regex(/^[A-Za-z0-9_-]+$/, 'validation.invalidFormat')
      .transform((val) => val.toUpperCase())
      .optional()
      .openapi({ example: 'SUMMER2026' }),
    description: z.string().trim().max(1000).nullable().optional(),
    discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
    discountValue: z.coerce
      .bigint()
      .refine((val) => val > 0n, { message: 'validation.valueTooSmall' })
      .optional(),
    maxDiscountAmount: z.coerce
      .bigint()
      .refine((val) => val > 0n, { message: 'validation.valueTooSmall' })
      .nullable()
      .optional(),
    minOrderAmount: z.coerce
      .bigint()
      .refine((val) => val >= 0n, { message: 'validation.valueTooSmall' })
      .optional(),
    usageLimit: z
      .number({ message: 'validation.quantityPositive' })
      .int()
      .positive('validation.quantityPositive')
      .nullable()
      .optional(),
    usageLimitPerUser: z
      .number({ message: 'validation.quantityPositive' })
      .int()
      .positive('validation.quantityPositive')
      .nullable()
      .optional(),
    startDate: z.coerce.date().optional(),
    endDate: z.coerce.date().optional(),
    isActive: z.boolean().optional(),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'validation.updateAtLeastOneField',
  });

registry.register('UpdateCouponDto', updateCouponSchema);
export type UpdateCouponDto = z.infer<typeof updateCouponSchema>;

export const listCouponsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).openapi({ example: 1 }),
  pageSize: z.coerce.number().int().positive().max(100).default(20).openapi({ example: 20 }),
  search: z.string().trim().optional().openapi({ example: 'SUMMER' }),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).optional(),
  isActive: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional()
    .openapi({ example: true }),
});
registry.register('ListCouponsQueryDto', listCouponsQuerySchema);
export type ListCouponsQueryDto = z.infer<typeof listCouponsQuerySchema>;

export const validateCouponSchema = z.object({
  code: z
    .string()
    .trim()
    .min(1, 'validation.invalidValue')
    .max(50)
    .transform((val) => val.toUpperCase())
    .openapi({ example: 'SUMMER2026', description: 'Coupon code to validate on user active cart' }),
});
registry.register('ValidateCouponDto', validateCouponSchema);
export type ValidateCouponDto = z.infer<typeof validateCouponSchema>;

// ==================== Response Schemas ====================

export const couponItemResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: '7f4cddc1-d6fd-4bda-a66a-65d09f244bf9' }),
  code: z.string().openapi({ example: 'SUMMER2026' }),
  description: z.string().nullable().openapi({ example: 'Giảm 20% đơn từ 500k' }),
  discountType: z.enum(['PERCENTAGE', 'FIXED_AMOUNT']).openapi({ example: 'PERCENTAGE' }),
  discountValue: z.string().openapi({ example: '20' }),
  maxDiscountAmount: z.string().nullable().openapi({ example: '100000' }),
  minOrderAmount: z.string().openapi({ example: '500000' }),
  usageLimit: z.number().int().nullable().openapi({ example: 100 }),
  usedCount: z.number().int().openapi({ example: 15 }),
  usageLimitPerUser: z.number().int().nullable().openapi({ example: 1 }),
  startDate: z.string().datetime().openapi({ example: '2026-08-01T00:00:00.000Z' }),
  endDate: z.string().datetime().openapi({ example: '2026-08-31T23:59:59.999Z' }),
  isActive: z.boolean().openapi({ example: true }),
  createdAt: z.string().datetime().openapi({ example: '2026-08-01T00:00:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-08-01T00:00:00.000Z' }),
});

export const couponDetailResponseSchema = z.object({
  coupon: couponItemResponseSchema,
});

export const validateCouponResponseSchema = z.object({
  coupon: couponItemResponseSchema,
  subtotal: z.string().openapi({ example: '1000000' }),
  discountAmount: z.string().openapi({ example: '100000' }),
  finalTotal: z.string().openapi({ example: '900000' }),
});
