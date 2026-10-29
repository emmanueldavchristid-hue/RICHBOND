"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Play, XCircle } from "lucide-react";
import { cancelInventoryCountAction, openInventoryCountAction } from "@/app/(app)/stock/inventaires/actions";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { FormField } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useActionRunner } from "@/components/use-action-runner";

/** Ouvre le comptage (PRÉPARÉ -> EN COMPTAGE) : le stock théorique est figé à cet instant. */
export function OpenCountButton({ countId, number, blind = false }: { countId: string; number: string; blind?: boolean }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);

  async function confirm() {
    const res = await run(() => openInventoryCountAction({ countId }), {
      success: `Comptage de ${number} ouvert.`,
      refresh: false,
      onSuccess: () => router.push(`/stock/inventaires/${countId}/comptage`),
    });
    if (res && !res.ok) setOpen(false);
  }

  return (
    <>
      <WriteButton className="h-14 px-8 text-base" onClick={() => setOpen(true)} data-testid="inv-open">
        <Play /> Commencer le comptage
      </WriteButton>
      <ConfirmDialog
        open={open}
        onOpenChange={setOpen}
        title="Commencer le comptage ?"
        description={
          blind
            ? "Vous allez compter sans voir les quantités attendues. Le stock de l'application est photographié maintenant : comptez ce que vous voyez sur les étagères."
            : "Le stock théorique de chaque article est figé à cet instant, puis le magasin compte sans le voir. La liste ne pourra plus être modifiée."
        }
        confirmLabel="Commencer le comptage"
        pending={pending}
        onConfirm={confirm}
        testId="inv-open-confirm"
      />
    </>
  );
}

/** Annulation d'un inventaire non validé : motif obligatoire, aucun mouvement de stock. */
export function CancelInventoryButton({ countId, number }: { countId: string; number: string }) {
  const router = useRouter();
  const { run, pending } = useActionRunner();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function confirm() {
    if (reason.trim().length < 3) {
      setError("Indiquez le motif de l'annulation (3 caractères minimum).");
      return;
    }
    setError(null);
    const res = await run(() => cancelInventoryCountAction({ countId, reason: reason.trim() }), {
      success: `Inventaire ${number} annulé. Le stock n'a pas été modifié.`,
      refresh: false,
      onSuccess: () => {
        setOpen(false);
        router.push("/stock/inventaires");
        router.refresh();
      },
    });
    if (res && !res.ok) setOpen(false);
  }

  return (
    <>
      <WriteButton variant="outline" className="h-11 px-4" onClick={() => setOpen(true)} data-testid="inv-cancel">
        <XCircle /> Annuler l&apos;inventaire
      </WriteButton>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          setOpen(o);
          if (!o) setError(null);
        }}
      >
        <DialogContent data-testid="inv-cancel-confirm">
          <DialogHeader>
            <DialogTitle>Annuler l&apos;inventaire {number} ?</DialogTitle>
            <DialogDescription>Les comptages saisis seront abandonnés. Cette action est définitive et ne modifie pas le stock.</DialogDescription>
          </DialogHeader>
          <FormField id="inv-cancel-reason" label="Motif de l'annulation" required error={error ?? undefined}>
            <Input
              id="inv-cancel-reason"
              className="h-12 text-base"
              maxLength={300}
              autoComplete="off"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              data-testid="inv-cancel-reason"
            />
          </FormField>
          <DialogFooter>
            <Button variant="outline" className="h-11 px-4" onClick={() => setOpen(false)} data-testid="inv-cancel-confirm-cancel">
              Retour
            </Button>
            <Button variant="destructive" className="h-11 px-4" disabled={pending} onClick={() => void confirm()} data-testid="inv-cancel-confirm-confirm">
              {pending ? "En cours…" : "Annuler l'inventaire"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
