-- CreateEnum
CREATE TYPE "DiscountType" AS ENUM ('PERCENTAGE', 'FIXED_AMOUNT');

-- CreateTable
CREATE TABLE "carts" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "carts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cart_items" (
    "id" UUID NOT NULL,
    "cart_id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "cart_items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupons" (
    "id" UUID NOT NULL,
    "code" VARCHAR(50) NOT NULL,
    "description" TEXT,
    "discount_type" "DiscountType" NOT NULL,
    "discount_value" BIGINT NOT NULL,
    "max_discount_amount" BIGINT,
    "min_order_amount" BIGINT NOT NULL DEFAULT 0,
    "usage_limit" INTEGER,
    "used_count" INTEGER NOT NULL DEFAULT 0,
    "usage_limit_per_user" INTEGER DEFAULT 1,
    "start_date" TIMESTAMPTZ(3) NOT NULL,
    "end_date" TIMESTAMPTZ(3) NOT NULL,
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "coupons_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "coupon_usages" (
    "id" UUID NOT NULL,
    "coupon_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "order_id" UUID,
    "discount_amount" BIGINT NOT NULL,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "coupon_usages_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "carts_user_id_key" ON "carts"("user_id");

-- CreateIndex
CREATE INDEX "cart_items_cart_id_idx" ON "cart_items"("cart_id");

-- CreateIndex
CREATE INDEX "cart_items_variant_id_idx" ON "cart_items"("variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "cart_items_cart_id_variant_id_key" ON "cart_items"("cart_id", "variant_id");

-- CreateIndex
CREATE UNIQUE INDEX "coupons_code_key" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_code_idx" ON "coupons"("code");

-- CreateIndex
CREATE INDEX "coupons_is_active_idx" ON "coupons"("is_active");

-- CreateIndex
CREATE INDEX "coupon_usages_coupon_id_user_id_idx" ON "coupon_usages"("coupon_id", "user_id");

-- CreateIndex
CREATE INDEX "coupon_usages_user_id_idx" ON "coupon_usages"("user_id");

-- AddForeignKey
ALTER TABLE "carts" ADD CONSTRAINT "carts_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_cart_id_fkey" FOREIGN KEY ("cart_id") REFERENCES "carts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_coupon_id_fkey" FOREIGN KEY ("coupon_id") REFERENCES "coupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Check Constraints
ALTER TABLE "cart_items" ADD CONSTRAINT "cart_items_quantity_check" CHECK ("quantity" > 0);

ALTER TABLE "coupon_usages" ADD CONSTRAINT "coupon_usages_discount_amount_check" CHECK ("discount_amount" >= 0);

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_usage_limit_check" CHECK ("usage_limit" IS NULL OR "used_count" <= "usage_limit");

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_used_count_check" CHECK ("used_count" >= 0);

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_dates_check" CHECK ("start_date" <= "end_date");

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_min_order_amount_check" CHECK ("min_order_amount" >= 0);

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_positive_limits_check" CHECK (
    ("usage_limit" IS NULL OR "usage_limit" > 0)
    AND ("usage_limit_per_user" IS NULL OR "usage_limit_per_user" > 0)
    AND ("max_discount_amount" IS NULL OR "max_discount_amount" > 0)
);

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_discount_value_check" CHECK (
    ("discount_type" = 'PERCENTAGE' AND "discount_value" >= 1 AND "discount_value" <= 100)
    OR ("discount_type" = 'FIXED_AMOUNT' AND "discount_value" > 0)
);

ALTER TABLE "coupons" ADD CONSTRAINT "coupons_fixed_max_discount_check" CHECK (
    ("discount_type" = 'FIXED_AMOUNT' AND "max_discount_amount" IS NULL)
    OR "discount_type" = 'PERCENTAGE'
);
