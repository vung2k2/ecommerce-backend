-- CreateIndex: Ensure each user can have at most one default address
CREATE UNIQUE INDEX "unique_user_default_address" ON "addresses"("user_id") WHERE "is_default" = true;
