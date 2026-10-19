import "server-only";
import { randomUUID } from "node:crypto";
import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { log } from "@/modules/audit";
import type { Actor } from "@/modules/referentials/actor";
import { lockFresh } from "@/modules/referentials/concurrency";
import { idSchema } from "@/modules/referentials/schemas";
import { detectImageType, PHOTO_MAX_BYTES } from "./photo-type";

/** Stockage hors `public/` (R19) ; dossier ignoré par git. */
const ROOT = () => path.resolve(process.cwd(), "storage", "items");

function safeFile(photoPath: string): string {
  const file = path.basename(photoPath);
  if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(file)) throw new BusinessError("PHOTO_INVALID", "Chemin de photo invalide.");
  return path.join(ROOT(), file);
}

/**
 * Remplace la photo. Garanties :
 * - la version (`updatedAt`) est contrôlée dans la transaction, ligne verrouillée ;
 * - le fichier est d'abord écrit sous un nom temporaire unique puis renommé sous un nom définitif unique
 *   (jamais le nom de l'ancienne photo) : l'ancienne photo n'est donc jamais écrasée ;
 * - l'ancienne photo n'est supprimée qu'après validation de la transaction ; en cas d'échec, seul le nouveau
 *   fichier est retiré.
 */
export async function setItemPhoto(
  actor: Actor,
  input: { id: string; expectedUpdatedAt: Date; bytes: Uint8Array },
  ip?: string | null,
) {
  if (input.bytes.length === 0) throw new BusinessError("PHOTO_INVALID", "Fichier vide.");
  if (input.bytes.length > PHOTO_MAX_BYTES) {
    throw new BusinessError("PHOTO_TOO_LARGE", "La photo dépasse 2 Mo : réduisez-la avant de l'envoyer.");
  }
  const type = detectImageType(input.bytes);
  if (!type) throw new BusinessError("PHOTO_INVALID", "Format non accepté : utilisez une image JPEG, PNG ou WebP.");
  const id = idSchema.parse(input.id);

  const token = randomUUID().replace(/-/g, "");
  const tmp = path.join(ROOT(), `.${token}.tmp`);
  const file = `${id}-${token.slice(0, 12)}.${type.ext}`;
  const finalPath = path.join(ROOT(), file);
  await mkdir(ROOT(), { recursive: true });
  await writeFile(tmp, input.bytes);

  let oldPhoto: string | null = null;
  try {
    await db.$transaction(async (tx) => {
      const before = await tx.item.findUnique({ where: { id }, select: { id: true, updatedAt: true, photoPath: true } });
      if (!before) throw new BusinessError("NOT_FOUND", "Article introuvable.");
      await lockFresh(tx, "items", before.id, input.expectedUpdatedAt);
      await rename(tmp, finalPath);
      const after = await tx.item.update({ where: { id: before.id }, data: { photoPath: file } });
      await log(tx, {
        userId: actor.id,
        action: "ITEM_PHOTO",
        entity: "Item",
        entityId: before.id,
        before: { photoPath: before.photoPath },
        after: { photoPath: after.photoPath },
        ip,
      });
      oldPhoto = before.photoPath;
    });
  } catch (e) {
    await rm(tmp, { force: true });
    await rm(finalPath, { force: true });
    throw e;
  }
  if (oldPhoto && oldPhoto !== file) {
    try {
      await rm(safeFile(oldPhoto), { force: true });
    } catch {
      /* fichier orphelin sans conséquence : la base référence déjà la nouvelle photo */
    }
  }
  return { photoPath: file };
}

export async function removeItemPhoto(actor: Actor, input: { id: string; expectedUpdatedAt: Date }, ip?: string | null) {
  const photoPath = await db.$transaction(async (tx) => {
    const before = await tx.item.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Article introuvable.");
    await lockFresh(tx, "items", before.id, input.expectedUpdatedAt);
    if (!before.photoPath) return null;
    await tx.item.update({ where: { id: before.id }, data: { photoPath: null } });
    await log(tx, {
      userId: actor.id,
      action: "ITEM_PHOTO",
      entity: "Item",
      entityId: before.id,
      before: { photoPath: before.photoPath },
      after: { photoPath: null },
      ip,
    });
    return before.photoPath;
  });
  if (photoPath) await rm(safeFile(photoPath), { force: true });
}

/** Lecture pour la route `GET /api/items/[id]/photo`. */
export async function readItemPhoto(id: string): Promise<{ bytes: Buffer; mime: string } | null> {
  const item = await db.item.findUnique({ where: { id }, select: { photoPath: true } });
  if (!item?.photoPath) return null;
  try {
    const bytes = await readFile(safeFile(item.photoPath));
    const type = detectImageType(bytes);
    return type ? { bytes, mime: type.mime } : null;
  } catch {
    return null;
  }
}
