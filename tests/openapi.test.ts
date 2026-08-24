import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';

const openApiDocumentSchema = z.object({
  openapi: z.literal('3.0.3'),
  paths: z.record(
    z.string(),
    z.object({
      get: z.unknown().optional(),
      post: z.unknown().optional(),
      patch: z.unknown().optional(),
      put: z.unknown().optional(),
      delete: z.unknown().optional(),
    }),
  ),
});

describe('OpenAPI document', () => {
  it('generates the document and registers every implemented API path', async () => {
    const response = await request(createApp()).get('/docs.json');

    expect(response.status).toBe(200);
    const document = openApiDocumentSchema.parse(response.body as unknown);

    expect(Object.keys(document.paths).sort()).toEqual(
      [
        '/admin/brands',
        '/admin/brands/{id}',
        '/admin/categories',
        '/admin/categories/{id}',
        '/admin/images',
        '/admin/images/{id}',
        '/admin/inventory',
        '/admin/inventory/{variantId}',
        '/admin/inventory/{variantId}/adjust',
        '/admin/inventory/{variantId}/movements',
        '/admin/inventory/{variantId}/restock',
        '/admin/products',
        '/admin/products/{id}',
        '/admin/specifications',
        '/admin/specifications/{id}',
        '/admin/staff',
        '/admin/staff/{id}',
        '/admin/staff/{id}/permissions',
        '/admin/variants',
        '/admin/variants/{id}',
        '/auth/login',
        '/auth/logout',
        '/auth/logout-all',
        '/auth/refresh',
        '/auth/register',
        '/brands',
        '/brands/{slug}',
        '/categories',
        '/categories/{slug}',
        '/products',
        '/products/{slug}',
        '/users/me',
        '/users/me/addresses',
        '/users/me/addresses/{id}',
        '/users/me/addresses/{id}/default',
      ].sort(),
    );
  });

  it('documents common errors globally and only business errors on each endpoint', async () => {
    const response = await request(createApp()).get('/docs.json');
    const body = response.body as {
      info?: { description?: string };
      paths?: Record<string, { post?: { responses?: Record<string, unknown> } }>;
    };

    expect(body.info?.description).toContain('UNAUTHORIZED');
    expect(body.info?.description).toContain('VALIDATION_ERROR');
    expect(body.info?.description).toContain('TOO_MANY_REQUESTS');
    expect(Object.keys(body.paths?.['/auth/register']?.post?.responses ?? {})).toEqual([
      '201',
      '409',
    ]);
    expect(Object.keys(body.paths?.['/auth/refresh']?.post?.responses ?? {})).toEqual([
      '200',
      '401',
      '403',
    ]);
    expect(Object.keys(body.paths?.['/auth/logout']?.post?.responses ?? {})).toEqual(['200']);
    expect(body.paths?.['/auth/register']?.post?.responses?.['409']).toEqual({
      description: 'Error codes: `EMAIL_ALREADY_EXISTS`',
    });
  });
});
