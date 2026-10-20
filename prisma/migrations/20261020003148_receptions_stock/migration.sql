-- CreateEnum
CREATE TYPE "ReceiptStatus" AS ENUM ('VALIDEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "RefusalReason" AS ENUM ('ABIME', 'NON_CONFORME', 'ERREUR_REFERENCE', 'HORS_DELAI', 'AUTRE');

-- CreateEnum
CREATE TYPE "NonConformityDecision" AS ENUM ('RETOUR', 'AVOIR', 'REMPLACEMENT');

-- CreateEnum
CREATE TYPE "NonConformityStatus" AS ENUM ('OUVERTE', 'CLOTUREE');

-- CreateEnum
CREATE TYPE "SupplierReturnStatus" AS ENUM ('VALIDE', 'ANNULE');

-- CreateEnum
CREATE TYPE "StockMovementType" AS ENUM ('ENTREE_RECEPTION', 'SORTIE', 'RETOUR_FOURNISSEUR', 'TRANSFERT', 'AJUSTEMENT', 'AJUSTEMENT_INVENTAIRE');

-- CreateEnum
CREATE TYPE "StockDocumentType" AS ENUM ('RECEPTION', 'SORTIE', 'RETOUR', 'TRANSFERT', 'AJUSTEMENT', 'INVENTAIRE');

-- CreateEnum
CREATE TYPE "StockIssueStatus" AS ENUM ('VALIDEE', 'ANNULEE');

-- AlterTable
ALTER TABLE "items" ADD COLUMN     "abc_computed_at" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "purchase_order_lines" ADD COLUMN     "closed_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
ADD COLUMN     "closed_reason" TEXT;

-- CreateTable
CREATE TABLE "receipts" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "ReceiptStatus" NOT NULL DEFAULT 'VALIDEE',
    "order_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "delivery_note_ref" TEXT NOT NULL,
    "received_at" DATE NOT NULL,
    "carrier" TEXT,
    "comment" TEXT,
    "reference_date" DATE NOT NULL,
    "days_late" INTEGER NOT NULL DEFAULT 0,
    "in_full" BOOLEAN NOT NULL DEFAULT false,
    "over_delivery_approved_by_id" TEXT,
    "over_delivery_reason" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "cancelled_reason" TEXT,

    CONSTRAINT "receipts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "receipt_lines" (
    "id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "item_id" TEXT,
    "delivered_qty" DECIMAL(14,3) NOT NULL,
    "accepted_qty" DECIMAL(14,3) NOT NULL,
    "refused_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "accepted_stock_qty" DECIMAL(14,3) NOT NULL,
    "refusal_reason" "RefusalReason",
    "lot_number" TEXT,
    "unit_cost_xof" DECIMAL(14,4) NOT NULL,

    CONSTRAINT "receipt_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "non_conformities" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "receipt_id" TEXT NOT NULL,
    "receipt_line_id" TEXT NOT NULL,
    "item_id" TEXT,
    "qty" DECIMAL(14,3) NOT NULL,
    "reason" "RefusalReason" NOT NULL,
    "decision" "NonConformityDecision",
    "status" "NonConformityStatus" NOT NULL DEFAULT 'OUVERTE',
    "comment" TEXT,
    "decided_by_id" TEXT,
    "decided_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "non_conformities_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_returns" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "SupplierReturnStatus" NOT NULL DEFAULT 'VALIDE',
    "supplier_id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "returned_at" DATE NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "supplier_returns_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_return_lines" (
    "id" TEXT NOT NULL,
    "return_id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "supplier_return_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_levels" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "pmp" DECIMAL(14,4) NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_levels_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_movements" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "warehouse_id" TEXT NOT NULL,
    "type" "StockMovementType" NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "value" INTEGER NOT NULL,
    "pmp_before" DECIMAL(14,4) NOT NULL,
    "pmp_after" DECIMAL(14,4) NOT NULL,
    "stock_after" DECIMAL(14,3) NOT NULL,
    "document_type" "StockDocumentType" NOT NULL,
    "document_id" TEXT,
    "document_ref" TEXT NOT NULL,
    "receipt_line_id" TEXT,
    "issue_line_id" TEXT,
    "reversal_of_id" TEXT,
    "comment" TEXT,
    "occurred_at" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "stock_movements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_issues" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "status" "StockIssueStatus" NOT NULL DEFAULT 'VALIDEE',
    "warehouse_id" TEXT NOT NULL,
    "department_id" TEXT NOT NULL,
    "requester_name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "equipment" TEXT,
    "issued_at" DATE NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "cancelled_reason" TEXT,

    CONSTRAINT "stock_issues_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "stock_issue_lines" (
    "id" TEXT NOT NULL,
    "issue_id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_cost" DECIMAL(14,4) NOT NULL,
    "value" INTEGER NOT NULL,

    CONSTRAINT "stock_issue_lines_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "receipts_number_key" ON "receipts"("number");

-- CreateIndex
CREATE INDEX "receipts_order_id_idx" ON "receipts"("order_id");

-- CreateIndex
CREATE INDEX "receipts_received_at_idx" ON "receipts"("received_at");

-- CreateIndex
CREATE INDEX "receipts_supplier_id_received_at_idx" ON "receipts"("supplier_id", "received_at");

-- CreateIndex
CREATE INDEX "receipt_lines_receipt_id_idx" ON "receipt_lines"("receipt_id");

-- CreateIndex
CREATE INDEX "receipt_lines_order_line_id_idx" ON "receipt_lines"("order_line_id");

-- CreateIndex
CREATE INDEX "receipt_lines_item_id_idx" ON "receipt_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "non_conformities_number_key" ON "non_conformities"("number");

-- CreateIndex
CREATE INDEX "non_conformities_status_created_at_idx" ON "non_conformities"("status", "created_at");

-- CreateIndex
CREATE INDEX "non_conformities_supplier_id_created_at_idx" ON "non_conformities"("supplier_id", "created_at");

-- CreateIndex
CREATE INDEX "non_conformities_order_id_idx" ON "non_conformities"("order_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_returns_number_key" ON "supplier_returns"("number");

-- CreateIndex
CREATE INDEX "supplier_returns_order_id_idx" ON "supplier_returns"("order_id");

-- CreateIndex
CREATE INDEX "supplier_returns_supplier_id_returned_at_idx" ON "supplier_returns"("supplier_id", "returned_at");

-- CreateIndex
CREATE INDEX "supplier_return_lines_return_id_idx" ON "supplier_return_lines"("return_id");

-- CreateIndex
CREATE INDEX "stock_levels_warehouse_id_idx" ON "stock_levels"("warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_levels_item_id_warehouse_id_key" ON "stock_levels"("item_id", "warehouse_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_movements_reversal_of_id_key" ON "stock_movements"("reversal_of_id");

-- CreateIndex
CREATE INDEX "stock_movements_item_id_occurred_at_idx" ON "stock_movements"("item_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_warehouse_id_occurred_at_idx" ON "stock_movements"("warehouse_id", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_type_occurred_at_idx" ON "stock_movements"("type", "occurred_at");

-- CreateIndex
CREATE INDEX "stock_movements_document_type_document_id_idx" ON "stock_movements"("document_type", "document_id");

-- CreateIndex
CREATE UNIQUE INDEX "stock_issues_number_key" ON "stock_issues"("number");

-- CreateIndex
CREATE INDEX "stock_issues_issued_at_idx" ON "stock_issues"("issued_at");

-- CreateIndex
CREATE INDEX "stock_issues_department_id_issued_at_idx" ON "stock_issues"("department_id", "issued_at");

-- CreateIndex
CREATE INDEX "stock_issue_lines_issue_id_idx" ON "stock_issue_lines"("issue_id");

-- CreateIndex
CREATE INDEX "stock_issue_lines_item_id_idx" ON "stock_issue_lines"("item_id");

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipts" ADD CONSTRAINT "receipts_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "receipt_lines" ADD CONSTRAINT "receipt_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformities" ADD CONSTRAINT "non_conformities_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformities" ADD CONSTRAINT "non_conformities_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformities" ADD CONSTRAINT "non_conformities_receipt_id_fkey" FOREIGN KEY ("receipt_id") REFERENCES "receipts"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformities" ADD CONSTRAINT "non_conformities_receipt_line_id_fkey" FOREIGN KEY ("receipt_line_id") REFERENCES "receipt_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "non_conformities" ADD CONSTRAINT "non_conformities_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_returns" ADD CONSTRAINT "supplier_returns_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_return_id_fkey" FOREIGN KEY ("return_id") REFERENCES "supplier_returns"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_return_lines" ADD CONSTRAINT "supplier_return_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_levels" ADD CONSTRAINT "stock_levels_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_receipt_line_id_fkey" FOREIGN KEY ("receipt_line_id") REFERENCES "receipt_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_issue_line_id_fkey" FOREIGN KEY ("issue_line_id") REFERENCES "stock_issue_lines"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_movements" ADD CONSTRAINT "stock_movements_reversal_of_id_fkey" FOREIGN KEY ("reversal_of_id") REFERENCES "stock_movements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issues" ADD CONSTRAINT "stock_issues_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issues" ADD CONSTRAINT "stock_issues_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issues" ADD CONSTRAINT "stock_issues_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issue_lines" ADD CONSTRAINT "stock_issue_lines_issue_id_fkey" FOREIGN KEY ("issue_id") REFERENCES "stock_issues"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "stock_issue_lines" ADD CONSTRAINT "stock_issue_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Garde-fous métier (dernier rempart derrière les services)
ALTER TABLE "stock_levels"
  ADD CONSTRAINT "stock_levels_quantity_chk" CHECK ("quantity" >= 0 AND "pmp" >= 0);

ALTER TABLE "receipt_lines"
  ADD CONSTRAINT "receipt_lines_delivered_chk" CHECK (
    "delivered_qty" = "accepted_qty" + "refused_qty"
    AND "accepted_qty" >= 0 AND "refused_qty" >= 0 AND "delivered_qty" > 0 AND "accepted_stock_qty" >= 0
  );
ALTER TABLE "receipt_lines"
  ADD CONSTRAINT "receipt_lines_refusal_reason_chk" CHECK ("refused_qty" = 0 OR "refusal_reason" IS NOT NULL);

ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "purchase_order_lines_closed_qty_chk" CHECK ("closed_qty" >= 0);

ALTER TABLE "stock_movements"
  ADD CONSTRAINT "stock_movements_stock_after_chk" CHECK ("stock_after" >= 0 AND "quantity" <> 0);

ALTER TABLE "stock_issue_lines"
  ADD CONSTRAINT "stock_issue_lines_quantity_chk" CHECK ("quantity" > 0);

ALTER TABLE "supplier_return_lines"
  ADD CONSTRAINT "supplier_return_lines_quantity_chk" CHECK ("quantity" > 0);
