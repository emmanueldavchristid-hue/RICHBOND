import { z } from "zod";

/** Quantité décimale >= 0, 3 décimales max (virgule acceptée). Sortie : nombre. */
export function qtySchema(label: string, opts: { positive?: boolean } = {}) {
  return z
    .union([z.number(), z.string()], { error: `${label} : valeur invalide.` })
    .transform((v) => (typeof v === "string" ? Number(v.trim().replace(",", ".")) : v))
    .refine((n) => Number.isFinite(n), `${label} : nombre invalide.`)
    .refine((n) => (opts.positive ? n > 0 : n >= 0), opts.positive ? `${label} doit être strictement positif.` : `${label} ne peut pas être négatif.`)
    .refine((n) => Math.abs(n * 1000 - Math.round(n * 1000)) < 1e-6, `${label} : 3 décimales maximum.`)
    .refine((n) => n < 1e11, `${label} : valeur trop grande.`);
}

/** "" / null / undefined => null. */
export function nullable<T extends z.ZodType>(schema: T) {
  return z.preprocess(
    (v) => (v === "" || v === undefined || v === null ? null : v),
    schema.nullable(),
  ) as unknown as z.ZodType<z.output<T> | null, unknown>;
}

export const idSchema = z.string().min(1, "Identifiant manquant.");

/** Version de la fiche lue par l'utilisateur (R16). */
export const expectedUpdatedAtSchema = z.coerce.date({ error: "Version de la fiche manquante." });

export const optionalString = (max: number, label: string) =>
  nullable(z.string().trim().min(1).max(max, `${label} : ${max} caractères maximum.`));
