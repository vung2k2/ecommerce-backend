-- Remove rows that cannot satisfy the new user foreign key.
DELETE FROM "refresh_tokens" AS "rt"
WHERE NOT EXISTS (
    SELECT 1 FROM "users" AS "u" WHERE "u"."id" = "rt"."user_id"
);

-- Older application versions could create duplicate hashes during rotation.
-- Invalidate only affected token families before enforcing uniqueness.
DELETE FROM "refresh_tokens"
WHERE "family_id" IN (
    SELECT DISTINCT "affected"."family_id"
    FROM "refresh_tokens" AS "affected"
    INNER JOIN (
        SELECT "token_hash"
        FROM "refresh_tokens"
        GROUP BY "token_hash"
        HAVING COUNT(*) > 1
    ) AS "duplicates" ON "duplicates"."token_hash" = "affected"."token_hash"
);

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_token_hash_key" ON "refresh_tokens"("token_hash");

-- CreateIndex
CREATE INDEX "refresh_tokens_user_id_idx" ON "refresh_tokens"("user_id");

-- CreateIndex
CREATE INDEX "refresh_tokens_family_id_idx" ON "refresh_tokens"("family_id");

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
