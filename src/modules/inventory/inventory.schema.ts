import { registry } from '../../docs/registry.js';
import { z } from '../../utils/zod.js';

// ==================== Request Schemas ====================

export const variantIdParamSchema = z.object({
  variantId: z
    .string()
    .uuid('validation.variantIdUuid')
    .openapi({ example: '7f4cddc1-d6fd-4bda-a66a-65d09f244bf9' }),
});
registry.register('VariantIdParamDto', variantIdParamSchema);

export const restockBodySchema = z.object({
  quantity: z
    .number({ message: 'validation.quantityPositive' })
    .int('validation.quantityPositive')
    .positive('validation.quantityPositive')
    .openapi({ example: 50, description: 'Quantity of items to add to on-hand stock' }),
  reason: z
    .string()
    .trim()
    .min(1, 'validation.restockReasonRequired')
    .max(255)
    .openapi({ example: 'Inward shipment PO-2026-08', description: 'Reason for restocking' }),
});
registry.register('RestockDto', restockBodySchema);

export const adjustStockBodySchema = z.object({
  newOnHand: z
    .number({ message: 'validation.onHandNonNegative' })
    .int('validation.onHandNonNegative')
    .min(0, 'validation.onHandNonNegative')
    .openapi({ example: 45, description: 'New physical on-hand quantity after stock count' }),
  reason: z
    .string()
    .trim()
    .min(1, 'validation.adjustmentReasonRequired')
    .max(255)
    .openapi({ example: 'Physical stock count discrepancy', description: 'Mandatory reason for adjustment' }),
});
registry.register('AdjustStockDto', adjustStockBodySchema);

export const listInventoryQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).openapi({ example: 1 }),
  pageSize: z.coerce.number().int().positive().max(100).default(20).openapi({ example: 20 }),
  search: z.string().trim().optional().openapi({ example: 'iPhone' }),
  lowStockThreshold: z.coerce
    .number()
    .int()
    .min(0)
    .optional()
    .openapi({ example: 5, description: 'Filter items where on-hand stock is <= threshold' }),
});
registry.register('ListInventoryQueryDto', listInventoryQuerySchema);

export const listStockMovementsQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).openapi({ example: 1 }),
  pageSize: z.coerce.number().int().positive().max(100).default(20).openapi({ example: 20 }),
});
registry.register('ListStockMovementsQueryDto', listStockMovementsQuerySchema);

// ==================== Response Schemas ====================

export const inventoryItemResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: '7f4cddc1-d6fd-4bda-a66a-65d09f244bf9' }),
  variantId: z.string().uuid().openapi({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' }),
  onHand: z.number().int().openapi({ example: 50 }),
  reserved: z.number().int().openapi({ example: 5 }),
  available: z.number().int().openapi({ example: 45 }),
  variant: z.object({
    id: z.string().uuid(),
    sku: z.string().openapi({ example: 'IP15-PRO-128-BLK' }),
    name: z.string().openapi({ example: 'iPhone 15 Pro 128GB Black' }),
    price: z.string().openapi({ example: '25990000' }),
    isActive: z.boolean(),
    product: z.object({
      id: z.string().uuid(),
      name: z.string().openapi({ example: 'iPhone 15 Pro' }),
      slug: z.string().openapi({ example: 'iphone-15-pro' }),
      status: z.string().openapi({ example: 'ACTIVE' }),
    }),
  }),
  createdAt: z.string().datetime().openapi({ example: '2026-08-20T12:00:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-08-20T12:00:00.000Z' }),
});

export const inventoryDetailResponseSchema = z.object({
  inventory: inventoryItemResponseSchema,
});

export const stockMovementItemResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: '8f4cddc1-d6fd-4bda-a66a-65d09f244bf9' }),
  inventoryId: z.string().uuid(),
  type: z.enum(['RESTOCK', 'ADJUSTMENT', 'RESERVE', 'COMMIT', 'RELEASE']),
  onHandChange: z.number().int().openapi({ example: 50 }),
  reservedChange: z.number().int().openapi({ example: 0 }),
  balanceAfterOnHand: z.number().int().openapi({ example: 50 }),
  balanceAfterReserved: z.number().int().openapi({ example: 0 }),
  reason: z.string().nullable().openapi({ example: 'Inward shipment PO-2026-08' }),
  referenceType: z.string().nullable().openapi({ example: 'MANUAL' }),
  referenceId: z.string().nullable().openapi({ example: 'PO-2026-08' }),
  actor: z
    .object({
      id: z.string().uuid(),
      email: z.string().email(),
      fullName: z.string(),
      role: z.string(),
    })
    .nullable(),
  createdAt: z.string().datetime().openapi({ example: '2026-08-20T12:00:00.000Z' }),
});

export const stockMovementsResponseSchema = z.object({
  movements: z.array(stockMovementItemResponseSchema),
});

// ==================== Type Inferences ====================

export type VariantIdParamDto = z.infer<typeof variantIdParamSchema>;
export type RestockDto = z.infer<typeof restockBodySchema>;
export type AdjustStockDto = z.infer<typeof adjustStockBodySchema>;
export type ListInventoryQueryDto = z.infer<typeof listInventoryQuerySchema>;
export type ListStockMovementsQueryDto = z.infer<typeof listStockMovementsQuerySchema>;
