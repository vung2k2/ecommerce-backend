import { AUDIT_ACTIONS, DISCOUNT_TYPES, ERROR_CODES } from '../../constants/index.js';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import { calculateCouponDiscount } from '../../utils/pricing.js';
import { auditRepository } from '../audit/audit.repository.js';
import { cartService } from '../cart/cart.service.js';
import { couponRepository, type CouponRecord } from './coupons.repository.js';
import type {
  CreateCouponDto,
  ListCouponsQueryDto,
  UpdateCouponDto,
} from './coupons.schema.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

export interface SerializedCoupon {
  id: string;
  code: string;
  description: string | null;
  discountType: 'PERCENTAGE' | 'FIXED_AMOUNT';
  discountValue: string;
  maxDiscountAmount: string | null;
  minOrderAmount: string;
  usageLimit: number | null;
  usedCount: number;
  usageLimitPerUser: number | null;
  startDate: string;
  endDate: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export function serializeCoupon(coupon: CouponRecord): SerializedCoupon {
  return {
    id: coupon.id,
    code: coupon.code,
    description: coupon.description,
    discountType: coupon.discountType,
    discountValue: coupon.discountValue.toString(),
    maxDiscountAmount: coupon.maxDiscountAmount ? coupon.maxDiscountAmount.toString() : null,
    minOrderAmount: coupon.minOrderAmount.toString(),
    usageLimit: coupon.usageLimit,
    usedCount: coupon.usedCount,
    usageLimitPerUser: coupon.usageLimitPerUser,
    startDate: coupon.startDate.toISOString(),
    endDate: coupon.endDate.toISOString(),
    isActive: coupon.isActive,
    createdAt: coupon.createdAt.toISOString(),
    updatedAt: coupon.updatedAt.toISOString(),
  };
}

export const couponService = {
  async createCoupon(dto: CreateCouponDto, actorId?: string): Promise<SerializedCoupon> {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await couponRepository.findByCode(dto.code, tx);
        if (existing) {
          throw new AppError(409, ERROR_CODES.COUPON_CODE_EXISTS);
        }

        const coupon = await couponRepository.createCoupon(
          {
            code: dto.code,
            description: dto.description ?? null,
            discountType: dto.discountType,
            discountValue: dto.discountValue,
            maxDiscountAmount:
              dto.discountType === DISCOUNT_TYPES.PERCENTAGE
                ? (dto.maxDiscountAmount ?? null)
                : null,
            minOrderAmount: dto.minOrderAmount ?? 0n,
            usageLimit: dto.usageLimit ?? null,
            usageLimitPerUser: dto.usageLimitPerUser ?? 1,
            startDate: dto.startDate,
            endDate: dto.endDate,
            isActive: dto.isActive ?? true,
          },
          tx,
        );

        await auditRepository.createAuditLog(
          {
            actorId,
            action: AUDIT_ACTIONS.COUPON_CREATED,
            targetType: 'COUPON',
            targetId: coupon.id,
            payload: {
              code: coupon.code,
              discountType: coupon.discountType,
              discountValue: coupon.discountValue.toString(),
            },
          },
          tx,
        );

        return serializeCoupon(coupon);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppError(409, ERROR_CODES.COUPON_CODE_EXISTS);
      }
      throw error;
    }
  },

  async updateCoupon(
    id: string,
    dto: UpdateCouponDto,
    actorId?: string,
  ): Promise<SerializedCoupon> {
    try {
      return await prisma.$transaction(async (tx) => {
        const existing = await couponRepository.findById(id, tx);
        if (!existing) {
          throw new AppError(404, ERROR_CODES.COUPON_NOT_FOUND);
        }

        if (dto.code && dto.code !== existing.code) {
          const duplicate = await couponRepository.findByCode(dto.code, tx);
          if (duplicate) {
            throw new AppError(409, ERROR_CODES.COUPON_CODE_EXISTS);
          }
        }

        // Merge với dữ liệu hiện tại để kiểm tra toàn bộ invariants
        const mergedStartDate = dto.startDate ?? existing.startDate;
        const mergedEndDate = dto.endDate ?? existing.endDate;
        if (mergedStartDate > mergedEndDate) {
          throw new AppError(400, ERROR_CODES.INVALID_COUPON_DATES);
        }

        const mergedUsageLimit = dto.usageLimit !== undefined ? dto.usageLimit : existing.usageLimit;
        if (mergedUsageLimit !== null && mergedUsageLimit < existing.usedCount) {
          throw new AppError(400, ERROR_CODES.INVALID_COUPON_LIMITS);
        }

        const mergedDiscountType = dto.discountType ?? existing.discountType;
        const mergedDiscountValue = dto.discountValue ?? existing.discountValue;
        if (mergedDiscountType === DISCOUNT_TYPES.PERCENTAGE && mergedDiscountValue > 100n) {
          throw new AppError(400, ERROR_CODES.VALIDATION_ERROR);
        }

        let updateMaxDiscountAmount: bigint | null | undefined = dto.maxDiscountAmount;
        if (mergedDiscountType === DISCOUNT_TYPES.FIXED_AMOUNT) {
          if (dto.maxDiscountAmount !== undefined && dto.maxDiscountAmount !== null) {
            throw new AppError(400, ERROR_CODES.VALIDATION_ERROR);
          }
          // Reset về null nếu đổi sang FIXED_AMOUNT
          updateMaxDiscountAmount = null;
        }

        const updated = await couponRepository.updateCoupon(
          id,
          {
            ...(dto.code !== undefined ? { code: dto.code } : {}),
            ...(dto.description !== undefined ? { description: dto.description } : {}),
            ...(dto.discountType !== undefined ? { discountType: dto.discountType } : {}),
            ...(dto.discountValue !== undefined ? { discountValue: dto.discountValue } : {}),
            ...(updateMaxDiscountAmount !== undefined
              ? { maxDiscountAmount: updateMaxDiscountAmount }
              : {}),
            ...(dto.minOrderAmount !== undefined ? { minOrderAmount: dto.minOrderAmount } : {}),
            ...(dto.usageLimit !== undefined ? { usageLimit: dto.usageLimit } : {}),
            ...(dto.usageLimitPerUser !== undefined
              ? { usageLimitPerUser: dto.usageLimitPerUser }
              : {}),
            ...(dto.startDate !== undefined ? { startDate: dto.startDate } : {}),
            ...(dto.endDate !== undefined ? { endDate: dto.endDate } : {}),
            ...(dto.isActive !== undefined ? { isActive: dto.isActive } : {}),
          },
          tx,
        );

        await auditRepository.createAuditLog(
          {
            actorId,
            action: AUDIT_ACTIONS.COUPON_UPDATED,
            targetType: 'COUPON',
            targetId: id,
            payload: {
              code: updated.code,
            },
          },
          tx,
        );

        return serializeCoupon(updated);
      });
    } catch (error) {
      if (
        error instanceof Prisma.PrismaClientKnownRequestError &&
        error.code === 'P2002'
      ) {
        throw new AppError(409, ERROR_CODES.COUPON_CODE_EXISTS);
      }
      throw error;
    }
  },

  async deleteCoupon(id: string, actorId?: string): Promise<SerializedCoupon> {
    return prisma.$transaction(async (tx) => {
      const existing = await couponRepository.findById(id, tx);
      if (!existing) {
        throw new AppError(404, ERROR_CODES.COUPON_NOT_FOUND);
      }

      if (existing.usedCount > 0) {
        throw new AppError(409, ERROR_CODES.COUPON_CANNOT_DELETE_USED);
      }

      const totalUsages = await couponRepository.countTotalUsages(id, tx);
      if (totalUsages > 0) {
        throw new AppError(409, ERROR_CODES.COUPON_CANNOT_DELETE_USED);
      }

      const deleted = await couponRepository.deleteCoupon(id, tx);

      await auditRepository.createAuditLog(
        {
          actorId,
          action: AUDIT_ACTIONS.COUPON_DELETED,
          targetType: 'COUPON',
          targetId: id,
          payload: {
            code: deleted.code,
          },
        },
        tx,
      );

      return serializeCoupon(deleted);
    });
  },

  async getCouponById(id: string): Promise<SerializedCoupon> {
    const coupon = await couponRepository.findById(id);
    if (!coupon) {
      throw new AppError(404, ERROR_CODES.COUPON_NOT_FOUND);
    }
    return serializeCoupon(coupon);
  },

  async listCoupons(query: ListCouponsQueryDto): Promise<{
    items: SerializedCoupon[];
    total: number;
    page: number;
    pageSize: number;
    totalPages: number;
  }> {
    const result = await couponRepository.listCoupons(query);
    return {
      items: result.items.map(serializeCoupon),
      total: result.total,
      page: result.page,
      pageSize: result.pageSize,
      totalPages: result.totalPages,
    };
  },

  async validateCoupon(
    userId: string,
    code: string,
    tx?: PrismaClientOrTx,
  ): Promise<{
    coupon: SerializedCoupon;
    subtotal: string;
    discountAmount: string;
    finalTotal: string;
  }> {
    // 1. Lấy cart hiện tại của user để tính live pricing
    const cart = await cartService.getCart(userId, tx);
    const subtotal = BigInt(cart.subtotal);

    if (cart.totalItems === 0 || cart.availableItemCount === 0 || subtotal <= 0n) {
      throw new AppError(422, ERROR_CODES.CART_NO_AVAILABLE_ITEMS);
    }

    // 2. Tìm coupon
    const coupon = await couponRepository.findByCode(code.toUpperCase(), tx);
    if (!coupon) {
      throw new AppError(404, ERROR_CODES.COUPON_NOT_FOUND);
    }

    // 3. Kiểm tra trạng thái và thời gian hiệu lực
    if (!coupon.isActive) {
      throw new AppError(422, ERROR_CODES.COUPON_INACTIVE);
    }

    const now = new Date();
    if (now < coupon.startDate) {
      throw new AppError(422, ERROR_CODES.COUPON_NOT_STARTED);
    }

    if (now > coupon.endDate) {
      throw new AppError(422, ERROR_CODES.COUPON_EXPIRED);
    }

    // 4. Kiểm tra Global Limit
    if (coupon.usageLimit !== null && coupon.usedCount >= coupon.usageLimit) {
      throw new AppError(422, ERROR_CODES.COUPON_USAGE_LIMIT_EXCEEDED);
    }

    // 5. Kiểm tra Per-User Limit
    if (coupon.usageLimitPerUser !== null) {
      const userUsageCount = await couponRepository.countUserUsages(coupon.id, userId, tx);
      if (userUsageCount >= coupon.usageLimitPerUser) {
        throw new AppError(422, ERROR_CODES.COUPON_USER_LIMIT_EXCEEDED);
      }
    }

    // 6. Kiểm tra giá trị đơn hàng tối thiểu
    if (subtotal < coupon.minOrderAmount) {
      throw new AppError(422, ERROR_CODES.COUPON_MIN_ORDER_NOT_MET);
    }

    // 7. Tính số tiền giảm giá
    const { discountAmount, finalTotal } = calculateCouponDiscount(coupon, subtotal);

    return {
      coupon: serializeCoupon(coupon),
      subtotal: subtotal.toString(),
      discountAmount: discountAmount.toString(),
      finalTotal: finalTotal.toString(),
    };
  },
};
