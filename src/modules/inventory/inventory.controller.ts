import type { RequestHandler } from 'express';
import { sendPaginated, sendSuccess } from '../../utils/response.js';
import type {
  AdjustStockDto,
  ListInventoryQueryDto,
  ListStockMovementsQueryDto,
  RestockDto,
  VariantIdParamDto,
} from './inventory.schema.js';
import { inventoryService } from './inventory.service.js';

export const inventoryController = {
  listInventories: (async (req, res) => {
    const query = req.query as unknown as ListInventoryQueryDto;
    const { items, total } = await inventoryService.listInventories(query);
    return sendPaginated(res, items, total, { page: query.page, pageSize: query.pageSize });
  }) as RequestHandler,

  getInventoryByVariantId: (async (req, res) => {
    const { variantId } = req.params;
    const inventory = await inventoryService.getInventoryByVariantId(variantId);
    return sendSuccess(res, { inventory });
  }) as RequestHandler<VariantIdParamDto>,

  getStockMovements: (async (req, res) => {
    const { variantId } = req.params;
    const query = req.query as unknown as ListStockMovementsQueryDto;
    const { movements, total } = await inventoryService.getStockMovements(variantId, query);
    return sendPaginated(res, movements, total, { page: query.page, pageSize: query.pageSize });
  }) as RequestHandler<VariantIdParamDto>,

  restock: (async (req, res) => {
    const { variantId } = req.params;
    const inventory = await inventoryService.restock(variantId, req.body, req.user?.userId);
    return sendSuccess(res, { inventory });
  }) as RequestHandler<VariantIdParamDto, unknown, RestockDto>,

  adjustStock: (async (req, res) => {
    const { variantId } = req.params;
    const inventory = await inventoryService.adjustStock(variantId, req.body, req.user?.userId);
    return sendSuccess(res, { inventory });
  }) as RequestHandler<VariantIdParamDto, unknown, AdjustStockDto>,
};
