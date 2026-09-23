import { prisma } from '../../database/prisma.js';
import { ORDER_STATUSES, type OrderStatus } from '../../constants/index.js';
import type { Prisma } from '../../generated/prisma/client.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

// ==================== Data Interfaces ====================

export interface ReportDateFilter {
  startDate?: Date | undefined;
  endDate?: Date | undefined;
}

export interface SalesOverviewResult {
  totalRevenue: bigint;
  totalOrders: number;
  totalItemsSold: number;
  averageOrderValue: bigint;
  dailyBreakdown: Array<{
    date: string;
    revenue: bigint;
    ordersCount: number;
  }>;
}

export interface TopProductResult {
  productId: string | null;
  productName: string;
  unitsSold: number;
  totalRevenue: bigint;
}

// ==================== Repository ====================

export const reportsRepository = {
  getSalesOverview: async (
    filter: ReportDateFilter,
    tx: PrismaClientOrTx = prisma,
  ): Promise<SalesOverviewResult> => {
    const where: Prisma.OrderWhereInput = {
      status: ORDER_STATUSES.DELIVERED as OrderStatus,
      deliveredAt: { not: null },
    };

    if (filter.startDate || filter.endDate) {
      where.deliveredAt = {
        not: null,
        ...(filter.startDate ? { gte: filter.startDate } : {}),
        ...(filter.endDate ? { lte: filter.endDate } : {}),
      };
    }

    const orders = await tx.order.findMany({
      where,
      select: {
        totalAmount: true,
        deliveredAt: true,
        items: {
          select: {
            quantity: true,
          },
        },
      },
      orderBy: { deliveredAt: 'asc' },
    });

    let totalRevenue = 0n;
    let totalItemsSold = 0;
    const dailyMap = new Map<string, { revenue: bigint; ordersCount: number }>();

    for (const order of orders) {
      totalRevenue += order.totalAmount;
      for (const item of order.items) {
        totalItemsSold += item.quantity;
      }

      const dateStr = (order.deliveredAt ?? new Date()).toISOString().slice(0, 10);
      const current = dailyMap.get(dateStr) ?? { revenue: 0n, ordersCount: 0 };
      dailyMap.set(dateStr, {
        revenue: current.revenue + order.totalAmount,
        ordersCount: current.ordersCount + 1,
      });
    }

    const totalOrders = orders.length;
    const averageOrderValue = totalOrders > 0 ? totalRevenue / BigInt(totalOrders) : 0n;

    const dailyBreakdown = Array.from(dailyMap.entries()).map(([date, data]) => ({
      date,
      revenue: data.revenue,
      ordersCount: data.ordersCount,
    }));

    return {
      totalRevenue,
      totalOrders,
      totalItemsSold,
      averageOrderValue,
      dailyBreakdown,
    };
  },

  getTopSellingProducts: async (
    filter: ReportDateFilter & { limit: number },
    tx: PrismaClientOrTx = prisma,
  ): Promise<TopProductResult[]> => {
    const where: Prisma.OrderItemWhereInput = {
      order: {
        status: ORDER_STATUSES.DELIVERED as OrderStatus,
        deliveredAt: {
          not: null,
          ...(filter.startDate ? { gte: filter.startDate } : {}),
          ...(filter.endDate ? { lte: filter.endDate } : {}),
        },
      },
    };

    const orderItems = await tx.orderItem.findMany({
      where,
      select: {
        productName: true,
        quantity: true,
        totalPrice: true,
        variant: {
          select: {
            productId: true,
          },
        },
      },
    });

    const productMap = new Map<
      string,
      {
        productId: string | null;
        productName: string;
        unitsSold: number;
        totalRevenue: bigint;
      }
    >();

    for (const item of orderItems) {
      const key = item.variant?.productId ?? item.productName;
      const current = productMap.get(key) ?? {
        productId: item.variant?.productId ?? null,
        productName: item.productName,
        unitsSold: 0,
        totalRevenue: 0n,
      };

      current.unitsSold += item.quantity;
      current.totalRevenue += item.totalPrice;
      productMap.set(key, current);
    }

    const sorted = Array.from(productMap.values()).sort((a, b) => {
      if (b.unitsSold !== a.unitsSold) {
        return b.unitsSold - a.unitsSold;
      }
      return b.totalRevenue > a.totalRevenue ? 1 : -1;
    });

    return sorted.slice(0, filter.limit);
  },
};
