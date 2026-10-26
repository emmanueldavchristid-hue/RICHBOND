import { BusinessError } from "@/lib/errors";
import { IMPORT_FIELDS, type ColumnMapping, type ImportType } from "./types";

/** Minuscules, sans accents ni ponctuation : « Désignation » = « designation ». */
export function normalizeText(s: string): string {
  return s
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/** Propose, pour chaque champ, la colonne du fichier dont le nom correspond (une colonne ne sert qu'une fois). */
export function suggestMapping(type: ImportType, headers: string[]): ColumnMapping {
  const normalized = headers.map((h) => normalizeText(h));
  const used = new Set<number>();
  const mapping: ColumnMapping = {};
  for (const field of IMPORT_FIELDS[type]) {
    const aliases = field.aliases.map(normalizeText);
    // L'ordre des alias donne la priorité : le nom le plus précis gagne.
    let found = -1;
    for (const alias of aliases) {
      found = normalized.findIndex((h, i) => !used.has(i) && h === alias);
      if (found >= 0) break;
    }
    if (found >= 0) used.add(found);
    mapping[field.key] = found >= 0 ? headers[found] : null;
  }
  return mapping;
}

/**
 * Mapping appliqué = suggestion, surchargée champ par champ par le choix de l'utilisateur
 * (`null` ou chaîne vide = champ non utilisé). Une colonne inconnue du fichier est refusée.
 */
export function resolveMapping(type: ImportType, headers: string[], explicit?: ColumnMapping | null): ColumnMapping {
  const mapping = suggestMapping(type, headers);
  if (!explicit) return mapping;
  const keys = new Set(IMPORT_FIELDS[type].map((f) => f.key));
  for (const [key, header] of Object.entries(explicit)) {
    if (!keys.has(key)) continue;
    if (header === null || header === "") {
      mapping[key] = null;
      continue;
    }
    if (!headers.includes(header)) {
      throw new BusinessError("IMPORT_COLONNE", `La colonne « ${header} » n'existe pas dans le fichier.`);
    }
    mapping[key] = header;
  }
  return mapping;
}
