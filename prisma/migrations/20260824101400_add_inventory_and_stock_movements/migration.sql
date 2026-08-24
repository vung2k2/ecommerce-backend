-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('RESTOCK', 'ADJUSTMENT', 'RESERVE', 'COMMIT', 'RELEASE');

-- CreateTable
CREATE TABLE "inventories" (
    "id" UUID NOT NULL,
    "variant_id" UUID NOT NULL,
    "on_hand" INTEGER NOT NULL DEFAULT 0,
    "reserved" INTEGER NOT NULL DEFAULT 0,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "inventories_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" UUID NOT NULL,
    "inventory_id" UUID NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "on_hand_change" INTEGER NOT NULL DEFAULT 0,
    "reserved_change" INTEGER NOT NULL DEFAULT 0,
    "balance_after_on_hand" INTEGER NOT NULL,
    "balance_after_reserved" INTEGER NOT NULL,
    "reason" VARCHAR(255),
    "reference_type" VARCHAR(50),
    "reference_id" VARCHAR(255),
    "actor_id" UUID,
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventories_variant_id_key" ON "inventories"("variant_id");

-- CreateIndex
CREATE INDEX "stock_movements_inventory_id_idx" ON "stock_movements"("inventory_id");

-- CreateIndex
CREATE INDEX "stock_movements_actor_id_idx" ON "stock_movements"("actor_id");

-- CreateIndex
CREATE INDEX "stock_movements_reference_type_reference_id_idx" ON "stock_movements"("reference_type", "reference_id");

-- AddForeignKey
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_variant_id_fkey" FOREIGN KEY ("variant_id") REFERENCES "product_variants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_inventory_id_fkey" FOREIGN KEY ("inventory_id") REFERENCES "inventories"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_actor_id_fkey" FOREIGN KEY ("actor_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddCheckConstraint
ALTER TABLE "inventories" ADD CONSTRAINT "inventories_stock_check" CHECK ("on_hand" >= 0 AND "reserved" >= 0 AND "on_hand" >= "reserved");
