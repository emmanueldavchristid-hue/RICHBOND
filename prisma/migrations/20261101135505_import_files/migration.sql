-- CreateEnum
CREATE TYPE "ImportMode" AS ENUM ('MARITIME', 'AERIEN', 'ROUTIER');

-- CreateEnum
CREATE TYPE "ImportFileStatus" AS ENUM ('OUVERT', 'CLOTURE', 'ANNULE');

-- CreateEnum
CREATE TYPE "ImportMilestoneCode" AS ENUM ('PROFORMA_RECUE', 'PAIEMENT_OU_CREDOC', 'MARCHANDISE_PRETE', 'EMBARQUEMENT_ETD', 'ARRIVEE_PREVUE_ETA', 'ARRIVEE_PORT', 'DOCUMENTS_RECUS', 'DEDOUANEMENT', 'ENLEVEMENT', 'RECEPTION_MAGASIN');

-- CreateEnum
CREATE TYPE "AllocationKey" AS ENUM ('VALEUR', 'POIDS', 'VOLUME', 'QUANTITE');

-- CreateEnum
CREATE TYPE "ApproachCostStatus" AS ENUM ('ESTIME', 'REEL');

-- CreateEnum
CREATE TYPE "ImportDocumentType" AS ENUM ('FACTURE_COMMERCIALE', 'PACKING_LIST', 'CONNAISSEMENT_LTA', 'CERTIFICAT_ORIGINE', 'DECLARATION_DOUANE', 'AUTRE');

-- AlterEnum
ALTER TYPE "StockDocumentType" ADD VALUE 'DOSSIER_IMPORT';

-- AlterEnum
ALTER TYPE "StockMovementType" ADD VALUE 'REEVALUATION_COUT';

-- AlterTable
ALTER TABLE "purchase_order_lines" ADD COLUMN     "unit_volume_m3" DECIMAL(14,4),
ADD COLUMN     "unit_weight_kg" DECIMAL(14,4);

-- AlterTable
ALTER TABLE "receipt_lines" ADD COLUMN     "landed_unit_cost_xof" DECIMAL(14,4);

-- CreateTable
CREATE TABLE "import_files" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ImportFileStatus" NOT NULL DEFAULT 'OUVERT',
    "supplier_id" TEXT NOT NULL,
    "incoterm" "Incoterm",
    "incoterm_place" TEXT,
    "mode" "ImportMode" NOT NULL,
    "loading_port" TEXT,
    "transitaire" TEXT,
    "bl_number" TEXT,
    "container_number" TEXT,
    "customs_declaration" TEXT,
    "customs_regime" TEXT,
    "notes" TEXT,
    "coefficient" DECIMAL(8,4),
    "closing_sheet" JSONB,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,
    "closed_at" TIMESTAMP(3),
    "closed_by_id" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "cancelled_reason" TEXT,

    CONSTRAINT "import_files_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_file_orders" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,

    CONSTRAINT "import_file_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_milestones" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "code" "ImportMilestoneCode" NOT NULL,
    "planned_date" DATE,
    "actual_date" DATE,
    "note" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "import_milestones_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "import_documents" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "type" "ImportDocumentType" NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "import_documents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approach_cost_types" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "default_key" "AllocationKey" NOT NULL DEFAULT 'VALEUR',
    "vat_recoverable_default" BOOLEAN NOT NULL DEFAULT false,
    "sort_order" INTEGER NOT NULL DEFAULT 0,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approach_cost_types_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approach_costs" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "type_id" TEXT NOT NULL,
    "status" "ApproachCostStatus" NOT NULL DEFAULT 'ESTIME',
    "amount" DECIMAL(16,2) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "rate" DECIMAL(14,6) NOT NULL,
    "amount_xof" INTEGER NOT NULL,
    "vat_recoverable" BOOLEAN NOT NULL DEFAULT false,
    "allocation_key" "AllocationKey" NOT NULL DEFAULT 'VALEUR',
    "payee" TEXT,
    "auto_estimate" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approach_costs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approach_coefficient_defaults" (
    "id" TEXT NOT NULL,
    "mode" "ImportMode" NOT NULL,
    "type_id" TEXT NOT NULL,
    "pct_of_value" DECIMAL(6,2) NOT NULL,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approach_coefficient_defaults_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approach_cost_adjustments" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "cost_id" TEXT,
    "user_id" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "before" JSONB,
    "after" JSONB,
    "reason" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "approach_cost_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "approach_coefficient_history" (
    "id" TEXT NOT NULL,
    "file_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "origin" TEXT NOT NULL,
    "mode" "ImportMode" NOT NULL,
    "coefficient" DECIMAL(8,4) NOT NULL,
    "goods_value_xof" INTEGER NOT NULL,
    "costs_xof" INTEGER NOT NULL,
    "closed_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "approach_coefficient_history_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "import_files_number_key" ON "import_files"("number");

-- CreateIndex
CREATE INDEX "import_files_status_created_at_idx" ON "import_files"("status", "created_at");

-- CreateIndex
CREATE INDEX "import_files_supplier_id_idx" ON "import_files"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_file_orders_order_id_key" ON "import_file_orders"("order_id");

-- CreateIndex
CREATE INDEX "import_file_orders_file_id_idx" ON "import_file_orders"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "import_milestones_file_id_code_key" ON "import_milestones"("file_id", "code");

-- CreateIndex
CREATE INDEX "import_documents_file_id_idx" ON "import_documents"("file_id");

-- CreateIndex
CREATE UNIQUE INDEX "approach_cost_types_code_key" ON "approach_cost_types"("code");

-- CreateIndex
CREATE INDEX "approach_costs_file_id_idx" ON "approach_costs"("file_id");

-- CreateIndex
CREATE INDEX "approach_costs_type_id_idx" ON "approach_costs"("type_id");

-- CreateIndex
CREATE UNIQUE INDEX "approach_coefficient_defaults_mode_type_id_key" ON "approach_coefficient_defaults"("mode", "type_id");

-- CreateIndex
CREATE INDEX "approach_cost_adjustments_file_id_created_at_idx" ON "approach_cost_adjustments"("file_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "approach_coefficient_history_file_id_key" ON "approach_coefficient_history"("file_id");

-- CreateIndex
CREATE INDEX "approach_coefficient_history_supplier_id_closed_at_idx" ON "approach_coefficient_history"("supplier_id", "closed_at");

-- CreateIndex
CREATE INDEX "approach_coefficient_history_origin_mode_idx" ON "approach_coefficient_history"("origin", "mode");

-- AddForeignKey
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_files" ADD CONSTRAINT "import_files_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_file_orders" ADD CONSTRAINT "import_file_orders_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "import_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_file_orders" ADD CONSTRAINT "import_file_orders_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_milestones" ADD CONSTRAINT "import_milestones_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "import_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "import_documents" ADD CONSTRAINT "import_documents_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "import_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approach_costs" ADD CONSTRAINT "approach_costs_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "import_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approach_costs" ADD CONSTRAINT "approach_costs_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "approach_cost_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approach_costs" ADD CONSTRAINT "approach_costs_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approach_coefficient_defaults" ADD CONSTRAINT "approach_coefficient_defaults_type_id_fkey" FOREIGN KEY ("type_id") REFERENCES "approach_cost_types"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approach_cost_adjustments" ADD CONSTRAINT "approach_cost_adjustments_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "import_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "approach_coefficient_history" ADD CONSTRAINT "approach_coefficient_history_file_id_fkey" FOREIGN KEY ("file_id") REFERENCES "import_files"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- LOT-12 : le mouvement de réévaluation de coût a une quantité nulle (valeur seule) ; les autres restent non nuls.
-- Comparaison via ::text : une valeur d'enum ajoutée dans la même transaction ne peut pas être utilisée directement.
ALTER TABLE "stock_movements" DROP CONSTRAINT "stock_movements_stock_after_chk";
ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_stock_after_chk" CHECK ("stock_after" >= 0 AND ("quantity" <> 0 OR "type"::text = 'REEVALUATION_COUT'));

ALTER TABLE "approach_costs" ADD CONSTRAINT "approach_costs_amount_chk" CHECK ("amount" >= 0 AND "amount_xof" >= 0 AND "rate" > 0);
ALTER TABLE "approach_coefficient_defaults" ADD CONSTRAINT "approach_coefficient_defaults_pct_chk" CHECK ("pct_of_value" >= 0);
