import 'dotenv/config';
import { z } from '../utils/zod.js';

const envSchema = z
  .object({
    NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
    PORT: z.coerce.number().int().positive().max(65535).default(3000),
    LOG_LEVEL: z
      .enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace', 'silent'])
      .default('info'),
    CORS_ORIGINS: z.string().default('http://localhost:3000'),
    DATABASE_URL: z.url().startsWith('postgresql://'),
    JWT_ACCESS_SECRET: z.string().min(32),
    JWT_REFRESH_SECRET: z.string().min(32),
    AWS_REGION: z.string().default('ap-southeast-1'),
    AWS_ACCESS_KEY_ID: z.string().optional(),
    AWS_SECRET_ACCESS_KEY: z.string().optional(),
    AWS_S3_BUCKET_NAME: z.string().default('ecommerce-assets'),
    AWS_S3_ENDPOINT: z.string().url().optional(),
    AWS_S3_PUBLIC_DOMAIN: z.url().optional(),
  })
  .refine((data) => data.JWT_ACCESS_SECRET !== data.JWT_REFRESH_SECRET, {
    message: 'JWT_ACCESS_SECRET and JWT_REFRESH_SECRET must be different',
    path: ['JWT_REFRESH_SECRET'],
  })
  .refine(
    (data) => Boolean(data.AWS_ACCESS_KEY_ID) === Boolean(data.AWS_SECRET_ACCESS_KEY),
    {
      message: 'AWS_ACCESS_KEY_ID and AWS_SECRET_ACCESS_KEY must be provided together',
      path: ['AWS_SECRET_ACCESS_KEY'],
    },
  )
  .refine(
    (data) => !data.AWS_S3_PUBLIC_DOMAIN || new URL(data.AWS_S3_PUBLIC_DOMAIN).pathname === '/',
    {
      message: 'AWS_S3_PUBLIC_DOMAIN must not contain a path',
      path: ['AWS_S3_PUBLIC_DOMAIN'],
    },
  );

const result = envSchema.safeParse(process.env);

if (!result.success) {
  console.error('Invalid environment variables', z.treeifyError(result.error));
  process.exit(1);
}

export const env = {
  ...result.data,
  CORS_ORIGINS: result.data.CORS_ORIGINS.split(',')
    .map((origin) => origin.trim())
    .filter(Boolean),
};
