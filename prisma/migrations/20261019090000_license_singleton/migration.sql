-- AlterTable : colonnes ajoutées sans valeur par défaut d'abord (évite un conflit d'unicité sur les lignes existantes)
ALTER TABLE "licenses" ADD COLUMN "singleton" BOOLEAN,
ADD COLUMN "last_seen_at" TIMESTAMP(3);

-- Seule la ligne la plus récente porte le marqueur ; aucune suppression.
UPDATE "licenses" SET "singleton" = true
WHERE "id" = (SELECT "id" FROM "licenses" ORDER BY "created_at" DESC, "id" DESC LIMIT 1);

ALTER TABLE "licenses" ALTER COLUMN "singleton" SET DEFAULT true;

-- CreateIndex
CREATE UNIQUE INDEX "licenses_singleton_key" ON "licenses"("singleton");
