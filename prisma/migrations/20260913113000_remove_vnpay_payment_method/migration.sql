-- Update any existing records using VNPAY to STRIPE
UPDATE "orders" SET "payment_method" = 'STRIPE' WHERE "payment_method"::text = 'VNPAY';
UPDATE "payment_transactions" SET "payment_method" = 'STRIPE' WHERE "payment_method"::text = 'VNPAY';

-- AlterEnum
CREATE TYPE "PaymentMethod_new" AS ENUM ('COD', 'STRIPE');
ALTER TABLE "orders" ALTER COLUMN "payment_method" TYPE "PaymentMethod_new" USING ("payment_method"::text::"PaymentMethod_new");
ALTER TABLE "payment_transactions" ALTER COLUMN "payment_method" DROP DEFAULT;
ALTER TABLE "payment_transactions" ALTER COLUMN "payment_method" TYPE "PaymentMethod_new" USING ("payment_method"::text::"PaymentMethod_new");
ALTER TABLE "payment_transactions" ALTER COLUMN "payment_method" SET DEFAULT 'STRIPE'::"PaymentMethod_new";
DROP TYPE "PaymentMethod";
ALTER TYPE "PaymentMethod_new" RENAME TO "PaymentMethod";
