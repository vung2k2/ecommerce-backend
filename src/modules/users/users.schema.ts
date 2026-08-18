import { z } from 'zod';
import { PHONE_REGEX } from '../../constants/index.js';

export const updateProfileSchema = z
    .object({
        fullName: z
            .string()
            .trim()
            .min(2, 'Họ và tên phải có ít nhất 2 ký tự')
            .max(100, 'Họ và tên tối đa 100 ký tự')
            .optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: 'Cần cung cấp ít nhất một trường để cập nhật',
    });

export const addressIdParamSchema = z.object({
    id: z.string().uuid('ID địa chỉ không đúng định dạng UUID'),
});

export const createAddressSchema = z.object({
    recipientName: z
        .string()
        .trim()
        .min(2, 'Tên người nhận phải có ít nhất 2 ký tự')
        .max(100, 'Tên người nhận tối đa 100 ký tự'),
    phone: z.string().trim().regex(PHONE_REGEX, 'Số điện thoại không hợp lệ'),
    province: z.string().trim().min(1, 'Tỉnh/Thành phố là bắt buộc').max(100),
    district: z.string().trim().min(1, 'Quận/Huyện là bắt buộc').max(100),
    ward: z.string().trim().min(1, 'Phường/Xã là bắt buộc').max(100),
    streetAddress: z.string().trim().min(1, 'Địa chỉ chi tiết là bắt buộc').max(255),
    isDefault: z.boolean().optional().default(false),
});

export const updateAddressSchema = z
    .object({
        recipientName: z.string().trim().min(2).max(100).optional(),
        phone: z.string().trim().regex(PHONE_REGEX, 'Số điện thoại không hợp lệ').optional(),
        province: z.string().trim().min(1).max(100).optional(),
        district: z.string().trim().min(1).max(100).optional(),
        ward: z.string().trim().min(1).max(100).optional(),
        streetAddress: z.string().trim().min(1).max(255).optional(),
        isDefault: z.boolean().optional(),
    })
    .refine((data) => Object.keys(data).length > 0, {
        message: 'Cần cung cấp ít nhất một trường để cập nhật',
    });

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
export type CreateAddressDto = z.infer<typeof createAddressSchema>;
export type UpdateAddressDto = z.infer<typeof updateAddressSchema>;