import { Redis } from 'ioredis';
import request from 'supertest';
import { describe, expect, it, vi } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';

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

  it('reports ready when PostgreSQL and Redis are both reachable', async () => {
    const dbSpy = vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ 1: 1 }] as never);
    const redisSpy = vi.spyOn(Redis.prototype, 'ping').mockResolvedValue('PONG' as never);

    const response = await request(createApp()).get('/health/ready');

    expect(response.status).toBe(200);
    expect(response.body).toEqual({
      status: 'ready',
      dependencies: { database: 'up', redis: 'up' },
    });

    dbSpy.mockRestore();
    redisSpy.mockRestore();
  });

  it('returns 503 when Redis is unreachable', async () => {
    const dbSpy = vi.spyOn(prisma, '$queryRaw').mockResolvedValue([{ 1: 1 }] as never);
    const pingSpy = vi
      .spyOn(Redis.prototype, 'ping')
      .mockRejectedValue(new Error('Connection is closed.') as never);

    const response = await request(createApp()).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'not_ready',
      dependencies: { database: 'up', redis: 'down' },
    });

    dbSpy.mockRestore();
    pingSpy.mockRestore();
  });

  it('returns 503 when PostgreSQL is unreachable', async () => {
    const dbSpy = vi.spyOn(prisma, '$queryRaw').mockRejectedValue(new Error('DB down') as never);
    const redisSpy = vi.spyOn(Redis.prototype, 'ping').mockResolvedValue('PONG' as never);

    const response = await request(createApp()).get('/health/ready');

    expect(response.status).toBe(503);
    expect(response.body).toEqual({
      status: 'not_ready',
      dependencies: { database: 'down', redis: 'up' },
    });

    dbSpy.mockRestore();
    redisSpy.mockRestore();
  });
});
