import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

// ==================== Data Interfaces ====================

export interface CartRecord {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartItemRecord {
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface CartItemWithDetailsRecord {
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
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
      images: Array<{
        id: string;
        url: string;
        isThumbnail: boolean;
        displayOrder: number;
      }>;
    };
    inventory: {
      onHand: number;
      reserved: number;
    } | null;
  };
}

export interface CartWithItemsRecord {
  id: string;
  userId: string;
  createdAt: Date;
  updatedAt: Date;
  items: CartItemWithDetailsRecord[];
}

export interface CartItemWithCartOwnerRecord {
  id: string;
  cartId: string;
  variantId: string;
  quantity: number;
  cart: {
    id: string;
    userId: string;
  };
}

// ==================== Repository ====================

export const cartRepository = {
  async getOrCreateCart(userId: string, tx?: PrismaClientOrTx): Promise<CartRecord> {
    const client = tx ?? prisma;
    return client.cart.upsert({
      where: { userId },
      create: { userId },
      update: {},
    });
  },

  async getOrCreateCartAndLock(userId: string, tx: Prisma.TransactionClient): Promise<CartRecord> {
    await tx.$executeRaw`
      INSERT INTO carts (id, user_id, created_at, updated_at)
      VALUES (gen_random_uuid(), ${userId}::uuid, NOW(), NOW())
      ON CONFLICT (user_id) DO NOTHING
    `;

    const [cart] = await tx.$queryRaw<CartRecord[]>`
      SELECT id, user_id as "userId", created_at as "createdAt", updated_at as "updatedAt"
      FROM carts
      WHERE user_id = ${userId}::uuid
      FOR UPDATE
    `;

    return cart!;
  },

  async lockCart(cartId: string, tx: Prisma.TransactionClient): Promise<void> {
    await tx.$queryRaw`SELECT id FROM carts WHERE id = ${cartId}::uuid FOR UPDATE`;
  },

  async findCartByUserId(userId: string, tx?: PrismaClientOrTx): Promise<CartWithItemsRecord | null> {
    const client = tx ?? prisma;
    return client.cart.findUnique({
      where: { userId },
      include: {
        items: {
          orderBy: { createdAt: 'asc' },
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    images: {
                      orderBy: [{ isThumbnail: 'desc' }, { displayOrder: 'asc' }],
                    },
                  },
                },
                inventory: true,
              },
            },
          },
        },
      },
    });
  },

  async findCartItemById(
    itemId: string,
    tx?: PrismaClientOrTx,
  ): Promise<CartItemWithCartOwnerRecord | null> {
    const client = tx ?? prisma;
    return client.cartItem.findUnique({
      where: { id: itemId },
      select: {
        id: true,
        cartId: true,
        variantId: true,
        quantity: true,
        cart: {
          select: {
            id: true,
            userId: true,
          },
        },
      },
    });
  },

  async findCartItemByCartAndVariant(
    cartId: string,
    variantId: string,
    tx?: PrismaClientOrTx,
  ): Promise<CartItemRecord | null> {
    const client = tx ?? prisma;
    return client.cartItem.findUnique({
      where: {
        cartId_variantId: {
          cartId,
          variantId,
        },
      },
    });
  },

  async upsertCartItem(
    cartId: string,
    variantId: string,
    quantity: number,
    tx?: PrismaClientOrTx,
  ): Promise<CartItemRecord> {
    const client = tx ?? prisma;
    return client.cartItem.upsert({
      where: {
        cartId_variantId: {
          cartId,
          variantId,
        },
      },
      create: {
        cartId,
        variantId,
        quantity,
      },
      update: {
        quantity,
      },
    });
  },

  async updateCartItemQuantity(
    itemId: string,
    quantity: number,
    tx?: PrismaClientOrTx,
  ): Promise<CartItemRecord> {
    const client = tx ?? prisma;
    return client.cartItem.update({
      where: { id: itemId },
      data: { quantity },
    });
  },

  async removeCartItem(itemId: string, tx?: PrismaClientOrTx): Promise<CartItemRecord> {
    const client = tx ?? prisma;
    return client.cartItem.delete({
      where: { id: itemId },
    });
  },

  async clearCart(cartId: string, tx?: PrismaClientOrTx): Promise<Prisma.BatchPayload> {
    const client = tx ?? prisma;
    return client.cartItem.deleteMany({
      where: { cartId },
    });
  },
};
