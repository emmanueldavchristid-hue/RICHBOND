"use client";

import { useState } from "react";
import Link from "next/link";
import { Gavel } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { DocNumber } from "@/components/doc-number";
import { EmptyState } from "@/components/empty-state";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { StatusBadge } from "@/components/status-badge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { unitShort } from "@/components/unit-select";
import { useActionRunner } from "@/components/use-action-runner";
import { formatQty } from "@/lib/money";
import { decideNonConformityAction } from "@/app/(app)/stock/receptions/actions";
import type { NonConformityRow } from "@/modules/receiving/types";
import { NC_DECISION_LABELS, NC_OPTIONS, REFUSAL_REASON_LABELS } from "./labels";

function DecisionDialog({ nc, onClose }: { nc: NonConformityRow; onClose: () => void }) {
  const { run, pending } = useActionRunner();
  const [decision, setDecision] = useState("");
  const [comment, setComment] = useState("");
  const [error, setError] = useState<string | null>(null);
  const help = NC_OPTIONS.find((d) => d.value === decision)?.help;

  return (
    <Dialog open onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-lg" data-testid="nc-decision-dialog">
        <DialogHeader>
          <DialogTitle>
            Décision pour <span className="doc-number">{nc.number}</span>
          </DialogTitle>
          <DialogDescription>
            {nc.supplierName} · {nc.itemCode ? `${nc.itemCode} – ` : ""}{nc.designation} · {formatQty(nc.qty)} {unitShort(nc.unit)} refusé ({REFUSAL_REASON_LABELS[nc.reason]}). La décision clôture la non-conformité et ne peut plus être changée.
          </DialogDescription>
        </DialogHeader>
        <FormError message={error} testId="nc-decision-error" />
        <FormField id="nc-decision" label="Décision" required hint={help}>
          <NativeSelect id="nc-decision" className="h-12" value={decision} onChange={(e) => setDecision(e.target.value)} data-testid="nc-decision-select">
            <option value="">Choisir…</option>
            {NC_OPTIONS.map((d) => (
              <option key={d.value} value={d.value}>
                {d.label}
              </option>
            ))}
          </NativeSelect>
        </FormField>
        <FormField id="nc-comment" label="Commentaire (facultatif)">
          <TextArea id="nc-comment" value={comment} maxLength={500} onChange={(e) => setComment(e.target.value)} data-testid="nc-decision-comment" />
        </FormField>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-11 px-4" onClick={onClose} data-testid="nc-decision-cancel">
            Retour
          </Button>
          <WriteButton
            className="h-11 px-4"
            disabled={pending || !decision}
            data-testid="nc-decision-confirm"
            onClick={async () => {
              setError(null);
              await run(() => decideNonConformityAction({ id: nc.id, decision: decision as NonConformityRow["decision"] & string, comment: comment.trim() || undefined }), {
                success: `Décision enregistrée pour ${nc.number}.`,
                onSuccess: onClose,
                onError: (f) => setError(f.message),
              });
            }}
          >
            {pending ? "En cours…" : "Enregistrer la décision"}
          </WriteButton>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/** Liste des non-conformités ; la décision (retour, avoir, remplacement) se prend ici. */
export function NonConformitiesTable({ rows }: { rows: NonConformityRow[] }) {
  const [current, setCurrent] = useState<NonConformityRow | null>(null);

  if (rows.length === 0) {
    return <EmptyState title="Aucune non-conformité" description="Une non-conformité est créée automatiquement lorsqu'une marchandise est refusée à la réception." />;
  }
  return (
    <>
      <div className="overflow-x-auto rounded-xl border bg-card" data-testid="nc-table">
        <table className="w-full min-w-[56rem] text-sm">
          <thead className="text-left text-xs font-medium text-muted-foreground">
            <tr className="border-b">
              <th className="h-10 px-3">N°</th>
              <th className="px-3">Date</th>
              <th className="px-3">Fournisseur</th>
              <th className="px-3">Article</th>
              <th className="px-3 text-right">Quantité</th>
              <th className="px-3">Motif</th>
              <th className="px-3">Réception</th>
              <th className="px-3">Statut</th>
              <th className="px-3">Décision</th>
              <th className="px-3" />
            </tr>
          </thead>
          <tbody className="divide-y">
            {rows.map((r) => (
              <tr key={r.id} className="h-11 transition-colors hover:bg-background" data-testid={`nc-row-${r.number}`}>
                <td className="px-3">
                  <DocNumber value={r.number} />
                </td>
                <td className="px-3 whitespace-nowrap tabular-nums">
                  <DateCell value={r.createdAt} />
                </td>
                <td className="max-w-48 truncate px-3">{r.supplierName}</td>
                <td className="max-w-56 truncate px-3">{r.itemCode ? `${r.itemCode} – ` : ""}{r.designation}</td>
                <td className="px-3 text-right whitespace-nowrap tabular-nums">
                  {formatQty(r.qty)} {unitShort(r.unit)}
                </td>
                <td className="px-3">{REFUSAL_REASON_LABELS[r.reason]}</td>
                <td className="px-3">
                  <Link href={`/stock/receptions/${r.receiptId}`} className="text-primary underline-offset-4 hover:underline">
                    <DocNumber value={r.receiptNumber} />
                  </Link>
                </td>
                <td className="px-3">
                  <StatusBadge status={r.status} />
                </td>
                <td className="px-3" data-testid={`nc-decision-${r.number}`}>
                  {r.decision ? NC_DECISION_LABELS[r.decision] : <span className="text-muted-foreground/70">—</span>}
                </td>
                <td className="px-3 text-right">
                  {r.canDecide ? (
                    <WriteButton variant="outline" size="sm" className="h-9" onClick={() => setCurrent(r)} data-testid={`nc-decide-${r.number}`}>
                      <Gavel /> Décider
                    </WriteButton>
                  ) : null}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {current ? <DecisionDialog nc={current} onClose={() => setCurrent(null)} /> : null}
    </>
  );
}
