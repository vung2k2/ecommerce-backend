import request from 'supertest';
import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';

describe('health endpoints', () => {
  it('returns the liveness status', async () => {
    const response = await request(createApp()).get('/health/live');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({ status: 'ok' });
    expect(response.headers['x-request-id']).toBeTypeOf('string');
  });

  it('returns the standard not-found response', async () => {
    const response = await request(createApp()).get('/missing-route');

    expect(response.status).toBe(404);
    expect(response.body as unknown).toMatchObject({
      error: { code: 'ROUTE_NOT_FOUND' },
    });
  });
});
