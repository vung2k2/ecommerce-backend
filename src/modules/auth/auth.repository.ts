import { prisma } from '../../database/prisma.js';
import type { RegisterInput } from './auth.schema.js';

export const authRepository = {
  findUserByEmail(email: string) {
    return prisma.user.findUnique({ where: { email } });
  },

  createCustomer(input: RegisterInput & { passwordHash: string }) {
    return prisma.user.create({
      data: {
        email: input.email,
        passwordHash: input.passwordHash,
        fullName: input.fullName,
      },
      select: {
        id: true,
        email: true,
        fullName: true,
        role: true,
        createdAt: true,
      },
    });
  },
};
