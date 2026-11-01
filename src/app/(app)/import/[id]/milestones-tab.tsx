"use client";

import { useState } from "react";
import { AlertTriangle, Check, Pencil } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { FormError, FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import { cn } from "@/lib/utils";
import type { MilestoneCode } from "@/modules/import-files/labels";
import { updateMilestoneAction } from "../actions";

export interface MilestoneItem {
  code: MilestoneCode;
  label: string;
  plannedDate: string | null;
  actualDate: string | null;
  late: boolean;
  daysLate: number;
  slipDays: number | null;
  note: string | null;
}

const slip = (d: number) => (d === 0 ? "À l'heure" : d > 0 ? `+${d} j` : `${d} j`);

/** Frise chronologique (prévu / réel) et tableau des 10 jalons, avec édition des dates. */
export function MilestonesTab({ fileId, items, today, canWrite }: { fileId: string; items: MilestoneItem[]; today: string; canWrite: boolean }) {
  const { run, pending } = useActionRunner();
  const [edit, setEdit] = useState<MilestoneItem | null>(null);
  const [planned, setPlanned] = useState("");
  const [actual, setActual] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const currentCode = items.find((m) => !m.actualDate)?.code;

  function open(m: MilestoneItem) {
    setEdit(m);
    setPlanned(m.plannedDate ?? "");
    setActual(m.actualDate ?? "");
    setNote(m.note ?? "");
    setError(null);
  }

  function save() {
    if (!edit) return;
    if (actual && actual > today) return setError("La date réelle ne peut pas être dans le futur : saisissez la date prévue.");
    void run(() => updateMilestoneAction({ fileId, code: edit.code, plannedDate: planned || null, actualDate: actual || null, note: note.trim() || null }), {
      success: `Jalon « ${edit.label} » mis à jour.`,
      onSuccess: () => setEdit(null),
      onError: (e) => setError(e.message),
    });
  }

  return (
    <div className="space-y-5" data-testid="imp-milestones">
      <nav aria-label="Frise des jalons" className="rounded-xl border bg-card px-4 py-4" data-testid="imp-timeline">
        <ol className="flex gap-0 overflow-x-auto">
          {items.map((m, i) => {
            const done = !!m.actualDate;
            const state = done ? "done" : m.late ? "late" : m.code === currentCode ? "current" : "todo";
            return (
              <li key={m.code} className="flex min-w-28 flex-1 flex-col items-center text-center" data-state={state} data-testid={`imp-step-${m.code}`}>
                <div className="flex w-full items-center">
                  <span className={cn("h-px flex-1", i === 0 ? "bg-transparent" : done || state === "late" || state === "current" ? "bg-primary" : "bg-border")} aria-hidden />
                  <span
                    className={cn(
                      "inline-flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                      state === "done" && "bg-primary text-primary-foreground",
                      state === "late" && "bg-red-600 text-white",
                      state === "current" && "border-2 border-primary text-primary",
                      state === "todo" && "border border-input text-muted-foreground",
                    )}
                  >
                    {state === "done" ? <Check className="size-4" aria-hidden /> : state === "late" ? <AlertTriangle className="size-3.5" aria-hidden /> : i + 1}
                  </span>
                  <span className={cn("h-px flex-1", i === items.length - 1 ? "bg-transparent" : done ? "bg-primary" : "bg-border")} aria-hidden />
                </div>
                <p className={cn("mt-2 px-1 text-xs leading-tight", state === "todo" ? "text-muted-foreground" : "font-medium text-foreground")}>{m.label}</p>
                <p className="mt-1 text-[11px] text-muted-foreground tabular-nums">
                  {done ? (
                    <>
                      réel <DateCell value={m.actualDate} />
                    </>
                  ) : (
                    <>
                      prévu <DateCell value={m.plannedDate} />
                    </>
                  )}
                </p>
                {state === "late" ? <p className="text-[11px] font-medium text-red-700">{m.daysLate} j de retard</p> : null}
              </li>
            );
          })}
        </ol>
      </nav>

      <section className="rounded-xl border bg-card p-4">
        <h2 className="mb-3 text-[15px] font-semibold">Dates prévues et réelles</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[720px] text-sm">
            <thead>
              <tr className="border-b text-left text-xs font-medium text-muted-foreground">
                <th className="py-2 pr-3">Jalon</th>
                <th className="py-2 pr-3">Prévu le</th>
                <th className="py-2 pr-3">Réalisé le</th>
                <th className="py-2 pr-3">Écart</th>
                <th className="py-2 pr-3">Remarque</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody>
              {items.map((m) => (
                <tr key={m.code} className={cn("border-b last:border-0", m.late && "bg-red-50/60")} data-testid={`imp-milestone-${m.code}`} data-late={m.late}>
                  <td className="py-2.5 pr-3 font-medium">{m.label}</td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    <DateCell value={m.plannedDate} />
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    <DateCell value={m.actualDate} />
                  </td>
                  <td className="py-2.5 pr-3 tabular-nums">
                    {m.late ? (
                      <span className="font-medium text-red-700">{m.daysLate} j de retard</span>
                    ) : m.slipDays !== null ? (
                      <span className={m.slipDays > 0 ? "text-amber-700" : "text-muted-foreground"}>{slip(m.slipDays)}</span>
                    ) : (
                      <span className="text-muted-foreground/70">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-3 text-muted-foreground">{m.note ?? "—"}</td>
                  <td className="py-2.5 text-right">
                    {canWrite ? (
                      <WriteButton variant="ghost" className="h-11 px-3" onClick={() => open(m)} data-testid={`imp-milestone-edit-${m.code}`}>
                        <Pencil /> Modifier
                      </WriteButton>
                    ) : null}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <Dialog open={!!edit} onOpenChange={(o) => !o && setEdit(null)}>
        <DialogContent className="sm:max-w-md" data-testid="imp-milestone-dialog">
          <DialogHeader>
            <DialogTitle>{edit?.label}</DialogTitle>
            <DialogDescription>Videz une date pour l&apos;effacer. La date réelle ne peut pas être dans le futur.</DialogDescription>
          </DialogHeader>
          <FormError message={error} testId="imp-milestone-error" />
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField id="imp-ms-planned" label="Date prévue">
              <Input id="imp-ms-planned" type="date" className="h-11" value={planned} onChange={(e) => setPlanned(e.target.value)} data-testid="imp-ms-planned" />
            </FormField>
            <FormField id="imp-ms-actual" label="Date réelle">
              <Input id="imp-ms-actual" type="date" className="h-11" value={actual} max={today} onChange={(e) => setActual(e.target.value)} data-testid="imp-ms-actual" />
            </FormField>
          </div>
          <Button type="button" variant="outline" className="h-11 self-start px-3" onClick={() => setActual(today)} data-testid="imp-ms-today">
            Réalisé aujourd&apos;hui
          </Button>
          <FormField id="imp-ms-note" label="Remarque">
            <Input id="imp-ms-note" className="h-11" maxLength={300} value={note} onChange={(e) => setNote(e.target.value)} data-testid="imp-ms-note" />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setEdit(null)}>
              Retour
            </Button>
            <WriteButton className="h-11 px-4" disabled={pending} onClick={save} data-testid="imp-ms-save">
              {pending ? "En cours…" : "Enregistrer"}
            </WriteButton>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
