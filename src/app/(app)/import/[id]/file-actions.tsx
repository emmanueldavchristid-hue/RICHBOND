"use client";

import { useState } from "react";
import { Ban, CheckCircle2, FileSpreadsheet, FileText } from "lucide-react";
import { WriteButton } from "@/components/license/write-button";
import { ReasonDialog } from "@/components/purchase-requests/reason-dialog";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionRunner } from "@/components/use-action-runner";
import { cancelImportFileAction, closeImportFileAction } from "../actions";

const BTN = "h-11 px-4";

/**
 * Boutons de l'en-tête du dossier : exports de la fiche, clôture (confirmation explicite si des frais sont encore estimés)
 * et annulation (motif obligatoire). Le serveur revérifie tout : ces boutons ne sont qu'un confort.
 */
export function FileActions({
  id,
  number,
  canManage,
  canClose,
  closable,
  estimatedCount,
}: {
  id: string;
  number: string;
  canManage: boolean;
  canClose: boolean;
  closable: { ok: boolean; reasons: string[] };
  estimatedCount: number;
}) {
  const { run, pending } = useActionRunner();
  const [dialog, setDialog] = useState<null | "close" | "cancel">(null);
  const [ack, setAck] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const done = () => {
    setDialog(null);
    setAck(false);
    setError(null);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" data-testid="imp-actions">
        <a
          href={`/api/import-files/${id}/fiche?format=xlsx`}
          download
          className="inline-flex h-11 items-center gap-1.5 rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
          data-testid="imp-export-xlsx"
        >
          <FileSpreadsheet className="size-4" aria-hidden /> Fiche Excel
        </a>
        <a
          href={`/api/import-files/${id}/fiche?format=pdf`}
          download
          className="inline-flex h-11 items-center gap-1.5 rounded-lg border bg-background px-4 text-sm font-medium hover:bg-muted"
          data-testid="imp-export-pdf"
        >
          <FileText className="size-4" aria-hidden /> Fiche PDF
        </a>
        {canManage ? (
          <WriteButton variant="ghost" className={`${BTN} text-red-700`} onClick={() => setDialog("cancel")} data-testid="imp-cancel">
            <Ban /> Annuler le dossier
          </WriteButton>
        ) : null}
        {canClose ? (
          <WriteButton className={BTN} disabled={!closable.ok || pending} onClick={() => setDialog("close")} data-testid="imp-close" title={closable.ok ? undefined : closable.reasons.join(" ")}>
            <CheckCircle2 /> Clôturer le dossier
          </WriteButton>
        ) : null}
      </div>

      <Dialog open={dialog === "close"} onOpenChange={(o) => !o && done()}>
        <DialogContent className="sm:max-w-lg" data-testid="imp-close-dialog">
          <DialogHeader>
            <DialogTitle>Clôturer le dossier {number} ?</DialogTitle>
            <DialogDescription>
              Le coût de revient est figé et le coût moyen pondéré (PMP) du stock restant est réévalué. Cette action est définitive : les frais ne pourront plus être modifiés.
            </DialogDescription>
          </DialogHeader>
          {error ? (
            <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" data-testid="imp-close-error">
              {error}
            </p>
          ) : null}
          {estimatedCount > 0 ? (
            <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="imp-close-estimated">
              <input type="checkbox" className="mt-0.5 size-5 shrink-0" checked={ack} onChange={(e) => setAck(e.target.checked)} data-testid="imp-close-ack" />
              <span>
                <strong>{estimatedCount}</strong> {estimatedCount > 1 ? "frais sont encore estimés" : "frais est encore estimé"} (pas de montant réel saisi). Je confirme les clôturer avec ces estimations.
              </span>
            </label>
          ) : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className={BTN} onClick={done} data-testid="imp-close-dialog-cancel">
              Retour
            </Button>
            <Button
              type="button"
              className={BTN}
              disabled={pending || (estimatedCount > 0 && !ack)}
              data-testid="imp-close-dialog-confirm"
              onClick={() =>
                void run(() => closeImportFileAction({ id, confirmEstimated: ack }), {
                  success: (d) => `Dossier clôturé. Coefficient d'approche : ${d.coefficient ?? "—"}.`,
                  onSuccess: done,
                  onError: (e) => setError(e.message),
                })
              }
            >
              {pending ? "En cours…" : "Clôturer définitivement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <ReasonDialog
        open={dialog === "cancel"}
        onOpenChange={(o) => !o && done()}
        title={`Annuler le dossier ${number} ?`}
        description="Le dossier est fermé sans calcul de coût de revient. Les bons de commande sont libérés. Cette action est définitive."
        label="Motif de l'annulation"
        min={5}
        max={300}
        confirmLabel="Annuler le dossier"
        destructive
        pending={pending}
        error={error}
        testId="imp-cancel-dialog"
        onConfirm={(reason) => void run(() => cancelImportFileAction({ id, reason }), { success: "Dossier annulé.", onSuccess: done, onError: (e) => setError(e.message) })}
      />
    </>
  );
}
