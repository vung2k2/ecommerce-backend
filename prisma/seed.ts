import bcrypt from 'bcrypt';
import { prisma } from '../src/database/prisma.js';

async function main() {
  const adminEmail = process.env.ADMIN_EMAIL || 'admin@ecommerce.test';
  const adminPassword = process.env.ADMIN_PASSWORD || 'Admin@123456';
  const adminFullName = process.env.ADMIN_FULLNAME || 'System Administrator';

  // 1. Seed Admin Account
  const existingAdmin = await prisma.user.findUnique({
    where: { email: adminEmail },
  });

  if (!existingAdmin) {
    const passwordHash = await bcrypt.hash(adminPassword, 12);
    const admin = await prisma.user.create({
      data: {
        email: adminEmail,
        fullName: adminFullName,
        passwordHash,
        role: 'ADMIN',
        isActive: true,
      },
    });
    console.log(`✅ Admin seeded: ${admin.email}`);
  }

  // 2. Seed Categories (Cây danh mục)
  const existingCat = await prisma.category.findUnique({ where: { slug: 'may-tinh-laptop' } });
  if (!existingCat) {
    const rootComputers = await prisma.category.create({
      data: {
        name: 'Máy tính & Laptop',
        slug: 'may-tinh-laptop',
        description: 'Tất cả các dòng máy tính, laptop và phụ kiện',
      },
    });

    const subLaptop = await prisma.category.create({
      data: {
        name: 'Laptop',
        slug: 'laptop',
        description: 'Máy tính xách tay văn phòng và cao cấp',
        parentId: rootComputers.id,
      },
    });

    await prisma.category.create({
      data: {
        name: 'Laptop Gaming',
        slug: 'laptop-gaming',
        description: 'Laptop cấu hình cao dành cho game thủ',
        parentId: subLaptop.id,
      },
    });

    await prisma.category.create({
      data: {
        name: 'Điện thoại & Tablet',
        slug: 'dien-thoai-tablet',
        description: 'Điện thoại thông minh và máy tính bảng',
      },
    });

    await prisma.category.create({
      data: {
        name: 'Tai nghe & Âm thanh',
        slug: 'tai-nghe-am-thanh',
        description: 'Tai nghe Bluetooth, loa di động cao cấp',
      },
    });

    console.log('✅ Categories hierarchy seeded');
  }

  // 3. Seed Brands
  const existingBrand = await prisma.brand.findUnique({ where: { slug: 'apple' } });
  if (!existingBrand) {
    await prisma.brand.createMany({
      data: [
        { name: 'Apple', slug: 'apple', description: 'Apple Inc. Cupertino, California', logoUrl: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9' },
        { name: 'Dell', slug: 'dell', description: 'Dell Technologies', logoUrl: 'https://images.unsplash.com/photo-1593642632823-8f785ba67e45' },
        { name: 'Sony', slug: 'sony', description: 'Sony Electronics Japan', logoUrl: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e' },
        { name: 'Asus', slug: 'asus', description: 'Asus ROG Gaming & ZenBook', logoUrl: 'https://images.unsplash.com/photo-1588872657578-7efd1f1555ed' },
      ],
    });
    console.log('✅ Brands seeded');
  }

  // 4. Seed Products
  const existingProduct = await prisma.product.findUnique({ where: { slug: 'macbook-pro-14-m3-pro' } });
  if (!existingProduct) {
    const laptopCat = await prisma.category.findUnique({ where: { slug: 'laptop' } });
    const phoneCat = await prisma.category.findUnique({ where: { slug: 'dien-thoai-tablet' } });
    const audioCat = await prisma.category.findUnique({ where: { slug: 'tai-nghe-am-thanh' } });

    const appleBrand = await prisma.brand.findUnique({ where: { slug: 'apple' } });
    const sonyBrand = await prisma.brand.findUnique({ where: { slug: 'sony' } });

    if (laptopCat && appleBrand) {
      await prisma.product.create({
        data: {
          name: 'MacBook Pro 14 inch M3 Pro',
          slug: 'macbook-pro-14-m3-pro',
          description: 'MacBook Pro 14 inch với chip M3 Pro mang lại hiệu năng đỉnh cao và thời lượng pin vượt trội.',
          status: 'ACTIVE',
          categoryId: laptopCat.id,
          brandId: appleBrand.id,
          images: {
            create: [
              {
                url: 'https://images.unsplash.com/photo-1517336714731-489689fd1ca8',
                isThumbnail: true,
                displayOrder: 0,
                altText: 'MacBook Pro 14 M3 Pro Space Black',
              },
              {
                url: 'https://images.unsplash.com/photo-1611186871348-b1ce696e52c9',
                isThumbnail: false,
                displayOrder: 1,
                altText: 'MacBook Pro M3 Pro góc nghiêng',
              },
            ],
          },
          specifications: {
            create: [
              { name: 'CPU', value: 'Apple M3 Pro (11-core CPU, 14-core GPU)', displayOrder: 0 },
              { name: 'Màn hình', value: '14.2 inch Liquid Retina XDR, 120Hz ProMotion', displayOrder: 1 },
              { name: 'Pin', value: '70Wh, sạc nhanh 70W USB-C', displayOrder: 2 },
              { name: 'Trọng lượng', value: '1.61 kg', displayOrder: 3 },
            ],
          },
          variants: {
            create: [
              {
                sku: 'MBP14-M3-18-512-GRAY',
                name: '18GB RAM / 512GB SSD / Space Gray',
                price: 49990000n,
                compareAtPrice: 52990000n,
                options: { color: 'Space Gray', ram: '18GB', storage: '512GB' },
                isActive: true,
              },
              {
                sku: 'MBP14-M3-36-1TB-SILVER',
                name: '36GB RAM / 1TB SSD / Silver',
                price: 64990000n,
                compareAtPrice: 68990000n,
                options: { color: 'Silver', ram: '36GB', storage: '1TB' },
                isActive: true,
              },
            ],
          },
        },
      });
    }

    if (phoneCat && appleBrand) {
      await prisma.product.create({
        data: {
          name: 'iPhone 15 Pro Max',
          slug: 'iphone-15-pro-max',
          description: 'iPhone 15 Pro Max khung Titan chuẩn hàng không vũ trụ, chip A17 Pro mạnh mẽ và nút Action đa năng.',
          status: 'ACTIVE',
          categoryId: phoneCat.id,
          brandId: appleBrand.id,
          images: {
            create: [
              {
                url: 'https://images.unsplash.com/photo-1695048133142-1a20484d2569',
                isThumbnail: true,
                displayOrder: 0,
                altText: 'iPhone 15 Pro Max Natural Titanium',
              },
            ],
          },
          specifications: {
            create: [
              { name: 'Chip', value: 'Apple A17 Pro (3nm)', displayOrder: 0 },
              { name: 'Màn hình', value: '6.7 inch Super Retina XDR OLED, 120Hz', displayOrder: 1 },
              { name: 'Camera', value: 'Chính 48MP + Tele 5x 12MP + Góc siêu rộng 12MP', displayOrder: 2 },
            ],
          },
          variants: {
            create: [
              {
                sku: 'IP15PM-256GB-NATURAL',
                name: '256GB / Titan Tự Nhiên',
                price: 29990000n,
                compareAtPrice: 34990000n,
                options: { color: 'Natural Titanium', storage: '256GB' },
                isActive: true,
              },
            ],
          },
        },
      });
    }

    if (audioCat && sonyBrand) {
      await prisma.product.create({
        data: {
          name: 'Sony WH-1000XM5',
          slug: 'sony-wh-1000xm5',
          description: 'Tai nghe chống ồn đỉnh cao hàng đầu thế giới với bộ xử lý V1 và QN1 kép.',
          status: 'ACTIVE',
          categoryId: audioCat.id,
          brandId: sonyBrand.id,
          images: {
            create: [
              {
                url: 'https://images.unsplash.com/photo-1505740420928-5e560c06d30e',
                isThumbnail: true,
                displayOrder: 0,
                altText: 'Sony WH-1000XM5 Black',
              },
            ],
          },
          specifications: {
            create: [
              { name: 'Chống ồn', value: 'Active Noise Cancelling kép V1 + QN1', displayOrder: 0 },
              { name: 'Thời lượng pin', value: '30 giờ (bật ANC), 40 giờ (tắt ANC)', displayOrder: 1 },
              { name: 'Kết nối', value: 'Bluetooth 5.2, LDAC, Jack 3.5mm', displayOrder: 2 },
            ],
          },
          variants: {
            create: [
              {
                sku: 'SONY-XM5-BLACK',
                name: 'Màu Đen',
                price: 7990000n,
                compareAtPrice: 8990000n,
                options: { color: 'Black' },
                isActive: true,
              },
            ],
          },
        },
      });
    }

    console.log('✅ Realistic electronic products seeded');
  }
}

main()
  .catch((e) => {
    console.error('Failed to seed database:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
