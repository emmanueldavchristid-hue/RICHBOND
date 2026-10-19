"use client";

import { useRef, useState } from "react";
import { Download, Paperclip, Trash2, X } from "lucide-react";
import { toast } from "sonner";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { WriteButton } from "@/components/license/write-button";
import { useActionRunner } from "@/components/use-action-runner";
import { addAttachmentAction, removeAttachmentAction } from "@/app/(app)/achats/demandes/actions";
import { ATTACHMENT_MAX_BYTES, ATTACHMENT_MAX_COUNT } from "@/modules/purchase-requests/attachment-type";

export interface AttachmentView {
  id: string;
  fileName: string;
  mimeType: string;
  size: number;
}

const ACCEPT = ".pdf,.jpg,.jpeg,.png,.xlsx,.docx";
const EXTENSIONS = ["pdf", "jpg", "jpeg", "png", "xlsx", "docx"];

export const formatFileSize = (n: number) => (n >= 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

/**
 * Pièces jointes d'une DA : PDF, JPEG, PNG, Excel, Word ; 5 Mo et 5 fichiers au maximum.
 * Avec `onPendingChange`, les fichiers choisis sont gardés pour être envoyés après l'enregistrement de la DA
 * (formulaire de création) ; sinon ils partent tout de suite.
 */
export function AttachmentsPanel({
  requestId,
  items,
  canEdit,
  pendingFiles = [],
  onPendingChange,
  testId = "pr-attachments",
}: {
  requestId: string | null;
  items: AttachmentView[];
  canEdit: boolean;
  pendingFiles?: File[];
  onPendingChange?: (files: File[]) => void;
  testId?: string;
}) {
  const { run, pending } = useActionRunner();
  const [toRemove, setToRemove] = useState<AttachmentView | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const total = items.length + pendingFiles.length;

  async function onPick(list: FileList | null) {
    const files = Array.from(list ?? []);
    if (input.current) input.current.value = "";
    if (files.length === 0) return;
    const accepted: File[] = [];
    for (const f of files) {
      const ext = f.name.split(".").pop()?.toLowerCase() ?? "";
      if (!EXTENSIONS.includes(ext)) {
        toast.error(`« ${f.name} » : format non accepté (PDF, JPEG, PNG, Excel ou Word).`);
      } else if (f.size > ATTACHMENT_MAX_BYTES) {
        toast.error(`« ${f.name} » dépasse 5 Mo : réduisez-le avant de l'envoyer.`);
      } else if (total + accepted.length >= ATTACHMENT_MAX_COUNT) {
        toast.error(`Une demande ne peut pas dépasser ${ATTACHMENT_MAX_COUNT} pièces jointes.`);
        break;
      } else {
        accepted.push(f);
      }
    }
    if (accepted.length === 0) return;
    if (onPendingChange) {
      onPendingChange([...pendingFiles, ...accepted]);
      return;
    }
    if (!requestId) return;
    for (const f of accepted) {
      const fd = new FormData();
      fd.set("requestId", requestId);
      fd.set("file", f);
      const res = await run(() => addAttachmentAction(fd), { success: `Pièce jointe « ${f.name} » ajoutée.` });
      if (!res?.ok) break;
    }
  }

  return (
    <div className="space-y-3" data-testid={testId}>
      {items.length === 0 && pendingFiles.length === 0 ? <p className="text-sm text-muted-foreground">Aucune pièce jointe.</p> : null}
      <ul className="divide-y rounded-lg border bg-card empty:hidden">
        {items.map((a) => (
          <li key={a.id} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 text-sm" data-testid={`pr-attachment-${a.fileName}`}>
            <a
              href={`/api/purchase-requests/${requestId}/attachments/${a.id}`}
              className="flex min-w-0 items-center gap-2 text-primary underline-offset-4 hover:underline"
              data-testid="pr-attachment-link"
            >
              <Download className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{a.fileName}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(a.size)}</span>
            </a>
            {canEdit && requestId ? (
              <WriteButton
                type="button"
                variant="ghost"
                className="size-11 shrink-0 p-0"
                aria-label={`Retirer ${a.fileName}`}
                onClick={() => setToRemove(a)}
                data-testid="pr-attachment-remove"
              >
                <Trash2 />
              </WriteButton>
            ) : null}
          </li>
        ))}
        {pendingFiles.map((f, i) => (
          <li key={`${f.name}-${i}`} className="flex min-h-12 items-center justify-between gap-3 px-3 py-2 text-sm" data-testid={`pr-attachment-pending-${f.name}`}>
            <span className="flex min-w-0 items-center gap-2">
              <Paperclip className="size-4 shrink-0" aria-hidden />
              <span className="truncate">{f.name}</span>
              <span className="shrink-0 text-xs text-muted-foreground">{formatFileSize(f.size)} · sera envoyé à l&apos;enregistrement</span>
            </span>
            <button
              type="button"
              className="inline-flex size-11 shrink-0 items-center justify-center rounded-lg hover:bg-muted"
              aria-label={`Ne pas joindre ${f.name}`}
              onClick={() => onPendingChange?.(pendingFiles.filter((_, idx) => idx !== i))}
            >
              <X className="size-4" />
            </button>
          </li>
        ))}
      </ul>

      {canEdit ? (
        <div>
          <input
            ref={input}
            id={`${testId}-input`}
            type="file"
            multiple
            accept={ACCEPT}
            className="sr-only"
            disabled={total >= ATTACHMENT_MAX_COUNT || pending}
            onChange={(e) => void onPick(e.target.files)}
            data-testid="pr-attachment-input"
          />
          <WriteButton
            type="button"
            variant="outline"
            className="h-11 px-4"
            disabled={total >= ATTACHMENT_MAX_COUNT || pending}
            onClick={() => input.current?.click()}
            data-testid="pr-attachment-add"
          >
            <Paperclip /> {pending ? "Envoi…" : "Ajouter une pièce jointe"}
          </WriteButton>
          <p className="mt-1 text-xs text-muted-foreground">PDF, JPEG, PNG, Excel ou Word · 5 Mo maximum · 5 pièces par demande (devis, photo de la pièce cassée…).</p>
        </div>
      ) : null}

      <ConfirmDialog
        open={toRemove !== null}
        onOpenChange={(o) => (!o ? setToRemove(null) : undefined)}
        title="Retirer cette pièce jointe ?"
        description={toRemove ? `« ${toRemove.fileName} » sera retirée de la demande (la suppression reste tracée dans la chronologie).` : undefined}
        confirmLabel="Retirer"
        destructive
        pending={pending}
        testId="pr-attachment-remove-dialog"
        onConfirm={async () => {
          if (!toRemove || !requestId) return;
          await run(() => removeAttachmentAction({ id: requestId, attachmentId: toRemove.id }), {
            success: "Pièce jointe retirée.",
            onSuccess: () => setToRemove(null),
          });
        }}
      />
    </div>
  );
}
