-- AlterEnum
ALTER TYPE "PaymentMethod" ADD VALUE 'STRIPE';

-- AlterTable
ALTER TABLE "payment_transactions" ALTER COLUMN "payment_method" SET DEFAULT 'STRIPE';
