import { registry } from '../../docs/registry.js';
import { z } from '../../utils/zod.js';

export const registerSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(255))
    .openapi({ example: 'alice@example.com' }),
  password: z
    .string()
    .min(8, 'validation.passwordMin8')
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
      message: 'validation.passwordMax72Bytes',
    })
    .openapi({ example: 'password123' }),
  fullName: z.string().trim().min(2).max(100).openapi({ example: 'Alice Nguyen' }),
});

registry.register('RegisterDto', registerSchema);
export type RegisterDto = z.infer<typeof registerSchema>;

export const registerResponseDataSchema = z.object({
  user: z.object({
    id: z.string().openapi({ example: 'usr_c3d4e5f6' }),
    email: z.string().openapi({ example: 'alice@example.com' }),
    fullName: z.string().openapi({ example: 'Alice Nguyen' }),
    role: z.string().openapi({ example: 'CUSTOMER' }),
    createdAt: z.string().datetime().openapi({ example: '2026-08-20T12:00:00.000Z' }),
  }),
});

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .pipe(z.email().max(255))
    .openapi({ example: 'alice@example.com' }),
  password: z
    .string()
    .min(8, 'validation.passwordMin8')
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
      message: 'validation.passwordMax72Bytes',
    })
    .openapi({ example: 'password123' }),
});

registry.register('LoginDto', loginSchema);
export type LoginDto = z.infer<typeof loginSchema>;

export const tokenResponseDataSchema = z.object({
  accessToken: z.string().openapi({ example: 'eyJhbGciOiJIUzI1NiIsInR...' }),
  refreshToken: z.string().openapi({ example: 'eyJhbGciOiJIUzI1NiIsInR...' }),
});

export const logoutResponseDataSchema = z.object({
  message: z.string().openapi({ example: 'Logged out successfully' }),
});

export const logoutSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'validation.refreshTokenRequired')
    .openapi({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }),
});

registry.register('LogoutDto', logoutSchema);
export type LogoutDto = z.infer<typeof logoutSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z
    .string()
    .min(1, 'validation.refreshTokenRequired')
    .openapi({ example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...' }),
});

registry.register('RefreshTokenDto', refreshTokenSchema);
export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
