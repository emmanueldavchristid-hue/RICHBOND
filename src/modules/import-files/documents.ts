import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { BusinessError } from "@/lib/errors";
import { log } from "@/modules/audit";
import type { OrderActor } from "@/modules/purchase-orders/internal";
import { ATTACHMENT_MAX_BYTES, detectAttachmentType, sanitizeFileName } from "@/modules/purchase-requests/attachment-type";
import { parseInput } from "@/modules/purchase-requests/parse";
import { idSchema } from "@/modules/referentials/schemas";
import { documentTypeSchema, removeDocumentSchema } from "./schemas";
import { assertImportAccess } from "./scope";

/**
 * Pièces du dossier import (LOT-12) : facture commerciale, packing list, BL/LTA, certificat d'origine, déclaration.
 * PDF ou image (JPEG/PNG), 5 Mo, 30 par dossier. Stockage hors `public/`, nom généré côté serveur.
 */
const MAX_COUNT = 30;
const ROOT = () => path.resolve(process.env.INVOICE_STORAGE_DIR ?? path.join(process.cwd(), "storage"), "import-files");
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_FILE = /^[a-f0-9]{24}\.(pdf|jpg|png)$/;

function fileFor(fileId: string, stored: string): string {
  if (!SAFE_ID.test(fileId)) throw new BusinessError("ATTACHMENT_INVALID", "Identifiant de dossier invalide.");
  if (!SAFE_FILE.test(stored)) throw new BusinessError("ATTACHMENT_INVALID", "Chemin de pièce jointe invalide.");
  return path.join(ROOT(), fileId, stored);
}

export async function addImportDocument(
  actor: OrderActor,
  input: { fileId: string; type: string; fileName: string; bytes: Uint8Array },
  ip?: string | null,
  at: Date = now(),
) {
  assertImportAccess(actor, "importFile.manage");
  const fileId = parseInput(idSchema, input.fileId);
  const type = parseInput(documentTypeSchema, input.type);
  if (input.bytes.length === 0) throw new BusinessError("ATTACHMENT_INVALID", "Fichier vide.");
  if (input.bytes.length > ATTACHMENT_MAX_BYTES) throw new BusinessError("ATTACHMENT_TOO_LARGE", "La pièce jointe dépasse 5 Mo : réduisez-la avant de l'envoyer.");
  const detected = detectAttachmentType(input.bytes);
  if (!detected || !["pdf", "jpg", "png"].includes(detected.ext)) throw new BusinessError("ATTACHMENT_INVALID", "Format non accepté : PDF ou image JPEG ou PNG.");
  const stored = `${randomBytes(12).toString("hex")}.${detected.ext}`;
  const fileName = sanitizeFileName(input.fileName);
  let written: string | null = null;
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM import_files WHERE id = ${fileId} FOR UPDATE`;
      const file = await tx.importFile.findUnique({ where: { id: fileId }, select: { id: true, number: true, status: true } });
      if (!file) throw new BusinessError("NOT_FOUND", "Dossier import introuvable.");
      if (file.status === "ANNULE") throw new BusinessError("INVALID_STATUS", "Ce dossier est annulé.");
      if (file.status === "CLOTURE") throw new BusinessError("INVALID_STATUS", "Ce dossier est clôturé : on n'y ajoute plus de pièce.");
      const count = await tx.importDocument.count({ where: { fileId, removedAt: null } });
      if (count >= MAX_COUNT) throw new BusinessError("ATTACHMENT_LIMIT", `Un dossier ne peut pas dépasser ${MAX_COUNT} pièces.`);
      written = fileFor(fileId, stored);
      await mkdir(path.dirname(written), { recursive: true });
      await writeFile(written, input.bytes);
      const doc = await tx.importDocument.create({
        data: { fileId, type, fileName, mimeType: detected.mime, size: input.bytes.length, path: stored, uploadedById: actor.id, createdAt: at },
      });
      await log(tx, { userId: actor.id, action: "IMPORT_DOCUMENT_ADD", entity: "ImportFile", entityId: fileId, after: { documentId: doc.id, type, fileName, size: doc.size, file: file.number }, ip });
      return { id: doc.id, fileName, type, mimeType: doc.mimeType, size: doc.size };
    });
  } catch (e) {
    if (written) await rm(written, { force: true });
    throw e;
  }
}

export async function removeImportDocument(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()) {
  assertImportAccess(actor, "importFile.manage");
  const { fileId, documentId } = parseInput(removeDocumentSchema, raw);
  const stored = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM import_files WHERE id = ${fileId} FOR UPDATE`;
    const file = await tx.importFile.findUnique({ where: { id: fileId }, select: { id: true, number: true, status: true } });
    if (!file) throw new BusinessError("NOT_FOUND", "Dossier import introuvable.");
    if (file.status !== "OUVERT") throw new BusinessError("INVALID_STATUS", "Les pièces d'un dossier clôturé ou annulé ne se retirent plus.");
    const doc = await tx.importDocument.findFirst({ where: { id: documentId, fileId, removedAt: null } });
    if (!doc) throw new BusinessError("NOT_FOUND", "Pièce jointe introuvable.");
    await tx.importDocument.update({ where: { id: doc.id }, data: { removedAt: at } });
    await log(tx, { userId: actor.id, action: "IMPORT_DOCUMENT_REMOVE", entity: "ImportFile", entityId: fileId, before: { documentId: doc.id, type: doc.type, fileName: doc.fileName, size: doc.size, file: file.number }, ip });
    return doc.path;
  });
  try {
    await rm(fileFor(fileId, stored), { force: true });
  } catch {
    /* fichier orphelin sans conséquence */
  }
  return { removed: true };
}

/** Lecture pour la route de téléchargement : droit `importFile.view` et périmètre IMPORT exigés. */
export async function readImportDocument(user: OrderActor, fileId: string, documentId: string): Promise<{ bytes: Buffer; mime: string; fileName: string }> {
  assertImportAccess(user, "importFile.view");
  if (!idSchema.safeParse(fileId).success || !idSchema.safeParse(documentId).success) throw new BusinessError("VALIDATION", "Identifiant invalide.");
  const doc = await db.importDocument.findFirst({ where: { id: documentId, fileId, removedAt: null } });
  if (!doc) throw new BusinessError("NOT_FOUND", "Pièce jointe introuvable.");
  try {
    return { bytes: await readFile(fileFor(fileId, doc.path)), mime: doc.mimeType, fileName: doc.fileName };
  } catch {
    throw new BusinessError("NOT_FOUND", "Fichier introuvable sur le serveur.");
  }
}
