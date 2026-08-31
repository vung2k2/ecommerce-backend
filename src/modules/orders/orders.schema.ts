import { ORDER_STATUSES, PAYMENT_METHODS, PAYMENT_STATUSES } from '../../constants/index.js';
import { registry } from '../../docs/registry.js';
import { z } from '../../utils/zod.js';

// ==================== Request Schemas ====================

export const orderIdParamSchema = z.object({
  id: z
    .string()
    .uuid('validation.orderIdUuid')
    .openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', description: 'Order UUID' }),
});
registry.register('OrderIdParamDto', orderIdParamSchema);
export type OrderIdParamDto = z.infer<typeof orderIdParamSchema>;

export const checkoutSchema = z.object({
  addressId: z
    .string()
    .uuid('validation.addressIdUuid')
    .openapi({ example: 'a1b2c3d4-e5f6-7a8b-9c0d-1e2f3a4b5c6d', description: 'Shipping address UUID' }),
  paymentMethod: z
    .enum([PAYMENT_METHODS.COD, PAYMENT_METHODS.VNPAY], { message: 'validation.paymentMethodRequired' })
    .openapi({ example: 'COD', description: 'Payment method (COD or VNPAY)' }),
  couponCode: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .transform((val) => val.toUpperCase())
    .optional()
    .openapi({ example: 'SUMMER2026', description: 'Optional coupon code' }),
  notes: z
    .string()
    .trim()
    .max(1000, 'validation.valueTooLarge')
    .optional()
    .openapi({ example: 'Giao giờ hành chính giúp tôi', description: 'Customer notes' }),
});
registry.register('CheckoutDto', checkoutSchema);
export type CheckoutDto = z.infer<typeof checkoutSchema>;

export const cancelOrderSchema = z.object({
  reason: z
    .string()
    .trim()
    .max(255, 'validation.valueTooLarge')
    .optional()
    .openapi({ example: 'Đổi ý không muốn mua nữa', description: 'Reason for cancellation' }),
});
registry.register('CancelOrderDto', cancelOrderSchema);
export type CancelOrderDto = z.infer<typeof cancelOrderSchema>;

export const updateOrderStatusSchema = z.object({
  status: z
    .enum(
      [
        ORDER_STATUSES.CONFIRMED,
        ORDER_STATUSES.PROCESSING,
        ORDER_STATUSES.SHIPPING,
        ORDER_STATUSES.DELIVERED,
        ORDER_STATUSES.CANCELLED,
        ORDER_STATUSES.PAYMENT_EXPIRED,
      ],
      { message: 'validation.orderStatusRequired' },
    )
    .openapi({ example: 'PROCESSING', description: 'New order status' }),
  reason: z
    .string()
    .trim()
    .max(255, 'validation.valueTooLarge')
    .optional()
    .openapi({ example: 'Đang chuẩn bị hàng xuất kho', description: 'Reason for status update' }),
});
registry.register('UpdateOrderStatusDto', updateOrderStatusSchema);
export type UpdateOrderStatusDto = z.infer<typeof updateOrderStatusSchema>;

export const listCustomerOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).openapi({ example: 1 }),
  pageSize: z.coerce.number().int().positive().max(100).default(20).openapi({ example: 20 }),
  status: z
    .enum([
      ORDER_STATUSES.PENDING_PAYMENT,
      ORDER_STATUSES.CONFIRMED,
      ORDER_STATUSES.PROCESSING,
      ORDER_STATUSES.SHIPPING,
      ORDER_STATUSES.DELIVERED,
      ORDER_STATUSES.CANCELLED,
      ORDER_STATUSES.PAYMENT_EXPIRED,
    ])
    .optional()
    .openapi({ example: 'CONFIRMED', description: 'Filter by order status' }),
});
registry.register('ListCustomerOrdersQueryDto', listCustomerOrdersQuerySchema);
export type ListCustomerOrdersQueryDto = z.infer<typeof listCustomerOrdersQuerySchema>;

export const listAdminOrdersQuerySchema = z.object({
  page: z.coerce.number().int().positive().default(1).openapi({ example: 1 }),
  pageSize: z.coerce.number().int().positive().max(100).default(20).openapi({ example: 20 }),
  status: z
    .enum([
      ORDER_STATUSES.PENDING_PAYMENT,
      ORDER_STATUSES.CONFIRMED,
      ORDER_STATUSES.PROCESSING,
      ORDER_STATUSES.SHIPPING,
      ORDER_STATUSES.DELIVERED,
      ORDER_STATUSES.CANCELLED,
      ORDER_STATUSES.PAYMENT_EXPIRED,
    ])
    .optional()
    .openapi({ example: 'CONFIRMED', description: 'Filter by order status' }),
  paymentStatus: z
    .enum([
      PAYMENT_STATUSES.PENDING,
      PAYMENT_STATUSES.PAID,
      PAYMENT_STATUSES.FAILED,
      PAYMENT_STATUSES.EXPIRED,
    ])
    .optional()
    .openapi({ example: 'PAID', description: 'Filter by payment status' }),
  search: z
    .string()
    .trim()
    .optional()
    .openapi({ example: 'ORD-2026', description: 'Search by orderNumber, phone, recipientName' }),
});
registry.register('ListAdminOrdersQueryDto', listAdminOrdersQuerySchema);
export type ListAdminOrdersQueryDto = z.infer<typeof listAdminOrdersQuerySchema>;

// ==================== Response Schemas ====================

export const orderItemResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  variantId: z.string().uuid().nullable().openapi({ example: '4fa85f64-5717-4562-b3fc-2c963f66afa7' }),
  productName: z.string().openapi({ example: 'Laptop ThinkPad X1 Carbon Gen 12' }),
  sku: z.string().openapi({ example: 'TP-X1-32GB' }),
  options: z.record(z.string(), z.unknown()).nullable().openapi({ example: { RAM: '32GB', SSD: '1TB' } }),
  unitPrice: z.string().openapi({ example: '35000000' }),
  quantity: z.number().int().openapi({ example: 1 }),
  totalPrice: z.string().openapi({ example: '35000000' }),
  createdAt: z.string().datetime().openapi({ example: '2026-08-31T10:00:00.000Z' }),
});

export const orderStatusHistoryResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: '5fa85f64-5717-4562-b3fc-2c963f66afa8' }),
  fromStatus: z.string().nullable().openapi({ example: 'PENDING_PAYMENT' }),
  toStatus: z.string().openapi({ example: 'CONFIRMED' }),
  reason: z.string().nullable().openapi({ example: 'COD order confirmed automatically' }),
  changedById: z.string().uuid().nullable().openapi({ example: '6fa85f64-5717-4562-b3fc-2c963f66afa9' }),
  createdAt: z.string().datetime().openapi({ example: '2026-08-31T10:00:00.000Z' }),
});

export const shippingAddressResponseSchema = z.object({
  recipientName: z.string().openapi({ example: 'Nguyen Van A' }),
  phone: z.string().openapi({ example: '0987654321' }),
  province: z.string().openapi({ example: 'TP. Ho Chi Minh' }),
  district: z.string().openapi({ example: 'Quan 1' }),
  ward: z.string().openapi({ example: 'Phuong Ben Nghe' }),
  streetAddress: z.string().openapi({ example: '123 Le Loi' }),
});

export const orderSummaryResponseSchema = z.object({
  id: z.string().uuid().openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6' }),
  orderNumber: z.string().openapi({ example: 'ORD-20260831-ABCDE' }),
  userId: z.string().uuid().openapi({ example: '1fa85f64-5717-4562-b3fc-2c963f66afa1' }),
  status: z.string().openapi({ example: 'CONFIRMED' }),
  paymentMethod: z.string().openapi({ example: 'COD' }),
  paymentStatus: z.string().openapi({ example: 'PENDING' }),
  subtotalAmount: z.string().openapi({ example: '35000000' }),
  discountAmount: z.string().openapi({ example: '1000000' }),
  shippingFee: z.string().openapi({ example: '0' }),
  totalAmount: z.string().openapi({ example: '34000000' }),
  couponCode: z.string().nullable().openapi({ example: 'SUMMER2026' }),
  notes: z.string().nullable().openapi({ example: 'Giao gio hanh chinh' }),
  cancelReason: z.string().nullable().openapi({ example: null }),
  cancelledAt: z.string().datetime().nullable().openapi({ example: null }),
  shippingAddress: shippingAddressResponseSchema,
  totalItems: z.number().int().openapi({ example: 1 }),
  createdAt: z.string().datetime().openapi({ example: '2026-08-31T10:00:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-08-31T10:00:00.000Z' }),
});

export const orderDetailResponseSchema = orderSummaryResponseSchema.extend({
  items: z.array(orderItemResponseSchema),
  statusHistory: z.array(orderStatusHistoryResponseSchema),
});

export const checkoutResponseSchema = z.object({
  order: orderDetailResponseSchema,
});

export const listOrdersResponseSchema = z.object({
  items: z.array(orderDetailResponseSchema),
});
