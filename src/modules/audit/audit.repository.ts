import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

export interface CreateAuditLogData {
  actorId?: string | null | undefined;
  action: string;
  targetType: string;
  targetId?: string | null | undefined;
  payload?: Prisma.InputJsonValue | undefined;
}

export const auditRepository = {
  createAuditLog(data: CreateAuditLogData, tx: PrismaClientOrTx = prisma) {
    const createData: Prisma.AuditLogUncheckedCreateInput = {
      action: data.action,
      targetType: data.targetType,
      ...(data.actorId !== undefined ? { actorId: data.actorId } : {}),
      ...(data.targetId !== undefined ? { targetId: data.targetId } : {}),
      ...(data.payload !== undefined ? { payload: data.payload } : {}),
    };

    return tx.auditLog.create({
      data: createData,
    });
  },

  findAuditLogs(
    params: {
      actorId?: string;
      targetType?: string;
      targetId?: string;
      page?: number;
      limit?: number;
    },
    tx: PrismaClientOrTx = prisma,
  ) {
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;
    const skip = (page - 1) * limit;

    const where: Prisma.AuditLogWhereInput = {
      ...(params.actorId ? { actorId: params.actorId } : {}),
      ...(params.targetType ? { targetType: params.targetType } : {}),
      ...(params.targetId ? { targetId: params.targetId } : {}),
    };

    return Promise.all([
      tx.auditLog.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: 'desc' },
        include: {
          actor: {
            select: {
              id: true,
              email: true,
              fullName: true,
              role: true,
            },
          },
        },
      }),
      tx.auditLog.count({ where }),
    ]);
  },
};
