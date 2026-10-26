"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { getNow } from "@/lib/clock";
import { getClientIp } from "@/modules/auth/ip";
import { withAction } from "@/modules/auth/session";
import { parseImportForm } from "@/modules/import/schemas";
import { commitImport, previewImport } from "@/modules/import/service";

/**
 * Import Excel/CSV (LOT-09). Entrée : FormData { file, type, mapping? (JSON {champ: colonne|null}) }.
 * Réservé au Responsable Achats et au Super-admin (`import.manage`).
 * Retours : { ok: true, data: { preview } } | { ok: true, data: { summary } } | { ok: false, code, message }.
 */
const formSchema = z.instanceof(FormData, { error: "Formulaire invalide." });

/** Aperçu : aucune écriture, donc autorisé même en lecture seule (licence expirée). */
export const previewImportAction = withAction(
  "import.manage",
  formSchema,
  async ({ input }) => ({ preview: await previewImport(await parseImportForm(input), (await getNow()).now) }),
  { writable: false },
);

/** Import des lignes valides : écriture, refusée si la licence est en lecture seule. */
export const commitImportAction = withAction("import.manage", formSchema, async ({ user, input }) => {
  const summary = await commitImport(user, await parseImportForm(input), await getClientIp(), (await getNow()).now);
  revalidatePath("/parametres/import");
  revalidatePath("/stock/articles");
  revalidatePath("/fournisseurs");
  return { summary };
});
