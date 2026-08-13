import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { createApp } from '../src/app.js';
import { prisma } from '../src/database/prisma.js';

describe('POST /api/v1/auth/register', () => {
  const app = createApp();

  beforeEach(async () => {
    await prisma.user.deleteMany();
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  it('creates a customer and never exposes the password hash', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      email: '  Alice@Example.com ',
      password: 'password123',
      fullName: '  Alice Nguyen  ',
    });

    expect(response.status).toBe(201);
    expect(response.body as unknown).toMatchObject({
      data: {
        user: {
          email: 'alice@example.com',
          fullName: 'Alice Nguyen',
          role: 'CUSTOMER',
        },
      },
    });
    expect(JSON.stringify(response.body)).not.toContain('passwordHash');

    const user = await prisma.user.findUniqueOrThrow({
      where: { email: 'alice@example.com' },
    });
    expect(user.passwordHash).not.toBe('password123');
    await expect(bcrypt.compare('password123', user.passwordHash)).resolves.toBe(true);
  });

  it('rejects a duplicate email', async () => {
    const input = {
      email: 'alice@example.com',
      password: 'password123',
      fullName: 'Alice Nguyen',
    };

    await request(app).post('/api/v1/auth/register').send(input).expect(201);
    const response = await request(app).post('/api/v1/auth/register').send(input);

    expect(response.status).toBe(409);
    expect(response.body as unknown).toMatchObject({
      error: { code: 'EMAIL_ALREADY_EXISTS' },
    });
    await expect(prisma.user.count()).resolves.toBe(1);
  });

  it('rejects invalid input without creating a user', async () => {
    const response = await request(app).post('/api/v1/auth/register').send({
      email: 'not-an-email',
      password: 'short',
      fullName: '',
    });

    expect(response.status).toBe(422);
    expect(response.body as unknown).toMatchObject({
      error: { code: 'VALIDATION_ERROR' },
    });
    await expect(prisma.user.count()).resolves.toBe(0);
  });
});
