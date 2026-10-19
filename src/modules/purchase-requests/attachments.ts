import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { BusinessError } from "@/lib/errors";
import { log } from "@/modules/audit";
import { canViewRequest } from "@/lib/permissions";
import { idSchema } from "@/modules/referentials/schemas";
import {
  ATTACHMENT_MAX_BYTES,
  ATTACHMENT_MAX_COUNT,
  detectAttachmentType,
  sanitizeFileName,
} from "./attachment-type";
import { displayNumber } from "./labels";
import { assertTransition, type WorkflowUser } from "./workflow";

/** D15 : stockage hors `public/` ; le chemin en base est un nom généré côté serveur, jamais saisi. */
const ROOT = () => path.resolve(process.cwd(), "storage", "purchase-requests");

const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_FILE = /^[a-f0-9]{24}\.(pdf|jpg|png|xlsx|docx)$/;

function dirFor(requestId: string): string {
  if (!SAFE_ID.test(requestId)) throw new BusinessError("ATTACHMENT_INVALID", "Identifiant de demande invalide.");
  return path.join(ROOT(), requestId);
}

function fileFor(requestId: string, stored: string): string {
  if (!SAFE_FILE.test(stored)) throw new BusinessError("ATTACHMENT_INVALID", "Chemin de pièce jointe invalide.");
  return path.join(dirFor(requestId), stored);
}

/** Verrou de ligne sans contrôle de version : sérialise les ajouts (limite de 5 pièces) sans conflit pour l'utilisateur. */
async function lockRow(tx: Pick<typeof db, "$queryRawUnsafe">, id: string) {
  await tx.$queryRawUnsafe(`SELECT id FROM "purchase_requests" WHERE id = $1 FOR UPDATE`, id);
}

export async function addAttachment(
  actor: WorkflowUser,
  input: { requestId: string; fileName: string; bytes: Uint8Array },
  ip?: string | null,
  at: Date = now(),
) {
  const requestId = idSchema.parse(input.requestId);
  if (input.bytes.length === 0) throw new BusinessError("ATTACHMENT_INVALID", "Fichier vide.");
  if (input.bytes.length > ATTACHMENT_MAX_BYTES) {
    throw new BusinessError("ATTACHMENT_TOO_LARGE", "La pièce jointe dépasse 5 Mo : réduisez-la avant de l'envoyer.");
  }
  const type = detectAttachmentType(input.bytes);
  if (!type) {
    throw new BusinessError("ATTACHMENT_INVALID", "Format non accepté : PDF, image JPEG ou PNG, fichier Excel (.xlsx) ou Word (.docx).");
  }
  const stored = `${randomBytes(12).toString("hex")}.${type.ext}`;
  const fileName = sanitizeFileName(input.fileName);
  let written: string | null = null;
  try {
    return await db.$transaction(async (tx) => {
      await lockRow(tx, requestId);
      const pr = await tx.purchaseRequest.findUnique({ where: { id: requestId } });
      if (!pr) throw new BusinessError("NOT_FOUND", "Demande d'achat introuvable.");
      assertTransition(pr, "attach", actor);
      const count = await tx.purchaseRequestAttachment.count({ where: { requestId, removedAt: null } });
      if (count >= ATTACHMENT_MAX_COUNT) {
        throw new BusinessError("ATTACHMENT_LIMIT", `Une demande ne peut pas dépasser ${ATTACHMENT_MAX_COUNT} pièces jointes.`);
      }
      const dir = dirFor(requestId);
      await mkdir(dir, { recursive: true });
      written = fileFor(requestId, stored);
      await writeFile(written, input.bytes);
      const att = await tx.purchaseRequestAttachment.create({
        data: { requestId, fileName, mimeType: type.mime, size: input.bytes.length, path: stored, uploadedById: actor.id, createdAt: at },
      });
      await tx.purchaseRequestEvent.create({
        data: { requestId, type: "ATTACHMENT_ADDED", userId: actor.id, comment: fileName, createdAt: at },
      });
      await log(tx, {
        userId: actor.id,
        action: "PR_ATTACHMENT_ADD",
        entity: "PurchaseRequest",
        entityId: requestId,
        after: { attachmentId: att.id, fileName, size: att.size, mimeType: att.mimeType, request: displayNumber(pr) },
        ip,
      });
      return { id: att.id, fileName, mimeType: att.mimeType, size: att.size };
    });
  } catch (e) {
    if (written) await rm(written, { force: true });
    throw e;
  }
}

export async function removeAttachment(
  actor: WorkflowUser,
  input: { requestId: string; attachmentId: string },
  ip?: string | null,
  at: Date = now(),
) {
  const stored = await db.$transaction(async (tx) => {
    await lockRow(tx, input.requestId);
    const pr = await tx.purchaseRequest.findUnique({ where: { id: input.requestId } });
    if (!pr) throw new BusinessError("NOT_FOUND", "Demande d'achat introuvable.");
    assertTransition(pr, "attach", actor);
    const att = await tx.purchaseRequestAttachment.findFirst({
      where: { id: input.attachmentId, requestId: input.requestId, removedAt: null },
    });
    if (!att) throw new BusinessError("NOT_FOUND", "Pièce jointe introuvable.");
    await tx.purchaseRequestAttachment.update({ where: { id: att.id }, data: { removedAt: at } });
    await tx.purchaseRequestEvent.create({
      data: { requestId: pr.id, type: "ATTACHMENT_REMOVED", userId: actor.id, comment: att.fileName, createdAt: at },
    });
    await log(tx, {
      userId: actor.id,
      action: "PR_ATTACHMENT_REMOVE",
      entity: "PurchaseRequest",
      entityId: pr.id,
      before: { attachmentId: att.id, fileName: att.fileName, size: att.size },
      ip,
    });
    return att.path;
  });
  // Fichier supprimé après validation de la transaction ; la trace reste dans l'audit et la chronologie.
  try {
    await rm(fileFor(input.requestId, stored), { force: true });
  } catch {
    /* fichier orphelin sans conséquence */
  }
  return { removed: true };
}

/** Lecture pour la route de téléchargement : droit de lecture sur la DA exigé. */
export async function readAttachment(
  user: WorkflowUser,
  requestId: string,
  attachmentId: string,
): Promise<{ bytes: Buffer; mime: string; fileName: string }> {
  const att = await db.purchaseRequestAttachment.findFirst({
    where: { id: attachmentId, requestId, removedAt: null },
    include: { request: { select: { createdById: true, kind: true } } },
  });
  if (!att) throw new BusinessError("NOT_FOUND", "Pièce jointe introuvable.");
  if (!canViewRequest(user, att.request)) throw new BusinessError("FORBIDDEN", "Vous n'avez pas accès à cette pièce jointe.");
  try {
    const bytes = await readFile(fileFor(requestId, att.path));
    return { bytes, mime: att.mimeType, fileName: att.fileName };
  } catch {
    throw new BusinessError("NOT_FOUND", "Fichier introuvable sur le serveur.");
  }
}
