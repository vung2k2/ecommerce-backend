import { logger } from '../../config/logger.js';
import type { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { auditRepository, type CreateAuditLogData } from './audit.repository.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

export const auditService = {
  async record(data: CreateAuditLogData, tx?: PrismaClientOrTx) {
    try {
      return await auditRepository.createAuditLog(data, tx);
    } catch (error) {
      logger.error({ error, auditData: data }, 'Failed to record audit log');
      // Không để lỗi ghi audit log chặn luồng chính nếu không nằm trong critical transaction
      if (tx) {
        throw error;
      }
      return null;
    }
  },

  async getLogs(params: {
    actorId?: string;
    targetType?: string;
    targetId?: string;
    page?: number;
    limit?: number;
  }) {
    const [items, total] = await auditRepository.findAuditLogs(params);
    const page = params.page ?? 1;
    const limit = params.limit ?? 20;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    };
  },
};
