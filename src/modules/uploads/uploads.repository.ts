import { prisma } from '../../database/prisma.js';

export const uploadsRepository = {
  findActorById(userId: string) {
    return prisma.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        isActive: true,
        role: true,
        permissions: {
          select: { permission: true },
        },
      },
    });
  },
};
