-- CreateTable: energy supplier prices (scraped daily from EnergizeCT)
CREATE TABLE "energy_prices" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "supplier" TEXT NOT NULL,
    "rate" REAL NOT NULL,
    "monthly_cost" REAL NOT NULL,
    "savings" REAL,
    "plan" TEXT NOT NULL DEFAULT '',
    "billing_cycles" INTEGER,
    "recs" REAL,
    "phone" TEXT NOT NULL DEFAULT '',
    "is_active" BOOLEAN NOT NULL DEFAULT true,
    "fetched_at" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- CreateIndex
CREATE INDEX "energy_prices_is_active_idx" ON "energy_prices"("is_active");
CREATE INDEX "energy_prices_fetched_at_idx" ON "energy_prices"("fetched_at");
