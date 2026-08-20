import { z } from '../../utils/zod.js';
import { PHONE_REGEX } from '../../constants/index.js';
import { registry } from '../../docs/registry.js';

export const updateProfileSchema = z
  .object({
    fullName: z
      .string()
      .trim()
      .min(2, 'Họ và tên phải có ít nhất 2 ký tự')
      .max(100, 'Họ và tên tối đa 100 ký tự')
      .optional()
      .openapi({ example: 'Bob Smith' }),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Cần cung cấp ít nhất một trường để cập nhật',
  });

registry.register('UpdateProfileDto', updateProfileSchema);

export const addressIdParamSchema = z.object({
  id: z
    .string()
    .uuid('ID địa chỉ không đúng định dạng UUID')
    .openapi({ example: '95eb6f7e-cced-45ba-8826-cdb01e284dc7' }),
});

registry.register('AddressIdParamDto', addressIdParamSchema);

export const createAddressSchema = z.object({
  recipientName: z
    .string()
    .trim()
    .min(2, 'Tên người nhận phải có ít nhất 2 ký tự')
    .max(100, 'Tên người nhận tối đa 100 ký tự')
    .openapi({ example: 'Bob Smith' }),
  phone: z
    .string()
    .trim()
    .regex(PHONE_REGEX, 'Số điện thoại không hợp lệ')
    .openapi({ example: '0901234567' }),
  province: z
    .string()
    .trim()
    .min(1, 'Tỉnh/Thành phố là bắt buộc')
    .max(100)
    .openapi({ example: 'Hà Nội' }),
  district: z
    .string()
    .trim()
    .min(1, 'Quận/Huyện là bắt buộc')
    .max(100)
    .openapi({ example: 'Quận Ba Đình' }),
  ward: z
    .string()
    .trim()
    .min(1, 'Phường/Xã là bắt buộc')
    .max(100)
    .openapi({ example: 'Phường Điện Biên' }),
  streetAddress: z
    .string()
    .trim()
    .min(1, 'Địa chỉ chi tiết là bắt buộc')
    .max(255)
    .openapi({ example: '28A Điện Biên Phủ' }),
  isDefault: z.boolean().optional().default(false).openapi({ example: true }),
});

registry.register('CreateAddressDto', createAddressSchema);

export const updateAddressSchema = z
  .object({
    recipientName: z.string().trim().min(2).max(100).optional().openapi({ example: 'Bob Smith' }),
    phone: z
      .string()
      .trim()
      .regex(PHONE_REGEX, 'Số điện thoại không hợp lệ')
      .optional()
      .openapi({ example: '0901234567' }),
    province: z.string().trim().min(1).max(100).optional().openapi({ example: 'Hà Nội' }),
    district: z.string().trim().min(1).max(100).optional().openapi({ example: 'Quận Ba Đình' }),
    ward: z.string().trim().min(1).max(100).optional().openapi({ example: 'Phường Điện Biên' }),
    streetAddress: z
      .string()
      .trim()
      .min(1)
      .max(255)
      .optional()
      .openapi({ example: '28A Điện Biên Phủ' }),
    isDefault: z.boolean().optional().openapi({ example: true }),
  })
  .refine((data) => Object.keys(data).length > 0, {
    message: 'Cần cung cấp ít nhất một trường để cập nhật',
  });

registry.register('UpdateAddressDto', updateAddressSchema);

export const userResponseSchema = z.object({
  user: z.object({
    id: z.string().uuid().openapi({ example: '7f4cddc1-d6fd-4bda-a66a-65d09f244bf9' }),
    email: z.email().openapi({ example: 'bob@example.com' }),
    fullName: z.string().openapi({ example: 'Bob Smith' }),
    role: z.enum(['CUSTOMER', 'STAFF', 'ADMIN']).openapi({ example: 'CUSTOMER' }),
    isActive: z.boolean().openapi({ example: true }),
    createdAt: z.string().datetime().openapi({ example: '2026-08-20T12:00:00.000Z' }),
    updatedAt: z.string().datetime().openapi({ example: '2026-08-20T12:00:00.000Z' }),
  }),
});

export const addressSchema = z.object({
  id: z.string().uuid().openapi({ example: '95eb6f7e-cced-45ba-8826-cdb01e284dc7' }),
  recipientName: z.string().openapi({ example: 'Bob Smith' }),
  phone: z.string().openapi({ example: '0901234567' }),
  province: z.string().openapi({ example: 'Hà Nội' }),
  district: z.string().openapi({ example: 'Quận Ba Đình' }),
  ward: z.string().openapi({ example: 'Phường Điện Biên' }),
  streetAddress: z.string().openapi({ example: '28A Điện Biên Phủ' }),
  isDefault: z.boolean().openapi({ example: true }),
  createdAt: z.string().datetime().openapi({ example: '2026-08-20T12:00:00.000Z' }),
  updatedAt: z.string().datetime().openapi({ example: '2026-08-20T12:00:00.000Z' }),
});

export const addressResponseSchema = z.object({ address: addressSchema });
export const addressListResponseSchema = z.object({ addresses: z.array(addressSchema) });
export const deleteAddressResponseSchema = z.object({
  message: z.string().openapi({ example: 'Address deleted successfully' }),
});

export type UpdateProfileDto = z.infer<typeof updateProfileSchema>;
export type CreateAddressDto = z.infer<typeof createAddressSchema>;
export type UpdateAddressDto = z.infer<typeof updateAddressSchema>;
