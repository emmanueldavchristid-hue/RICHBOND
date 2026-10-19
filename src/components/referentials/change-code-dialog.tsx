"use client";

import { useState } from "react";
import { KeyRound } from "lucide-react";
import { CodeInput } from "@/components/code-input";
import { FormError, FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionRunner } from "@/components/use-action-runner";
import type { ActionResult } from "@/lib/errors";

/**
 * Changement de code réservé au Responsable (R2) : le code est la clé d'échange avec Sage,
 * le message d'avertissement tient lieu de confirmation.
 */
export function ChangeCodeDialog({
  entityLabel,
  id,
  currentCode,
  updatedAt,
  action,
  testId,
}: {
  entityLabel: string;
  id: string;
  currentCode: string;
  /** Version de la fiche (ISO). */
  updatedAt: string;
  action: (input: unknown) => Promise<ActionResult<unknown>>;
  testId: string;
}) {
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);
  const [code, setCode] = useState(currentCode);
  const [error, setError] = useState<string | null>(null);

  function onOpenChange(next: boolean) {
    setOpen(next);
    if (next) {
      setCode(currentCode);
      setError(null);
    }
  }

  async function submit() {
    setError(null);
    if (code.trim() === "") {
      setError("Le code est obligatoire.");
      return;
    }
    if (code === currentCode) {
      setOpen(false);
      return;
    }
    await run(() => action({ id, code, expectedUpdatedAt: updatedAt }), {
      success: "Code modifié.",
      onSuccess: () => setOpen(false),
      onError: (f) => setError(f.message),
    });
  }

  return (
    <>
      <WriteButton type="button" variant="outline" className="h-11 shrink-0 px-3" onClick={() => onOpenChange(true)} data-testid={`${testId}-open`}>
        <KeyRound /> Modifier le code
      </WriteButton>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-md" data-testid={`${testId}-dialog`}>
          <DialogHeader>
            <DialogTitle>Modifier le code du {entityLabel}</DialogTitle>
            <DialogDescription>
              Attention : ce code est la clé d&apos;échange avec Sage. Ne le changez que si le code Sage a lui-même changé. Le changement est enregistré dans le journal.
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} testId={`${testId}-error`} />
          <FormField id={`${testId}-input`} label="Nouveau code" hint={`Code actuel : ${currentCode}`}>
            <CodeInput id={`${testId}-input`} value={code} onChange={setCode} data-testid={`${testId}-input`} />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setOpen(false)}>
              Annuler
            </Button>
            <Button type="button" className="h-11 px-4" disabled={pending} onClick={() => void submit()} data-testid={`${testId}-confirm`}>
              {pending ? "Enregistrement…" : "Confirmer le changement"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
