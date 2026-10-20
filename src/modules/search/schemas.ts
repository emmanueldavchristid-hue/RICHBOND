import { z } from "zod";

export const globalSearchSchema = z.object({
  q: z.string().trim().min(2, "Saisissez au moins 2 caractères.").max(80),
});

export type GlobalSearchKind = "DA" | "BC" | "ARTICLE" | "FOURNISSEUR";

export interface GlobalSearchHit {
  kind: GlobalSearchKind;
  id: string;
  /** Numéro ou code (affiché en police mono). */
  ref: string;
  label: string;
  /** Statut (clé de StatusBadge) quand il existe. */
  status?: string;
  href: string;
}

export const MAX_HITS_PER_KIND = 5;
