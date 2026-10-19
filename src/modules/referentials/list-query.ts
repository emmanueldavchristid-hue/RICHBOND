import { z } from "zod";

export const PAGE_SIZES = [25, 50, 100] as const;
export const EXPORT_MAX_ROWS = 10_000;

const emptyToUndefined = (v: unknown) => (typeof v === "string" && v.trim() === "" ? undefined : v);

/** Texte de filtre facultatif : "" => undefined. */
export const optionalText = (max = 100) =>
  z.preprocess(emptyToUndefined, z.string().trim().max(max, "Texte trop long.").optional());

/** R17 : paramètres communs d'une liste (état dans l'URL, valeurs de chaîne acceptées). */
export const listQuerySchema = z.object({
  q: optionalText(100),
  tri: optionalText(30),
  ordre: z.preprocess(emptyToUndefined, z.enum(["asc", "desc"]).default("asc")),
  page: z.preprocess(emptyToUndefined, z.coerce.number().int().min(1).default(1)),
  taille: z.preprocess(
    emptyToUndefined,
    z.coerce
      .number()
      .refine((n) => (PAGE_SIZES as readonly number[]).includes(n), "Taille de page non autorisée (25, 50 ou 100).")
      .default(25),
  ),
});

export type ListQuery = z.output<typeof listQuerySchema>;

export interface Page<T> {
  rows: T[];
  total: number;
  page: number;
  taille: number;
  pageCount: number;
}

export function toPage<T>(rows: T[], total: number, q: { page: number; taille: number }): Page<T> {
  return { rows, total, page: q.page, taille: q.taille, pageCount: Math.max(1, Math.ceil(total / q.taille)) };
}
