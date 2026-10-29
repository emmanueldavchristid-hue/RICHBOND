"use client";

import { useRef, useState } from "react";
import { FileText, Trash2, Upload } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateCell } from "@/components/date-cell";
import { WriteButton } from "@/components/license/write-button";
import { useActionRunner } from "@/components/use-action-runner";
import { addInvoiceAttachmentAction, removeInvoiceAttachmentAction } from "../actions";

interface Attachment {
  id: string;
  fileName: string;
  size: number;
  createdAt: Date | string;
}

const sizeLabel = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

export function InvoiceAttachments({ invoiceId, attachments, canEdit }: { invoiceId: string; attachments: Attachment[]; canEdit: boolean }) {
  const { run, pending } = useActionRunner();
  const input = useRef<HTMLInputElement>(null);
  const [toRemove, setToRemove] = useState<Attachment | null>(null);

  async function upload(file: File | undefined) {
    if (!file) return;
    const fd = new FormData();
    fd.set("invoiceId", invoiceId);
    fd.set("file", file);
    await run(() => addInvoiceAttachmentAction(fd), { success: "Pièce jointe ajoutée." });
    if (input.current) input.current.value = "";
  }

  return (
    <section className="rounded-xl border bg-card p-4" data-testid="inv-attachments">
      <h2 className="mb-3 text-[15px] font-semibold">Pièces jointes</h2>
      {attachments.length === 0 ? (
        <p className="text-sm text-muted-foreground" data-testid="inv-attachments-empty">
          Aucune pièce jointe. Ajoutez la facture scannée (PDF, JPG ou PNG, 5 Mo maximum).
        </p>
      ) : (
        <ul className="divide-y">
          {attachments.map((a) => (
            <li key={a.id} className="flex min-h-11 items-center gap-2 py-1.5" data-testid="inv-attachment">
              <FileText className="size-4 shrink-0 text-muted-foreground" />
              <a href={`/api/invoices/${invoiceId}/attachments/${a.id}`} className="min-w-0 flex-1 truncate text-sm text-primary hover:underline" data-testid="inv-attachment-link">
                {a.fileName}
              </a>
              <span className="shrink-0 text-xs text-muted-foreground">
                {sizeLabel(a.size)} · <DateCell value={a.createdAt} />
              </span>
              {canEdit ? (
                <WriteButton variant="ghost" size="icon" className="size-11 text-red-700" aria-label={`Supprimer ${a.fileName}`} onClick={() => setToRemove(a)} data-testid="inv-attachment-remove">
                  <Trash2 />
                </WriteButton>
              ) : null}
            </li>
          ))}
        </ul>
      )}
      {canEdit ? (
        <div className="mt-3">
          <input
            ref={input}
            type="file"
            accept="application/pdf,image/jpeg,image/png"
            className="sr-only"
            tabIndex={-1}
            onChange={(e) => void upload(e.target.files?.[0])}
            data-testid="inv-attachment-input"
          />
          <WriteButton variant="outline" className="h-11 px-4" disabled={pending} onClick={() => input.current?.click()} data-testid="inv-attachment-add">
            <Upload /> {pending ? "Envoi…" : "Ajouter une pièce jointe"}
          </WriteButton>
        </div>
      ) : null}
      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(o) => !o && setToRemove(null)}
        title="Supprimer cette pièce jointe ?"
        description={toRemove ? `« ${toRemove.fileName} » ne sera plus accessible.` : undefined}
        confirmLabel="Supprimer"
        destructive
        pending={pending}
        testId="inv-attachment-remove-dialog"
        onConfirm={async () => {
          if (!toRemove) return;
          await run(() => removeInvoiceAttachmentAction({ id: invoiceId, attachmentId: toRemove.id }), { success: "Pièce jointe supprimée.", onSuccess: () => setToRemove(null) });
        }}
      />
    </section>
  );
}
