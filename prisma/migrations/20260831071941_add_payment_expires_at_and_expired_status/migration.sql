-- AlterEnum
ALTER TYPE "PaymentTransactionStatus" ADD VALUE 'EXPIRED';

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "payment_expires_at" TIMESTAMPTZ(3);

-- CreateIndex
CREATE INDEX "orders_payment_expires_at_idx" ON "orders"("payment_expires_at");
