import { z } from "zod";

/** R1 : 17 caractères maximum (limite Sage), majuscules, chiffres, `.`, `_`, `-`. */
export const CODE_REGEX = /^[A-Z0-9][A-Z0-9._-]{0,16}$/;

export const CODE_FORMAT_MESSAGE =
  "Code invalide : 17 caractères maximum, lettres majuscules, chiffres, « . », « _ » ou « - », sans espace.";

/** Supprime les espaces de bord et passe en majuscules. */
export function normalizeCode(raw: string): string {
  return raw.trim().toUpperCase();
}

export function isValidCode(code: string): boolean {
  return CODE_REGEX.test(code);
}

/** Code facultatif : vide => `undefined` (génération côté serveur). */
export const optionalCodeSchema = z
  .string()
  .optional()
  .transform((v) => (v === undefined || v.trim() === "" ? undefined : normalizeCode(v)))
  .refine((v) => v === undefined || CODE_REGEX.test(v), CODE_FORMAT_MESSAGE);

/** Code obligatoire (dépôt, service, devise…). */
export const requiredCodeSchema = z
  .string()
  .transform(normalizeCode)
  .refine((v) => v.length > 0, "Le code est obligatoire.")
  .refine((v) => v === "" || CODE_REGEX.test(v), CODE_FORMAT_MESSAGE);

/** R20 : NCC ivoirien usuel = 7 chiffres + 1 lettre. Simple avertissement, jamais bloquant. */
export function validateNcc(ncc: string): { ok: boolean; warning?: string } {
  const v = ncc.trim().toUpperCase();
  if (/^[0-9]{7}[A-Z]$/.test(v)) return { ok: true };
  return { ok: false, warning: "Le NCC ne respecte pas le format habituel (7 chiffres et 1 lettre) : vérifiez-le." };
}

/** Clé de comparaison de raisons sociales : sans accents, ponctuation, espaces ni forme juridique usuelle. */
export function normalizeName(name: string): string {
  return name
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\./g, "")
    .replace(/\b(sarl|sa|sas|sasu|ltd|co|gmbh|ci|cie)\b/g, " ")
    .replace(/[^a-z0-9]+/g, "");
}
