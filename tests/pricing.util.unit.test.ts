import { describe, expect, it } from 'vitest';
import { DISCOUNT_TYPES } from '../src/constants/index.js';
import {
  calculateCartPricing,
  calculateCouponDiscount,
  calculateItemSubtotal,
  evaluateItemAvailability,
  type CartItemWithDetails,
} from '../src/utils/pricing.js';

describe('Pricing & Discount Calculation Utilities', () => {
  describe('calculateItemSubtotal', () => {
    it('calculates subtotal correctly using bigint', () => {
      expect(calculateItemSubtotal(150000n, 3)).toBe(450000n);
      expect(calculateItemSubtotal(0n, 5)).toBe(0n);
      expect(calculateItemSubtotal(100000n, 0)).toBe(0n);
    });
  });

  describe('evaluateItemAvailability', () => {
    const createMockItem = (
      productStatus: string,
      variantIsActive: boolean,
      onHand: number,
      reserved: number,
      quantity: number,
    ): CartItemWithDetails => ({
      id: 'item-1',
      cartId: 'cart-1',
      variantId: 'variant-1',
      quantity,
      createdAt: new Date(),
      updatedAt: new Date(),
      variant: {
        id: 'variant-1',
        sku: 'SKU-1',
        name: 'Variant 1',
        price: 100000n,
        isActive: variantIsActive,
        product: {
          id: 'prod-1',
          name: 'Product 1',
          slug: 'product-1',
          status: productStatus,
        },
        inventory: {
          onHand,
          reserved,
        },
      },
    });

    it('identifies available items when product active, variant active, and stock sufficient', () => {
      const item = createMockItem('ACTIVE', true, 10, 2, 3);
      const res = evaluateItemAvailability(item);
      expect(res.isAvailable).toBe(true);
      expect(res.warningReason).toBeNull();
      expect(res.availableStock).toBe(8);
    });

    it('identifies PRODUCT_INACTIVE when product status is not ACTIVE', () => {
      const item = createMockItem('DRAFT', true, 10, 0, 1);
      const res = evaluateItemAvailability(item);
      expect(res.isAvailable).toBe(false);
      expect(res.warningReason).toBe('PRODUCT_INACTIVE');
    });

    it('identifies VARIANT_INACTIVE when variant isActive is false', () => {
      const item = createMockItem('ACTIVE', false, 10, 0, 1);
      const res = evaluateItemAvailability(item);
      expect(res.isAvailable).toBe(false);
      expect(res.warningReason).toBe('VARIANT_INACTIVE');
    });

    it('identifies OUT_OF_STOCK when available stock is 0', () => {
      const item = createMockItem('ACTIVE', true, 5, 5, 1);
      const res = evaluateItemAvailability(item);
      expect(res.isAvailable).toBe(false);
      expect(res.warningReason).toBe('OUT_OF_STOCK');
      expect(res.availableStock).toBe(0);
    });

    it('identifies INSUFFICIENT_STOCK when available stock is less than cart quantity', () => {
      const item = createMockItem('ACTIVE', true, 5, 2, 4); // available = 3, quantity = 4
      const res = evaluateItemAvailability(item);
      expect(res.isAvailable).toBe(false);
      expect(res.warningReason).toBe('INSUFFICIENT_STOCK');
      expect(res.availableStock).toBe(3);
    });
  });

  describe('calculateCartPricing', () => {
    it('calculates subtotal only from available items and flags unavailable items', () => {
      const items: CartItemWithDetails[] = [
        {
          id: 'item-1',
          cartId: 'cart-1',
          variantId: 'variant-1',
          quantity: 2,
          createdAt: new Date(),
          updatedAt: new Date(),
          variant: {
            id: 'variant-1',
            sku: 'SKU-1',
            name: 'Item 1',
            price: 200000n,
            isActive: true,
            product: { id: 'p1', name: 'P1', slug: 'p1', status: 'ACTIVE' },
            inventory: { onHand: 10, reserved: 0 },
          },
        },
        {
          id: 'item-2',
          cartId: 'cart-1',
          variantId: 'variant-2',
          quantity: 1,
          createdAt: new Date(),
          updatedAt: new Date(),
          variant: {
            id: 'variant-2',
            sku: 'SKU-2',
            name: 'Item 2 Out of stock',
            price: 500000n,
            isActive: true,
            product: { id: 'p2', name: 'P2', slug: 'p2', status: 'ACTIVE' },
            inventory: { onHand: 0, reserved: 0 },
          },
        },
      ];

      const snapshot = calculateCartPricing('cart-1', items);

      expect(snapshot.totalItems).toBe(3);
      expect(snapshot.availableItemCount).toBe(2);
      expect(snapshot.unavailableItemCount).toBe(1);
      expect(snapshot.hasUnavailableItems).toBe(true);
      // Item 1: 2 * 200,000 = 400,000. Item 2 is out of stock -> excluded from subtotal
      expect(snapshot.subtotal).toBe(400000n);
    });
  });

  describe('calculateCouponDiscount', () => {
    it('calculates PERCENTAGE discount without cap', () => {
      const res = calculateCouponDiscount(
        {
          discountType: DISCOUNT_TYPES.PERCENTAGE,
          discountValue: 10n, // 10%
          maxDiscountAmount: null,
        },
        1000000n,
      );
      expect(res.discountAmount).toBe(100000n);
      expect(res.finalTotal).toBe(900000n);
    });

    it('calculates PERCENTAGE discount with maxDiscountAmount cap', () => {
      const res = calculateCouponDiscount(
        {
          discountType: DISCOUNT_TYPES.PERCENTAGE,
          discountValue: 20n, // 20% of 1,000,000 = 200,000, capped at 50,000
          maxDiscountAmount: 50000n,
        },
        1000000n,
      );
      expect(res.discountAmount).toBe(50000n);
      expect(res.finalTotal).toBe(950000n);
    });

    it('calculates FIXED_AMOUNT discount', () => {
      const res = calculateCouponDiscount(
        {
          discountType: DISCOUNT_TYPES.FIXED_AMOUNT,
          discountValue: 150000n,
        },
        500000n,
      );
      expect(res.discountAmount).toBe(150000n);
      expect(res.finalTotal).toBe(350000n);
    });

    it('ensures discountAmount does not exceed subtotal (finalTotal >= 0)', () => {
      const res = calculateCouponDiscount(
        {
          discountType: DISCOUNT_TYPES.FIXED_AMOUNT,
          discountValue: 1000000n, // 1,000,000 VND discount on 300,000 VND order
        },
        300000n,
      );
      expect(res.discountAmount).toBe(300000n);
      expect(res.finalTotal).toBe(0n);
    });

    it('handles zero or negative subtotal safely', () => {
      const res = calculateCouponDiscount(
        {
          discountType: DISCOUNT_TYPES.PERCENTAGE,
          discountValue: 50n,
        },
        0n,
      );
      expect(res.discountAmount).toBe(0n);
      expect(res.finalTotal).toBe(0n);
    });
  });
});
