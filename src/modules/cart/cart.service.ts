import { ERROR_CODES } from '../../constants/index.js';
import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import { calculateCartPricing } from '../../utils/pricing.js';
import { cartRepository } from './cart.repository.js';
import type { AddToCartDto, UpdateCartItemDto } from './cart.schema.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

export interface SerializedCartItem {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: string;
  itemSubtotal: string;
  isAvailable: boolean;
  warningReason: string | null;
  variant: {
    id: string;
    sku: string;
    name: string;
    price: string;
    isActive: boolean;
    product: {
      id: string;
      name: string;
      slug: string;
      status: string;
      thumbnailUrl: string | null;
    };
    availableStock: number;
  };
}

export interface SerializedCart {
  id: string;
  items: SerializedCartItem[];
  totalItems: number;
  availableItemCount: number;
  unavailableItemCount: number;
  hasUnavailableItems: boolean;
  subtotal: string;
}

export const cartService = {
  async getCart(userId: string, tx?: PrismaClientOrTx): Promise<SerializedCart> {
    await cartRepository.getOrCreateCart(userId, tx);
    const cart = await cartRepository.findCartByUserId(userId, tx);

    if (!cart) {
      throw new AppError(404, ERROR_CODES.CART_NOT_FOUND);
    }

    const snapshot = calculateCartPricing(cart.id, cart.items);

    return {
      id: snapshot.id,
      items: snapshot.items.map((item) => ({
        id: item.id,
        variantId: item.variantId,
        quantity: item.quantity,
        unitPrice: item.unitPrice.toString(),
        itemSubtotal: item.itemSubtotal.toString(),
        isAvailable: item.isAvailable,
        warningReason: item.warningReason,
        variant: {
          id: item.variant.id,
          sku: item.variant.sku,
          name: item.variant.name,
          price: item.variant.price.toString(),
          isActive: item.variant.isActive,
          product: item.variant.product,
          availableStock: item.variant.availableStock,
        },
      })),
      totalItems: snapshot.totalItems,
      availableItemCount: snapshot.availableItemCount,
      unavailableItemCount: snapshot.unavailableItemCount,
      hasUnavailableItems: snapshot.hasUnavailableItems,
      subtotal: snapshot.subtotal.toString(),
    };
  },

  async addItem(userId: string, dto: AddToCartDto): Promise<SerializedCart> {
    return prisma.$transaction(async (tx) => {
      // 1. Tìm variant và kiểm tra trạng thái
      const variant = await tx.productVariant.findUnique({
        where: { id: dto.variantId },
        include: {
          product: { select: { id: true, status: true } },
          inventory: true,
        },
      });

      if (!variant) {
        throw new AppError(404, ERROR_CODES.VARIANT_NOT_FOUND);
      }

      if (variant.product.status !== 'ACTIVE' || !variant.isActive) {
        throw new AppError(422, ERROR_CODES.VARIANT_INACTIVE);
      }

      const onHand = variant.inventory?.onHand ?? 0;
      const reserved = variant.inventory?.reserved ?? 0;
      const availableStock = Math.max(0, onHand - reserved);

      if (availableStock <= 0) {
        throw new AppError(422, ERROR_CODES.INSUFFICIENT_STOCK);
      }

      // 2. Lấy cart của user và khóa giỏ hàng để tránh race condition / lost update
      const cart = await cartRepository.getOrCreateCartAndLock(userId, tx);

      // 3. Tìm item đã có trong cart để cộng dồn
      const existingItem = await cartRepository.findCartItemByCartAndVariant(
        cart.id,
        dto.variantId,
        tx,
      );
      const newQuantity = (existingItem?.quantity ?? 0) + dto.quantity;

      if (newQuantity > availableStock) {
        throw new AppError(422, ERROR_CODES.CART_ITEM_QUANTITY_INVALID);
      }

      // 4. Lưu vào database
      await cartRepository.upsertCartItem(cart.id, dto.variantId, newQuantity, tx);

      // 5. Trả về cart mới nhất
      return this.getCart(userId, tx);
    });
  },

  async updateItemQuantity(
    userId: string,
    itemId: string,
    dto: UpdateCartItemDto,
  ): Promise<SerializedCart> {
    return prisma.$transaction(async (tx) => {
      // 1. Kiểm tra item và quyền sở hữu
      const item = await cartRepository.findCartItemById(itemId, tx);
      if (!item || item.cart.userId !== userId) {
        throw new AppError(404, ERROR_CODES.CART_ITEM_NOT_FOUND);
      }

      await cartRepository.lockCart(item.cartId, tx);

      // 2. Kiểm tra tồn kho của variant
      const variant = await tx.productVariant.findUnique({
        where: { id: item.variantId },
        include: {
          product: { select: { status: true } },
          inventory: true,
        },
      });

      if (!variant) {
        throw new AppError(404, ERROR_CODES.VARIANT_NOT_FOUND);
      }

      if (variant.product.status !== 'ACTIVE' || !variant.isActive) {
        throw new AppError(422, ERROR_CODES.VARIANT_INACTIVE);
      }

      const onHand = variant.inventory?.onHand ?? 0;
      const reserved = variant.inventory?.reserved ?? 0;
      const availableStock = Math.max(0, onHand - reserved);

      if (dto.quantity > availableStock) {
        throw new AppError(422, ERROR_CODES.CART_ITEM_QUANTITY_INVALID);
      }

      // 3. Cập nhật số lượng mới
      await cartRepository.updateCartItemQuantity(itemId, dto.quantity, tx);

      return this.getCart(userId, tx);
    });
  },

  async removeItem(userId: string, itemId: string): Promise<SerializedCart> {
    const item = await cartRepository.findCartItemById(itemId);
    if (!item || item.cart.userId !== userId) {
      throw new AppError(404, ERROR_CODES.CART_ITEM_NOT_FOUND);
    }

    await cartRepository.removeCartItem(itemId);
    return this.getCart(userId);
  },

  async clearCart(userId: string): Promise<SerializedCart> {
    const cart = await cartRepository.getOrCreateCart(userId);
    await cartRepository.clearCart(cart.id);
    return this.getCart(userId);
  },
};
