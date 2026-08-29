import { registry } from '../../docs/registry.js';
import { z } from '../../utils/zod.js';

// ==================== Request Schemas ====================

export const addToCartSchema = z.object({
  variantId: z
    .string()
    .uuid('validation.variantIdUuid')
    .openapi({ example: '7f4cddc1-d6fd-4bda-a66a-65d09f244bf9', description: 'Product variant UUID' }),
  quantity: z
    .number({ message: 'validation.quantityPositive' })
    .int('validation.quantityPositive')
    .positive('validation.quantityPositive')
    .default(1)
    .openapi({ example: 1, description: 'Incremental quantity to add to cart' }),
});
registry.register('AddToCartDto', addToCartSchema);
export type AddToCartDto = z.infer<typeof addToCartSchema>;

export const updateCartItemSchema = z.object({
  quantity: z
    .number({ message: 'validation.quantityPositive' })
    .int('validation.quantityPositive')
    .positive('validation.quantityPositive')
    .openapi({ example: 2, description: 'New specific quantity for the cart item' }),
});
registry.register('UpdateCartItemDto', updateCartItemSchema);
export type UpdateCartItemDto = z.infer<typeof updateCartItemSchema>;

export const cartItemParamsSchema = z.object({
  itemId: z
    .string()
    .uuid()
    .openapi({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'Cart Item UUID' }),
});
registry.register('CartItemParamsDto', cartItemParamsSchema);
export type CartItemParamsDto = z.infer<typeof cartItemParamsSchema>;

// ==================== Response Schemas ====================

export const cartItemProductSchema = z.object({
  id: z.string().uuid().openapi({ example: '123e4567-e89b-12d3-a456-426614174000' }),
  name: z.string().openapi({ example: 'iPhone 15 Pro' }),
  slug: z.string().openapi({ example: 'iphone-15-pro' }),
  status: z.string().openapi({ example: 'ACTIVE' }),
  thumbnailUrl: z.string().nullable().openapi({ example: 'https://cdn.example.com/products/ip15.jpg' }),
});

export const cartItemVariantSchema = z.object({
  id: z.string().uuid().openapi({ example: '7f4cddc1-d6fd-4bda-a66a-65d09f244bf9' }),
  sku: z.string().openapi({ example: 'IP15-PRO-128-BLK' }),
  name: z.string().openapi({ example: 'Black Titanium 128GB' }),
  price: z.string().openapi({ example: '25990000' }),
  isActive: z.boolean().openapi({ example: true }),
  product: cartItemProductSchema,
  availableStock: z.number().int().openapi({ example: 10 }),
});

export const cartItemResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d' }),
  variantId: z.string().uuid().openapi({ example: '7f4cddc1-d6fd-4bda-a66a-65d09f244bf9' }),
  quantity: z.number().int().openapi({ example: 2 }),
  unitPrice: z.string().openapi({ example: '25990000' }),
  itemSubtotal: z.string().openapi({ example: '51980000' }),
  isAvailable: z.boolean().openapi({ example: true }),
  warningReason: z
    .enum(['PRODUCT_INACTIVE', 'VARIANT_INACTIVE', 'OUT_OF_STOCK', 'INSUFFICIENT_STOCK'])
    .nullable()
    .openapi({ example: null }),
  variant: cartItemVariantSchema,
});

export const cartResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: '998e4567-e89b-12d3-a456-426614174000' }),
  items: z.array(cartItemResponseSchema),
  totalItems: z.number().int().openapi({ example: 2 }),
  availableItemCount: z.number().int().openapi({ example: 2 }),
  unavailableItemCount: z.number().int().openapi({ example: 0 }),
  hasUnavailableItems: z.boolean().openapi({ example: false }),
  subtotal: z.string().openapi({ example: '51980000' }),
});
