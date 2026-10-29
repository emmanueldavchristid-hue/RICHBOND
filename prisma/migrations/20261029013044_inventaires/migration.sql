-- CreateEnum
CREATE TYPE "InventoryCountStatus" AS ENUM ('PREPARE', 'EN_COMPTAGE', 'A_VALIDER', 'VALIDE', 'ANNULE');

-- CreateEnum
CREATE TYPE "InventoryCountKind" AS ENUM ('TOURNANT', 'COMPLET');

-- CreateTable
CREATE TABLE "inventory_counts" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "InventoryCountStatus" NOT NULL DEFAULT 'PREPARE',
    "kind" "InventoryCountKind" NOT NULL DEFAULT 'TOURNANT',
    "warehouse_id" TEXT NOT NULL,
    "planned_for" DATE,
    "threshold_pct" DECIMAL(5,2) NOT NULL,
    "threshold_value" INTEGER NOT NULL,
    "comment" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "opened_at" TIMESTAMP(3),
    "opened_by_id" TEXT,
    "submitted_at" TIMESTAMP(3),
    "submitted_by_id" TEXT,
    "validated_at" TIMESTAMP(3),
    "validated_by_id" TEXT,
    "reliability_pct" DECIMAL(5,2),
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "cancelled_reason" TEXT,

    CONSTRAINT "inventory_counts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "inventory_count_lines" (
    "id" TEXT NOT NULL,
    "count_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "selection_reason" TEXT NOT NULL,
    "theoretical_qty" DECIMAL(14,3),
    "pmp" DECIMAL(14,4),
    "counted_qty" DECIMAL(14,3),
    "counted_by_id" TEXT,
    "counted_at" TIMESTAMP(3),
    "recount_qty" DECIMAL(14,3),
    "recount_by_id" TEXT,
    "recount_at" TIMESTAMP(3),
    "recount_required" BOOLEAN NOT NULL DEFAULT false,
    "variance_reason" TEXT,
    "moved_during_count" BOOLEAN NOT NULL DEFAULT false,
    "adjustment_movement_id" TEXT,

    CONSTRAINT "inventory_count_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "inventory_counts_number_key" ON "inventory_counts"("number");

-- CreateIndex
CREATE INDEX "inventory_counts_status_created_at_idx" ON "inventory_counts"("status", "created_at");

-- CreateIndex
CREATE INDEX "inventory_counts_warehouse_id_status_idx" ON "inventory_counts"("warehouse_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_lines_adjustment_movement_id_key" ON "inventory_count_lines"("adjustment_movement_id");

-- CreateIndex
CREATE INDEX "inventory_count_lines_item_id_idx" ON "inventory_count_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "inventory_count_lines_count_id_item_id_key" ON "inventory_count_lines"("count_id", "item_id");

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_counts" ADD CONSTRAINT "inventory_counts_validated_by_id_fkey" FOREIGN KEY ("validated_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_count_id_fkey" FOREIGN KEY ("count_id") REFERENCES "inventory_counts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "inventory_count_lines" ADD CONSTRAINT "inventory_count_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
