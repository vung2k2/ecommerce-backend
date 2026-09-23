import { registry } from '../../docs/registry.js';
import { z } from '../../utils/zod.js';

// ==================== Request Schemas ====================

export const productIdParamSchema = z.object({
  productId: z
    .string()
    .uuid('validation.invalidFormat')
    .openapi({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'Product UUID' }),
});
registry.register('ProductIdParamDto', productIdParamSchema);
export type ProductIdParamDto = z.infer<typeof productIdParamSchema>;

export const reviewIdParamSchema = z.object({
  id: z
    .string()
    .uuid('validation.invalidFormat')
    .openapi({ example: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e', description: 'Review UUID' }),
});
registry.register('ReviewIdParamDto', reviewIdParamSchema);
export type ReviewIdParamDto = z.infer<typeof reviewIdParamSchema>;

export const createReviewSchema = z.object({
  orderItemId: z.string().uuid('validation.invalidFormat').openapi({
    example: 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f',
    description: 'Order item UUID being reviewed',
  }),
  rating: z
    .number()
    .int('validation.invalidFormat')
    .min(1, 'validation.valueTooSmall')
    .max(5, 'validation.valueTooLarge')
    .openapi({ example: 5, description: 'Rating score from 1 to 5' }),
  comment: z.string().trim().max(1000, 'validation.valueTooLarge').optional().openapi({
    example: 'Sản phẩm dùng rất tốt, đóng gói cẩn thận!',
    description: 'Review comment',
  }),
});
registry.register('CreateReviewDto', createReviewSchema);
export type CreateReviewDto = z.infer<typeof createReviewSchema>;

export const listProductReviewsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).openapi({ example: 1 }),
  pageSize: z.coerce.number().int().positive().max(50).default(10).openapi({ example: 10 }),
  sort: z
    .enum(['newest', 'oldest', 'rating_high', 'rating_low'])
    .default('newest')
    .openapi({ example: 'newest', description: 'Sort criteria' }),
});
registry.register('ListProductReviewsQueryDto', listProductReviewsQuerySchema);
export type ListProductReviewsQueryDto = z.infer<typeof listProductReviewsQuerySchema>;

export const listAdminReviewsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).openapi({ example: 1 }),
  pageSize: z.coerce.number().int().positive().max(50).default(10).openapi({ example: 10 }),
  productId: z
    .string()
    .uuid('validation.invalidFormat')
    .optional()
    .openapi({ description: 'Filter by Product UUID' }),
  isVisible: z
    .enum(['true', 'false'])
    .transform((val) => val === 'true')
    .optional()
    .openapi({ example: 'true', description: 'Filter by visibility status' }),
});
registry.register('ListAdminReviewsQueryDto', listAdminReviewsQuerySchema);
export type ListAdminReviewsQueryDto = z.infer<typeof listAdminReviewsQuerySchema>;

export const moderateReviewSchema = z
  .object({
    isVisible: z.boolean().openapi({ example: false, description: 'Visibility status' }),
    reason: z.string().trim().max(255, 'validation.valueTooLarge').optional().openapi({
      example: 'Nội dung chứa từ ngữ xúc phạm hoặc spam',
      description: 'Moderation reason',
    }),
  })
  .refine(
    (data) => data.isVisible || (data.reason !== undefined && data.reason.trim().length > 0),
    {
      message: 'Reason is required when hiding a review',
      path: ['reason'],
    },
  );
registry.register('ModerateReviewDto', moderateReviewSchema);
export type ModerateReviewDto = z.infer<typeof moderateReviewSchema>;

// ==================== Response Schemas ====================

export const reviewUserSummarySchema = z.object({
  fullName: z.string().openapi({ example: 'Nguyen Van A' }),
  avatarUrl: z.string().nullable().openapi({ example: 'https://example.com/avatar.jpg' }),
});

export const productReviewItemSchema = z.object({
  id: z.string().uuid().openapi({ example: 'b2c3d4e5-f6a7-8b9c-0d1e-2f3a4b5c6d7e' }),
  productId: z.string().uuid().openapi({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' }),
  orderItemId: z.string().uuid().openapi({ example: 'c3d4e5f6-a7b8-9c0d-1e2f-3a4b5c6d7e8f' }),
  userId: z.string().uuid().openapi({ example: 'd4e5f6a7-b8c9-0d1e-2f3a-4b5c6d7e8f9a' }),
  user: reviewUserSummarySchema,
  rating: z.number().int().min(1).max(5).openapi({ example: 5 }),
  comment: z.string().nullable().openapi({ example: 'Sản phẩm tuyệt vời!' }),
  createdAt: z.string().datetime().openapi({ example: '2026-09-23T10:00:00.000Z' }),
});
registry.register('ProductReviewItem', productReviewItemSchema);

export const ratingSummarySchema = z.object({
  averageRating: z.number().openapi({ example: 4.8 }),
  totalReviews: z.number().openapi({ example: 42 }),
  breakdown: z.object({
    1: z.number().openapi({ example: 1 }),
    2: z.number().openapi({ example: 0 }),
    3: z.number().openapi({ example: 3 }),
    4: z.number().openapi({ example: 8 }),
    5: z.number().openapi({ example: 30 }),
  }),
});
registry.register('RatingSummary', ratingSummarySchema);

export const productReviewsDataSchema = z.object({
  items: z.array(productReviewItemSchema),
  ratingSummary: ratingSummarySchema,
  total: z.number().openapi({ example: 42 }),
  page: z.number().openapi({ example: 1 }),
  pageSize: z.number().openapi({ example: 10 }),
  totalPages: z.number().openapi({ example: 5 }),
});
registry.register('ProductReviewsData', productReviewsDataSchema);

export const adminReviewItemSchema = productReviewItemSchema.extend({
  isVisible: z.boolean().openapi({ example: true }),
  moderationReason: z.string().nullable().openapi({ example: null }),
  moderatedById: z.string().uuid().nullable().openapi({ example: null }),
  moderatedAt: z.string().datetime().nullable().openapi({ example: null }),
  productName: z.string().openapi({ example: 'Bàn phím cơ không dây' }),
  sku: z.string().openapi({ example: 'KEY-MECH-01' }),
});
registry.register('AdminReviewItem', adminReviewItemSchema);
