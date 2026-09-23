import type { RequestHandler } from 'express';
import { translate } from '../../i18n/index.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import type {
  CreateReviewDto,
  ListAdminReviewsQueryDto,
  ListProductReviewsQueryDto,
  ModerateReviewDto,
  ProductIdParamDto,
  ReviewIdParamDto,
} from './reviews.schema.js';
import { reviewsService } from './reviews.service.js';

export const reviewsController = {
  createReview: (async (req, res) => {
    const { productId } = req.params;
    const review = await reviewsService.createReview(req.user.userId, productId, req.body);
    return sendSuccess(res, { review }, 201);
  }) as RequestHandler<ProductIdParamDto, unknown, CreateReviewDto>,

  getProductReviews: (async (req, res) => {
    const { productId } = req.params;
    const query = req.query as unknown as ListProductReviewsQueryDto;
    const data = await reviewsService.getProductReviews(productId, query);
    return sendSuccess(res, data);
  }) as RequestHandler<ProductIdParamDto>,

  listAdminReviews: (async (req, res) => {
    const query = req.query as unknown as ListAdminReviewsQueryDto;
    const { items, total } = await reviewsService.listAdminReviews(query);
    return sendPaginated(res, items, total, { page: query.page, pageSize: query.pageSize });
  }) as RequestHandler,

  moderateReview: (async (req, res) => {
    const { id } = req.params;
    const review = await reviewsService.moderateReview(id, req.body, req.user.userId);
    return sendSuccess(res, {
      review,
      message: translate(req.locale, 'success.reviewModerated'),
    });
  }) as RequestHandler<ReviewIdParamDto, unknown, ModerateReviewDto>,
};
