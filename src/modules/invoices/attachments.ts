import "server-only";
import { randomBytes } from "node:crypto";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { BusinessError } from "@/lib/errors";
import { requireAction } from "@/lib/permissions";
import { log } from "@/modules/audit";
import { idSchema } from "@/modules/referentials/schemas";
import { ATTACHMENT_MAX_BYTES, detectAttachmentType, sanitizeFileName } from "@/modules/purchase-requests/attachment-type";
import type { OrderActor } from "@/modules/purchase-orders/internal";

/** Pièces jointes d'une facture : PDF ou image (JPEG/PNG), 5 Mo, 10 par facture. Stockage hors `public/`, nom généré côté serveur. */
const MAX_COUNT = 10;
const ROOT = () => path.resolve(process.env.INVOICE_STORAGE_DIR ?? path.join(process.cwd(), "storage"), "invoices");
const SAFE_ID = /^[A-Za-z0-9_-]+$/;
const SAFE_FILE = /^[a-f0-9]{24}\.(pdf|jpg|png)$/;

function fileFor(invoiceId: string, stored: string): string {
  if (!SAFE_ID.test(invoiceId)) throw new BusinessError("ATTACHMENT_INVALID", "Identifiant de facture invalide.");
  if (!SAFE_FILE.test(stored)) throw new BusinessError("ATTACHMENT_INVALID", "Chemin de pièce jointe invalide.");
  return path.join(ROOT(), invoiceId, stored);
}

export async function addInvoiceAttachment(actor: OrderActor, input: { invoiceId: string; fileName: string; bytes: Uint8Array }, ip?: string | null, at: Date = now()) {
  requireAction(actor, "invoice.manage");
  const invoiceId = idSchema.parse(input.invoiceId);
  if (input.bytes.length === 0) throw new BusinessError("ATTACHMENT_INVALID", "Fichier vide.");
  if (input.bytes.length > ATTACHMENT_MAX_BYTES) throw new BusinessError("ATTACHMENT_TOO_LARGE", "La pièce jointe dépasse 5 Mo : réduisez-la avant de l'envoyer.");
  const type = detectAttachmentType(input.bytes);
  if (!type || !["pdf", "jpg", "png"].includes(type.ext)) {
    throw new BusinessError("ATTACHMENT_INVALID", "Format non accepté : PDF ou image JPEG ou PNG.");
  }
  const stored = `${randomBytes(12).toString("hex")}.${type.ext}`;
  const fileName = sanitizeFileName(input.fileName);
  let written: string | null = null;
  try {
    return await db.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${invoiceId} FOR UPDATE`;
      const inv = await tx.supplierInvoice.findUnique({ where: { id: invoiceId }, select: { id: true, number: true, status: true } });
      if (!inv) throw new BusinessError("NOT_FOUND", "Facture introuvable.");
      if (inv.status === "ANNULEE") throw new BusinessError("INVALID_STATUS", "Cette facture est annulée.");
      const count = await tx.supplierInvoiceAttachment.count({ where: { invoiceId, removedAt: null } });
      if (count >= MAX_COUNT) throw new BusinessError("ATTACHMENT_LIMIT", `Une facture ne peut pas dépasser ${MAX_COUNT} pièces jointes.`);
      written = fileFor(invoiceId, stored);
      await mkdir(path.dirname(written), { recursive: true });
      await writeFile(written, input.bytes);
      const att = await tx.supplierInvoiceAttachment.create({
        data: { invoiceId, fileName, mimeType: type.mime, size: input.bytes.length, path: stored, uploadedById: actor.id, createdAt: at },
      });
      await log(tx, { userId: actor.id, action: "INVOICE_ATTACHMENT_ADD", entity: "SupplierInvoice", entityId: invoiceId, after: { attachmentId: att.id, fileName, size: att.size, invoice: inv.number }, ip });
      return { id: att.id, fileName, mimeType: att.mimeType, size: att.size };
    });
  } catch (e) {
    if (written) await rm(written, { force: true });
    throw e;
  }
}

export async function removeInvoiceAttachment(actor: OrderActor, input: { invoiceId: string; attachmentId: string }, ip?: string | null, at: Date = now()) {
  requireAction(actor, "invoice.manage");
  const stored = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM supplier_invoices WHERE id = ${input.invoiceId} FOR UPDATE`;
    const inv = await tx.supplierInvoice.findUnique({ where: { id: input.invoiceId }, select: { id: true, number: true, status: true } });
    if (!inv) throw new BusinessError("NOT_FOUND", "Facture introuvable.");
    if (inv.status === "TRANSMISE" || inv.status === "ANNULEE") throw new BusinessError("INVALID_STATUS", "Les pièces d'une facture transmise ou annulée ne se retirent plus.");
    const att = await tx.supplierInvoiceAttachment.findFirst({ where: { id: input.attachmentId, invoiceId: inv.id, removedAt: null } });
    if (!att) throw new BusinessError("NOT_FOUND", "Pièce jointe introuvable.");
    await tx.supplierInvoiceAttachment.update({ where: { id: att.id }, data: { removedAt: at } });
    await log(tx, { userId: actor.id, action: "INVOICE_ATTACHMENT_REMOVE", entity: "SupplierInvoice", entityId: inv.id, before: { attachmentId: att.id, fileName: att.fileName, size: att.size }, ip });
    return att.path;
  });
  try {
    await rm(fileFor(input.invoiceId, stored), { force: true });
  } catch {
    /* fichier orphelin sans conséquence */
  }
  return { removed: true };
}

/** Lecture pour la route de téléchargement : droit `invoice.view` exigé. */
export async function readInvoiceAttachment(user: OrderActor, invoiceId: string, attachmentId: string): Promise<{ bytes: Buffer; mime: string; fileName: string }> {
  requireAction(user, "invoice.view");
  const att = await db.supplierInvoiceAttachment.findFirst({ where: { id: attachmentId, invoiceId, removedAt: null } });
  if (!att) throw new BusinessError("NOT_FOUND", "Pièce jointe introuvable.");
  try {
    return { bytes: await readFile(fileFor(invoiceId, att.path)), mime: att.mimeType, fileName: att.fileName };
  } catch {
    throw new BusinessError("NOT_FOUND", "Fichier introuvable sur le serveur.");
  }
}
