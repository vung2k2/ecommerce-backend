import { prisma } from '../../database/prisma.js';
import type { DiscountType, Prisma } from '../../generated/prisma/client.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

// ==================== Data Interfaces ====================

export interface CreateCouponData {
  code: string;
  description?: string | null;
  discountType: DiscountType;
  discountValue: bigint;
  maxDiscountAmount?: bigint | null;
  minOrderAmount?: bigint;
  usageLimit?: number | null;
  usageLimitPerUser?: number | null;
  startDate: Date;
  endDate: Date;
  isActive?: boolean;
}

export interface UpdateCouponData {
  code?: string;
  description?: string | null;
  discountType?: DiscountType;
  discountValue?: bigint;
  maxDiscountAmount?: bigint | null;
  minOrderAmount?: bigint;
  usageLimit?: number | null;
  usageLimitPerUser?: number | null;
  startDate?: Date;
  endDate?: Date;
  isActive?: boolean;
}

export interface CouponRecord {
  id: string;
  code: string;
  description: string | null;
  discountType: DiscountType;
  discountValue: bigint;
  maxDiscountAmount: bigint | null;
  minOrderAmount: bigint;
  usageLimit: number | null;
  usedCount: number;
  usageLimitPerUser: number | null;
  startDate: Date;
  endDate: Date;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface CouponUsageRecord {
  id: string;
  couponId: string;
  userId: string;
  orderId: string | null;
  discountAmount: bigint;
  createdAt: Date;
}

export interface ListCouponsOptions {
  page: number;
  pageSize: number;
  search?: string | undefined;
  discountType?: DiscountType | undefined;
  isActive?: boolean | undefined;
}

// ==================== Repository ====================

export const couponRepository = {
  async createCoupon(data: CreateCouponData, tx?: PrismaClientOrTx): Promise<CouponRecord> {
    const client = tx ?? prisma;
    return client.coupon.create({
      data: {
        code: data.code,
        description: data.description ?? null,
        discountType: data.discountType,
        discountValue: data.discountValue,
        maxDiscountAmount: data.maxDiscountAmount ?? null,
        minOrderAmount: data.minOrderAmount ?? 0n,
        usageLimit: data.usageLimit ?? null,
        usageLimitPerUser: data.usageLimitPerUser ?? 1,
        startDate: data.startDate,
        endDate: data.endDate,
        isActive: data.isActive ?? true,
      },
    });
  },

  async updateCoupon(
    id: string,
    data: UpdateCouponData,
    tx?: PrismaClientOrTx,
  ): Promise<CouponRecord> {
    const client = tx ?? prisma;
    return client.coupon.update({
      where: { id },
      data,
    });
  },

  async deleteCoupon(id: string, tx?: PrismaClientOrTx): Promise<CouponRecord> {
    const client = tx ?? prisma;
    return client.coupon.delete({
      where: { id },
    });
  },

  async findById(id: string, tx?: PrismaClientOrTx): Promise<CouponRecord | null> {
    const client = tx ?? prisma;
    return client.coupon.findUnique({
      where: { id },
    });
  },

  async findByCode(code: string, tx?: PrismaClientOrTx): Promise<CouponRecord | null> {
    const client = tx ?? prisma;
    return client.coupon.findUnique({
      where: { code },
    });
  },

  async findForUpdate(id: string, tx: Prisma.TransactionClient): Promise<CouponRecord | null> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        code: string;
        description: string | null;
        discount_type: DiscountType;
        discount_value: bigint;
        max_discount_amount: bigint | null;
        min_order_amount: bigint;
        usage_limit: number | null;
        used_count: number;
        usage_limit_per_user: number | null;
        start_date: Date;
        end_date: Date;
        is_active: boolean;
        created_at: Date;
        updated_at: Date;
      }>
    >`SELECT * FROM coupons WHERE id = ${id}::uuid FOR UPDATE`;

    const [row] = rows;
    if (!row) return null;

    return {
      id: row.id,
      code: row.code,
      description: row.description,
      discountType: row.discount_type,
      discountValue: row.discount_value,
      maxDiscountAmount: row.max_discount_amount,
      minOrderAmount: row.min_order_amount,
      usageLimit: row.usage_limit,
      usedCount: row.used_count,
      usageLimitPerUser: row.usage_limit_per_user,
      startDate: row.start_date,
      endDate: row.end_date,
      isActive: row.is_active,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  async listCoupons(
    options: ListCouponsOptions,
    tx?: PrismaClientOrTx,
  ): Promise<{
    items: CouponRecord[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const client = tx ?? prisma;
    const { page, pageSize, search, discountType, isActive } = options;
    const skip = (page - 1) * pageSize;

    const where: Prisma.CouponWhereInput = {};

    if (search) {
      where.OR = [
        { code: { contains: search, mode: 'insensitive' } },
        { description: { contains: search, mode: 'insensitive' } },
      ];
    }

    if (discountType) {
      where.discountType = discountType;
    }

    if (typeof isActive === 'boolean') {
      where.isActive = isActive;
    }

    const [items, total] = await Promise.all([
      client.coupon.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
      }),
      client.coupon.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  },

  async countUserUsages(
    couponId: string,
    userId: string,
    tx?: PrismaClientOrTx,
  ): Promise<number> {
    const client = tx ?? prisma;
    return client.couponUsage.count({
      where: {
        couponId,
        userId,
      },
    });
  },

  async countTotalUsages(couponId: string, tx?: PrismaClientOrTx): Promise<number> {
    const client = tx ?? prisma;
    return client.couponUsage.count({
      where: { couponId },
    });
  },

  async recordUsage(
    data: {
      couponId: string;
      userId: string;
      orderId?: string | null;
      discountAmount: bigint;
    },
    tx?: PrismaClientOrTx,
  ): Promise<CouponUsageRecord> {
    const client = tx ?? prisma;
    return client.couponUsage.create({
      data: {
        couponId: data.couponId,
        userId: data.userId,
        orderId: data.orderId ?? null,
        discountAmount: data.discountAmount,
      },
    });
  },

  async incrementUsedCount(couponId: string, tx?: PrismaClientOrTx): Promise<CouponRecord> {
    const client = tx ?? prisma;
    return client.coupon.update({
      where: { id: couponId },
      data: {
        usedCount: {
          increment: 1,
        },
      },
    });
  },
};
