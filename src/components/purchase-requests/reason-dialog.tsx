"use client";

import { useState, type ReactNode } from "react";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";

function ReasonForm({
  label,
  min,
  max,
  confirmLabel,
  destructive,
  pending,
  error,
  testId,
  hint,
  onCancel,
  onConfirm,
}: {
  label: string;
  min: number;
  max: number;
  confirmLabel: string;
  destructive: boolean;
  pending: boolean;
  error: string | null;
  testId: string;
  hint?: ReactNode;
  onCancel: () => void;
  onConfirm: (reason: string) => void;
}) {
  const [text, setText] = useState("");
  const [local, setLocal] = useState<string | null>(null);
  const length = text.trim().length;

  function submit() {
    if (length < min) {
      setLocal(`${label} obligatoire (${min} caractères minimum).`);
      return;
    }
    setLocal(null);
    onConfirm(text.trim());
  }

  return (
    <>
      <FormError message={error} testId={`${testId}-error`} />
      <FormField
        id={`${testId}-text`}
        label={label}
        required
        error={local ?? undefined}
        hint={
          <>
            {hint ?? `Entre ${min} et ${max} caractères.`}{" "}
            <span data-testid={`${testId}-counter`} className={length > max ? "text-red-700" : undefined}>
              {length} / {max}
            </span>
          </>
        }
      >
        <TextArea
          id={`${testId}-text`}
          value={text}
          maxLength={max}
          onChange={(e) => {
            setText(e.target.value);
            setLocal(null);
          }}
          data-testid={`${testId}-text`}
        />
      </FormField>
      <div className="flex justify-end gap-2">
        <Button type="button" variant="outline" className="h-11 px-4" onClick={onCancel} data-testid={`${testId}-cancel`}>
          Retour
        </Button>
        <Button
          type="button"
          variant={destructive ? "destructive" : "default"}
          className="h-11 px-4"
          disabled={pending}
          onClick={submit}
          data-testid={`${testId}-confirm`}
        >
          {pending ? "En cours…" : confirmLabel}
        </Button>
      </div>
    </>
  );
}

/** Motif obligatoire (refus, retour, annulation) avec compteur de caractères. Le texte se vide à chaque ouverture. */
export function ReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  label = "Motif",
  min = 5,
  max = 500,
  confirmLabel = "Confirmer",
  destructive = false,
  pending = false,
  error = null,
  hint,
  testId = "reason-dialog",
  onConfirm,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: ReactNode;
  label?: string;
  min?: number;
  max?: number;
  confirmLabel?: string;
  destructive?: boolean;
  pending?: boolean;
  error?: string | null;
  hint?: ReactNode;
  testId?: string;
  onConfirm: (reason: string) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg" data-testid={testId}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          {description ? <DialogDescription>{description}</DialogDescription> : null}
        </DialogHeader>
        <ReasonForm
          label={label}
          min={min}
          max={max}
          confirmLabel={confirmLabel}
          destructive={destructive}
          pending={pending}
          error={error}
          hint={hint}
          testId={testId}
          onCancel={() => onOpenChange(false)}
          onConfirm={onConfirm}
        />
      </DialogContent>
    </Dialog>
  );
}
