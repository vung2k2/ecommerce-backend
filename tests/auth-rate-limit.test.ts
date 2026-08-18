import express, { type Express } from 'express';
import { rateLimit } from 'express-rate-limit';
import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { errorHandler } from '../src/middlewares/error.middleware.js';

const rateLimitErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

describe('Auth Rate Limiter', () => {
  it('returns 429 Too Many Requests when rate limit threshold is exceeded', async () => {
    const app: Express = express();
    app.use(express.json());

    // Limiter thử nghiệm với limit = 3 requests
    const testLimiter = rateLimit({
      windowMs: 1000,
      limit: 3,
      standardHeaders: 'draft-8',
      legacyHeaders: false,
      handler: (_req, res) => {
        res.status(429).json({
          error: {
            code: 'TOO_MANY_REQUESTS',
            message: 'Too many auth requests, please try again later.',
          },
        });
      },
    });

    app.post('/api/v1/auth/test-limit', testLimiter, (_req, res) => {
      res.status(200).json({ status: 'ok' });
    });
    app.use(errorHandler);

    // Gửi 3 request đầu tiên thành công
    for (let i = 0; i < 3; i++) {
      const res = await request(app).post('/api/v1/auth/test-limit');
      expect(res.status).toBe(200);
    }

    // Request thứ 4 vượt ngưỡng -> 429
    const limitedRes = await request(app).post('/api/v1/auth/test-limit');
    expect(limitedRes.status).toBe(429);
    const body = rateLimitErrorSchema.parse(limitedRes.body);
    expect(body.error.code).toBe('TOO_MANY_REQUESTS');
  });
});
