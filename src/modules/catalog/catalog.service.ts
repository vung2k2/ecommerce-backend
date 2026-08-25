import {
  AUDIT_ACTIONS,
  ERROR_CODES,
  UPLOAD_PURPOSES,
  type ErrorCode,
} from '../../constants/index.js';
import { prisma } from '../../database/prisma.js';
import { Prisma, type Category } from '../../generated/prisma/client.js';
import { auditRepository } from '../audit/audit.repository.js';
import { UPLOAD_POLICIES } from '../uploads/uploads.policy.js';
import { s3Service } from '../../services/s3.service.js';
import { AppError } from '../../utils/app-error.js';
import {
  catalogRepository,
  type CreateProductData,
  type UpdateProductData,
} from './catalog.repository.js';
import type {
  AdminListProductsQueryDto,
  CreateBrandDto,
  CreateCategoryDto,
  CreateProductDto,
  CreateProductImageDto,
  CreateProductSpecDto,
  CreateVariantDto,
  ListProductsQueryDto,
  UpdateBrandDto,
  UpdateCategoryDto,
  UpdateProductDto,
  UpdateVariantDto,
} from './catalog.schema.js';

export function slugify(text: string): string {
  const result = text
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/[\s_-]+/g, '-')
    .replace(/^-+|-+$/g, '');

  return result || `item-${Date.now()}`;
}

export function formatCatalogResponse<T>(data: T): T {
  if (data === null || data === undefined) return data;
  if (typeof data === 'bigint') return data.toString() as unknown as T;
  if (data instanceof Date) return data.toISOString() as unknown as T;
  if (Array.isArray(data)) return data.map(formatCatalogResponse) as unknown as T;
  if (typeof data === 'object') {
    const res: Record<string, unknown> = {};
    for (const key of Object.keys(data as Record<string, unknown>)) {
      res[key] = formatCatalogResponse((data as Record<string, unknown>)[key]);
    }
    return res as T;
  }
  return data;
}

export function parseSpecsFilter(specs?: string): Array<{ name: string; value: string }> | undefined {
  if (!specs) return undefined;
  const list = specs
    .split(',')
    .map((item) => {
      const idx = item.indexOf(':');
      if (idx === -1) return null;
      const name = item.slice(0, idx).trim();
      const value = item.slice(idx + 1).trim();
      if (!name || !value) return null;
      return { name, value };
    })
    .filter((item): item is { name: string; value: string } => item !== null);

  return list.length > 0 ? list : undefined;
}

// Helper to catch Prisma unique constraint violations (P2002) and map to 409 AppErrors
async function handlePrismaUnique<T>(
  operation: () => Promise<T>,
  fieldErrorMap: Record<string, ErrorCode>,
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = (error.meta?.target as string[]) || [];
      for (const field of target) {
        if (fieldErrorMap[field]) {
          throw new AppError(409, fieldErrorMap[field]);
        }
      }
      // Check fallback target keys
      const targetStr = JSON.stringify(error.meta?.target || '');
      for (const [key, code] of Object.entries(fieldErrorMap)) {
        if (targetStr.includes(key)) {
          throw new AppError(409, code);
        }
      }
    }
    throw error;
  }
}

function requireUploadActorId(actorId: string | undefined): string {
  if (!actorId) {
    throw new AppError(403, ERROR_CODES.FORBIDDEN);
  }

  return actorId;
}

async function promoteCatalogImage(
  url: string,
  purpose: typeof UPLOAD_PURPOSES.PRODUCT_IMAGE | typeof UPLOAD_PURPOSES.BRAND_LOGO,
  actorId: string | undefined,
) {
  const policy = UPLOAD_POLICIES[purpose];

  return s3Service.promoteTempUpload({
    url,
    expectedFolder: policy.folder,
    ownerId: requireUploadActorId(actorId),
    allowedMimeTypes: policy.allowedMimeTypes,
    maxSizeBytes: policy.maxSizeBytes,
  });
}

interface CategoryTreeNode {
  id: string;
  name: string;
  slug: string;
  description: string | null;
  parentId: string | null;
  createdAt: Date;
  updatedAt: Date;
  children: CategoryTreeNode[];
}

function buildCategoryTree(categories: Category[]): CategoryTreeNode[] {
  const nodeMap = new Map<string, CategoryTreeNode>();

  for (const cat of categories) {
    nodeMap.set(cat.id, {
      id: cat.id,
      name: cat.name,
      slug: cat.slug,
      description: cat.description ?? null,
      parentId: cat.parentId ?? null,
      createdAt: cat.createdAt,
      updatedAt: cat.updatedAt,
      children: [],
    });
  }

  const roots: CategoryTreeNode[] = [];
  for (const cat of categories) {
    const node = nodeMap.get(cat.id);
    if (!node) continue;
    if (cat.parentId && nodeMap.has(cat.parentId)) {
      const parentNode = nodeMap.get(cat.parentId);
      if (parentNode) {
        parentNode.children.push(node);
      }
    } else {
      roots.push(node);
    }
  }

  return roots;
}

async function getAllCategoryDescendantIds(rootCategoryId: string): Promise<string[]> {
  const allCategories = await catalogRepository.findCategories();
  const childrenMap = new Map<string, string[]>();
  for (const cat of allCategories) {
    if (cat.parentId) {
      const list = childrenMap.get(cat.parentId) || [];
      list.push(cat.id);
      childrenMap.set(cat.parentId, list);
    }
  }

  const result: string[] = [rootCategoryId];
  const queue: string[] = [rootCategoryId];
  while (queue.length > 0) {
    const current = queue.shift();
    if (!current) break;
    const children = childrenMap.get(current) || [];
    for (const childId of children) {
      result.push(childId);
      queue.push(childId);
    }
  }

  return result;
}

export const catalogService = {
  // ==================== Categories ====================

  async getCategories() {
    const categories = await catalogRepository.findCategories();
    const tree = buildCategoryTree(categories);
    return formatCatalogResponse(tree);
  },

  async getCategoryById(id: string) {
    const category = await catalogRepository.findCategoryById(id);
    if (!category) {
      throw new AppError(404, ERROR_CODES.CATEGORY_NOT_FOUND);
    }
    return formatCatalogResponse(category);
  },

  async getCategoryBySlug(slug: string) {
    const category = await catalogRepository.findCategoryBySlug(slug);
    if (!category) {
      throw new AppError(404, ERROR_CODES.CATEGORY_NOT_FOUND);
    }
    return formatCatalogResponse(category);
  },

  async createCategory(dto: CreateCategoryDto, actorId?: string) {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);

    if (dto.parentId) {
      const parent = await catalogRepository.findCategoryById(dto.parentId);
      if (!parent) {
        throw new AppError(404, ERROR_CODES.CATEGORY_NOT_FOUND);
      }
    }

    const existingSlug = await catalogRepository.findCategoryBySlug(slug);
    if (existingSlug) {
      throw new AppError(409, ERROR_CODES.CATEGORY_SLUG_EXISTS);
    }

    return handlePrismaUnique(async () => {
      return prisma.$transaction(async (tx) => {
        const category = await catalogRepository.createCategory(
          {
            name: dto.name,
            slug,
            description: dto.description ?? null,
            parentId: dto.parentId ?? null,
          },
          tx,
        );

        if (actorId) {
          await auditRepository.createAuditLog(
            {
              actorId,
              action: AUDIT_ACTIONS.CATEGORY_CREATED,
              targetType: 'Category',
              targetId: category.id,
              payload: { name: category.name, slug: category.slug },
            },
            tx,
          );
        }

        return formatCatalogResponse(category);
      });
    }, { slug: ERROR_CODES.CATEGORY_SLUG_EXISTS });
  },

  async updateCategory(id: string, dto: UpdateCategoryDto, actorId?: string) {
    const existing = await catalogRepository.findCategoryById(id);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.CATEGORY_NOT_FOUND);
    }

    let slug: string | undefined;
    if (dto.slug !== undefined) {
      slug = slugify(dto.slug);
      if (slug !== existing.slug) {
        const checkSlug = await catalogRepository.findCategoryBySlug(slug);
        if (checkSlug && checkSlug.id !== id) {
          throw new AppError(409, ERROR_CODES.CATEGORY_SLUG_EXISTS);
        }
      }
    }

    if (dto.parentId !== undefined) {
      if (dto.parentId === id) {
        throw new AppError(422, ERROR_CODES.CATEGORY_CYCLIC_HIERARCHY);
      }

      if (dto.parentId !== null) {
        const parent = await catalogRepository.findCategoryById(dto.parentId);
        if (!parent) {
          throw new AppError(404, ERROR_CODES.CATEGORY_NOT_FOUND);
        }

        // Check cyclic hierarchy: parent cannot be a descendant of current category
        const descendantIds = await getAllCategoryDescendantIds(id);
        if (descendantIds.includes(dto.parentId)) {
          throw new AppError(422, ERROR_CODES.CATEGORY_CYCLIC_HIERARCHY);
        }
      }
    }

    return handlePrismaUnique(async () => {
      return prisma.$transaction(async (tx) => {
        const updated = await catalogRepository.updateCategory(
          id,
          {
            name: dto.name,
            slug,
            description: dto.description,
            parentId: dto.parentId,
          },
          tx,
        );

        if (actorId) {
          await auditRepository.createAuditLog(
            {
              actorId,
              action: AUDIT_ACTIONS.CATEGORY_UPDATED,
              targetType: 'Category',
              targetId: id,
              payload: { changes: dto },
            },
            tx,
          );
        }

        return formatCatalogResponse(updated);
      });
    }, { slug: ERROR_CODES.CATEGORY_SLUG_EXISTS });
  },

  async deleteCategory(id: string, actorId?: string) {
    const category = await catalogRepository.findCategoryById(id);
    if (!category) {
      throw new AppError(404, ERROR_CODES.CATEGORY_NOT_FOUND);
    }

    const childrenCount = await catalogRepository.countCategoryChildren(id);
    if (childrenCount > 0) {
      throw new AppError(409, ERROR_CODES.CATEGORY_HAS_CHILDREN);
    }

    const productsCount = await catalogRepository.countCategoryProducts(id);
    if (productsCount > 0) {
      throw new AppError(409, ERROR_CODES.CATEGORY_HAS_PRODUCTS);
    }

    await prisma.$transaction(async (tx) => {
      await catalogRepository.deleteCategory(id, tx);

      if (actorId) {
        await auditRepository.createAuditLog(
          {
            actorId,
            action: AUDIT_ACTIONS.CATEGORY_DELETED,
            targetType: 'Category',
            targetId: id,
            payload: { name: category.name, slug: category.slug },
          },
          tx,
        );
      }
    });
  },

  // ==================== Brands ====================

  async getBrands() {
    const brands = await catalogRepository.findBrands();
    return formatCatalogResponse(brands);
  },

  async getBrandById(id: string) {
    const brand = await catalogRepository.findBrandById(id);
    if (!brand) {
      throw new AppError(404, ERROR_CODES.BRAND_NOT_FOUND);
    }
    return formatCatalogResponse(brand);
  },

  async getBrandBySlug(slug: string) {
    const brand = await catalogRepository.findBrandBySlug(slug);
    if (!brand) {
      throw new AppError(404, ERROR_CODES.BRAND_NOT_FOUND);
    }
    return formatCatalogResponse(brand);
  },

  async createBrand(dto: CreateBrandDto, actorId?: string) {
    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);

    const existing = await catalogRepository.findBrandBySlug(slug);
    if (existing) {
      throw new AppError(409, ERROR_CODES.BRAND_SLUG_EXISTS);
    }

    const promotedLogo = dto.logoUrl
      ? await promoteCatalogImage(dto.logoUrl, UPLOAD_PURPOSES.BRAND_LOGO, actorId)
      : null;

    try {
      const brand = await handlePrismaUnique(async () => {
        return prisma.$transaction(async (tx) => {
          const created = await catalogRepository.createBrand(
            {
              name: dto.name,
              slug,
              description: dto.description ?? null,
              logoUrl: promotedLogo?.fileUrl ?? null,
            },
            tx,
          );

          if (actorId) {
            await auditRepository.createAuditLog(
              {
                actorId,
                action: AUDIT_ACTIONS.BRAND_CREATED,
                targetType: 'Brand',
                targetId: created.id,
                payload: { name: created.name, slug: created.slug },
              },
              tx,
            );
          }

          return formatCatalogResponse(created);
        });
      }, { slug: ERROR_CODES.BRAND_SLUG_EXISTS });

      if (promotedLogo) {
        await s3Service.cleanupObjects([promotedLogo.tempKey]);
      }

      return brand;
    } catch (error) {
      if (promotedLogo) {
        await s3Service.cleanupObjects([promotedLogo.fileKey]);
      }
      throw error;
    }
  },

  async updateBrand(id: string, dto: UpdateBrandDto, actorId?: string) {
    const existing = await catalogRepository.findBrandById(id);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.BRAND_NOT_FOUND);
    }

    let slug: string | undefined;
    if (dto.slug !== undefined) {
      slug = slugify(dto.slug);
      if (slug !== existing.slug) {
        const checkSlug = await catalogRepository.findBrandBySlug(slug);
        if (checkSlug && checkSlug.id !== id) {
          throw new AppError(409, ERROR_CODES.BRAND_SLUG_EXISTS);
        }
      }
    }

    let finalLogoUrl: string | null | undefined;
    let promotedLogo: Awaited<ReturnType<typeof promoteCatalogImage>> | null = null;
    if (dto.logoUrl !== undefined) {
      if (dto.logoUrl === null) {
        finalLogoUrl = null;
      } else {
        promotedLogo = await promoteCatalogImage(
          dto.logoUrl,
          UPLOAD_PURPOSES.BRAND_LOGO,
          actorId,
        );
        finalLogoUrl = promotedLogo.fileUrl;
      }
    }

    try {
      const brand = await handlePrismaUnique(async () => {
        return prisma.$transaction(async (tx) => {
          const updated = await catalogRepository.updateBrand(
            id,
            {
              name: dto.name,
              slug,
              description: dto.description,
              logoUrl: finalLogoUrl,
            },
            tx,
          );

          if (actorId) {
            await auditRepository.createAuditLog(
              {
                actorId,
                action: AUDIT_ACTIONS.BRAND_UPDATED,
                targetType: 'Brand',
                targetId: id,
                payload: { changes: dto },
              },
              tx,
            );
          }

          return formatCatalogResponse(updated);
        });
      }, { slug: ERROR_CODES.BRAND_SLUG_EXISTS });

      const oldKey =
        dto.logoUrl !== undefined && existing.logoUrl
          ? s3Service.extractKeyFromUrl(existing.logoUrl)
          : null;
      await s3Service.cleanupObjects([
        ...(oldKey ? [oldKey] : []),
        ...(promotedLogo ? [promotedLogo.tempKey] : []),
      ]);

      return brand;
    } catch (error) {
      if (promotedLogo) {
        await s3Service.cleanupObjects([promotedLogo.fileKey]);
      }
      throw error;
    }
  },

  async deleteBrand(id: string, actorId?: string) {
    const brand = await catalogRepository.findBrandById(id);
    if (!brand) {
      throw new AppError(404, ERROR_CODES.BRAND_NOT_FOUND);
    }

    const productsCount = await catalogRepository.countBrandProducts(id);
    if (productsCount > 0) {
      throw new AppError(409, ERROR_CODES.BRAND_HAS_PRODUCTS);
    }

    await prisma.$transaction(async (tx) => {
      await catalogRepository.deleteBrand(id, tx);

      if (actorId) {
        await auditRepository.createAuditLog(
          {
            actorId,
            action: AUDIT_ACTIONS.BRAND_DELETED,
            targetType: 'Brand',
            targetId: id,
            payload: { name: brand.name, slug: brand.slug },
          },
          tx,
        );
      }
    });

    if (brand.logoUrl) {
      const key = s3Service.extractKeyFromUrl(brand.logoUrl);
      if (key) await s3Service.cleanupObjects([key]);
    }
  },

  // ==================== Products ====================

  async listPublicProducts(query: ListProductsQueryDto) {
    let categoryIds: string[] | undefined;

    if (query.categorySlug) {
      const category = await catalogRepository.findCategoryBySlug(query.categorySlug);
      if (category) {
        categoryIds = await getAllCategoryDescendantIds(category.id);
      } else {
        return {
          products: [],
          total: 0,
        };
      }
    }

    let brandId: string | undefined;
    if (query.brandSlug) {
      const brand = await catalogRepository.findBrandBySlug(query.brandSlug);
      if (brand) {
        brandId = brand.id;
      } else {
        return {
          products: [],
          total: 0,
        };
      }
    }

    const { total, products } = await catalogRepository.findPublicProducts({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      categoryIds,
      brandId,
      minPrice: query.minPrice,
      maxPrice: query.maxPrice,
      sortBy: query.sortBy,
      specifications: parseSpecsFilter(query.specs),
    });

    return {
      products: formatCatalogResponse(products),
      total,
    };
  },

  async getPublicProductBySlug(slug: string) {
    const product = await catalogRepository.findPublicProductBySlug(slug);
    if (!product) {
      throw new AppError(404, ERROR_CODES.PRODUCT_NOT_FOUND);
    }

    return formatCatalogResponse(product);
  },

  async listAdminProducts(query: AdminListProductsQueryDto) {
    const { total, products } = await catalogRepository.findAdminProducts({
      page: query.page,
      pageSize: query.pageSize,
      search: query.search,
      status: query.status,
      categoryId: query.categoryId,
      brandId: query.brandId,
      sortBy: query.sortBy,
    });

    return {
      products: formatCatalogResponse(products),
      total,
    };
  },

  async getProductById(id: string) {
    const product = await catalogRepository.findProductById(id);
    if (!product) {
      throw new AppError(404, ERROR_CODES.PRODUCT_NOT_FOUND);
    }

    return formatCatalogResponse(product);
  },

  async createProduct(dto: CreateProductDto, actorId?: string) {
    const category = await catalogRepository.findCategoryById(dto.categoryId);
    if (!category) {
      throw new AppError(404, ERROR_CODES.CATEGORY_NOT_FOUND);
    }

    if (dto.brandId) {
      const brand = await catalogRepository.findBrandById(dto.brandId);
      if (!brand) {
        throw new AppError(404, ERROR_CODES.BRAND_NOT_FOUND);
      }
    }

    const slug = dto.slug ? slugify(dto.slug) : slugify(dto.name);
    const existingProduct = await catalogRepository.findProductBySlug(slug);
    if (existingProduct) {
      throw new AppError(409, ERROR_CODES.PRODUCT_SLUG_EXISTS);
    }

    if (dto.variants && dto.variants.length > 0) {
      const skuSet = new Set<string>();
      for (const v of dto.variants) {
        if (skuSet.has(v.sku)) {
          throw new AppError(409, ERROR_CODES.PRODUCT_SKU_EXISTS);
        }
        skuSet.add(v.sku);

        const existingVariant = await catalogRepository.findVariantBySku(v.sku);
        if (existingVariant) {
          throw new AppError(409, ERROR_CODES.PRODUCT_SKU_EXISTS);
        }
      }
    }

    const promotedImages: Awaited<ReturnType<typeof promoteCatalogImage>>[] = [];

    // Sanitize and promote images to ensure at most 1 isThumbnail
    let sanitizedImages: CreateProductData['images'];
    try {
      if (dto.images && dto.images.length > 0) {
        for (const image of dto.images) {
          promotedImages.push(
            await promoteCatalogImage(image.url, UPLOAD_PURPOSES.PRODUCT_IMAGE, actorId),
          );
        }

        const firstThumbnailIdx = dto.images.findIndex((image) => image.isThumbnail);
        const thumbnailIdx = firstThumbnailIdx !== -1 ? firstThumbnailIdx : 0;
        sanitizedImages = dto.images.map((image, index) => ({
          url: promotedImages[index]?.fileUrl ?? image.url,
          isThumbnail: index === thumbnailIdx,
          displayOrder: image.displayOrder ?? index,
          altText: image.altText ?? null,
        }));
      }

      const createData: CreateProductData = {
        name: dto.name,
        slug,
        description: dto.description ?? null,
        status: dto.status,
        categoryId: dto.categoryId,
        brandId: dto.brandId ?? null,
        images: sanitizedImages,
        specifications: dto.specifications,
        variants: dto.variants?.map((variant) => ({
          sku: variant.sku,
          name: variant.name,
          price: variant.price,
          compareAtPrice: variant.compareAtPrice ?? null,
          options: variant.options as Prisma.InputJsonValue | undefined,
          isActive: variant.isActive ?? true,
        })),
      };

      const product = await handlePrismaUnique(async () => {
        return prisma.$transaction(async (tx) => {
          const created = await catalogRepository.createProductWithDetails(createData, tx);

          if (actorId) {
            await auditRepository.createAuditLog(
              {
                actorId,
                action: AUDIT_ACTIONS.PRODUCT_CREATED,
                targetType: 'Product',
                targetId: created.id,
                payload: { name: created.name, slug: created.slug },
              },
              tx,
            );
          }

          return formatCatalogResponse(created);
        });
      }, {
        slug: ERROR_CODES.PRODUCT_SLUG_EXISTS,
        sku: ERROR_CODES.PRODUCT_SKU_EXISTS,
      });

      await s3Service.cleanupObjects(promotedImages.map((image) => image.tempKey));
      return product;
    } catch (error) {
      await s3Service.cleanupObjects(promotedImages.map((image) => image.fileKey));
      throw error;
    }
  },

  async updateProduct(id: string, dto: UpdateProductDto, actorId?: string) {
    const existing = await catalogRepository.findProductById(id);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.PRODUCT_NOT_FOUND);
    }

    if (dto.categoryId !== undefined) {
      const category = await catalogRepository.findCategoryById(dto.categoryId);
      if (!category) {
        throw new AppError(404, ERROR_CODES.CATEGORY_NOT_FOUND);
      }
    }

    if (dto.brandId !== undefined && dto.brandId !== null) {
      const brand = await catalogRepository.findBrandById(dto.brandId);
      if (!brand) {
        throw new AppError(404, ERROR_CODES.BRAND_NOT_FOUND);
      }
    }

    let slug: string | undefined;
    if (dto.slug !== undefined) {
      slug = slugify(dto.slug);
      if (slug !== existing.slug) {
        const checkSlug = await catalogRepository.findProductBySlug(slug);
        if (checkSlug && checkSlug.id !== id) {
          throw new AppError(409, ERROR_CODES.PRODUCT_SLUG_EXISTS);
        }
      }
    }

    const updateData: UpdateProductData = {
      name: dto.name,
      slug,
      description: dto.description,
      status: dto.status,
      categoryId: dto.categoryId,
      brandId: dto.brandId,
    };

    return handlePrismaUnique(async () => {
      return prisma.$transaction(async (tx) => {
        const updated = await catalogRepository.updateProduct(id, updateData, tx);

        if (actorId) {
          await auditRepository.createAuditLog(
            {
              actorId,
              action: AUDIT_ACTIONS.PRODUCT_UPDATED,
              targetType: 'Product',
              targetId: id,
              payload: { changes: dto },
            },
            tx,
          );
        }

        return formatCatalogResponse(updated);
      });
    }, { slug: ERROR_CODES.PRODUCT_SLUG_EXISTS });
  },

  async deleteProduct(id: string, actorId?: string) {
    const product = await catalogRepository.findProductById(id);
    if (!product) {
      throw new AppError(404, ERROR_CODES.PRODUCT_NOT_FOUND);
    }

    if (await catalogRepository.productHasStockHistory(id)) {
      throw new AppError(409, ERROR_CODES.STOCK_HISTORY_EXISTS);
    }

    await prisma.$transaction(async (tx) => {
      await catalogRepository.deleteProduct(id, tx);

      if (actorId) {
        await auditRepository.createAuditLog(
          {
            actorId,
            action: AUDIT_ACTIONS.PRODUCT_DELETED,
            targetType: 'Product',
            targetId: id,
            payload: { name: product.name, slug: product.slug },
          },
          tx,
        );
      }
    });

    if (product.images && product.images.length > 0) {
      const keys = product.images
        .map((img) => s3Service.extractKeyFromUrl(img.url))
        .filter((k): k is string => Boolean(k));
      await s3Service.cleanupObjects(keys);
    }
  },

  // ==================== Variants ====================

  async createVariant(dto: CreateVariantDto, actorId?: string) {
    const product = await catalogRepository.findProductById(dto.productId);
    if (!product) {
      throw new AppError(404, ERROR_CODES.PRODUCT_NOT_FOUND);
    }

    const existingSku = await catalogRepository.findVariantBySku(dto.sku);
    if (existingSku) {
      throw new AppError(409, ERROR_CODES.PRODUCT_SKU_EXISTS);
    }

    return handlePrismaUnique(async () => {
      return prisma.$transaction(async (tx) => {
        const variant = await catalogRepository.createVariant(
          {
            productId: dto.productId,
            sku: dto.sku,
            name: dto.name,
            price: dto.price,
            compareAtPrice: dto.compareAtPrice ?? null,
            options: dto.options as Prisma.InputJsonValue | undefined,
            isActive: dto.isActive ?? true,
          },
          tx,
        );

        if (actorId) {
          await auditRepository.createAuditLog(
            {
              actorId,
              action: AUDIT_ACTIONS.VARIANT_CREATED,
              targetType: 'ProductVariant',
              targetId: variant.id,
              payload: { productId: dto.productId, sku: variant.sku, name: variant.name },
            },
            tx,
          );
        }

        return formatCatalogResponse(variant);
      });
    }, { sku: ERROR_CODES.PRODUCT_SKU_EXISTS });
  },

  async updateVariant(id: string, dto: UpdateVariantDto, actorId?: string) {
    const existing = await catalogRepository.findVariantById(id);
    if (!existing) {
      throw new AppError(404, ERROR_CODES.VARIANT_NOT_FOUND);
    }

    if (dto.sku !== undefined && dto.sku !== existing.sku) {
      const checkSku = await catalogRepository.findVariantBySku(dto.sku);
      if (checkSku && checkSku.id !== id) {
        throw new AppError(409, ERROR_CODES.PRODUCT_SKU_EXISTS);
      }
    }

    return handlePrismaUnique(async () => {
      return prisma.$transaction(async (tx) => {
        const updated = await catalogRepository.updateVariant(
          id,
          {
            sku: dto.sku,
            name: dto.name,
            price: dto.price,
            compareAtPrice: dto.compareAtPrice,
            options: dto.options as Prisma.InputJsonValue | null | undefined,
            isActive: dto.isActive,
          },
          tx,
        );

        if (actorId) {
          await auditRepository.createAuditLog(
            {
              actorId,
              action: AUDIT_ACTIONS.VARIANT_UPDATED,
              targetType: 'ProductVariant',
              targetId: id,
              payload: { changes: formatCatalogResponse(dto) as Prisma.InputJsonValue },
            },
            tx,
          );
        }

        return formatCatalogResponse(updated);
      });
    }, { sku: ERROR_CODES.PRODUCT_SKU_EXISTS });
  },

  async deleteVariant(id: string, actorId?: string) {
    const variant = await catalogRepository.findVariantById(id);
    if (!variant) {
      throw new AppError(404, ERROR_CODES.VARIANT_NOT_FOUND);
    }

    if (await catalogRepository.variantHasStockHistory(id)) {
      throw new AppError(409, ERROR_CODES.STOCK_HISTORY_EXISTS);
    }

    await prisma.$transaction(async (tx) => {
      await catalogRepository.deleteVariant(id, tx);

      if (actorId) {
        await auditRepository.createAuditLog(
          {
            actorId,
            action: AUDIT_ACTIONS.VARIANT_DELETED,
            targetType: 'ProductVariant',
            targetId: id,
            payload: { productId: variant.productId, sku: variant.sku },
          },
          tx,
        );
      }
    });
  },

  // ==================== Images ====================

  async createImage(dto: CreateProductImageDto, actorId?: string) {
    const product = await catalogRepository.findProductById(dto.productId);
    if (!product) {
      throw new AppError(404, ERROR_CODES.PRODUCT_NOT_FOUND);
    }

    const promotedImage = await promoteCatalogImage(
      dto.url,
      UPLOAD_PURPOSES.PRODUCT_IMAGE,
      actorId,
    );

    try {
      const image = await prisma.$transaction(async (tx) => {
        if (dto.isThumbnail) {
          await tx.productImage.updateMany({
            where: { productId: dto.productId, isThumbnail: true },
            data: { isThumbnail: false },
          });
        }

        const created = await catalogRepository.createImage(
          {
            productId: dto.productId,
            url: promotedImage.fileUrl,
            isThumbnail: dto.isThumbnail ?? false,
            displayOrder: dto.displayOrder ?? 0,
            altText: dto.altText ?? null,
          },
          tx,
        );

        return formatCatalogResponse(created);
      });

      await s3Service.cleanupObjects([promotedImage.tempKey]);
      return image;
    } catch (error) {
      await s3Service.cleanupObjects([promotedImage.fileKey]);
      throw error;
    }
  },

  async deleteImage(id: string) {
    const image = await catalogRepository.findImageById(id);
    if (!image) {
      throw new AppError(404, ERROR_CODES.PRODUCT_IMAGE_NOT_FOUND);
    }

    await catalogRepository.deleteImage(id);

    if (image.url) {
      const key = s3Service.extractKeyFromUrl(image.url);
      if (key) await s3Service.cleanupObjects([key]);
    }
  },

  // ==================== Specifications ====================

  async createSpec(dto: CreateProductSpecDto) {
    const product = await catalogRepository.findProductById(dto.productId);
    if (!product) {
      throw new AppError(404, ERROR_CODES.PRODUCT_NOT_FOUND);
    }

    const spec = await catalogRepository.createSpec({
      productId: dto.productId,
      name: dto.name,
      value: dto.value,
      displayOrder: dto.displayOrder ?? 0,
    });

    return formatCatalogResponse(spec);
  },

  async deleteSpec(id: string) {
    const spec = await catalogRepository.findSpecById(id);
    if (!spec) {
      throw new AppError(404, ERROR_CODES.SPECIFICATION_NOT_FOUND);
    }

    await catalogRepository.deleteSpec(id);
  },
};
