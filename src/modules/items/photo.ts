import "server-only";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { log } from "@/modules/audit";
import type { Actor } from "@/modules/referentials/actor";
import { assertFresh } from "@/modules/referentials/concurrency";
import { detectImageType, PHOTO_MAX_BYTES } from "./photo-type";

/** Stockage hors `public/` (R19) ; dossier ignoré par git. */
const ROOT = () => path.resolve(process.cwd(), "storage", "items");

function safeFile(photoPath: string): string {
  const file = path.basename(photoPath);
  if (!/^[A-Za-z0-9_-]+\.(jpg|png|webp)$/.test(file)) throw new BusinessError("PHOTO_INVALID", "Chemin de photo invalide.");
  return path.join(ROOT(), file);
}

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
  const before = await db.item.findUnique({ where: { id: input.id }, select: { id: true, updatedAt: true, photoPath: true } });
  if (!before) throw new BusinessError("NOT_FOUND", "Article introuvable.");
  assertFresh(before.updatedAt, input.expectedUpdatedAt);
  const file = `${before.id}.${type.ext}`;
  await mkdir(ROOT(), { recursive: true });
  await writeFile(path.join(ROOT(), file), input.bytes);
  try {
    await db.$transaction(async (tx) => {
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
    });
  } catch (e) {
    if (!before.photoPath) await rm(path.join(ROOT(), file), { force: true });
    throw e;
  }
  if (before.photoPath && before.photoPath !== file) await rm(safeFile(before.photoPath), { force: true });
  return { photoPath: file };
}

export async function removeItemPhoto(actor: Actor, input: { id: string; expectedUpdatedAt: Date }, ip?: string | null) {
  const photoPath = await db.$transaction(async (tx) => {
    const before = await tx.item.findUnique({ where: { id: input.id } });
    if (!before) throw new BusinessError("NOT_FOUND", "Article introuvable.");
    assertFresh(before.updatedAt, input.expectedUpdatedAt);
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
