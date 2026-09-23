import { prisma } from '../../database/prisma.js';
import type { Prisma } from '../../generated/prisma/client.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

// ==================== Data Interfaces & Selects ====================

export const reviewWithUserSelect = {
  id: true,
  productId: true,
  orderItemId: true,
  userId: true,
  rating: true,
  comment: true,
  isVisible: true,
  moderationReason: true,
  moderatedById: true,
  moderatedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      fullName: true,
      avatarUrl: true,
    },
  },
} as const;

export type ReviewWithUserRecord = Prisma.ReviewGetPayload<{
  select: typeof reviewWithUserSelect;
}>;

export const adminReviewSelect = {
  id: true,
  productId: true,
  orderItemId: true,
  userId: true,
  rating: true,
  comment: true,
  isVisible: true,
  moderationReason: true,
  moderatedById: true,
  moderatedAt: true,
  createdAt: true,
  updatedAt: true,
  user: {
    select: {
      fullName: true,
      avatarUrl: true,
    },
  },
  orderItem: {
    select: {
      productName: true,
      sku: true,
    },
  },
} as const;

export type AdminReviewRecord = Prisma.ReviewGetPayload<{
  select: typeof adminReviewSelect;
}>;

export interface CreateReviewData {
  userId: string;
  productId: string;
  orderItemId: string;
  rating: number;
  comment?: string | null | undefined;
}

export interface ListProductReviewsOptions {
  skip: number;
  take: number;
  sort?: 'newest' | 'oldest' | 'rating_high' | 'rating_low';
}

export interface ListAdminReviewsOptions {
  skip: number;
  take: number;
  productId?: string | undefined;
  isVisible?: boolean | undefined;
}

export interface UpdateReviewModerationData {
  isVisible: boolean;
  moderationReason?: string | null | undefined;
  moderatedById: string;
  moderatedAt: Date;
}

export interface RatingSummaryResult {
  averageRating: number;
  totalReviews: number;
  breakdown: {
    1: number;
    2: number;
    3: number;
    4: number;
    5: number;
  };
}

// ==================== Repository ====================

export const reviewsRepository = {
  findReviewById: async (id: string, tx?: PrismaClientOrTx): Promise<AdminReviewRecord | null> => {
    const client = tx ?? prisma;
    return client.review.findUnique({
      where: { id },
      select: adminReviewSelect,
    });
  },

  findReviewByOrderItemId: async (orderItemId: string, tx?: PrismaClientOrTx) => {
    const client = tx ?? prisma;
    return client.review.findUnique({
      where: { orderItemId },
    });
  },

  findOrderItemForReview: async (orderItemId: string, tx?: PrismaClientOrTx) => {
    const client = tx ?? prisma;
    return client.orderItem.findUnique({
      where: { id: orderItemId },
      include: {
        order: {
          select: {
            id: true,
            userId: true,
            status: true,
          },
        },
        variant: {
          select: {
            id: true,
            productId: true,
          },
        },
      },
    });
  },

  createReview: async (
    data: CreateReviewData,
    tx?: PrismaClientOrTx,
  ): Promise<ReviewWithUserRecord> => {
    const client = tx ?? prisma;
    return client.review.create({
      data: {
        userId: data.userId,
        productId: data.productId,
        orderItemId: data.orderItemId,
        rating: data.rating,
        comment: data.comment ?? null,
        isVisible: true,
      },
      select: reviewWithUserSelect,
    });
  },

  listProductReviews: async (
    productId: string,
    options: ListProductReviewsOptions,
    tx?: PrismaClientOrTx,
  ): Promise<{ items: ReviewWithUserRecord[]; total: number }> => {
    const client = tx ?? prisma;
    const where: Prisma.ReviewWhereInput = {
      productId,
      isVisible: true,
    };

    let orderBy: Prisma.ReviewOrderByWithRelationInput = { createdAt: 'desc' };
    if (options.sort === 'oldest') {
      orderBy = { createdAt: 'asc' };
    } else if (options.sort === 'rating_high') {
      orderBy = { rating: 'desc' };
    } else if (options.sort === 'rating_low') {
      orderBy = { rating: 'asc' };
    }

    const [items, total] = await Promise.all([
      client.review.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy,
        select: reviewWithUserSelect,
      }),
      client.review.count({ where }),
    ]);

    return { items, total };
  },

  getProductRatingSummary: async (
    productId: string,
    tx?: PrismaClientOrTx,
  ): Promise<RatingSummaryResult> => {
    const client = tx ?? prisma;
    const reviews = await client.review.findMany({
      where: { productId, isVisible: true },
      select: { rating: true },
    });

    const breakdown = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    let sum = 0;

    for (const r of reviews) {
      if (r.rating >= 1 && r.rating <= 5) {
        breakdown[r.rating as 1 | 2 | 3 | 4 | 5] += 1;
        sum += r.rating;
      }
    }

    const totalReviews = reviews.length;
    const averageRating = totalReviews > 0 ? Math.round((sum / totalReviews) * 10) / 10 : 0;

    return {
      averageRating,
      totalReviews,
      breakdown,
    };
  },

  listAdminReviews: async (
    options: ListAdminReviewsOptions,
    tx?: PrismaClientOrTx,
  ): Promise<{ items: AdminReviewRecord[]; total: number }> => {
    const client = tx ?? prisma;
    const where: Prisma.ReviewWhereInput = {};
    if (options.productId) {
      where.productId = options.productId;
    }
    if (options.isVisible !== undefined) {
      where.isVisible = options.isVisible;
    }

    const [items, total] = await Promise.all([
      client.review.findMany({
        where,
        skip: options.skip,
        take: options.take,
        orderBy: { createdAt: 'desc' },
        select: adminReviewSelect,
      }),
      client.review.count({ where }),
    ]);

    return { items, total };
  },

  updateReviewModeration: async (
    id: string,
    data: UpdateReviewModerationData,
    tx?: PrismaClientOrTx,
  ): Promise<AdminReviewRecord> => {
    const client = tx ?? prisma;
    return client.review.update({
      where: { id },
      data: {
        isVisible: data.isVisible,
        moderationReason: data.moderationReason ?? null,
        moderatedById: data.moderatedById,
        moderatedAt: data.moderatedAt,
      },
      select: adminReviewSelect,
    });
  },
};
