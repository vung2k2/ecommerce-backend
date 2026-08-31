import { registry } from '../../docs/registry.js';
import { z } from '../../utils/zod.js';

// ==================== Request Schemas ====================

export const createPaymentUrlSchema = z.object({
  orderId: z
    .string()
    .uuid('validation.orderIdUuid')
    .openapi({ example: '3fa85f64-5717-4562-b3fc-2c963f66afa6', description: 'Order UUID' }),
  bankCode: z
    .string()
    .trim()
    .min(1)
    .max(50)
    .optional()
    .openapi({ example: 'NCB', description: 'Optional bank code (e.g. NCB, VNPAYQR, INTCARD)' }),
  language: z
    .enum(['vn', 'en'])
    .default('vn')
    .openapi({ example: 'vn', description: 'Display language on gateway' }),
});
registry.register('CreatePaymentUrlDto', createPaymentUrlSchema);
export type CreatePaymentUrlDto = z.infer<typeof createPaymentUrlSchema>;

export const vnpayReturnQuerySchema = z
  .object({
    vnp_Amount: z.string().optional().openapi({ example: '10000000' }),
    vnp_BankCode: z.string().optional().openapi({ example: 'NCB' }),
    vnp_BankTranNo: z.string().optional().openapi({ example: 'VNP14000001' }),
    vnp_CardType: z.string().optional().openapi({ example: 'ATM' }),
    vnp_OrderInfo: z.string().optional().openapi({ example: 'Thanh toan don hang' }),
    vnp_PayDate: z.string().optional().openapi({ example: '20260831110000' }),
    vnp_ResponseCode: z.string().optional().openapi({ example: '00' }),
    vnp_TmnCode: z.string().optional().openapi({ example: '2QXUI4J4' }),
    vnp_TransactionNo: z.string().optional().openapi({ example: '14000001' }),
    vnp_TransactionStatus: z.string().optional().openapi({ example: '00' }),
    vnp_TxnRef: z.string().optional().openapi({ example: 'ORD-20260831-ABCDE-1234' }),
    vnp_SecureHash: z.string().optional().openapi({ example: 'a1b2c3d4e5f6...' }),
    vnp_SecureHashType: z.string().optional().openapi({ example: 'SHA512' }),
  })
  .passthrough();
registry.register('VnPayReturnQueryDto', vnpayReturnQuerySchema);
export type VnPayReturnQueryDto = z.infer<typeof vnpayReturnQuerySchema>;

// ==================== Response Schemas ====================

export const paymentUrlDataSchema = z.object({
  paymentUrl: z.string().url().openapi({
    example: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=10000000...',
    description: 'Direct payment redirect URL to VNPay Sandbox gateway',
  }),
  txnRef: z.string().openapi({
    example: 'ORD-20260831-ABCDE-1234',
    description: 'Unique transaction reference ID for this payment attempt',
  }),
});

export const createPaymentUrlResponseSchema = z.object({
  paymentUrl: z.string().url().openapi({
    example: 'https://sandbox.vnpayment.vn/paymentv2/vpcpay.html?vnp_Amount=10000000...',
  }),
  txnRef: z.string().openapi({ example: 'ORD-20260831-ABCDE-1234' }),
});

export const paymentReturnDataSchema = z.object({
  isSuccess: z.boolean().openapi({ example: true }),
  orderNumber: z.string().nullable().openapi({ example: 'ORD-20260831-ABCDE' }),
  responseCode: z.string().openapi({ example: '00' }),
  transactionNo: z.string().nullable().openapi({ example: '14000001' }),
  amount: z.string().openapi({ example: '100000' }),
  message: z.string().openapi({ example: 'Payment authorized successfully' }),
});

export const vnpayReturnResponseSchema = z.object({
  isSuccess: z.boolean().openapi({ example: true }),
  orderNumber: z.string().nullable().openapi({ example: 'ORD-20260831-ABCDE' }),
  responseCode: z.string().openapi({ example: '00' }),
  transactionNo: z.string().nullable().openapi({ example: '14000001' }),
  amount: z.string().openapi({ example: '100000' }),
  message: z.string().openapi({ example: 'Payment authorized successfully' }),
});

export const vnpayIpnResponseSchema = z.object({
  RspCode: z.string().openapi({ example: '00', description: 'VNPay standard response code' }),
  Message: z.string().openapi({ example: 'Confirm Success', description: 'VNPay standard message' }),
});
