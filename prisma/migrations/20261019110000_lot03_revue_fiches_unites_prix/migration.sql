-- AlterTable
ALTER TABLE "item_price_history" ADD COLUMN     "price_unit" TEXT;

-- AlterTable
ALTER TABLE "item_suppliers" ADD COLUMN     "price_unit" TEXT;

-- AlterTable
ALTER TABLE "suppliers" ADD COLUMN     "address" TEXT,
ADD COLUMN     "bank_details" TEXT,
ADD COLUMN     "email" TEXT,
ADD COLUMN     "phone" TEXT;

-- Reprise : les prix existants sont exprimés dans l'unité d'achat actuelle de l'article.
UPDATE "item_suppliers" s SET "price_unit" = i."purchase_unit" FROM "items" i WHERE i."id" = s."item_id" AND s."last_price" IS NOT NULL;
UPDATE "item_price_history" h SET "price_unit" = i."purchase_unit" FROM "items" i WHERE i."id" = h."item_id";
