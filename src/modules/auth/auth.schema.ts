import { z } from 'zod';

export const registerSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(255)),
  password: z
    .string()
    .min(8, 'Password must contain at least 8 characters')
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
      message: 'Password must not exceed 72 bytes',
    }),
  fullName: z.string().trim().min(2).max(100),
});

export type RegisterDto = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email().max(255)),
  password: z
    .string()
    .min(8, 'Password must contain at least 8 characters')
    .refine((password) => Buffer.byteLength(password, 'utf8') <= 72, {
      message: 'Password must not exceed 72 bytes',
    }),
});

export type LoginDto = z.infer<typeof loginSchema>;

export const logoutSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type LogoutDto = z.infer<typeof logoutSchema>;

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export type RefreshTokenDto = z.infer<typeof refreshTokenSchema>;
