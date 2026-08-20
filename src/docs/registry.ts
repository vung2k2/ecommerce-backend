import { OpenAPIRegistry } from '@asteasolutions/zod-to-openapi';
import type { ErrorCode } from '../constants/index.js';
import { z } from '../utils/zod.js';

export const registry = new OpenAPIRegistry();

// Đăng ký phương thức xác thực chung
registry.registerComponent('securitySchemes', 'bearerAuth', {
  type: 'http',
  scheme: 'bearer',
  bearerFormat: 'JWT',
});

// Hàm tiện ích để tạo schema cho Response thành công có định nghĩa cục data
export function createSuccessResponseSchema(dataSchema: z.ZodType) {
  return z.object({
    data: dataSchema,
    requestId: z.string().openapi({ example: 'req_a1b2c3d4' }),
  });
}

export function createPaginatedResponseSchema(itemSchema: z.ZodType) {
  return z.object({
    data: z.array(itemSchema),
    meta: z.object({
      page: z.number().int().positive().openapi({ example: 1 }),
      pageSize: z.number().int().positive().openapi({ example: 20 }),
      total: z.number().int().nonnegative().openapi({ example: 100 }),
      totalPages: z.number().int().nonnegative().openapi({ example: 5 }),
    }),
    requestId: z.string().openapi({ example: 'req_a1b2c3d4' }),
  });
}

export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.string().openapi({ example: 'INTERNAL_SERVER_ERROR' }),
    message: z.string().openapi({ example: 'An unexpected error occurred' }),
    details: z.unknown().optional(),
  }),
  requestId: z.string().openapi({ example: 'req_a1b2c3d4' }),
});
registry.register('ErrorResponse', ErrorResponseSchema);

export function errorResponse(errorCodes: ErrorCode | ErrorCode[]) {
  const codes = Array.isArray(errorCodes) ? errorCodes : [errorCodes];

  return {
    description: `Error codes: ${codes.map((code) => `\`${code}\``).join(', ')}`,
  };
}
