import type { RequestHandler } from 'express';
import { translate } from '../../i18n/index.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import type {
  CouponIdParamDto,
  CreateCouponDto,
  ListCouponsQueryDto,
  UpdateCouponDto,
  ValidateCouponDto,
} from './coupons.schema.js';
import { couponService } from './coupons.service.js';

export const couponController = {
  // ==================== Customer Endpoint ====================
  validateCoupon: (async (req, res) => {
    const result = await couponService.validateCoupon(req.user.userId, req.body.code);
    return sendSuccess(res, result);
  }) as RequestHandler<unknown, unknown, ValidateCouponDto>,

  // ==================== Admin Endpoints ====================
  listCoupons: (async (req, res) => {
    const query = req.query as unknown as ListCouponsQueryDto;
    const { items, total, page, pageSize } = await couponService.listCoupons(query);
    return sendPaginated(res, items, total, { page, pageSize });
  }) as RequestHandler,

  getCouponById: (async (req, res) => {
    const { id } = req.params;
    const coupon = await couponService.getCouponById(id);
    return sendSuccess(res, { coupon });
  }) as RequestHandler<CouponIdParamDto>,

  createCoupon: (async (req, res) => {
    const coupon = await couponService.createCoupon(req.body, req.user?.userId);
    return sendSuccess(res, { coupon }, 201);
  }) as RequestHandler<unknown, unknown, CreateCouponDto>,

  updateCoupon: (async (req, res) => {
    const { id } = req.params;
    const coupon = await couponService.updateCoupon(id, req.body, req.user?.userId);
    return sendSuccess(res, { coupon });
  }) as RequestHandler<CouponIdParamDto, unknown, UpdateCouponDto>,

  deleteCoupon: (async (req, res) => {
    const { id } = req.params;
    await couponService.deleteCoupon(id, req.user?.userId);
    return sendSuccess(res, { message: translate(req.locale, 'success.couponDeleted') });
  }) as RequestHandler<CouponIdParamDto>,
};
