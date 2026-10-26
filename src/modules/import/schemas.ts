import { z } from "zod";
import { BusinessError } from "@/lib/errors";
import { detectFormat } from "./parse";
import { IMPORT_MAX_BYTES, IMPORT_TYPES, type ColumnMapping, type ImportType } from "./types";

export const importTypeSchema = z.enum(IMPORT_TYPES, { error: "Type d'import inconnu." });

const mappingSchema = z.record(z.string(), z.string().nullable());

export interface ImportForm {
  type: ImportType;
  fileName: string;
  buffer: Buffer;
  mapping: ColumnMapping | null;
}

/** FormData : `file` (xlsx/csv), `type`, `mapping` (JSON facultatif {champ: colonne|null}). */
export async function parseImportForm(fd: FormData): Promise<ImportForm> {
  const type = importTypeSchema.safeParse(fd.get("type"));
  if (!type.success) throw new BusinessError("VALIDATION", "Type d'import inconnu.");
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) throw new BusinessError("VALIDATION", "Choisissez un fichier Excel (.xlsx) ou CSV.");
  if (file.size > IMPORT_MAX_BYTES) throw new BusinessError("IMPORT_TROP_GROS", "Fichier trop volumineux (5 Mo maximum).");
  detectFormat(file.name);
  let mapping: ColumnMapping | null = null;
  const rawMapping = fd.get("mapping");
  if (typeof rawMapping === "string" && rawMapping.trim() !== "") {
    try {
      mapping = mappingSchema.parse(JSON.parse(rawMapping));
    } catch {
      throw new BusinessError("VALIDATION", "Correspondance des colonnes invalide.");
    }
  }
  return { type: type.data, fileName: file.name.slice(0, 200), buffer: Buffer.from(await file.arrayBuffer()), mapping };
}
