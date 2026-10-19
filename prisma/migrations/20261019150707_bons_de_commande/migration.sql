-- CreateEnum
CREATE TYPE "PurchaseOrderStatus" AS ENUM ('BROUILLON', 'A_VALIDER', 'VALIDE', 'ENVOYE', 'CONFIRME', 'PARTIELLEMENT_RECU', 'RECU', 'CLOTURE', 'REFUSE', 'ANNULE');

-- CreateEnum
CREATE TYPE "PurchaseOrderType" AS ENUM ('LOCAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "PurchaseOrderOrigin" AS ENUM ('DA', 'DIRECT', 'OFFRE');

-- CreateEnum
CREATE TYPE "ContactChannel" AS ENUM ('EMAIL', 'WHATSAPP', 'TELEPHONE', 'REMIS_EN_MAIN', 'AUTRE');

-- CreateEnum
CREATE TYPE "PurchaseOrderEventType" AS ENUM ('CREATED', 'UPDATED', 'SUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'SENT', 'CONFIRMED', 'PROMISED_DATE_CHANGED', 'REMINDED', 'AMENDMENT_STARTED', 'AMENDMENT_ABANDONED', 'CLOSED', 'COMMENT', 'STATUS_SYNC');

-- AlterTable
ALTER TABLE "warehouses" ADD COLUMN     "address" TEXT;

-- CreateTable
CREATE TABLE "purchase_orders" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "version" INTEGER NOT NULL DEFAULT 1,
    "resume_status" "PurchaseOrderStatus",
    "status" "PurchaseOrderStatus" NOT NULL DEFAULT 'BROUILLON',
    "type" "PurchaseOrderType" NOT NULL,
    "origin" "PurchaseOrderOrigin" NOT NULL DEFAULT 'DA',
    "direct_reason" TEXT,
    "supplier_id" TEXT NOT NULL,
    "created_by_id" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL,
    "exchange_rate" DECIMAL(14,6),
    "rate_date" DATE,
    "payment_term" "PaymentTerm" NOT NULL,
    "payment_term_note" TEXT,
    "incoterm" "Incoterm",
    "incoterm_place" TEXT,
    "warehouse_id" TEXT NOT NULL,
    "delivery_address" TEXT NOT NULL DEFAULT '',
    "requested_date" DATE NOT NULL,
    "promised_date" DATE,
    "first_promised_date" DATE,
    "promised_date_changes" INTEGER NOT NULL DEFAULT 0,
    "expected_date" DATE NOT NULL,
    "supplier_ref" TEXT,
    "notes" TEXT,
    "internal_note" TEXT,
    "total_ht" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "total_vat" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "total_ttc" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "total_ht_xof" INTEGER,
    "total_ttc_xof" INTEGER,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "rejected_reason" TEXT,
    "sent_at" TIMESTAMP(3),
    "sent_channel" "ContactChannel",
    "confirmed_at" TIMESTAMP(3),
    "last_reminded_at" TIMESTAMP(3),
    "reminder_count" INTEGER NOT NULL DEFAULT 0,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "cancelled_reason" TEXT,
    "closed_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_orders_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_lines" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" TEXT,
    "free_designation" TEXT,
    "supplier_ref" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit" TEXT NOT NULL,
    "stock_qty" DECIMAL(14,3),
    "unit_price" DECIMAL(14,2) NOT NULL,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(5,2) NOT NULL,
    "net_amount" DECIMAL(16,2) NOT NULL,
    "last_price_xof" INTEGER,
    "price_delta_pct" DECIMAL(7,2),
    "received_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "invoiced_qty" DECIMAL(14,3) NOT NULL DEFAULT 0,
    "note" TEXT,

    CONSTRAINT "purchase_order_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_line_allocations" (
    "id" TEXT NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "request_line_id" TEXT NOT NULL,
    "qty" DECIMAL(14,3) NOT NULL,

    CONSTRAINT "purchase_order_line_allocations_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_charges" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "amount" DECIMAL(14,2) NOT NULL,
    "vat_rate" DECIMAL(5,2) NOT NULL,

    CONSTRAINT "purchase_order_charges_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_events" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 1,
    "type" "PurchaseOrderEventType" NOT NULL,
    "user_id" TEXT NOT NULL,
    "from_status" "PurchaseOrderStatus",
    "to_status" "PurchaseOrderStatus",
    "comment" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_order_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_order_versions" (
    "id" TEXT NOT NULL,
    "order_id" TEXT NOT NULL,
    "version" INTEGER NOT NULL,
    "snapshot" JSONB NOT NULL,
    "approved_at" TIMESTAMP(3) NOT NULL,
    "approved_by_id" TEXT NOT NULL,

    CONSTRAINT "purchase_order_versions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_orders_number_key" ON "purchase_orders"("number");

-- CreateIndex
CREATE INDEX "purchase_orders_status_expected_date_idx" ON "purchase_orders"("status", "expected_date");

-- CreateIndex
CREATE INDEX "purchase_orders_supplier_id_status_idx" ON "purchase_orders"("supplier_id", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_created_by_id_status_idx" ON "purchase_orders"("created_by_id", "status");

-- CreateIndex
CREATE INDEX "purchase_orders_type_status_idx" ON "purchase_orders"("type", "status");

-- CreateIndex
CREATE INDEX "purchase_order_lines_item_id_idx" ON "purchase_order_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_lines_order_id_line_no_key" ON "purchase_order_lines"("order_id", "line_no");

-- CreateIndex
CREATE INDEX "purchase_order_line_allocations_request_line_id_idx" ON "purchase_order_line_allocations"("request_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_line_allocations_order_line_id_request_line__key" ON "purchase_order_line_allocations"("order_line_id", "request_line_id");

-- CreateIndex
CREATE INDEX "purchase_order_charges_order_id_idx" ON "purchase_order_charges"("order_id");

-- CreateIndex
CREATE INDEX "purchase_order_events_order_id_created_at_idx" ON "purchase_order_events"("order_id", "created_at");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_order_versions_order_id_version_key" ON "purchase_order_versions"("order_id", "version");

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_orders" ADD CONSTRAINT "purchase_orders_warehouse_id_fkey" FOREIGN KEY ("warehouse_id") REFERENCES "warehouses"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_lines" ADD CONSTRAINT "purchase_order_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line_allocations" ADD CONSTRAINT "purchase_order_line_allocations_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_line_allocations" ADD CONSTRAINT "purchase_order_line_allocations_request_line_id_fkey" FOREIGN KEY ("request_line_id") REFERENCES "purchase_request_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_charges" ADD CONSTRAINT "purchase_order_charges_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_events" ADD CONSTRAINT "purchase_order_events_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_events" ADD CONSTRAINT "purchase_order_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_order_versions" ADD CONSTRAINT "purchase_order_versions_order_id_fkey" FOREIGN KEY ("order_id") REFERENCES "purchase_orders"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Une ligne de BC porte soit un article du catalogue, soit une désignation libre (jamais les deux, jamais aucun).
ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "purchase_order_lines_item_xor_free_check"
  CHECK (("item_id" IS NOT NULL) <> ("free_designation" IS NOT NULL));

-- Quantités et allocations strictement positives ; remise entre 0 et 100 %.
ALTER TABLE "purchase_order_lines"
  ADD CONSTRAINT "purchase_order_lines_values_check"
  CHECK ("quantity" > 0 AND "discount_pct" >= 0 AND "discount_pct" <= 100 AND "received_qty" >= 0 AND "invoiced_qty" >= 0);
ALTER TABLE "purchase_order_line_allocations"
  ADD CONSTRAINT "purchase_order_line_allocations_qty_check" CHECK ("qty" > 0);
