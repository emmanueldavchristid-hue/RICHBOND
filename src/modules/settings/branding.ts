import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { log } from "@/modules/audit";
import { detectImageType } from "@/modules/items/photo-type";
import type { Actor } from "@/modules/referentials/actor";

/** D29 : logo de la société imprimé sur les bons de commande. PNG ou JPEG, 1 Mo maximum, type vérifié par la signature. */
export const LOGO_MAX_BYTES = 1024 * 1024;

/** Dossier hors `public/` et hors git ; les noms de fichiers sont fixes (aucun chemin n'est saisi par l'utilisateur). */
/** `BRANDING_DIR` (tests) : dossier distinct pour ne jamais toucher au logo réel. Jamais saisi par un utilisateur. */
const ROOT = () => (process.env.BRANDING_DIR ? path.resolve(process.env.BRANDING_DIR) : path.resolve(process.cwd(), "storage", "branding"));
const FILES = { png: "logo.png", jpg: "logo.jpg" } as const;
const MIME = { png: "image/png", jpg: "image/jpeg" } as const;

export interface Logo {
  bytes: Buffer;
  mime: "image/png" | "image/jpeg";
  ext: "png" | "jpg";
}

export async function readLogo(): Promise<Logo | null> {
  for (const ext of ["png", "jpg"] as const) {
    try {
      const bytes = await readFile(path.join(ROOT(), FILES[ext]));
      const type = detectImageType(bytes);
      if (type && type.ext === ext) return { bytes, mime: MIME[ext], ext };
    } catch {
      /* absent : on essaie l'autre extension */
    }
  }
  return null;
}

export async function setLogo(actor: Actor, input: { bytes: Uint8Array }, ip?: string | null): Promise<{ ext: "png" | "jpg"; size: number }> {
  if (input.bytes.length === 0) throw new BusinessError("LOGO_INVALID", "Fichier vide.");
  if (input.bytes.length > LOGO_MAX_BYTES) throw new BusinessError("LOGO_TOO_LARGE", "Le logo dépasse 1 Mo : réduisez-le avant de l'envoyer.");
  const type = detectImageType(input.bytes);
  if (!type || type.ext === "webp") throw new BusinessError("LOGO_INVALID", "Format non accepté : utilisez une image PNG ou JPEG.");
  const ext = type.ext;
  const before = await readLogo();

  await mkdir(ROOT(), { recursive: true });
  const tmp = path.join(ROOT(), `.${randomUUID().replace(/-/g, "")}.tmp`);
  await writeFile(tmp, input.bytes);
  try {
    await db.$transaction(async (tx) => {
      await rename(tmp, path.join(ROOT(), FILES[ext]));
      await log(tx, {
        userId: actor.id,
        action: "SETTINGS_LOGO",
        entity: "Setting",
        entityId: "company.logo",
        before: before ? { ext: before.ext, size: before.bytes.length } : null,
        after: { ext, size: input.bytes.length },
        ip,
      });
    });
  } catch (e) {
    await rm(tmp, { force: true });
    throw e;
  }
  const other = ext === "png" ? FILES.jpg : FILES.png;
  await rm(path.join(ROOT(), other), { force: true });
  return { ext, size: input.bytes.length };
}

export async function removeLogo(actor: Actor, ip?: string | null): Promise<void> {
  const before = await readLogo();
  if (!before) return;
  await db.$transaction(async (tx) => {
    await log(tx, {
      userId: actor.id,
      action: "SETTINGS_LOGO",
      entity: "Setting",
      entityId: "company.logo",
      before: { ext: before.ext, size: before.bytes.length },
      after: null,
      ip,
    });
  });
  await rm(path.join(ROOT(), FILES[before.ext]), { force: true });
}
