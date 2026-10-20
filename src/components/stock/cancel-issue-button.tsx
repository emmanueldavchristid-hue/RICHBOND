"use client";

import { useState } from "react";
import { Undo2 } from "lucide-react";
import { ReasonDialog } from "@/components/purchase-requests/reason-dialog";
import { WriteButton } from "@/components/license/write-button";
import { useActionRunner } from "@/components/use-action-runner";
import { cancelIssueAction } from "@/app/(app)/stock/sorties/actions";

/** Annulation d'une sortie par contre-passation (Responsable) : motif obligatoire, le stock est remis. */
export function CancelIssueButton({ id, number }: { id: string; number: string }) {
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function confirm(reason: string) {
    setError(null);
    await run(() => cancelIssueAction({ id, reason }), {
      success: `Sortie ${number} annulée. Le stock a été remis.`,
      onSuccess: () => setOpen(false),
      onError: (f) => setError(f.message),
    });
  }

  return (
    <>
      <WriteButton variant="outline" className="h-11 px-4" onClick={() => setOpen(true)} data-testid="sor-cancel">
        <Undo2 /> Annuler la sortie
      </WriteButton>
      <ReasonDialog
        open={open}
        onOpenChange={setOpen}
        title={`Annuler la sortie ${number} ?`}
        description="Les quantités sortent du bon et retournent en stock au même coût. Cette action est tracée et ne peut pas être défaite."
        label="Motif de l'annulation"
        confirmLabel="Annuler la sortie"
        destructive
        pending={pending}
        error={error}
        testId="sor-cancel-dialog"
        onConfirm={(r) => void confirm(r)}
      />
    </>
  );
}
