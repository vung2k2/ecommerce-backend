import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';
import { jwtService } from '../src/utils/jwt.js';

const tokenPairResponseSchema = z.object({
  data: z.object({
    accessToken: z.string().min(1),
    refreshToken: z.string().min(1),
  }),
});

function readTokenPair(response: request.Response) {
  return tokenPairResponseSchema.parse(response.body as unknown).data;
}

describe('auth session lifecycle', () => {
  const app = createApp();
  const credentials = {
    email: 'session@example.com',
    password: 'password123',
    fullName: 'Session User',
  };

  beforeEach(async () => {
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany({ where: { email: credentials.email } });
    await request(app).post('/api/v1/auth/register').send(credentials).expect(201);
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  async function login() {
    const response = await request(app).post('/api/v1/auth/login').send({
      email: credentials.email,
      password: credentials.password,
    });

    expect(response.status).toBe(200);
    return readTokenPair(response);
  }

  it('always generates a distinct refresh token during immediate rotation', async () => {
    const tokens = await login();
    const response = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken });

    expect(response.status).toBe(200);
    expect(readTokenPair(response).refreshToken).not.toBe(tokens.refreshToken);
    await expect(prisma.refreshToken.count({ where: { isRevoked: false } })).resolves.toBe(1);
  });

  it('commits family revocation when a rotated token is reused', async () => {
    const tokens = await login();
    const rotated = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken })
      .expect(200);

    const reuse = await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: tokens.refreshToken });

    expect(reuse.status).toBe(401);
    expect(reuse.body).toMatchObject({ error: { code: 'TOKEN_REUSE_DETECTED' } });
    await expect(prisma.refreshToken.count({ where: { isRevoked: false } })).resolves.toBe(0);

    await request(app)
      .post('/api/v1/auth/refresh')
      .send({ refreshToken: readTokenPair(rotated).refreshToken })
      .expect(401);
  });

  it('never leaves two valid tokens after concurrent refresh requests', async () => {
    const tokens = await login();
    const responses = await Promise.all([
      request(app).post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }),
      request(app).post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }),
    ]);

    expect(responses.map((response) => response.status).sort()).toEqual([200, 401]);
    await expect(prisma.refreshToken.count({ where: { isRevoked: false } })).resolves.toBe(0);
  });

  it('does not leave a valid session when refresh races with logout', async () => {
    const tokens = await login();
    const [refreshResponse, logoutResponse] = await Promise.all([
      request(app).post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }),
      request(app).post('/api/v1/auth/logout').send({ refreshToken: tokens.refreshToken }),
    ]);

    expect([200, 401]).toContain(refreshResponse.status);
    expect(logoutResponse.status).toBe(200);
    await expect(prisma.refreshToken.count({ where: { isRevoked: false } })).resolves.toBe(0);

    if (refreshResponse.status === 200) {
      await request(app)
        .post('/api/v1/auth/refresh')
        .send({ refreshToken: readTokenPair(refreshResponse).refreshToken })
        .expect(401);
    }
  });

  it('does not leave a valid session when refresh races with logout-all', async () => {
    const tokens = await login();
    const [refreshResponse, logoutAllResponse] = await Promise.all([
      request(app).post('/api/v1/auth/refresh').send({ refreshToken: tokens.refreshToken }),
      request(app)
        .post('/api/v1/auth/logout-all')
        .set('Authorization', `Bearer ${tokens.accessToken}`),
    ]);

    expect([200, 401]).toContain(refreshResponse.status);
    expect(logoutAllResponse.status).toBe(200);
    await expect(prisma.refreshToken.count({ where: { isRevoked: false } })).resolves.toBe(0);
  });

  it('rejects refresh tokens at access-token boundaries', async () => {
    const tokens = await login();

    await request(app)
      .post('/api/v1/auth/logout-all')
      .set('Authorization', `Bearer ${tokens.refreshToken}`)
      .expect(401);

    expect(() => jwtService.verifyAccessToken(tokens.refreshToken)).toThrow();
  });
});
