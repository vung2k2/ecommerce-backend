import type { RequestHandler } from 'express';
import { translate } from '../../i18n/index.js';
import { sendSuccess } from '../../utils/response.js';
import type { LoginDto, LogoutDto, RefreshTokenDto, RegisterDto } from './auth.schema.js';
import { authService } from './auth.service.js';

export const authController = {
  register: (async (req, res) => {
    const user = await authService.register(req.body);
    return sendSuccess(res, { user }, 201);
  }) as RequestHandler<Record<string, never>, unknown, RegisterDto>,

  login: (async (req, res) => {
    const result = await authService.login(req.body);
    return sendSuccess(res, result, 200);
  }) as RequestHandler<Record<string, never>, unknown, LoginDto>,

  refreshToken: (async (req, res) => {
    const result = await authService.refreshToken(req.body);
    return sendSuccess(res, result, 200);
  }) as RequestHandler<Record<string, never>, unknown, RefreshTokenDto>,

  logout: (async (req, res) => {
    await authService.logout(req.body);
    return sendSuccess(res, { message: translate(req.locale, 'success.loggedOut') }, 200);
  }) as RequestHandler<Record<string, never>, unknown, LogoutDto>,

  logoutAll: (async (req, res) => {
    await authService.logoutAll(req.user.userId);
    return sendSuccess(res, { message: translate(req.locale, 'success.loggedOutAll') }, 200);
  }) as RequestHandler,
};
