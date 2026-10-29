-- CreateEnum
CREATE TYPE "InvoiceStatus" AS ENUM ('SAISIE', 'CONFORME', 'ECART', 'BON_A_PAYER', 'TRANSMISE', 'LITIGE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "InvoiceLineMatch" AS ENUM ('CONFORME', 'ECART_PRIX', 'ECART_QTE', 'ECART_PRIX_QTE');

-- CreateTable
CREATE TABLE "supplier_invoices" (
    "id" TEXT NOT NULL,
    "number" TEXT NOT NULL,
    "supplier_invoice_no" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "status" "InvoiceStatus" NOT NULL DEFAULT 'SAISIE',
    "invoice_date" DATE NOT NULL,
    "due_date" DATE NOT NULL,
    "currency_code" TEXT NOT NULL,
    "total_ht" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "total_vat" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "total_ttc" DECIMAL(16,2) NOT NULL DEFAULT 0,
    "total_ttc_xof" INTEGER,
    "notes" TEXT,
    "litige_reason" TEXT,
    "cancelled_reason" TEXT,
    "matched_at" TIMESTAMP(3),
    "pay_approved_at" TIMESTAMP(3),
    "pay_approved_by_id" TEXT,
    "transmitted_at" TIMESTAMP(3),
    "transmitted_by_id" TEXT,
    "created_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_invoices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoice_lines" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "order_line_id" TEXT NOT NULL,
    "quantity" DECIMAL(14,3) NOT NULL,
    "unit_price" DECIMAL(14,2) NOT NULL,
    "discount_pct" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "vat_rate" DECIMAL(5,2) NOT NULL,
    "net_amount" DECIMAL(16,2) NOT NULL,
    "match" "InvoiceLineMatch",
    "match_received_qty" DECIMAL(14,3),
    "match_po_price" DECIMAL(14,2),
    "match_price_delta_pct" DECIMAL(7,2),
    "match_qty_delta" DECIMAL(14,3),

    CONSTRAINT "supplier_invoice_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_invoice_attachments" (
    "id" TEXT NOT NULL,
    "invoice_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "supplier_invoice_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoices_number_key" ON "supplier_invoices"("number");

-- CreateIndex
CREATE INDEX "supplier_invoices_status_due_date_idx" ON "supplier_invoices"("status", "due_date");

-- CreateIndex
CREATE INDEX "supplier_invoices_supplier_id_invoice_date_idx" ON "supplier_invoices"("supplier_id", "invoice_date");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoices_supplier_id_supplier_invoice_no_key" ON "supplier_invoices"("supplier_id", "supplier_invoice_no");

-- CreateIndex
CREATE INDEX "supplier_invoice_lines_order_line_id_idx" ON "supplier_invoice_lines"("order_line_id");

-- CreateIndex
CREATE UNIQUE INDEX "supplier_invoice_lines_invoice_id_line_no_key" ON "supplier_invoice_lines"("invoice_id", "line_no");

-- CreateIndex
CREATE INDEX "supplier_invoice_attachments_invoice_id_idx" ON "supplier_invoice_attachments"("invoice_id");

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoices" ADD CONSTRAINT "supplier_invoices_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoice_lines" ADD CONSTRAINT "supplier_invoice_lines_order_line_id_fkey" FOREIGN KEY ("order_line_id") REFERENCES "purchase_order_lines"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_invoice_attachments" ADD CONSTRAINT "supplier_invoice_attachments_invoice_id_fkey" FOREIGN KEY ("invoice_id") REFERENCES "supplier_invoices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
