import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import type { db } from "@/lib/db";

/**
 * D15 : l'évaluation des fournisseurs arrive au LOT-14. D'ici là aucune source n'est enregistrée et l'information
 * « Fournisseur non évalué depuis 12 mois » n'est jamais affichée (pas de fausse donnée). Information non bloquante.
 */
export interface SupplierEvaluationSource {
  /** Date de la dernière évaluation du fournisseur ; null si jamais évalué. */
  lastEvaluatedAt(client: Prisma.TransactionClient | typeof db, supplierId: string): Promise<Date | null>;
}

let source: SupplierEvaluationSource | null = null;

export function registerSupplierEvaluationSource(s: SupplierEvaluationSource): void {
  source = s;
}

export const EVALUATION_MAX_AGE_MONTHS = 12;

/** `true` si le fournisseur n'a pas été évalué depuis 12 mois ; `null` si la question ne se pose pas encore (aucune source). */
export async function isSupplierEvaluationStale(
  client: Prisma.TransactionClient | typeof db,
  supplierId: string,
  now: Date,
): Promise<boolean | null> {
  if (!source) return null;
  const last = await source.lastEvaluatedAt(client, supplierId);
  if (!last) return true;
  const limit = new Date(now);
  limit.setUTCMonth(limit.getUTCMonth() - EVALUATION_MAX_AGE_MONTHS);
  return last < limit;
}
