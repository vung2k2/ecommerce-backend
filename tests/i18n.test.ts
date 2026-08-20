import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { resolveLocale, translate } from '../src/i18n/index.js';

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z
      .array(
        z.object({
          path: z.string(),
          message: z.string(),
        }),
      )
      .optional(),
  }),
  requestId: z.string(),
});

describe('response localization', () => {
  const app = createApp();

  it('uses English by default and falls back to English for unsupported locales', async () => {
    const defaultResponse = await request(app).get('/missing-route');
    const fallbackResponse = await request(app)
      .get('/missing-route')
      .set('Accept-Language', 'fr-FR');

    expect(errorResponseSchema.parse(defaultResponse.body as unknown).error).toEqual({
      code: 'ROUTE_NOT_FOUND',
      message: 'Route GET /missing-route was not found',
    });
    expect(errorResponseSchema.parse(fallbackResponse.body as unknown).error.message).toBe(
      'Route GET /missing-route was not found',
    );
    expect(defaultResponse.headers['content-language']).toBe('en');
  });

  it('normalizes regional locales and honors quality weights', () => {
    expect(resolveLocale('vi-VN')).toBe('vi');
    expect(resolveLocale('fr-FR, vi;q=0.9, en;q=0.5')).toBe('vi');
    expect(resolveLocale('vi;q=0, en;q=0.8')).toBe('en');
  });

  it('localizes common AppError responses without changing status or error code', async () => {
    const englishResponse = await request(app).get('/api/v1/users/me');
    const vietnameseResponse = await request(app)
      .get('/api/v1/users/me')
      .set('Accept-Language', 'vi-VN');
    const englishBody = errorResponseSchema.parse(englishResponse.body as unknown);
    const vietnameseBody = errorResponseSchema.parse(vietnameseResponse.body as unknown);

    expect(englishResponse.status).toBe(401);
    expect(vietnameseResponse.status).toBe(401);
    expect(englishBody.error).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Authentication is required',
    });
    expect(vietnameseBody.error).toEqual({
      code: 'UNAUTHORIZED',
      message: 'Yêu cầu xác thực',
    });
    expect(vietnameseResponse.headers['content-language']).toBe('vi');
    expect(vietnameseResponse.headers.vary).toContain('Accept-Language');
  });

  it('localizes validation summary and field details', async () => {
    const response = await request(app)
      .post('/api/v1/auth/register')
      .set('Accept-Language', 'vi')
      .send({ email: 'invalid', password: 'short', fullName: '' });
    const body = errorResponseSchema.parse(response.body as unknown);

    expect(response.status).toBe(422);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toBe('Request body không hợp lệ');
    expect(body.error.details).toEqual(
      expect.arrayContaining([
        { path: 'password', message: 'Mật khẩu phải có ít nhất 8 ký tự' },
      ]),
    );
  });

  it('provides localized success messages from the typed catalog', () => {
    expect(translate('en', 'success.loggedOut')).toBe('Logged out successfully');
    expect(translate('vi', 'success.loggedOut')).toBe('Đăng xuất thành công');
  });
});
