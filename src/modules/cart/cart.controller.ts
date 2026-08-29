import type { RequestHandler } from 'express';
import { sendSuccess } from '../../utils/response.js';
import type { AddToCartDto, CartItemParamsDto, UpdateCartItemDto } from './cart.schema.js';
import { cartService } from './cart.service.js';

export const cartController = {
  getCart: (async (req, res) => {
    const cart = await cartService.getCart(req.user.userId);
    return sendSuccess(res, cart);
  }) as RequestHandler,

  addItem: (async (req, res) => {
    const cart = await cartService.addItem(req.user.userId, req.body);
    return sendSuccess(res, cart);
  }) as RequestHandler<unknown, unknown, AddToCartDto>,

  updateItemQuantity: (async (req, res) => {
    const { itemId } = req.params;
    const cart = await cartService.updateItemQuantity(req.user.userId, itemId, req.body);
    return sendSuccess(res, cart);
  }) as RequestHandler<CartItemParamsDto, unknown, UpdateCartItemDto>,

  removeItem: (async (req, res) => {
    const { itemId } = req.params;
    const cart = await cartService.removeItem(req.user.userId, itemId);
    return sendSuccess(res, cart);
  }) as RequestHandler<CartItemParamsDto>,

  clearCart: (async (req, res) => {
    const cart = await cartService.clearCart(req.user.userId);
    return sendSuccess(res, cart);
  }) as RequestHandler,
};
