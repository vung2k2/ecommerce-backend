import { DISCOUNT_TYPES, type DiscountType } from '../constants/index.js';

export interface CartItemWithDetails {
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
    options?: unknown;
    isActive: boolean;
    product: {
      id: string;
      name: string;
      slug: string;
      status: string;
      images?: Array<{
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

export type ItemWarningReason =
  | 'PRODUCT_INACTIVE'
  | 'VARIANT_INACTIVE'
  | 'OUT_OF_STOCK'
  | 'INSUFFICIENT_STOCK';

export interface CalculatedCartItem {
  id: string;
  variantId: string;
  quantity: number;
  unitPrice: bigint;
  itemSubtotal: bigint;
  isAvailable: boolean;
  warningReason: ItemWarningReason | null;
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
      thumbnailUrl: string | null;
    };
    availableStock: number;
  };
}

export interface CartPricingSnapshot {
  id: string;
  items: CalculatedCartItem[];
  totalItems: number;
  availableItemCount: number;
  unavailableItemCount: number;
  hasUnavailableItems: boolean;
  subtotal: bigint;
}

export interface CouponDiscountInput {
  discountType: DiscountType;
  discountValue: bigint;
  maxDiscountAmount?: bigint | null;
}

export interface CouponDiscountResult {
  discountAmount: bigint;
  finalTotal: bigint;
}

export function calculateItemSubtotal(unitPrice: bigint, quantity: number): bigint {
  if (quantity <= 0) return 0n;
  return unitPrice * BigInt(quantity);
}

export function evaluateItemAvailability(item: CartItemWithDetails): {
  isAvailable: boolean;
  warningReason: ItemWarningReason | null;
  availableStock: number;
} {
  const onHand = item.variant.inventory?.onHand ?? 0;
  const reserved = item.variant.inventory?.reserved ?? 0;
  const availableStock = Math.max(0, onHand - reserved);

  if (item.variant.product.status !== 'ACTIVE') {
    return {
      isAvailable: false,
      warningReason: 'PRODUCT_INACTIVE',
      availableStock,
    };
  }

  if (!item.variant.isActive) {
    return {
      isAvailable: false,
      warningReason: 'VARIANT_INACTIVE',
      availableStock,
    };
  }

  if (availableStock <= 0) {
    return {
      isAvailable: false,
      warningReason: 'OUT_OF_STOCK',
      availableStock,
    };
  }

  if (availableStock < item.quantity) {
    return {
      isAvailable: false,
      warningReason: 'INSUFFICIENT_STOCK',
      availableStock,
    };
  }

  return {
    isAvailable: true,
    warningReason: null,
    availableStock,
  };
}

export function calculateCartPricing(
  cartId: string,
  items: CartItemWithDetails[],
): CartPricingSnapshot {
  let subtotal = 0n;
  let totalItems = 0;
  let availableItemCount = 0;
  let unavailableItemCount = 0;

  const calculatedItems: CalculatedCartItem[] = items.map((item) => {
    const { isAvailable, warningReason, availableStock } = evaluateItemAvailability(item);
    const unitPrice = item.variant.price;
    const itemSubtotal = calculateItemSubtotal(unitPrice, item.quantity);

    totalItems += item.quantity;

    if (isAvailable) {
      availableItemCount += item.quantity;
      subtotal += itemSubtotal;
    } else {
      unavailableItemCount += item.quantity;
    }

    const thumbnail =
      item.variant.product.images?.find((img) => img.isThumbnail) ??
      item.variant.product.images?.[0] ??
      null;

    return {
      id: item.id,
      variantId: item.variantId,
      quantity: item.quantity,
      unitPrice,
      itemSubtotal,
      isAvailable,
      warningReason,
      variant: {
        id: item.variant.id,
        sku: item.variant.sku,
        name: item.variant.name,
        price: item.variant.price,
        isActive: item.variant.isActive,
        product: {
          id: item.variant.product.id,
          name: item.variant.product.name,
          slug: item.variant.product.slug,
          status: item.variant.product.status,
          thumbnailUrl: thumbnail ? thumbnail.url : null,
        },
        availableStock,
      },
    };
  });

  return {
    id: cartId,
    items: calculatedItems,
    totalItems,
    availableItemCount,
    unavailableItemCount,
    hasUnavailableItems: unavailableItemCount > 0,
    subtotal,
  };
}

export function calculateCouponDiscount(
  coupon: CouponDiscountInput,
  subtotal: bigint,
): CouponDiscountResult {
  if (subtotal <= 0n) {
    return {
      discountAmount: 0n,
      finalTotal: 0n,
    };
  }

  let rawDiscount = 0n;

  if (coupon.discountType === DISCOUNT_TYPES.PERCENTAGE) {
    rawDiscount = (subtotal * coupon.discountValue) / 100n;
    if (coupon.maxDiscountAmount != null && coupon.maxDiscountAmount > 0n) {
      if (rawDiscount > coupon.maxDiscountAmount) {
        rawDiscount = coupon.maxDiscountAmount;
      }
    }
  } else if (coupon.discountType === DISCOUNT_TYPES.FIXED_AMOUNT) {
    rawDiscount = coupon.discountValue;
  }

  // Đảm bảo số tiền giảm không vượt quá tổng giá trị đơn hàng
  const discountAmount = rawDiscount > subtotal ? subtotal : rawDiscount;
  const finalTotal = subtotal - discountAmount;

  return {
    discountAmount,
    finalTotal,
  };
}
