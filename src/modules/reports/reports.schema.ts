import { registry } from '../../docs/registry.js';
import { z } from '../../utils/zod.js';

// ==================== Request Schemas ====================

export const salesReportQuerySchema = z.object({
  startDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .openapi({ example: '2026-09-01T00:00:00.000Z', description: 'Start date in ISO 8601 format' }),
  endDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .openapi({ example: '2026-09-30T23:59:59.999Z', description: 'End date in ISO 8601 format' }),
});
registry.register('SalesReportQueryDto', salesReportQuerySchema);
export type SalesReportQueryDto = z.infer<typeof salesReportQuerySchema>;

export const topProductsQuerySchema = z.object({
  startDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .openapi({ example: '2026-09-01T00:00:00.000Z', description: 'Start date in ISO 8601 format' }),
  endDate: z
    .string()
    .datetime({ offset: true })
    .optional()
    .openapi({ example: '2026-09-30T23:59:59.999Z', description: 'End date in ISO 8601 format' }),
  limit: z.coerce
    .number()
    .int()
    .positive()
    .max(50)
    .default(10)
    .openapi({ example: 10, description: 'Number of top products to return (max 50)' }),
});
registry.register('TopProductsQueryDto', topProductsQuerySchema);
export type TopProductsQueryDto = z.infer<typeof topProductsQuerySchema>;

// ==================== Response Schemas ====================

export const dailySalesBreakdownSchema = z.object({
  date: z.string().openapi({ example: '2026-09-23' }),
  revenue: z
    .string()
    .openapi({ example: '15000000', description: 'Total revenue in VND as string' }),
  ordersCount: z.number().int().openapi({ example: 5 }),
});

export const salesOverviewResponseSchema = z.object({
  totalRevenue: z.string().openapi({
    example: '150000000',
    description: 'Net delivered revenue in VND (after coupon discounts, including shipping fees)',
  }),
  totalOrders: z.number().int().openapi({ example: 50, description: 'Total delivered orders' }),
  totalItemsSold: z
    .number()
    .int()
    .openapi({ example: 120, description: 'Total units sold across delivered orders' }),
  averageOrderValue: z
    .string()
    .openapi({ example: '3000000', description: 'Average order value in VND' }),
  dailyBreakdown: z.array(dailySalesBreakdownSchema),
});
registry.register('SalesOverviewResponse', salesOverviewResponseSchema);

export const topProductItemSchema = z.object({
  productId: z
    .string()
    .uuid()
    .nullable()
    .openapi({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' }),
  productName: z.string().openapi({ example: 'Bàn phím cơ không dây RGB' }),
  unitsSold: z
    .number()
    .int()
    .openapi({ example: 45, description: 'Total units sold across all variants' }),
  totalRevenue: z.string().openapi({
    example: '45000000',
    description: 'Gross product revenue before coupon discounts and shipping fees in VND',
  }),
});
registry.register('TopProductItem', topProductItemSchema);

export const topProductsResponseSchema = z.object({
  products: z.array(topProductItemSchema),
});
registry.register('TopProductsResponse', topProductsResponseSchema);
