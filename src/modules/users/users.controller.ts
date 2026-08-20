import type { RequestHandler } from 'express';
import { translate } from '../../i18n/index.js';
import { sendSuccess } from '../../utils/response.js';
import type { CreateAddressDto, UpdateAddressDto, UpdateProfileDto } from './users.schema.js';
import { usersService } from './users.service.js';

export const usersController = {
  getProfile: (async (req, res) => {
    const user = await usersService.getProfile(req.user.userId);
    return sendSuccess(res, { user }, 200);
  }) as RequestHandler,

  updateProfile: (async (req, res) => {
    const user = await usersService.updateProfile(req.user.userId, req.body);
    return sendSuccess(res, { user }, 200);
  }) as RequestHandler<Record<string, never>, unknown, UpdateProfileDto>,

  getAddresses: (async (req, res) => {
    const addresses = await usersService.getAddresses(req.user.userId);
    return sendSuccess(res, { addresses }, 200);
  }) as RequestHandler,

  createAddress: (async (req, res) => {
    const address = await usersService.createAddress(req.user.userId, req.body);
    return sendSuccess(res, { address }, 201);
  }) as RequestHandler<Record<string, never>, unknown, CreateAddressDto>,

  updateAddress: (async (req, res) => {
    const address = await usersService.updateAddress(req.params.id, req.user.userId, req.body);
    return sendSuccess(res, { address }, 200);
  }) as RequestHandler<{ id: string }, unknown, UpdateAddressDto>,

  deleteAddress: (async (req, res) => {
    await usersService.deleteAddress(req.params.id, req.user.userId);
    return sendSuccess(res, { message: translate(req.locale, 'success.addressDeleted') }, 200);
  }) as RequestHandler<{ id: string }>,

  setDefaultAddress: (async (req, res) => {
    const address = await usersService.setDefaultAddress(req.params.id, req.user.userId);
    return sendSuccess(res, { address }, 200);
  }) as RequestHandler<{ id: string }>,
};
