import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import type { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from './users.schema.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

export const usersRepository = {
  findUserById(userId: string, tx: PrismaClientOrTx = prisma) {
    return tx.user.findUnique({
      where: { id: userId },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  updateUser(userId: string, data: UpdateProfileDto, tx: PrismaClientOrTx = prisma) {
    return tx.user.update({
      where: { id: userId },
      data: {
        ...(data.fullName !== undefined ? { fullName: data.fullName } : {}),
      },
      select: {
        id: true,
        fullName: true,
        email: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  },

  findAddressesByUserId(userId: string, tx: PrismaClientOrTx = prisma) {
    return tx.address.findMany({
      where: { userId },
      orderBy: [{ isDefault: 'desc' }, { createdAt: 'desc' }],
    });
  },

  findAddressByIdAndUserId(id: string, userId: string, tx: PrismaClientOrTx = prisma) {
    return tx.address.findFirst({
      where: { id, userId },
    });
  },

  countAddressesByUserId(userId: string, tx: PrismaClientOrTx = prisma) {
    return tx.address.count({
      where: { userId },
    });
  },

  lockUserAddresses(userId: string, tx: Prisma.TransactionClient) {
    return tx.$queryRaw<Array<{ locked: string }>>`
      SELECT pg_advisory_xact_lock(hashtextextended(${`user-address:${userId}`}, 0))::text AS locked
    `;
  },

  async createAddress(userId: string, data: CreateAddressDto) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`user-address:${userId}`}, 0))::text AS locked
      `;

      const count = await tx.address.count({ where: { userId } });
      const isDefault = count === 0 ? true : Boolean(data.isDefault);

      if (isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.create({
        data: {
          ...data,
          userId,
          isDefault,
        },
      });
    });
  },

  async updateAddress(id: string, userId: string, data: UpdateAddressDto) {
    const updateData: Prisma.AddressUpdateInput = {
      ...(data.recipientName !== undefined ? { recipientName: data.recipientName } : {}),
      ...(data.phone !== undefined ? { phone: data.phone } : {}),
      ...(data.province !== undefined ? { province: data.province } : {}),
      ...(data.district !== undefined ? { district: data.district } : {}),
      ...(data.ward !== undefined ? { ward: data.ward } : {}),
      ...(data.streetAddress !== undefined ? { streetAddress: data.streetAddress } : {}),
      ...(data.isDefault !== undefined ? { isDefault: data.isDefault } : {}),
    };

    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`user-address:${userId}`}, 0))::text AS locked
      `;

      if (data.isDefault) {
        await tx.address.updateMany({
          where: { userId, isDefault: true },
          data: { isDefault: false },
        });
      }

      return tx.address.update({
        where: { id },
        data: updateData,
      });
    });
  },

  deleteAddress(id: string, userId: string, tx: PrismaClientOrTx = prisma) {
    return tx.address.deleteMany({
      where: { id, userId },
    });
  },

  async setDefaultAddress(id: string, userId: string) {
    return prisma.$transaction(async (tx) => {
      await tx.$queryRaw`
        SELECT pg_advisory_xact_lock(hashtextextended(${`user-address:${userId}`}, 0))::text AS locked
      `;

      await tx.address.updateMany({
        where: { userId, isDefault: true },
        data: { isDefault: false },
      });

      return tx.address.update({
        where: { id },
        data: { isDefault: true },
      });
    });
  },
};
