import { AUDIT_ACTIONS, ERROR_CODES } from '../../constants/index.js';
import { prisma } from '../../database/prisma.js';
import { Prisma } from '../../generated/prisma/client.js';
import { AppError } from '../../utils/app-error.js';
import { auditService } from '../audit/audit.service.js';
import { reviewsRepository } from './reviews.repository.js';
import type {
  CreateReviewDto,
  ListAdminReviewsQueryDto,
  ListProductReviewsQueryDto,
  ModerateReviewDto,
} from './reviews.schema.js';

export const reviewsService = {
  createReview: async (userId: string, productId: string, dto: CreateReviewDto) => {
    // 1. Kiểm tra tồn tại của order item và quan hệ với đơn hàng
    const orderItem = await reviewsRepository.findOrderItemForReview(dto.orderItemId);
    if (!orderItem) {
      throw new AppError(404, ERROR_CODES.ORDER_ITEM_NOT_FOUND);
    }

    // 2. Kiểm tra quyền sở hữu đơn hàng (không cho phép review đơn của người khác)
    if (orderItem.order.userId !== userId) {
      throw new AppError(404, ERROR_CODES.ORDER_ITEM_NOT_FOUND);
    }

    // 3. Kiểm tra trạng thái đơn hàng: Chỉ DELIVERED mới được review
    if (orderItem.order.status !== 'DELIVERED') {
      throw new AppError(400, ERROR_CODES.ORDER_NOT_DELIVERED);
    }

    // 4. Kiểm tra xem variant có tồn tại và thuộc productId được yêu cầu không
    if (!orderItem.variant || orderItem.variant.productId !== productId) {
      throw new AppError(404, ERROR_CODES.ORDER_ITEM_NOT_FOUND);
    }

    // 5. Kiểm tra trước xem order item đã được review chưa
    const existing = await reviewsRepository.findReviewByOrderItemId(dto.orderItemId);
    if (existing) {
      throw new AppError(409, ERROR_CODES.REVIEW_ALREADY_EXISTS);
    }

    // 6. Tạo review trong database, bắt lỗi Unique Constraint P2002 nếu có race condition
    try {
      const review = await reviewsRepository.createReview({
        userId,
        productId,
        orderItemId: dto.orderItemId,
        rating: dto.rating,
        comment: dto.comment ?? null,
      });

      return {
        id: review.id,
        productId: review.productId,
        orderItemId: review.orderItemId,
        userId: review.userId,
        user: {
          fullName: review.user.fullName,
          avatarUrl: review.user.avatarUrl,
        },
        rating: review.rating,
        comment: review.comment,
        createdAt: review.createdAt.toISOString(),
      };
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
        throw new AppError(409, ERROR_CODES.REVIEW_ALREADY_EXISTS);
      }
      throw error;
    }
  },

  getProductReviews: async (productId: string, query: ListProductReviewsQueryDto) => {
    const page = query.page;
    const pageSize = query.pageSize;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const [{ items, total }, ratingSummary] = await Promise.all([
      reviewsRepository.listProductReviews(productId, {
        skip,
        take,
        sort: query.sort,
      }),
      reviewsRepository.getProductRatingSummary(productId),
    ]);

    const formattedItems = items.map((review) => ({
      id: review.id,
      productId: review.productId,
      orderItemId: review.orderItemId,
      userId: review.userId,
      user: {
        fullName: review.user.fullName,
        avatarUrl: review.user.avatarUrl,
      },
      rating: review.rating,
      comment: review.comment,
      createdAt: review.createdAt.toISOString(),
    }));

    return {
      items: formattedItems,
      ratingSummary,
      total,
      page,
      pageSize,
      totalPages: Math.ceil(total / pageSize) || 1,
    };
  },

  listAdminReviews: async (query: ListAdminReviewsQueryDto) => {
    const page = query.page;
    const pageSize = query.pageSize;
    const skip = (page - 1) * pageSize;
    const take = pageSize;

    const { items, total } = await reviewsRepository.listAdminReviews({
      skip,
      take,
      productId: query.productId,
      isVisible: query.isVisible,
    });

    const formattedItems = items.map((review) => ({
      id: review.id,
      productId: review.productId,
      orderItemId: review.orderItemId,
      userId: review.userId,
      user: {
        fullName: review.user.fullName,
        avatarUrl: review.user.avatarUrl,
      },
      rating: review.rating,
      comment: review.comment,
      isVisible: review.isVisible,
      moderationReason: review.moderationReason,
      moderatedById: review.moderatedById,
      moderatedAt: review.moderatedAt ? review.moderatedAt.toISOString() : null,
      productName: review.orderItem.productName,
      sku: review.orderItem.sku,
      createdAt: review.createdAt.toISOString(),
    }));

    return {
      items: formattedItems,
      total,
    };
  },

  moderateReview: async (id: string, dto: ModerateReviewDto, actorId: string) => {
    const review = await reviewsRepository.findReviewById(id);
    if (!review) {
      throw new AppError(404, ERROR_CODES.REVIEW_NOT_FOUND);
    }

    const updated = await prisma.$transaction(async (tx) => {
      const updatedReview = await reviewsRepository.updateReviewModeration(
        id,
        {
          isVisible: dto.isVisible,
          moderationReason: dto.isVisible ? null : (dto.reason ?? null),
          moderatedById: actorId,
          moderatedAt: new Date(),
        },
        tx,
      );

      await auditService.record(
        {
          actorId,
          action: AUDIT_ACTIONS.REVIEW_MODERATED,
          targetType: 'REVIEW',
          targetId: id,
          payload: {
            previousVisibility: review.isVisible,
            newVisibility: dto.isVisible,
            reason: dto.reason ?? null,
          },
        },
        tx,
      );

      return updatedReview;
    });

    return {
      id: updated.id,
      productId: updated.productId,
      orderItemId: updated.orderItemId,
      userId: updated.userId,
      user: {
        fullName: updated.user.fullName,
        avatarUrl: updated.user.avatarUrl,
      },
      rating: updated.rating,
      comment: updated.comment,
      isVisible: updated.isVisible,
      moderationReason: updated.moderationReason,
      moderatedById: updated.moderatedById,
      moderatedAt: updated.moderatedAt ? updated.moderatedAt.toISOString() : null,
      productName: updated.orderItem.productName,
      sku: updated.orderItem.sku,
      createdAt: updated.createdAt.toISOString(),
    };
  },
};
