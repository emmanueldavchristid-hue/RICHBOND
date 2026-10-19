"use client";

import { useState } from "react";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";
import { changePromisedDateAction, confirmOrderAction } from "@/app/(app)/achats/commandes/actions";

/**
 * Confirmation du fournisseur (date promise obligatoire, référence facultative) ou report de la date promise
 * (motif obligatoire : un fournisseur qui repousse plusieurs fois doit se voir).
 */
export function PromiseDialog(props: PromiseProps) {
  const testId = props.mode === "confirm" ? "po-confirm-dialog" : "po-promise-dialog";
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid={testId}>
        <PromiseBody {...props} />
      </DialogContent>
    </Dialog>
  );
}

interface PromiseProps {
  mode: "confirm" | "change";
  open: boolean;
  onOpenChange: (open: boolean) => void;
  orderId: string;
  updatedAt: string;
  displayNumber: string;
  /** Date promise actuelle (yyyy-MM-dd), si elle existe. */
  currentPromised: string | null;
  /** Date du bon (yyyy-MM-dd) : la date promise ne peut pas la précéder. */
  minDate: string;
}

function PromiseBody({
  mode,
  onOpenChange,
  orderId,
  updatedAt,
  displayNumber,
  currentPromised,
  minDate,
}: PromiseProps) {
  const { run, pending } = useActionRunner();
  const [date, setDate] = useState(currentPromised ?? "");
  const [ref, setRef] = useState("");
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!date) return setError("Saisissez la date promise par le fournisseur.");
    if (date < minDate) return setError("La date promise ne peut pas être antérieure à la date du bon de commande.");
    if (mode === "change") {
      if (date === currentPromised) return setError("Choisissez une date différente de la date promise actuelle.");
      if (reason.trim().length < 5) return setError("Le motif du report est obligatoire (5 caractères minimum).");
    }
    setError(null);
    if (mode === "confirm") {
      await run(() => confirmOrderAction({ id: orderId, expectedUpdatedAt: updatedAt, promisedDate: date, supplierRef: ref || null }), {
        success: `${displayNumber} confirmé par le fournisseur.`,
        onSuccess: () => onOpenChange(false),
      });
    } else {
      await run(() => changePromisedDateAction({ id: orderId, expectedUpdatedAt: updatedAt, promisedDate: date, reason: reason.trim() }), {
        success: "Date promise modifiée.",
        onSuccess: () => onOpenChange(false),
      });
    }
  }

  const testId = mode === "confirm" ? "po-confirm-dialog" : "po-promise-dialog";
  return (
    <>
        <DialogHeader>
          <DialogTitle>{mode === "confirm" ? `Confirmation du fournisseur : ${displayNumber}` : `Changer la date promise : ${displayNumber}`}</DialogTitle>
          <DialogDescription>
            {mode === "confirm"
              ? "Saisissez la date de livraison promise par le fournisseur. C'est elle qui sert à repérer les retards."
              : "Chaque report est conservé dans la chronologie : le motif est obligatoire."}
          </DialogDescription>
        </DialogHeader>
        <FormError message={error} testId={`${testId}-error`} />
        <FormField id={`${testId}-date`} label="Date promise" required>
          <Input id={`${testId}-date`} type="date" className="h-11" min={minDate} value={date} onChange={(e) => setDate(e.target.value)} data-testid={`${testId}-date`} />
        </FormField>
        {mode === "confirm" ? (
          <FormField id={`${testId}-ref`} label="Référence du fournisseur (accusé, proforma…)">
            <Input id={`${testId}-ref`} className="h-11" maxLength={60} value={ref} onChange={(e) => setRef(e.target.value)} data-testid={`${testId}-ref`} />
          </FormField>
        ) : (
          <FormField id={`${testId}-reason`} label="Motif du report" required>
            <TextArea id={`${testId}-reason`} className="min-h-20" maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} data-testid={`${testId}-reason`} />
          </FormField>
        )}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="outline" className="h-11 px-4" onClick={() => onOpenChange(false)} data-testid={`${testId}-cancel`}>
            Retour
          </Button>
          <WriteButton type="button" className="h-11 px-4" disabled={pending} onClick={() => void save()} data-testid={`${testId}-confirm`}>
            {pending ? "Enregistrement…" : mode === "confirm" ? "Confirmer la commande" : "Enregistrer la nouvelle date"}
          </WriteButton>
        </div>
    </>
  );
}
