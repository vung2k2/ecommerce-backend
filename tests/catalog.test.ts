import bcrypt from 'bcrypt';
import request from 'supertest';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { createApp } from '../src/app.js';
import { PERMISSIONS, ROLES } from '../src/constants/index.js';
import { prisma } from '../src/database/prisma.js';
import { jwtService } from '../src/utils/jwt.js';

interface CategoryItem {
  id: string;
  name: string;
  slug: string;
  parentId?: string | null | undefined;
  children?: CategoryItem[] | undefined;
}

const categoryItemSchema: z.ZodType<CategoryItem> = z.lazy(() =>
  z.object({
    id: z.string(),
    name: z.string(),
    slug: z.string(),
    parentId: z.string().nullable().optional(),
    children: z.array(categoryItemSchema).optional(),
  }),
);

const categoryListResponseSchema = z.object({
  data: z.object({
    categories: z.array(categoryItemSchema),
  }),
});

const categoryDetailResponseSchema = z.object({
  data: z.object({
    category: categoryItemSchema,
  }),
});

const brandItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
});

const brandListResponseSchema = z.object({
  data: z.object({
    brands: z.array(brandItemSchema),
  }),
});

const productItemSchema = z.object({
  id: z.string(),
  name: z.string(),
  slug: z.string(),
  status: z.string().optional(),
  category: z.object({ id: z.string(), name: z.string(), slug: z.string() }).optional(),
  brand: z.object({ id: z.string(), name: z.string(), slug: z.string() }).nullable().optional(),
  images: z.array(z.object({ url: z.string(), isThumbnail: z.boolean().optional() })).optional(),
  specifications: z.array(z.object({ name: z.string(), value: z.string() })).optional(),
  variants: z.array(z.object({ id: z.string(), sku: z.string(), name: z.string(), price: z.string() })).optional(),
});

const productListResponseSchema = z.object({
  data: z.array(productItemSchema),
  meta: z.object({
    page: z.number(),
    pageSize: z.number(),
    total: z.number(),
    totalPages: z.number(),
  }),
});

const productDetailResponseSchema = z.object({
  data: z.object({
    product: productItemSchema,
  }),
});

const variantResponseSchema = z.object({
  data: z.object({
    variant: z.object({
      id: z.string(),
      sku: z.string(),
      name: z.string(),
      price: z.string(),
    }),
  }),
});

const errorResponseSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

const successMessageResponseSchema = z.object({
  data: z.object({
    message: z.string(),
  }),
});

describe('Catalog & Media Domain', () => {
  const app = createApp();

  let adminToken: string;
  let staffTokenWithWrite: string;
  let staffTokenWithReadOnly: string;
  let staffTokenWithoutCatalog: string;
  let customerToken: string;
  let staffWithWriteId: string;

  beforeEach(async () => {
    // Dọn dẹp dữ liệu
    await prisma.auditLog.deleteMany();
    await prisma.productSpecification.deleteMany();
    await prisma.productImage.deleteMany();
    await prisma.productVariant.deleteMany();
    await prisma.product.deleteMany();
    await prisma.category.deleteMany();
    await prisma.brand.deleteMany();
    await prisma.userPermission.deleteMany();
    await prisma.refreshToken.deleteMany();
    await prisma.user.deleteMany();

    const passwordHash = await bcrypt.hash('Password123!', 10);

    // Tạo Admin
    const admin = await prisma.user.create({
      data: {
        email: 'admin_catalog@example.com',
        fullName: 'Admin Catalog',
        passwordHash,
        role: ROLES.ADMIN,
        isActive: true,
      },
    });
    adminToken = jwtService.signAccessToken({ userId: admin.id, role: admin.role });

    // Tạo Staff có quyền catalog:write
    const staffWrite = await prisma.user.create({
      data: {
        email: 'staff_write@example.com',
        fullName: 'Staff With Write',
        passwordHash,
        role: ROLES.STAFF,
        isActive: true,
        permissions: {
          create: [{ permission: PERMISSIONS.CATALOG_WRITE }],
        },
      },
    });
    staffWithWriteId = staffWrite.id;
    staffTokenWithWrite = jwtService.signAccessToken({ userId: staffWrite.id, role: staffWrite.role });

    // Tạo Staff chỉ có quyền catalog:read
    const staffRead = await prisma.user.create({
      data: {
        email: 'staff_read@example.com',
        fullName: 'Staff With Read',
        passwordHash,
        role: ROLES.STAFF,
        isActive: true,
        permissions: {
          create: [{ permission: PERMISSIONS.CATALOG_READ }],
        },
      },
    });
    staffTokenWithReadOnly = jwtService.signAccessToken({ userId: staffRead.id, role: staffRead.role });

    // Tạo Staff chỉ có quyền order:read (không có catalog)
    const staffNoCatalog = await prisma.user.create({
      data: {
        email: 'staff_nocatalog@example.com',
        fullName: 'Staff No Catalog',
        passwordHash,
        role: ROLES.STAFF,
        isActive: true,
        permissions: {
          create: [{ permission: PERMISSIONS.ORDER_READ }],
        },
      },
    });
    staffTokenWithoutCatalog = jwtService.signAccessToken({ userId: staffNoCatalog.id, role: staffNoCatalog.role });

    // Tạo Customer
    const customer = await prisma.user.create({
      data: {
        email: 'customer_catalog@example.com',
        fullName: 'Customer User',
        passwordHash,
        role: ROLES.CUSTOMER,
        isActive: true,
      },
    });
    customerToken = jwtService.signAccessToken({ userId: customer.id, role: customer.role });
  });

  afterAll(async () => {
    await prisma.$disconnect();
  });

  // ==================== 1. Public Categories & Brands ====================

  describe('Public Categories & Brands APIs', () => {
    it('GET /api/v1/categories > returns hierarchy tree of root categories only', async () => {
      const rootCat = await prisma.category.create({
        data: { name: 'Máy tính', slug: 'may-tinh' },
      });
      await prisma.category.create({
        data: { name: 'Laptop', slug: 'laptop', parentId: rootCat.id },
      });

      const res = await request(app).get('/api/v1/categories');
      expect(res.status).toBe(200);

      const parsed = categoryListResponseSchema.parse(res.body);
      // Chỉ có 1 node root ở mảng ngoài cùng
      expect(parsed.data.categories.length).toBe(1);

      const root = parsed.data.categories[0];
      expect(root?.slug).toBe('may-tinh');
      expect(root?.children).toBeInstanceOf(Array);
      expect(root?.children?.length).toBe(1);
      expect(root?.children?.[0]?.slug).toBe('laptop');
    });

    it('GET /api/v1/categories/:slug > returns category detail or 404', async () => {
      await prisma.category.create({
        data: { name: 'Điện thoại', slug: 'dien-thoai' },
      });

      const resFound = await request(app).get('/api/v1/categories/dien-thoai');
      expect(resFound.status).toBe(200);
      const parsedFound = categoryDetailResponseSchema.parse(resFound.body);
      expect(parsedFound.data.category.name).toBe('Điện thoại');

      const resNotFound = await request(app).get('/api/v1/categories/non-existent');
      expect(resNotFound.status).toBe(404);
      const parsedNotFound = errorResponseSchema.parse(resNotFound.body);
      expect(parsedNotFound.error.code).toBe('CATEGORY_NOT_FOUND');
    });

    it('GET /api/v1/brands > returns list of brands', async () => {
      await prisma.brand.createMany({
        data: [
          { name: 'Apple', slug: 'apple' },
          { name: 'Dell', slug: 'dell' },
        ],
      });

      const res = await request(app).get('/api/v1/brands');
      expect(res.status).toBe(200);
      const parsed = brandListResponseSchema.parse(res.body);
      expect(parsed.data.brands.length).toBe(2);
      expect(parsed.data.brands[0]?.name).toBe('Apple');
    });
  });

  // ==================== 2. Public Products Filtering & Detail ====================

  describe('Public Products Filtering & Detail APIs', () => {
    it('GET /api/v1/products > only returns ACTIVE products with ACTIVE variants, hides DRAFT and INACTIVE', async () => {
      const cat = await prisma.category.create({
        data: { name: 'Laptop', slug: 'laptop' },
      });
      const brand = await prisma.brand.create({
        data: { name: 'Apple', slug: 'apple' },
      });

      // Product 1: ACTIVE with active variant -> MUST BE RETURNED
      const p1 = await prisma.product.create({
        data: {
          name: 'Active MacBook',
          slug: 'active-macbook',
          status: 'ACTIVE',
          categoryId: cat.id,
          brandId: brand.id,
        },
      });
      await prisma.productVariant.create({
        data: { productId: p1.id, sku: 'MBP-ACTIVE', name: 'Active', price: 30000000n, isActive: true },
      });

      // Product 2: ACTIVE but with NO active variant -> MUST BE EXCLUDED
      const p2 = await prisma.product.create({
        data: {
          name: 'No Variant MacBook',
          slug: 'no-variant-macbook',
          status: 'ACTIVE',
          categoryId: cat.id,
          brandId: brand.id,
        },
      });
      await prisma.productVariant.create({
        data: { productId: p2.id, sku: 'MBP-INACTIVE-VAR', name: 'Inactive', price: 30000000n, isActive: false },
      });

      // Product 3: DRAFT with active variant -> MUST BE EXCLUDED
      const p3 = await prisma.product.create({
        data: {
          name: 'Draft MacBook',
          slug: 'draft-macbook',
          status: 'DRAFT',
          categoryId: cat.id,
          brandId: brand.id,
        },
      });
      await prisma.productVariant.create({
        data: { productId: p3.id, sku: 'MBP-DRAFT', name: 'Draft', price: 30000000n, isActive: true },
      });

      const res = await request(app).get('/api/v1/products');
      expect(res.status).toBe(200);
      const parsed = productListResponseSchema.parse(res.body);
      expect(parsed.data.length).toBe(1);
      expect(parsed.data[0]?.slug).toBe('active-macbook');
      expect(parsed.meta.total).toBe(1);
    });

    it('GET /api/v1/products > filters recursively across 3-level categories and sorts by price', async () => {
      const l1 = await prisma.category.create({
        data: { name: 'Máy tính', slug: 'may-tinh' },
      });
      const l2 = await prisma.category.create({
        data: { name: 'Laptop', slug: 'laptop', parentId: l1.id },
      });
      const l3 = await prisma.category.create({
        data: { name: 'Laptop Gaming', slug: 'laptop-gaming', parentId: l2.id },
      });
      const apple = await prisma.brand.create({
        data: { name: 'Apple', slug: 'apple' },
      });
      const dell = await prisma.brand.create({
        data: { name: 'Dell', slug: 'dell' },
      });

      // Product 1: In L1 (Máy tính), 50M
      const p1 = await prisma.product.create({
        data: {
          name: 'Apple MacBook Pro M3',
          slug: 'apple-macbook-pro-m3',
          status: 'ACTIVE',
          categoryId: l1.id,
          brandId: apple.id,
        },
      });
      await prisma.productVariant.create({
        data: { productId: p1.id, sku: 'MBP-50M', name: 'Base', price: 50000000n, isActive: true },
      });

      // Product 2: In L3 (Laptop Gaming), 25M
      const p2 = await prisma.product.create({
        data: {
          name: 'Dell G15 Gaming',
          slug: 'dell-g15-gaming',
          status: 'ACTIVE',
          categoryId: l3.id,
          brandId: dell.id,
        },
      });
      await prisma.productVariant.create({
        data: { productId: p2.id, sku: 'DELL-25M', name: 'Gaming Base', price: 25000000n, isActive: true },
      });

      // Filter by root category "may-tinh" (should recursively find product in L3)
      const catRes = await request(app).get('/api/v1/products?categorySlug=may-tinh');
      const parsedCat = productListResponseSchema.parse(catRes.body);
      expect(parsedCat.data.length).toBe(2);

      // Sort by price_asc -> Dell 25M first, Apple 50M second
      const sortAscRes = await request(app).get('/api/v1/products?sortBy=price_asc');
      const parsedSortAsc = productListResponseSchema.parse(sortAscRes.body);
      expect(parsedSortAsc.data[0]?.slug).toBe('dell-g15-gaming');
      expect(parsedSortAsc.data[1]?.slug).toBe('apple-macbook-pro-m3');

      // Sort by price_desc -> Apple 50M first, Dell 25M second
      const sortDescRes = await request(app).get('/api/v1/products?sortBy=price_desc');
      const parsedSortDesc = productListResponseSchema.parse(sortDescRes.body);
      expect(parsedSortDesc.data[0]?.slug).toBe('apple-macbook-pro-m3');
      expect(parsedSortDesc.data[1]?.slug).toBe('dell-g15-gaming');
    });

    it('rejects invalid query when minPrice > maxPrice with 422 Validation Error', async () => {
      const res = await request(app).get('/api/v1/products?minPrice=50000000&maxPrice=10000000');
      expect(res.status).toBe(422);
    });

    it('filters products by specifications key:value pairs', async () => {
      const cat = await prisma.category.create({
        data: { name: 'Laptop', slug: 'laptop' },
      });

      // Product 1: 16GB RAM + 512GB SSD
      const p1 = await prisma.product.create({
        data: {
          name: 'Laptop 16GB RAM',
          slug: 'laptop-16gb-ram',
          status: 'ACTIVE',
          categoryId: cat.id,
          specifications: {
            create: [
              { name: 'RAM', value: '16GB', displayOrder: 0 },
              { name: 'Storage', value: '512GB', displayOrder: 1 },
            ],
          },
          variants: {
            create: [{ sku: 'LAP-16-512', name: '16/512', price: 20000000n, isActive: true }],
          },
        },
      });

      // Product 2: 8GB RAM + 256GB SSD
      await prisma.product.create({
        data: {
          name: 'Laptop 8GB RAM',
          slug: 'laptop-8gb-ram',
          status: 'ACTIVE',
          categoryId: cat.id,
          specifications: {
            create: [
              { name: 'RAM', value: '8GB', displayOrder: 0 },
              { name: 'Storage', value: '256GB', displayOrder: 1 },
            ],
          },
          variants: {
            create: [{ sku: 'LAP-8-256', name: '8/256', price: 12000000n, isActive: true }],
          },
        },
      });

      // Query RAM:16GB -> Only Product 1 matches
      const res1 = await request(app).get('/api/v1/products?specs=RAM:16GB');
      expect(res1.status).toBe(200);
      const parsed1 = productListResponseSchema.parse(res1.body);
      expect(parsed1.data.length).toBe(1);
      expect(parsed1.data[0]?.id).toBe(p1.id);

      // Query RAM:16GB,Storage:512GB -> Only Product 1 matches
      const res2 = await request(app).get('/api/v1/products?specs=RAM:16GB,Storage:512GB');
      expect(res2.status).toBe(200);
      const parsed2 = productListResponseSchema.parse(res2.body);
      expect(parsed2.data.length).toBe(1);
      expect(parsed2.data[0]?.id).toBe(p1.id);

      // Query RAM:32GB (no matches) -> 0 products
      const res3 = await request(app).get('/api/v1/products?specs=RAM:32GB');
      expect(res3.status).toBe(200);
      const parsed3 = productListResponseSchema.parse(res3.body);
      expect(parsed3.data.length).toBe(0);
    });

    it('GET /api/v1/products/:slug > returns product detail with images, specs, variants and formats BigInt correctly', async () => {
      const cat = await prisma.category.create({
        data: { name: 'Tai nghe', slug: 'tai-nghe' },
      });
      const brand = await prisma.brand.create({
        data: { name: 'Sony', slug: 'sony' },
      });

      await prisma.product.create({
        data: {
          name: 'Sony WH-1000XM5',
          slug: 'sony-wh-1000xm5',
          status: 'ACTIVE',
          categoryId: cat.id,
          brandId: brand.id,
          images: {
            create: [{ url: 'https://example.com/sony.jpg', isThumbnail: true, displayOrder: 0 }],
          },
          specifications: {
            create: [{ name: 'Bluetooth', value: '5.2', displayOrder: 0 }],
          },
          variants: {
            create: [
              {
                sku: 'SONY-XM5-BLK',
                name: 'Black',
                price: 7990000n,
                compareAtPrice: 8990000n,
                isActive: true,
              },
            ],
          },
        },
      });

      const res = await request(app).get('/api/v1/products/sony-wh-1000xm5');
      expect(res.status).toBe(200);
      const parsed = productDetailResponseSchema.parse(res.body);
      expect(parsed.data.product.name).toBe('Sony WH-1000XM5');
      expect(parsed.data.product.images?.length).toBe(1);
      expect(parsed.data.product.specifications?.length).toBe(1);
      expect(parsed.data.product.variants?.length).toBe(1);
      expect(parsed.data.product.variants?.[0]?.price).toBe('7990000');
    });
  });

  // ==================== 3. Admin & Staff Authorization PBAC ====================

  describe('Admin & Staff PBAC APIs for Catalog', () => {
    it('rejects unauthenticated user with 401 UNAUTHORIZED', async () => {
      const res = await request(app).post('/api/v1/admin/categories').send({ name: 'Test Cat' });
      expect(res.status).toBe(401);
    });

    it('rejects CUSTOMER user from calling admin catalog APIs with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${customerToken}`)
        .send({ name: 'Customer Cat' });
      expect(res.status).toBe(403);
    });

    it('rejects STAFF without catalog permissions with 403 FORBIDDEN', async () => {
      const res = await request(app)
        .get('/api/v1/admin/products')
        .set('Authorization', `Bearer ${staffTokenWithoutCatalog}`);
      expect(res.status).toBe(403);
    });

    it('allows STAFF with catalog:read permission to view admin product list, but blocks write mutations', async () => {
      // 1. Can read admin products list
      const readRes = await request(app)
        .get('/api/v1/admin/products')
        .set('Authorization', `Bearer ${staffTokenWithReadOnly}`);
      expect(readRes.status).toBe(200);

      // 2. Blocked from creating product
      const writeRes = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${staffTokenWithReadOnly}`)
        .send({ name: 'Blocked Product' });
      expect(writeRes.status).toBe(403);
    });

    it('allows STAFF with catalog:write permission to create category and records audit log atomically', async () => {
      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${staffTokenWithWrite}`)
        .send({
          name: 'Điện thoại mới',
          slug: 'dien-thoai-moi',
          description: 'Mô tả',
        });

      expect(res.status).toBe(201);
      const parsed = categoryDetailResponseSchema.parse(res.body);
      expect(parsed.data.category.slug).toBe('dien-thoai-moi');

      // Kiểm tra Audit Log
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'CATEGORY_CREATED', targetType: 'Category' },
      });
      expect(audit).toBeDefined();
      expect(audit?.actorId).toBe(staffWithWriteId);
    });

    it('rejects creating duplicate category slug with 409 CATEGORY_SLUG_EXISTS', async () => {
      await prisma.category.create({
        data: { name: 'Màn hình', slug: 'man-hinh' },
      });

      const res = await request(app)
        .post('/api/v1/admin/categories')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ name: 'Màn hình khác', slug: 'man-hinh' });

      expect(res.status).toBe(409);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe('CATEGORY_SLUG_EXISTS');
    });

    it('prevents cyclic hierarchy when updating category parent', async () => {
      const parent = await prisma.category.create({
        data: { name: 'Cha', slug: 'cha' },
      });
      const child = await prisma.category.create({
        data: { name: 'Con', slug: 'con', parentId: parent.id },
      });

      // Thử đặt parent của "Cha" thành "Con" -> Vòng lặp
      const res = await request(app)
        .patch(`/api/v1/admin/categories/${parent.id}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({ parentId: child.id });

      expect(res.status).toBe(422);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe('CATEGORY_CYCLIC_HIERARCHY');
    });

    it('creates full product and guarantees single thumbnail invariant', async () => {
      const cat = await prisma.category.create({
        data: { name: 'Tablet', slug: 'tablet' },
      });
      const brand = await prisma.brand.create({
        data: { name: 'Apple', slug: 'apple' },
      });

      // Gửi 2 ảnh cùng đánh dấu isThumbnail: true -> Service phải chỉ giữ 1 thumbnail
      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'iPad Pro 11 M4',
          slug: 'ipad-pro-11-m4',
          description: 'iPad Pro M4 siêu mỏng',
          status: 'ACTIVE',
          categoryId: cat.id,
          brandId: brand.id,
          images: [
            { url: 'https://example.com/ipad1.jpg', isThumbnail: true, displayOrder: 0 },
            { url: 'https://example.com/ipad2.jpg', isThumbnail: true, displayOrder: 1 },
          ],
          specifications: [
            { name: 'Chip', value: 'Apple M4', displayOrder: 0 },
          ],
          variants: [
            {
              sku: 'IPAD-M4-256-WIFI',
              name: '256GB WiFi',
              price: 28990000,
              options: { storage: '256GB', connectivity: 'WiFi' },
            },
          ],
        });

      expect(res.status).toBe(201);
      const parsed = productDetailResponseSchema.parse(res.body);
      expect(parsed.data.product.name).toBe('iPad Pro 11 M4');
      expect(parsed.data.product.variants?.length).toBe(1);
      expect(parsed.data.product.variants?.[0]?.sku).toBe('IPAD-M4-256-WIFI');

      // Kiểm tra DB chỉ có 1 ảnh duy nhất có isThumbnail = true
      const thumbnails = await prisma.productImage.findMany({
        where: { productId: parsed.data.product.id, isThumbnail: true },
      });
      expect(thumbnails.length).toBe(1);

      // Audit Log kiểm tra
      const audit = await prisma.auditLog.findFirst({
        where: { action: 'PRODUCT_CREATED', targetType: 'Product' },
      });
      expect(audit).toBeDefined();
    });

    it('rejects product creation when variant SKU already exists in database', async () => {
      const cat = await prisma.category.create({
        data: { name: 'Phone', slug: 'phone' },
      });
      const brand = await prisma.brand.create({
        data: { name: 'Apple', slug: 'apple' },
      });

      const p1 = await prisma.product.create({
        data: { name: 'Phone 1', slug: 'phone-1', categoryId: cat.id, brandId: brand.id },
      });
      await prisma.productVariant.create({
        data: { productId: p1.id, sku: 'DUPLICATE-SKU', name: 'V1', price: 1000n },
      });

      const res = await request(app)
        .post('/api/v1/admin/products')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          name: 'Phone 2',
          slug: 'phone-2',
          categoryId: cat.id,
          brandId: brand.id,
          variants: [
            { sku: 'DUPLICATE-SKU', name: 'V2', price: 2000 },
          ],
        });

      expect(res.status).toBe(409);
      const parsed = errorResponseSchema.parse(res.body);
      expect(parsed.error.code).toBe('PRODUCT_SKU_EXISTS');
    });

    it('manages variants independently (Create, Update, Delete)', async () => {
      const cat = await prisma.category.create({
        data: { name: 'Phụ kiện', slug: 'phu-kien' },
      });
      const product = await prisma.product.create({
        data: { name: 'Cáp sạc Type-C', slug: 'cap-sac-type-c', categoryId: cat.id },
      });

      // 1. Tạo variant
      const createRes = await request(app)
        .post('/api/v1/admin/variants')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product.id,
          sku: 'CABLE-1M-WHITE',
          name: 'Dài 1m Màu Trắng',
          price: 250000,
        });

      expect(createRes.status).toBe(201);
      const parsedCreate = variantResponseSchema.parse(createRes.body);
      const variantId = parsedCreate.data.variant.id;

      // 2. Cập nhật variant
      const updateRes = await request(app)
        .patch(`/api/v1/admin/variants/${variantId}`)
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          price: 220000,
        });

      expect(updateRes.status).toBe(200);
      const parsedUpdate = variantResponseSchema.parse(updateRes.body);
      expect(parsedUpdate.data.variant.price).toBe('220000');

      // 3. Xóa variant
      const deleteRes = await request(app)
        .delete(`/api/v1/admin/variants/${variantId}`)
        .set('Authorization', `Bearer ${adminToken}`);

      expect(deleteRes.status).toBe(200);

      const checkDb = await prisma.productVariant.findUnique({ where: { id: variantId } });
      expect(checkDb).toBeNull();
    });

    it('manages specifications and returns SPECIFICATION_NOT_FOUND when deleting non-existent spec', async () => {
      const cat = await prisma.category.create({
        data: { name: 'Chuột', slug: 'chuot' },
      });
      const product = await prisma.product.create({
        data: { name: 'Chuột Gaming', slug: 'chuot-gaming', categoryId: cat.id },
      });

      // 1. Tạo spec
      const createRes = await request(app)
        .post('/api/v1/admin/specifications')
        .set('Authorization', `Bearer ${adminToken}`)
        .send({
          productId: product.id,
          name: 'DPI',
          value: '16000',
        });
      expect(createRes.status).toBe(201);
      const specId = (createRes.body as { data: { spec: { id: string } } }).data.spec.id;

      // 2. Xóa spec thành công
      const deleteRes = await request(app)
        .delete(`/api/v1/admin/specifications/${specId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleteRes.status).toBe(200);
      const parsedDelete = successMessageResponseSchema.parse(deleteRes.body);
      expect(parsedDelete.data.message).toBe('Specification deleted successfully');

      // 3. Xóa lại spec đã xóa -> 404 SPECIFICATION_NOT_FOUND
      const deleteAgainRes = await request(app)
        .delete(`/api/v1/admin/specifications/${specId}`)
        .set('Authorization', `Bearer ${adminToken}`);
      expect(deleteAgainRes.status).toBe(404);
      const parsedErr = errorResponseSchema.parse(deleteAgainRes.body);
      expect(parsedErr.error.code).toBe('SPECIFICATION_NOT_FOUND');
    });
  });
});
