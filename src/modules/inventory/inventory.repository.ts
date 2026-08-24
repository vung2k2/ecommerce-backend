import { prisma } from '../../database/prisma.js';
import type { Prisma, StockMovementType } from '../../generated/prisma/client.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

// ==================== Data Interfaces ====================

export interface CreateStockMovementData {
  inventoryId: string;
  type: StockMovementType;
  onHandChange: number;
  reservedChange: number;
  balanceAfterOnHand: number;
  balanceAfterReserved: number;
  reason?: string | null | undefined;
  referenceType?: string | null | undefined;
  referenceId?: string | null | undefined;
  actorId?: string | null | undefined;
}

export interface InventoryRecord {
  id: string;
  variantId: string;
  onHand: number;
  reserved: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface InventoryWithVariantAndProduct {
  id: string;
  variantId: string;
  onHand: number;
  reserved: number;
  createdAt: Date;
  updatedAt: Date;
  variant: {
    id: string;
    sku: string;
    name: string;
    price: bigint;
    isActive: boolean;
    product: {
      id: string;
      name: string;
      slug: string;
      status: string;
    };
  };
}

export interface StockMovementWithActor {
  id: string;
  inventoryId: string;
  type: StockMovementType;
  onHandChange: number;
  reservedChange: number;
  balanceAfterOnHand: number;
  balanceAfterReserved: number;
  reason: string | null;
  referenceType: string | null;
  referenceId: string | null;
  actorId: string | null;
  createdAt: Date;
  actor: {
    id: string;
    email: string;
    fullName: string;
    role: string;
  } | null;
}

export interface ListInventoriesOptions {
  page: number;
  pageSize: number;
  search?: string | undefined;
  lowStockThreshold?: number | undefined;
}

export interface ListMovementsOptions {
  page: number;
  pageSize: number;
}

// ==================== Repository ====================

export const inventoryRepository = {
  findVariantWithProduct(variantId: string, tx: PrismaClientOrTx = prisma) {
    return tx.productVariant.findUnique({
      where: { id: variantId },
      include: {
        product: {
          select: {
            id: true,
            name: true,
            slug: true,
            status: true,
          },
        },
      },
    });
  },

  async findByVariantId(
    variantId: string,
    tx?: PrismaClientOrTx,
  ): Promise<InventoryWithVariantAndProduct | null> {
    const client = tx ?? prisma;
    return client.inventory.findUnique({
      where: { variantId },
      include: {
        variant: {
          select: {
            id: true,
            sku: true,
            name: true,
            price: true,
            isActive: true,
            product: {
              select: {
                id: true,
                name: true,
                slug: true,
                status: true,
              },
            },
          },
        },
      },
    });
  },

  async findForUpdate(variantId: string, tx: Prisma.TransactionClient): Promise<InventoryRecord | null> {
    const rows = await tx.$queryRaw<
      Array<{
        id: string;
        variant_id: string;
        on_hand: number;
        reserved: number;
        created_at: Date;
        updated_at: Date;
      }>
    >`SELECT id, variant_id, on_hand, reserved, created_at, updated_at FROM inventories WHERE variant_id = ${variantId}::uuid FOR UPDATE`;

    const [row] = rows;
    if (!row) {
      return null;
    }

    return {
      id: row.id,
      variantId: row.variant_id,
      onHand: row.on_hand,
      reserved: row.reserved,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  },

  async ensureInventory(variantId: string, tx?: PrismaClientOrTx): Promise<InventoryRecord> {
    const client = tx ?? prisma;
    return client.inventory.upsert({
      where: { variantId },
      create: {
        variantId,
        onHand: 0,
        reserved: 0,
      },
      update: {},
    });
  },

  async updateStock(
    inventoryId: string,
    data: { onHand?: number; reserved?: number },
    tx?: PrismaClientOrTx,
  ) {
    const client = tx ?? prisma;
    return client.inventory.update({
      where: { id: inventoryId },
      data,
    });
  },

  async createStockMovement(data: CreateStockMovementData, tx?: PrismaClientOrTx) {
    const client = tx ?? prisma;
    return client.stockMovement.create({
      data: {
        inventoryId: data.inventoryId,
        type: data.type,
        onHandChange: data.onHandChange,
        reservedChange: data.reservedChange,
        balanceAfterOnHand: data.balanceAfterOnHand,
        balanceAfterReserved: data.balanceAfterReserved,
        reason: data.reason ?? null,
        referenceType: data.referenceType ?? null,
        referenceId: data.referenceId ?? null,
        actorId: data.actorId ?? null,
      },
    });
  },

  findMovementByBusinessEvent(
    inventoryId: string,
    type: StockMovementType,
    referenceType: string,
    referenceId: string,
    tx: PrismaClientOrTx = prisma,
  ) {
    return tx.stockMovement.findFirst({
      where: {
        inventoryId,
        type,
        referenceType,
        referenceId,
      },
    });
  },

  async listInventories(
    options: ListInventoriesOptions,
    tx?: PrismaClientOrTx,
  ): Promise<{
    items: InventoryWithVariantAndProduct[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const client = tx ?? prisma;
    const { page, pageSize, search, lowStockThreshold } = options;
    const skip = (page - 1) * pageSize;

    const where: Prisma.InventoryWhereInput = {};

    if (search) {
      where.variant = {
        OR: [
          { sku: { contains: search, mode: 'insensitive' } },
          { name: { contains: search, mode: 'insensitive' } },
          { product: { name: { contains: search, mode: 'insensitive' } } },
        ],
      };
    }

    if (typeof lowStockThreshold === 'number') {
      where.onHand = {
        lte: lowStockThreshold,
      };
    }

    const [items, total] = await Promise.all([
      client.inventory.findMany({
        where,
        skip,
        take: pageSize,
        orderBy: { updatedAt: 'desc' },
        include: {
          variant: {
            select: {
              id: true,
              sku: true,
              name: true,
              price: true,
              isActive: true,
              product: {
                select: {
                  id: true,
                  name: true,
                  slug: true,
                  status: true,
                },
              },
            },
          },
        },
      }),
      client.inventory.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },

  async listMovements(
    inventoryId: string,
    options: ListMovementsOptions,
    tx?: PrismaClientOrTx,
  ): Promise<{
    items: StockMovementWithActor[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const client = tx ?? prisma;
    const { page, pageSize } = options;
    const skip = (page - 1) * pageSize;

    const [items, total] = await Promise.all([
      client.stockMovement.findMany({
        where: { inventoryId },
        skip,
        take: pageSize,
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
      client.stockMovement.count({ where: { inventoryId } }),
    ]);

    return {
      items,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize),
    };
  },
};
