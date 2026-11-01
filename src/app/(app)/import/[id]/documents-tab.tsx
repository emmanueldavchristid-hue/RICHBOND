"use client";

import { useRef, useState } from "react";
import { Download, FileText, Trash2, Upload } from "lucide-react";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { DateCell } from "@/components/date-cell";
import { EmptyState } from "@/components/empty-state";
import { FormError, FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type DocumentTypeCode } from "@/modules/import-files/labels";
import { addImportDocumentAction, removeImportDocumentAction } from "../actions";

export interface DocumentView {
  id: string;
  type: string;
  fileName: string;
  size: number;
  createdAt: string | Date;
}

const size = (n: number) => (n >= 1_048_576 ? `${(n / 1_048_576).toFixed(1).replace(".", ",")} Mo` : `${Math.max(1, Math.round(n / 1024))} Ko`);

/** Pièces du dossier : facture commerciale, packing list, connaissement, certificat d'origine, déclaration en douane. */
export function DocumentsTab({ fileId, documents, canWrite }: { fileId: string; documents: DocumentView[]; canWrite: boolean }) {
  const { run, pending } = useActionRunner();
  const [type, setType] = useState<DocumentTypeCode>("FACTURE_COMMERCIALE");
  const [error, setError] = useState<string | null>(null);
  const [removing, setRemoving] = useState<DocumentView | null>(null);
  const input = useRef<HTMLInputElement>(null);

  function upload() {
    setError(null);
    const file = input.current?.files?.[0];
    if (!file) return setError("Choisissez un fichier à ajouter.");
    const fd = new FormData();
    fd.set("fileId", fileId);
    fd.set("type", type);
    fd.set("file", file);
    void run(() => addImportDocumentAction(fd), {
      success: "Document ajouté.",
      onSuccess: () => {
        if (input.current) input.current.value = "";
      },
      onError: (e) => setError(e.message),
    });
  }

  return (
    <div className="space-y-5" data-testid="imp-documents">
      {canWrite ? (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-[15px] font-semibold">Ajouter un document</h2>
          <FormError message={error} testId="imp-doc-error" />
          <div className="mt-2 grid items-end gap-3 sm:grid-cols-[14rem_1fr_auto]">
            <FormField id="imp-doc-type" label="Type de document">
              <NativeSelect id="imp-doc-type" value={type} onChange={(e) => setType(e.target.value as DocumentTypeCode)} data-testid="imp-doc-type">
                {DOCUMENT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {DOCUMENT_TYPE_LABELS[t]}
                  </option>
                ))}
              </NativeSelect>
            </FormField>
            <FormField id="imp-doc-file" label="Fichier" hint="PDF, JPEG ou PNG, 5 Mo au plus.">
              <Input id="imp-doc-file" ref={input} type="file" accept=".pdf,.jpg,.jpeg,.png" className="h-11 pt-2" data-testid="imp-doc-file" />
            </FormField>
            <WriteButton className="h-11 px-4" disabled={pending} onClick={upload} data-testid="imp-doc-upload">
              <Upload /> Ajouter
            </WriteButton>
          </div>
        </section>
      ) : null}

      {documents.length === 0 ? (
        <EmptyState icon={<FileText />} title="Aucun document" description="Ajoutez la facture commerciale, la packing list, le connaissement, le certificat d'origine ou la déclaration en douane." />
      ) : (
        <section className="rounded-xl border bg-card p-4">
          <h2 className="mb-3 text-[15px] font-semibold">Documents du dossier</h2>
          <ul className="divide-y" data-testid="imp-doc-list">
            {documents.map((d) => (
              <li key={d.id} className="flex flex-wrap items-center gap-3 py-2.5" data-testid={`imp-doc-${d.id}`}>
                <FileText className="size-5 shrink-0 text-muted-foreground" aria-hidden />
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-medium">{d.fileName}</p>
                  <p className="text-xs text-muted-foreground">
                    {DOCUMENT_TYPE_LABELS[d.type as DocumentTypeCode] ?? d.type} · {size(d.size)} · ajouté le <DateCell value={d.createdAt} />
                  </p>
                </div>
                <a
                  href={`/api/import-files/${fileId}/documents/${d.id}`}
                  download
                  className="inline-flex h-11 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium hover:bg-muted"
                  data-testid="imp-doc-download"
                >
                  <Download className="size-4" aria-hidden /> Télécharger
                </a>
                {canWrite ? (
                  <WriteButton variant="ghost" className="h-11 px-3 text-red-700" onClick={() => setRemoving(d)} aria-label={`Supprimer ${d.fileName}`} data-testid="imp-doc-remove">
                    <Trash2 />
                  </WriteButton>
                ) : null}
              </li>
            ))}
          </ul>
        </section>
      )}

      <ConfirmDialog
        open={!!removing}
        onOpenChange={(o) => !o && setRemoving(null)}
        title={`Supprimer « ${removing?.fileName ?? ""} » ?`}
        description="Le document n'apparaîtra plus dans le dossier. La suppression est tracée dans le journal."
        confirmLabel="Supprimer le document"
        destructive
        pending={pending}
        testId="imp-doc-remove-dialog"
        onConfirm={async () => {
          if (!removing) return;
          await run(() => removeImportDocumentAction({ fileId, documentId: removing.id }), { success: "Document supprimé.", onSuccess: () => setRemoving(null) });
        }}
      />
    </div>
  );
}
