/** D15 : PDF, JPEG, PNG, XLSX, DOCX ; 5 Mo ; type vérifié par la signature (jamais par l'extension ni le type annoncé). */
export const ATTACHMENT_MAX_BYTES = 5 * 1024 * 1024;
export const ATTACHMENT_MAX_COUNT = 5;

export interface AttachmentType {
  ext: "pdf" | "jpg" | "png" | "xlsx" | "docx";
  mime: string;
}

const MIME = {
  pdf: "application/pdf",
  jpg: "image/jpeg",
  png: "image/png",
  xlsx: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
} as const;

function contains(bytes: Uint8Array, needle: string): boolean {
  return Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength).includes(Buffer.from(needle, "latin1"));
}

export function detectAttachmentType(b: Uint8Array): AttachmentType | null {
  if (b.length >= 5 && b[0] === 0x25 && b[1] === 0x50 && b[2] === 0x44 && b[3] === 0x46 && b[4] === 0x2d) {
    return { ext: "pdf", mime: MIME.pdf };
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return { ext: "jpg", mime: MIME.jpg };
  if (
    b.length >= 8 &&
    b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47 &&
    b[4] === 0x0d && b[5] === 0x0a && b[6] === 0x1a && b[7] === 0x0a
  ) {
    return { ext: "png", mime: MIME.png };
  }
  // Office Open XML : archive ZIP dont les noms d'entrée désignent Word ou Excel.
  if (b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04) {
    if (contains(b, "word/document.xml")) return { ext: "docx", mime: MIME.docx };
    if (contains(b, "xl/workbook.xml")) return { ext: "xlsx", mime: MIME.xlsx };
  }
  return null;
}

/** Nom d'affichage nettoyé (jamais utilisé comme chemin). */
export function sanitizeFileName(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? "";
  const cleaned = base.replace(/[\u0000-\u001f\u007f<>:"|?*]/g, "").trim();
  return (cleaned || "piece-jointe").slice(0, 120);
}
