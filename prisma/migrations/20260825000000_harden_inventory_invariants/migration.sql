-- Backfill a zero-balance inventory for variants that predate inventory lifecycle integration.
-- A deterministic UUID avoids requiring a database UUID extension.
INSERT INTO "inventories" ("id", "variant_id", "on_hand", "reserved", "created_at", "updated_at")
SELECT md5("id"::text || ':inventory')::uuid, "id", 0, 0, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "product_variants"
ON CONFLICT ("variant_id") DO NOTHING;

-- A stock ledger is audit data and must prevent deletion of its parent inventory.
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_inventory_id_fkey";
ALTER TABLE "stock_movements"
ADD CONSTRAINT "stock_movements_inventory_id_fkey"
FOREIGN KEY ("inventory_id") REFERENCES "inventories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Prevent the same business event from mutating one inventory more than once.
-- PostgreSQL permits multiple NULL values, so manual movements remain unrestricted.
DROP INDEX "stock_movements_reference_type_reference_id_idx";
CREATE UNIQUE INDEX "stock_movements_inventory_id_type_reference_type_reference_id_key"
ON "stock_movements"("inventory_id", "type", "reference_type", "reference_id");

ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_balance_check" CHECK (
    "balance_after_on_hand" >= 0
    AND "balance_after_reserved" >= 0
    AND "balance_after_on_hand" >= "balance_after_reserved"
);
