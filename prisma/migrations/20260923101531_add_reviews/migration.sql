-- CreateTable
CREATE TABLE "reviews" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "product_id" UUID NOT NULL,
    "order_item_id" UUID NOT NULL,
    "rating" SMALLINT NOT NULL,
    "comment" TEXT,
    "is_visible" BOOLEAN NOT NULL DEFAULT true,
    "moderation_reason" VARCHAR(255),
    "moderated_by_id" UUID,
    "moderated_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "reviews_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "reviews_order_item_id_key" ON "reviews"("order_item_id");

-- CreateIndex
CREATE INDEX "reviews_product_id_is_visible_idx" ON "reviews"("product_id", "is_visible");

-- CreateIndex
CREATE INDEX "reviews_user_id_idx" ON "reviews"("user_id");

-- CreateIndex
CREATE INDEX "reviews_order_item_id_idx" ON "reviews"("order_item_id");

-- CreateIndex
CREATE INDEX "reviews_created_at_idx" ON "reviews"("created_at");

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_product_id_fkey" FOREIGN KEY ("product_id") REFERENCES "products"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_order_item_id_fkey" FOREIGN KEY ("order_item_id") REFERENCES "order_items"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "reviews" ADD CONSTRAINT "reviews_moderated_by_id_fkey" FOREIGN KEY ("moderated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
