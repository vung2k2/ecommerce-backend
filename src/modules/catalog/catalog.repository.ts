import { prisma } from '../../database/prisma.js';
import { Prisma, type ProductStatus } from '../../generated/prisma/client.js';

type PrismaClientOrTx = Prisma.TransactionClient | typeof prisma;

// ==================== Data Interfaces ====================

export interface CreateCategoryData {
  name: string;
  slug: string;
  description?: string | null | undefined;
  parentId?: string | null | undefined;
}

export interface UpdateCategoryData {
  name?: string | undefined;
  slug?: string | undefined;
  description?: string | null | undefined;
  parentId?: string | null | undefined;
}

export interface CreateBrandData {
  name: string;
  slug: string;
  description?: string | null | undefined;
  logoUrl?: string | null | undefined;
}

export interface UpdateBrandData {
  name?: string | undefined;
  slug?: string | undefined;
  description?: string | null | undefined;
  logoUrl?: string | null | undefined;
}

export interface CreateProductData {
  name: string;
  slug: string;
  description?: string | null | undefined;
  status?: ProductStatus | undefined;
  categoryId: string;
  brandId?: string | null | undefined;
  images?: Array<{
    url: string;
    isThumbnail?: boolean | undefined;
    displayOrder?: number | undefined;
    altText?: string | null | undefined;
  }> | undefined;
  specifications?: Array<{
    name: string;
    value: string;
    displayOrder?: number | undefined;
  }> | undefined;
  variants?: Array<{
    sku: string;
    name: string;
    price: bigint;
    compareAtPrice?: bigint | null | undefined;
    options?: Prisma.InputJsonValue | undefined;
    isActive?: boolean | undefined;
  }> | undefined;
}

export interface UpdateProductData {
  name?: string | undefined;
  slug?: string | undefined;
  description?: string | null | undefined;
  status?: ProductStatus | undefined;
  categoryId?: string | undefined;
  brandId?: string | null | undefined;
}

export interface CreateVariantData {
  productId: string;
  sku: string;
  name: string;
  price: bigint;
  compareAtPrice?: bigint | null | undefined;
  options?: Prisma.InputJsonValue | undefined;
  isActive?: boolean | undefined;
}

export interface UpdateVariantData {
  sku?: string | undefined;
  name?: string | undefined;
  price?: bigint | undefined;
  compareAtPrice?: bigint | null | undefined;
  options?: Prisma.InputJsonValue | Prisma.NullableJsonNullValueInput | null | undefined;
  isActive?: boolean | undefined;
}

export interface CreateImageData {
  productId: string;
  url: string;
  isThumbnail?: boolean | undefined;
  displayOrder?: number | undefined;
  altText?: string | null | undefined;
}

export interface CreateSpecData {
  productId: string;
  name: string;
  value: string;
  displayOrder?: number | undefined;
}

export interface ListProductsFilter {
  page: number;
  pageSize: number;
  search?: string | undefined;
  categoryIds?: string[] | undefined;
  brandId?: string | undefined;
  minPrice?: bigint | undefined;
  maxPrice?: bigint | undefined;
  sortBy?: 'createdAt_desc' | 'price_asc' | 'price_desc' | 'name_asc' | undefined;
  specifications?: Array<{ name: string; value: string }> | undefined;
}

export interface AdminListProductsFilter {
  page: number;
  pageSize: number;
  search?: string | undefined;
  status?: ProductStatus | undefined;
  categoryId?: string | undefined;
  brandId?: string | undefined;
  sortBy?: 'createdAt_desc' | 'createdAt_asc' | 'name_asc' | 'name_desc' | undefined;
}

// ==================== Repository Object ====================

export const catalogRepository = {
  // --- Category ---
  findCategories(tx: PrismaClientOrTx = prisma) {
    return tx.category.findMany({
      orderBy: [{ parentId: 'asc' }, { name: 'asc' }],
      include: {
        children: {
          orderBy: { name: 'asc' },
        },
      },
    });
  },

  findCategoryById(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
      },
    });
  },

  findCategoryBySlug(slug: string, tx: PrismaClientOrTx = prisma) {
    return tx.category.findUnique({
      where: { slug },
      include: {
        parent: true,
        children: true,
      },
    });
  },

  countCategoryChildren(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.category.count({
      where: { parentId: id },
    });
  },

  countCategoryProducts(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.product.count({
      where: { categoryId: id },
    });
  },

  createCategory(data: CreateCategoryData, tx: PrismaClientOrTx = prisma) {
    return tx.category.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        parentId: data.parentId ?? null,
      },
    });
  },

  updateCategory(id: string, data: UpdateCategoryData, tx: PrismaClientOrTx = prisma) {
    return tx.category.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.parentId !== undefined ? { parentId: data.parentId } : {}),
      },
    });
  },

  deleteCategory(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.category.delete({
      where: { id },
    });
  },

  // --- Brand ---
  findBrands(tx: PrismaClientOrTx = prisma) {
    return tx.brand.findMany({
      orderBy: { name: 'asc' },
    });
  },

  findBrandById(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.brand.findUnique({
      where: { id },
    });
  },

  findBrandBySlug(slug: string, tx: PrismaClientOrTx = prisma) {
    return tx.brand.findUnique({
      where: { slug },
    });
  },

  countBrandProducts(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.product.count({
      where: { brandId: id },
    });
  },

  createBrand(data: CreateBrandData, tx: PrismaClientOrTx = prisma) {
    return tx.brand.create({
      data: {
        name: data.name,
        slug: data.slug,
        description: data.description ?? null,
        logoUrl: data.logoUrl ?? null,
      },
    });
  },

  updateBrand(id: string, data: UpdateBrandData, tx: PrismaClientOrTx = prisma) {
    return tx.brand.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.logoUrl !== undefined ? { logoUrl: data.logoUrl } : {}),
      },
    });
  },

  deleteBrand(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.brand.delete({
      where: { id },
    });
  },

  // --- Product Public Queries ---
  async findPublicProducts(filter: ListProductsFilter, tx: PrismaClientOrTx = prisma) {
    const where: Prisma.ProductWhereInput = {
      status: 'ACTIVE',
      variants: {
        some: {
          isActive: true,
          ...(filter.minPrice !== undefined || filter.maxPrice !== undefined
            ? {
                price: {
                  ...(filter.minPrice !== undefined ? { gte: filter.minPrice } : {}),
                  ...(filter.maxPrice !== undefined ? { lte: filter.maxPrice } : {}),
                },
              }
            : {}),
        },
      },
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { description: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
      ...(filter.categoryIds && filter.categoryIds.length > 0
        ? { categoryId: { in: filter.categoryIds } }
        : {}),
      ...(filter.brandId ? { brandId: filter.brandId } : {}),
      ...(filter.specifications && filter.specifications.length > 0
        ? {
            AND: filter.specifications.map((s) => ({
              specifications: {
                some: {
                  name: { equals: s.name, mode: 'insensitive' as const },
                  value: { equals: s.value, mode: 'insensitive' as const },
                },
              },
            })),
          }
        : {}),
    };

    if (filter.sortBy === 'price_asc' || filter.sortBy === 'price_desc') {
      const isAsc = filter.sortBy === 'price_asc';
      const sorted = await tx.productVariant.groupBy({
        by: ['productId'],
        where: {
          isActive: true,
          product: where,
        },
        _min: { price: true },
        orderBy: [
          { _min: { price: isAsc ? 'asc' : 'desc' } },
          { productId: 'asc' },
        ],
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
      });

      const ids = sorted.map((s) => s.productId);
      const [total, productsList] = await Promise.all([
        tx.product.count({ where }),
        ids.length > 0
          ? tx.product.findMany({
              where: { id: { in: ids } },
              include: {
                category: {
                  select: { id: true, name: true, slug: true },
                },
                brand: {
                  select: { id: true, name: true, slug: true, logoUrl: true },
                },
                images: {
                  where: { isThumbnail: true },
                  take: 1,
                  select: { url: true, altText: true },
                },
                variants: {
                  where: { isActive: true },
                  orderBy: [{ price: 'asc' }, { id: 'asc' }],
                  select: { id: true, sku: true, name: true, price: true, compareAtPrice: true },
                },
              },
            })
          : [],
      ]);

      const idMap = new Map(productsList.map((p) => [p.id, p]));
      const products = ids.map((id) => idMap.get(id)).filter(Boolean) as typeof productsList;
      return { total, products };
    }

    const orderBy: Prisma.ProductOrderByWithRelationInput[] =
      filter.sortBy === 'name_asc'
        ? [{ name: 'asc' }, { id: 'asc' }]
        : [{ createdAt: 'desc' }, { id: 'asc' }];

    const [total, products] = await Promise.all([
      tx.product.count({ where }),
      tx.product.findMany({
        where,
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        orderBy,
        include: {
          category: {
            select: { id: true, name: true, slug: true },
          },
          brand: {
            select: { id: true, name: true, slug: true, logoUrl: true },
          },
          images: {
            where: { isThumbnail: true },
            take: 1,
            select: { url: true, altText: true },
          },
          variants: {
            where: { isActive: true },
            orderBy: [{ price: 'asc' }, { id: 'asc' }],
            select: { id: true, sku: true, name: true, price: true, compareAtPrice: true },
          },
        },
      }),
    ]);

    return { total, products };
  },

  findPublicProductBySlug(slug: string, tx: PrismaClientOrTx = prisma) {
    return tx.product.findFirst({
      where: {
        slug,
        status: 'ACTIVE',
        variants: { some: { isActive: true } },
      },
      include: {
        category: true,
        brand: true,
        images: {
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        },
        variants: {
          where: { isActive: true },
          orderBy: [{ price: 'asc' }, { id: 'asc' }],
        },
        specifications: {
          orderBy: [{ displayOrder: 'asc' }, { id: 'asc' }],
        },
      },
    });
  },

  // --- Product Admin Queries ---
  async findAdminProducts(filter: AdminListProductsFilter, tx: PrismaClientOrTx = prisma) {
    const where: Prisma.ProductWhereInput = {
      ...(filter.status ? { status: filter.status } : {}),
      ...(filter.categoryId ? { categoryId: filter.categoryId } : {}),
      ...(filter.brandId ? { brandId: filter.brandId } : {}),
      ...(filter.search
        ? {
            OR: [
              { name: { contains: filter.search, mode: 'insensitive' } },
              { slug: { contains: filter.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    let orderBy: Prisma.ProductOrderByWithRelationInput[] = [{ createdAt: 'desc' }, { id: 'asc' }];
    if (filter.sortBy === 'createdAt_asc') orderBy = [{ createdAt: 'asc' }, { id: 'asc' }];
    if (filter.sortBy === 'name_asc') orderBy = [{ name: 'asc' }, { id: 'asc' }];
    if (filter.sortBy === 'name_desc') orderBy = [{ name: 'desc' }, { id: 'asc' }];

    const [total, products] = await Promise.all([
      tx.product.count({ where }),
      tx.product.findMany({
        where,
        skip: (filter.page - 1) * filter.pageSize,
        take: filter.pageSize,
        orderBy,
        include: {
          category: { select: { id: true, name: true, slug: true } },
          brand: { select: { id: true, name: true, slug: true } },
          variants: { select: { id: true, sku: true, name: true, price: true, isActive: true } },
          images: { where: { isThumbnail: true }, take: 1, select: { url: true } },
        },
      }),
    ]);

    return { total, products };
  },

  findProductById(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.product.findUnique({
      where: { id },
      include: {
        category: true,
        brand: true,
        images: { orderBy: { displayOrder: 'asc' } },
        variants: { orderBy: { price: 'asc' } },
        specifications: { orderBy: { displayOrder: 'asc' } },
      },
    });
  },

  findProductBySlug(slug: string, tx: PrismaClientOrTx = prisma) {
    return tx.product.findUnique({
      where: { slug },
      include: {
        category: true,
        brand: true,
        images: { orderBy: { displayOrder: 'asc' } },
        variants: { orderBy: { price: 'asc' } },
        specifications: { orderBy: { displayOrder: 'asc' } },
      },
    });
  },

  createProductWithDetails(data: CreateProductData, tx: PrismaClientOrTx = prisma) {
    const createData: Prisma.ProductCreateInput = {
      name: data.name,
      slug: data.slug,
      description: data.description ?? null,
      status: data.status ?? 'DRAFT',
      category: { connect: { id: data.categoryId } },
      ...(data.brandId ? { brand: { connect: { id: data.brandId } } } : {}),
      ...(data.images && data.images.length > 0
        ? {
            images: {
              create: data.images.map((img) => ({
                url: img.url,
                isThumbnail: img.isThumbnail ?? false,
                displayOrder: img.displayOrder ?? 0,
                altText: img.altText ?? null,
              })),
            },
          }
        : {}),
      ...(data.specifications && data.specifications.length > 0
        ? {
            specifications: {
              create: data.specifications.map((spec) => ({
                name: spec.name,
                value: spec.value,
                displayOrder: spec.displayOrder ?? 0,
              })),
            },
          }
        : {}),
      ...(data.variants && data.variants.length > 0
        ? {
            variants: {
              create: data.variants.map((v) => ({
                sku: v.sku,
                name: v.name,
                price: v.price,
                compareAtPrice: v.compareAtPrice ?? null,
                ...(v.options !== undefined ? { options: v.options } : {}),
                isActive: v.isActive ?? true,
              })),
            },
          }
        : {}),
    };

    return tx.product.create({
      data: createData,
      include: {
        category: true,
        brand: true,
        images: true,
        specifications: true,
        variants: true,
      },
    });
  },

  updateProduct(id: string, data: UpdateProductData, tx: PrismaClientOrTx = prisma) {
    return tx.product.update({
      where: { id },
      data: {
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.slug !== undefined ? { slug: data.slug } : {}),
        ...(data.description !== undefined ? { description: data.description } : {}),
        ...(data.status !== undefined ? { status: data.status } : {}),
        ...(data.categoryId !== undefined ? { categoryId: data.categoryId } : {}),
        ...(data.brandId !== undefined ? { brandId: data.brandId } : {}),
      },
      include: {
        category: true,
        brand: true,
        images: true,
        variants: true,
      },
    });
  },

  deleteProduct(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.product.delete({
      where: { id },
    });
  },

  // --- Variant Operations ---
  findVariantById(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.productVariant.findUnique({
      where: { id },
    });
  },

  findVariantBySku(sku: string, tx: PrismaClientOrTx = prisma) {
    return tx.productVariant.findUnique({
      where: { sku },
    });
  },

  createVariant(data: CreateVariantData, tx: PrismaClientOrTx = prisma) {
    return tx.productVariant.create({
      data: {
        productId: data.productId,
        sku: data.sku,
        name: data.name,
        price: data.price,
        compareAtPrice: data.compareAtPrice ?? null,
        ...(data.options !== undefined ? { options: data.options } : {}),
        isActive: data.isActive ?? true,
      },
    });
  },

  updateVariant(id: string, data: UpdateVariantData, tx: PrismaClientOrTx = prisma) {
    return tx.productVariant.update({
      where: { id },
      data: {
        ...(data.sku !== undefined ? { sku: data.sku } : {}),
        ...(data.name !== undefined ? { name: data.name } : {}),
        ...(data.price !== undefined ? { price: data.price } : {}),
        ...(data.compareAtPrice !== undefined ? { compareAtPrice: data.compareAtPrice } : {}),
        ...(data.options !== undefined
          ? { options: data.options === null ? Prisma.JsonNull : data.options }
          : {}),
        ...(data.isActive !== undefined ? { isActive: data.isActive } : {}),
      },
    });
  },

  deleteVariant(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.productVariant.delete({
      where: { id },
    });
  },

  // --- Image Operations ---
  findImageById(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.productImage.findUnique({
      where: { id },
    });
  },

  createImage(data: CreateImageData, tx: PrismaClientOrTx = prisma) {
    return tx.productImage.create({
      data: {
        productId: data.productId,
        url: data.url,
        isThumbnail: data.isThumbnail ?? false,
        displayOrder: data.displayOrder ?? 0,
        altText: data.altText ?? null,
      },
    });
  },

  async setThumbnailImage(productId: string, imageId: string, tx: PrismaClientOrTx = prisma) {
    await tx.productImage.updateMany({
      where: { productId, isThumbnail: true },
      data: { isThumbnail: false },
    });

    return tx.productImage.update({
      where: { id: imageId },
      data: { isThumbnail: true },
    });
  },

  deleteImage(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.productImage.delete({
      where: { id },
    });
  },

  // --- Spec Operations ---
  findSpecById(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.productSpecification.findUnique({
      where: { id },
    });
  },

  createSpec(data: CreateSpecData, tx: PrismaClientOrTx = prisma) {
    return tx.productSpecification.create({
      data: {
        productId: data.productId,
        name: data.name,
        value: data.value,
        displayOrder: data.displayOrder ?? 0,
      },
    });
  },

  deleteSpec(id: string, tx: PrismaClientOrTx = prisma) {
    return tx.productSpecification.delete({
      where: { id },
    });
  },
};
