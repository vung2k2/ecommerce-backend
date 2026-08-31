import { prisma } from '../../database/prisma.js';
import {
  Prisma,
  type OrderStatus,
  type PaymentMethod,
  type PaymentStatus,
} from '../../generated/prisma/client.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

// ==================== Data Interfaces ====================

export interface CreateOrderItemData {
  variantId?: string | null | undefined;
  productName: string;
  sku: string;
  options?: Prisma.InputJsonValue | null | undefined;
  unitPrice: bigint;
  quantity: number;
  totalPrice: bigint;
}

export interface CreateOrderData {
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotalAmount: bigint;
  discountAmount: bigint;
  shippingFee: bigint;
  totalAmount: bigint;
  recipientName: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  streetAddress: string;
  couponCode?: string | null | undefined;
  notes?: string | null | undefined;
  paymentExpiresAt?: Date | null | undefined;
  items: CreateOrderItemData[];
  initialHistoryReason?: string | null | undefined;
  actorId?: string | null | undefined;
}

export interface OrderItemRecord {
  id: string;
  orderId: string;
  variantId: string | null;
  productName: string;
  sku: string;
  options: Prisma.JsonValue | null;
  unitPrice: bigint;
  quantity: number;
  totalPrice: bigint;
  createdAt: Date;
}

export interface OrderStatusHistoryRecord {
  id: string;
  orderId: string;
  fromStatus: OrderStatus | null;
  toStatus: OrderStatus;
  reason: string | null;
  changedById: string | null;
  createdAt: Date;
}

export interface OrderWithDetailsRecord {
  id: string;
  orderNumber: string;
  userId: string;
  status: OrderStatus;
  paymentMethod: PaymentMethod;
  paymentStatus: PaymentStatus;
  subtotalAmount: bigint;
  discountAmount: bigint;
  shippingFee: bigint;
  totalAmount: bigint;
  recipientName: string;
  phone: string;
  province: string;
  district: string;
  ward: string;
  streetAddress: string;
  couponCode: string | null;
  notes: string | null;
  cancelReason: string | null;
  cancelledAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
  items: OrderItemRecord[];
  statusHistory: OrderStatusHistoryRecord[];
}

export interface ListCustomerOrdersOptions {
  userId: string;
  page: number;
  pageSize: number;
  status?: OrderStatus | undefined;
}

export interface ListAdminOrdersOptions {
  page: number;
  pageSize: number;
  status?: OrderStatus | undefined;
  paymentStatus?: PaymentStatus | undefined;
  search?: string | undefined;
}

export interface UpdateOrderStatusData {
  status: OrderStatus;
  paymentStatus?: PaymentStatus | undefined;
  cancelReason?: string | null | undefined;
  cancelledAt?: Date | null | undefined;
}

// ==================== Repository ====================

export const orderRepository = {
  async createOrder(data: CreateOrderData, tx?: PrismaClientOrTx): Promise<OrderWithDetailsRecord> {
    const client = tx ?? prisma;
    return client.order.create({
      data: {
        orderNumber: data.orderNumber,
        userId: data.userId,
        status: data.status,
        paymentMethod: data.paymentMethod,
        paymentStatus: data.paymentStatus,
        subtotalAmount: data.subtotalAmount,
        discountAmount: data.discountAmount,
        shippingFee: data.shippingFee,
        totalAmount: data.totalAmount,
        recipientName: data.recipientName,
        phone: data.phone,
        province: data.province,
        district: data.district,
        ward: data.ward,
        streetAddress: data.streetAddress,
        couponCode: data.couponCode ?? null,
        notes: data.notes ?? null,
        paymentExpiresAt: data.paymentExpiresAt ?? null,
        items: {
          create: data.items.map((item) => ({
            variantId: item.variantId ?? null,
            productName: item.productName,
            sku: item.sku,
            options:
              item.options === undefined || item.options === null
                ? Prisma.DbNull
                : item.options,
            unitPrice: item.unitPrice,
            quantity: item.quantity,
            totalPrice: item.totalPrice,
          })),
        },
        statusHistory: {
          create: {
            fromStatus: null,
            toStatus: data.status,
            reason: data.initialHistoryReason ?? 'Order created',
            changedById: data.actorId ?? data.userId,
          },
        },
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  },

  async findById(id: string, tx?: PrismaClientOrTx): Promise<OrderWithDetailsRecord | null> {
    const client = tx ?? prisma;
    return client.order.findUnique({
      where: { id },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  },

  async findByOrderNumber(
    orderNumber: string,
    tx?: PrismaClientOrTx,
  ): Promise<OrderWithDetailsRecord | null> {
    const client = tx ?? prisma;
    return client.order.findUnique({
      where: { orderNumber },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  },

  async findForUpdate(id: string, tx: Prisma.TransactionClient): Promise<OrderWithDetailsRecord | null> {
    await tx.$queryRaw`SELECT id FROM orders WHERE id = ${id}::uuid FOR UPDATE`;
    return this.findById(id, tx);
  },

  async listCustomerOrders(
    options: ListCustomerOrdersOptions,
    tx?: PrismaClientOrTx,
  ): Promise<{
    items: OrderWithDetailsRecord[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const client = tx ?? prisma;
    const { userId, page, pageSize, status } = options;
    const skip = (page - 1) * pageSize;

    const where: Prisma.OrderWhereInput = {
      userId,
      ...(status ? { status } : {}),
    };

    const [items, total] = await Promise.all([
      client.order.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
          },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      client.order.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  },

  async listAdminOrders(
    options: ListAdminOrdersOptions,
    tx?: PrismaClientOrTx,
  ): Promise<{
    items: OrderWithDetailsRecord[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const client = tx ?? prisma;
    const { page, pageSize, status, paymentStatus, search } = options;
    const skip = (page - 1) * pageSize;

    const where: Prisma.OrderWhereInput = {};

    if (status) {
      where.status = status;
    }

    if (paymentStatus) {
      where.paymentStatus = paymentStatus;
    }

    if (search) {
      where.OR = [
        { orderNumber: { contains: search, mode: 'insensitive' } },
        { phone: { contains: search, mode: 'insensitive' } },
        { recipientName: { contains: search, mode: 'insensitive' } },
      ];
    }

    const [items, total] = await Promise.all([
      client.order.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { createdAt: 'desc' },
        include: {
          items: {
            orderBy: { createdAt: 'asc' },
          },
          statusHistory: {
            orderBy: { createdAt: 'asc' },
          },
        },
      }),
      client.order.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  },

  async updateOrderStatus(
    orderId: string,
    data: UpdateOrderStatusData,
    tx?: PrismaClientOrTx,
  ): Promise<OrderWithDetailsRecord> {
    const client = tx ?? prisma;
    return client.order.update({
      where: { id: orderId },
      data: {
        status: data.status,
        ...(data.paymentStatus !== undefined ? { paymentStatus: data.paymentStatus } : {}),
        ...(data.cancelReason !== undefined ? { cancelReason: data.cancelReason } : {}),
        ...(data.cancelledAt !== undefined ? { cancelledAt: data.cancelledAt } : {}),
      },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
        },
        statusHistory: {
          orderBy: { createdAt: 'asc' },
        },
      },
    });
  },

  async createStatusHistory(
    data: {
      orderId: string;
      fromStatus: OrderStatus | null;
      toStatus: OrderStatus;
      reason?: string | null;
      changedById?: string | null;
    },
    tx?: PrismaClientOrTx,
  ): Promise<OrderStatusHistoryRecord> {
    const client = tx ?? prisma;
    return client.orderStatusHistory.create({
      data: {
        orderId: data.orderId,
        fromStatus: data.fromStatus,
        toStatus: data.toStatus,
        reason: data.reason ?? null,
        changedById: data.changedById ?? null,
      },
    });
  },

  async countOrderItemsByVariantId(variantId: string, tx?: PrismaClientOrTx): Promise<number> {
    const client = tx ?? prisma;
    return client.orderItem.count({
      where: { variantId },
    });
  },

  async countOrderItemsByProductId(productId: string, tx?: PrismaClientOrTx): Promise<number> {
    const client = tx ?? prisma;
    return client.orderItem.count({
      where: {
        variant: {
          productId,
        },
      },
    });
  },
};
