-- CreateEnum
CREATE TYPE "ItemCategory" AS ENUM ('MATIERE_PREMIERE', 'INTRANT', 'PDR', 'FOURNITURE', 'SERVICE');

-- CreateEnum
CREATE TYPE "Criticality" AS ENUM ('CRITIQUE', 'IMPORTANT', 'STANDARD');

-- CreateEnum
CREATE TYPE "ItemStatus" AS ENUM ('ACTIF', 'BLOQUE', 'OBSOLETE');

-- CreateEnum
CREATE TYPE "SupplierType" AS ENUM ('LOCAL', 'IMPORT');

-- CreateEnum
CREATE TYPE "SupplierStatus" AS ENUM ('ACTIF', 'EN_EVALUATION', 'BLOQUE');

-- CreateEnum
CREATE TYPE "PaymentTerm" AS ENUM ('COMPTANT', 'J30', 'J45', 'J60', 'J90', 'FIN_DE_MOIS_30', 'AUTRE');

-- CreateEnum
CREATE TYPE "Incoterm" AS ENUM ('EXW', 'FCA', 'FAS', 'FOB', 'CFR', 'CIF', 'CPT', 'CIP', 'DAP', 'DPU', 'DDP');

-- CreateEnum
CREATE TYPE "PriceSource" AS ENUM ('MANUEL', 'BC', 'FACTURE');

-- CreateTable
CREATE TABLE "warehouses" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "warehouses_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "departments" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "departments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "currencies" (
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "decimals" INTEGER NOT NULL DEFAULT 2,
    "is_base" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "currencies_pkey" PRIMARY KEY ("code")
);

-- CreateTable
CREATE TABLE "exchange_rates" (
    "id" TEXT NOT NULL,
    "currency_code" TEXT NOT NULL,
    "date" DATE NOT NULL,
    "rate" DECIMAL(14,6) NOT NULL,
    "note" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "exchange_rates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "suppliers" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" "SupplierType" NOT NULL,
    "country" TEXT NOT NULL DEFAULT 'CI',
    "city" TEXT,
    "currency_code" TEXT NOT NULL,
    "ncc" TEXT,
    "rccm" TEXT,
    "payment_term" "PaymentTerm" NOT NULL DEFAULT 'J30',
    "payment_term_note" TEXT,
    "incoterm" "Incoterm",
    "lead_time_days" INTEGER,
    "categories" "ItemCategory"[],
    "status" "SupplierStatus" NOT NULL DEFAULT 'ACTIF',
    "blocked_reason" TEXT,
    "blocked_at" TIMESTAMP(3),
    "blocked_by_id" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "supplier_contacts" (
    "id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT,
    "phone" TEXT,
    "email" TEXT,
    "is_primary" BOOLEAN NOT NULL DEFAULT false,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "supplier_contacts_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "items" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" "ItemCategory" NOT NULL,
    "family" TEXT,
    "stock_unit" TEXT NOT NULL,
    "purchase_unit" TEXT NOT NULL,
    "conversion_factor" DECIMAL(14,3) NOT NULL DEFAULT 1,
    "stocked" BOOLEAN NOT NULL DEFAULT true,
    "criticality" "Criticality" NOT NULL DEFAULT 'STANDARD',
    "abc_class" TEXT,
    "default_warehouse_id" TEXT,
    "safety_stock" DECIMAL(14,3),
    "reorder_point" DECIMAL(14,3),
    "economic_order_qty" DECIMAL(14,3),
    "lead_time_days" INTEGER,
    "main_supplier_id" TEXT,
    "barcode" TEXT,
    "status" "ItemStatus" NOT NULL DEFAULT 'ACTIF',
    "equipment" TEXT,
    "photo_path" TEXT,
    "notes" TEXT,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "items_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_suppliers" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "supplier_ref" TEXT,
    "last_price" DECIMAL(14,2),
    "currency_code" TEXT,
    "last_price_date" TIMESTAMP(3),
    "lead_time_days" INTEGER,
    "min_order_qty" DECIMAL(14,3),
    "active" BOOLEAN NOT NULL DEFAULT true,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_suppliers_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "item_price_history" (
    "id" TEXT NOT NULL,
    "item_id" TEXT NOT NULL,
    "supplier_id" TEXT NOT NULL,
    "price" DECIMAL(14,2) NOT NULL,
    "currency_code" TEXT NOT NULL,
    "rate_to_xof" DECIMAL(14,6),
    "source" "PriceSource" NOT NULL DEFAULT 'MANUEL',
    "source_ref" TEXT,
    "date" TIMESTAMP(3) NOT NULL,
    "created_by_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "item_price_history_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settings" (
    "key" TEXT NOT NULL,
    "value" JSONB NOT NULL,
    "updated_by_id" TEXT,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "settings_pkey" PRIMARY KEY ("key")
);

-- CreateIndex
CREATE UNIQUE INDEX "warehouses_code_key" ON "warehouses"("code");

-- CreateIndex
CREATE UNIQUE INDEX "departments_code_key" ON "departments"("code");

-- CreateIndex
CREATE UNIQUE INDEX "exchange_rates_currency_code_date_key" ON "exchange_rates"("currency_code", "date");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_code_key" ON "suppliers"("code");

-- CreateIndex
CREATE UNIQUE INDEX "suppliers_ncc_key" ON "suppliers"("ncc");

-- CreateIndex
CREATE INDEX "suppliers_status_type_idx" ON "suppliers"("status", "type");

-- CreateIndex
CREATE INDEX "suppliers_name_idx" ON "suppliers"("name");

-- CreateIndex
CREATE INDEX "supplier_contacts_supplier_id_idx" ON "supplier_contacts"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "items_code_key" ON "items"("code");

-- CreateIndex
CREATE UNIQUE INDEX "items_barcode_key" ON "items"("barcode");

-- CreateIndex
CREATE INDEX "items_category_status_idx" ON "items"("category", "status");

-- CreateIndex
CREATE INDEX "items_criticality_idx" ON "items"("criticality");

-- CreateIndex
CREATE INDEX "items_name_idx" ON "items"("name");

-- CreateIndex
CREATE INDEX "items_equipment_idx" ON "items"("equipment");

-- CreateIndex
CREATE INDEX "item_suppliers_supplier_id_idx" ON "item_suppliers"("supplier_id");

-- CreateIndex
CREATE UNIQUE INDEX "item_suppliers_item_id_supplier_id_key" ON "item_suppliers"("item_id", "supplier_id");

-- CreateIndex
CREATE INDEX "item_price_history_item_id_date_idx" ON "item_price_history"("item_id", "date");

-- AddForeignKey
ALTER TABLE "exchange_rates" ADD CONSTRAINT "exchange_rates_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "suppliers" ADD CONSTRAINT "suppliers_currency_code_fkey" FOREIGN KEY ("currency_code") REFERENCES "currencies"("code") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "supplier_contacts" ADD CONSTRAINT "supplier_contacts_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_default_warehouse_id_fkey" FOREIGN KEY ("default_warehouse_id") REFERENCES "warehouses"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "items" ADD CONSTRAINT "items_main_supplier_id_fkey" FOREIGN KEY ("main_supplier_id") REFERENCES "suppliers"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_suppliers" ADD CONSTRAINT "item_suppliers_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_suppliers" ADD CONSTRAINT "item_suppliers_supplier_id_fkey" FOREIGN KEY ("supplier_id") REFERENCES "suppliers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "item_price_history" ADD CONSTRAINT "item_price_history_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
