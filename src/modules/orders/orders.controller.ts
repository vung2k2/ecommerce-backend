import type { RequestHandler } from 'express';
import { translate } from '../../i18n/index.js';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import type {
  CancelOrderDto,
  CheckoutDto,
  ListAdminOrdersQueryDto,
  ListCustomerOrdersQueryDto,
  OrderIdParamDto,
  UpdateOrderStatusDto,
} from './orders.schema.js';
import { orderService } from './orders.service.js';

export const orderController = {
  // ==================== Customer Endpoints ====================

  checkout: (async (req, res) => {
    const order = await orderService.checkout(req.user.userId, req.body);
    return sendSuccess(res, { order }, 201);
  }) as RequestHandler<unknown, unknown, CheckoutDto>,

  getCustomerOrders: (async (req, res) => {
    const query = req.query as unknown as ListCustomerOrdersQueryDto;
    const { items, total } = await orderService.getCustomerOrders(req.user.userId, query);
    return sendPaginated(res, items, total, { page: query.page, pageSize: query.pageSize });
  }) as RequestHandler,

  getCustomerOrderById: (async (req, res) => {
    const { id } = req.params;
    const order = await orderService.getCustomerOrderById(req.user.userId, id);
    return sendSuccess(res, { order });
  }) as RequestHandler<OrderIdParamDto>,

  cancelCustomerOrder: (async (req, res) => {
    const { id } = req.params;
    const order = await orderService.cancelCustomerOrder(req.user.userId, id, req.body);
    return sendSuccess(res, {
      order,
      message: translate(req.locale, 'success.orderCancelled'),
    });
  }) as RequestHandler<OrderIdParamDto, unknown, CancelOrderDto>,

  // ==================== Admin Endpoints ====================

  listAdminOrders: (async (req, res) => {
    const query = req.query as unknown as ListAdminOrdersQueryDto;
    const { items, total } = await orderService.listAdminOrders(query);
    return sendPaginated(res, items, total, { page: query.page, pageSize: query.pageSize });
  }) as RequestHandler,

  getAdminOrderById: (async (req, res) => {
    const { id } = req.params;
    const order = await orderService.getAdminOrderById(id);
    return sendSuccess(res, { order });
  }) as RequestHandler<OrderIdParamDto>,

  updateAdminOrderStatus: (async (req, res) => {
    const { id } = req.params;
    const order = await orderService.updateAdminOrderStatus(id, req.body, req.user.userId);
    return sendSuccess(res, {
      order,
      message: translate(req.locale, 'success.orderStatusUpdated'),
    });
  }) as RequestHandler<OrderIdParamDto, unknown, UpdateOrderStatusDto>,
};
