-- CreateEnum
CREATE TYPE "PurchaseRequestStatus" AS ENUM ('BROUILLON', 'SOUMISE', 'A_COMPLETER', 'VALIDEE', 'REFUSEE', 'EN_CONSULTATION', 'PARTIELLEMENT_COMMANDEE', 'COMMANDEE', 'ANNULEE');

-- CreateEnum
CREATE TYPE "PurchaseRequestUrgency" AS ENUM ('NORMALE', 'URGENTE', 'ARRET_PRODUCTION');

-- CreateEnum
CREATE TYPE "PurchaseRequestType" AS ENUM ('LOCAL', 'IMPORT', 'A_DEFINIR');

-- CreateEnum
CREATE TYPE "PurchaseRequestKind" AS ENUM ('STANDARD', 'REAPPRO');

-- CreateEnum
CREATE TYPE "PurchaseRequestEventType" AS ENUM ('CREATED', 'UPDATED', 'SUBMITTED', 'RESUBMITTED', 'APPROVED', 'REJECTED', 'RETURNED', 'CANCELLED', 'ASSIGNED', 'QTY_CHANGED', 'COMMENT', 'ATTACHMENT_ADDED', 'ATTACHMENT_REMOVED', 'STATUS_SYNC');

-- CreateEnum
CREATE TYPE "NotificationSeverity" AS ENUM ('INFO', 'IMPORTANT', 'CRITIQUE');

-- CreateTable
CREATE TABLE "purchase_requests" (
    "id" TEXT NOT NULL,
    "number" TEXT,
    "status" "PurchaseRequestStatus" NOT NULL DEFAULT 'BROUILLON',
    "kind" "PurchaseRequestKind" NOT NULL DEFAULT 'STANDARD',
    "urgency" "PurchaseRequestUrgency" NOT NULL DEFAULT 'NORMALE',
    "priority" INTEGER NOT NULL DEFAULT 2,
    "type" "PurchaseRequestType" NOT NULL DEFAULT 'A_DEFINIR',
    "department_id" TEXT NOT NULL,
    "requester_name" TEXT NOT NULL,
    "reason" TEXT NOT NULL,
    "needed_by" DATE NOT NULL,
    "estimated_total" INTEGER,
    "created_by_id" TEXT NOT NULL,
    "submitted_at" TIMESTAMP(3),
    "approved_at" TIMESTAMP(3),
    "approved_by_id" TEXT,
    "rejected_reason" TEXT,
    "cancelled_reason" TEXT,
    "cancelled_at" TIMESTAMP(3),
    "cancelled_by_id" TEXT,
    "assigned_buyer_id" TEXT,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "purchase_requests_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_lines" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "line_no" INTEGER NOT NULL,
    "item_id" TEXT,
    "free_designation" TEXT,
    "quantity" DECIMAL(14,3) NOT NULL,
    "approved_qty" DECIMAL(14,3),
    "unit" TEXT NOT NULL,
    "stock_qty" DECIMAL(14,3),
    "estimated_unit_price" INTEGER,
    "note" TEXT,

    CONSTRAINT "purchase_request_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_events" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "type" "PurchaseRequestEventType" NOT NULL,
    "user_id" TEXT NOT NULL,
    "from_status" "PurchaseRequestStatus",
    "to_status" "PurchaseRequestStatus",
    "comment" TEXT,
    "payload" JSONB,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "purchase_request_events_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "purchase_request_attachments" (
    "id" TEXT NOT NULL,
    "request_id" TEXT NOT NULL,
    "file_name" TEXT NOT NULL,
    "mime_type" TEXT NOT NULL,
    "size" INTEGER NOT NULL,
    "path" TEXT NOT NULL,
    "uploaded_by_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "removed_at" TIMESTAMP(3),

    CONSTRAINT "purchase_request_attachments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notifications" (
    "id" TEXT NOT NULL,
    "recipient_id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" "NotificationSeverity" NOT NULL DEFAULT 'INFO',
    "title" TEXT NOT NULL,
    "body" TEXT,
    "link" TEXT NOT NULL,
    "entity" TEXT,
    "entity_id" TEXT,
    "read_at" TIMESTAMP(3),
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notifications_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "purchase_requests_number_key" ON "purchase_requests"("number");

-- CreateIndex
CREATE INDEX "purchase_requests_status_priority_needed_by_idx" ON "purchase_requests"("status", "priority", "needed_by");

-- CreateIndex
CREATE INDEX "purchase_requests_created_by_id_idx" ON "purchase_requests"("created_by_id");

-- CreateIndex
CREATE INDEX "purchase_requests_assigned_buyer_id_status_idx" ON "purchase_requests"("assigned_buyer_id", "status");

-- CreateIndex
CREATE INDEX "purchase_requests_department_id_idx" ON "purchase_requests"("department_id");

-- CreateIndex
CREATE INDEX "purchase_request_lines_item_id_idx" ON "purchase_request_lines"("item_id");

-- CreateIndex
CREATE UNIQUE INDEX "purchase_request_lines_request_id_line_no_key" ON "purchase_request_lines"("request_id", "line_no");

-- CreateIndex
CREATE INDEX "purchase_request_events_request_id_created_at_idx" ON "purchase_request_events"("request_id", "created_at");

-- CreateIndex
CREATE INDEX "purchase_request_attachments_request_id_idx" ON "purchase_request_attachments"("request_id");

-- CreateIndex
CREATE INDEX "notifications_recipient_id_read_at_created_at_idx" ON "notifications"("recipient_id", "read_at", "created_at");

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_department_id_fkey" FOREIGN KEY ("department_id") REFERENCES "departments"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_created_by_id_fkey" FOREIGN KEY ("created_by_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_approved_by_id_fkey" FOREIGN KEY ("approved_by_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_requests" ADD CONSTRAINT "purchase_requests_assigned_buyer_id_fkey" FOREIGN KEY ("assigned_buyer_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_lines" ADD CONSTRAINT "purchase_request_lines_item_id_fkey" FOREIGN KEY ("item_id") REFERENCES "items"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_events" ADD CONSTRAINT "purchase_request_events_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_events" ADD CONSTRAINT "purchase_request_events_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "purchase_request_attachments" ADD CONSTRAINT "purchase_request_attachments_request_id_fkey" FOREIGN KEY ("request_id") REFERENCES "purchase_requests"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_recipient_id_fkey" FOREIGN KEY ("recipient_id") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;


-- Règles d'intégrité complémentaires (non exprimables dans Prisma)
ALTER TABLE "purchase_request_lines"
  ADD CONSTRAINT "purchase_request_lines_item_or_designation_chk"
  CHECK (("item_id" IS NOT NULL) <> ("free_designation" IS NOT NULL));
ALTER TABLE "purchase_request_lines"
  ADD CONSTRAINT "purchase_request_lines_quantity_chk" CHECK ("quantity" > 0);
ALTER TABLE "purchase_request_lines"
  ADD CONSTRAINT "purchase_request_lines_approved_qty_chk" CHECK ("approved_qty" IS NULL OR "approved_qty" >= 0);
ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_priority_chk" CHECK ("priority" IN (0, 1, 2));
ALTER TABLE "purchase_requests"
  ADD CONSTRAINT "purchase_requests_number_chk" CHECK ("submitted_at" IS NULL OR "number" IS NOT NULL);
