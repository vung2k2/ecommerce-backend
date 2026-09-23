-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "delivered_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "orders_delivered_at_idx" ON "orders"("delivered_at");
