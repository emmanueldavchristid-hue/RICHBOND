"use client";

import { useState } from "react";
import { Ban, ShieldCheck } from "lucide-react";
import { toast } from "sonner";
import { FormError, FormField, TextArea } from "@/components/form-field";
import { WriteButton } from "@/components/license/write-button";
import { NativeSelect } from "@/components/native-select";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useActionRunner } from "@/components/use-action-runner";
import { blockSupplierSchema } from "@/modules/suppliers/schemas";
import { blockSupplierAction, unblockSupplierAction } from "../actions";

interface MainItem {
  id: string;
  code: string;
  name: string;
  status: string;
}

/** Bloquer (acheteurs et Responsable) / Débloquer (Responsable seul). Le serveur reste la vraie protection. */
export function SupplierBlockActions({
  id,
  name,
  updatedAt,
  blocked,
  canBlock,
  canUnblock,
  mainItems,
}: {
  id: string;
  name: string;
  updatedAt: string;
  blocked: boolean;
  canBlock: boolean;
  canUnblock: boolean;
  mainItems: MainItem[];
}) {
  const { run, pending } = useActionRunner();
  const [mode, setMode] = useState<"block" | "unblock" | null>(null);
  const [reason, setReason] = useState("");
  const [nextStatus, setNextStatus] = useState("ACTIF");
  const [error, setError] = useState<string | null>(null);
  const affected = mainItems.filter((i) => i.status === "ACTIF");

  function open(m: "block" | "unblock") {
    setMode(m);
    setReason("");
    setNextStatus("ACTIF");
    setError(null);
  }

  async function submitBlock() {
    setError(null);
    const check = blockSupplierSchema.safeParse({ id, reason, expectedUpdatedAt: updatedAt });
    if (!check.success) {
      setError(check.error.issues[0]?.message ?? "Motif invalide.");
      return;
    }
    await run(() => blockSupplierAction({ id, reason, expectedUpdatedAt: updatedAt }), {
      success: "Fournisseur bloqué.",
      onSuccess: (data) => {
        setMode(null);
        const n = (data as { affectedItems: unknown[] }).affectedItems.length;
        if (n > 0) {
          toast.warning(`${n} article(s) ont ce fournisseur comme principal : choisissez-en un autre.`, { duration: 15_000 });
        }
      },
      onError: (f) => setError(f.message),
    });
  }

  async function submitUnblock() {
    setError(null);
    await run(() => unblockSupplierAction({ id, status: nextStatus, expectedUpdatedAt: updatedAt }), {
      success: "Fournisseur débloqué.",
      onSuccess: () => setMode(null),
      onError: (f) => setError(f.message),
    });
  }

  return (
    <>
      {blocked ? (
        canUnblock ? (
          <WriteButton type="button" variant="outline" className="h-11 px-4" onClick={() => open("unblock")} data-testid="supplier-unblock">
            <ShieldCheck /> Débloquer
          </WriteButton>
        ) : (
          <span className="text-sm text-muted-foreground" data-testid="supplier-unblock-hint">
            Seul le Responsable Achats peut débloquer.
          </span>
        )
      ) : canBlock ? (
        <WriteButton type="button" variant="destructive" className="h-11 px-4" onClick={() => open("block")} data-testid="supplier-block">
          <Ban /> Bloquer
        </WriteButton>
      ) : null}

      <Dialog open={mode === "block"} onOpenChange={(o) => (!o ? setMode(null) : undefined)}>
        <DialogContent className="sm:max-w-lg" data-testid="supplier-block-dialog">
          <DialogHeader>
            <DialogTitle>Bloquer {name} ?</DialogTitle>
            <DialogDescription>
              Un fournisseur bloqué ne peut plus recevoir de bon de commande. Seul le Responsable Achats pourra le débloquer.
            </DialogDescription>
          </DialogHeader>
          <FormError message={error} testId="supplier-block-error" />
          {affected.length > 0 ? (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900" data-testid="supplier-block-warning">
              <p className="font-medium">Ce fournisseur est le fournisseur principal de {affected.length} article(s) :</p>
              <ul className="mt-1 list-disc pl-5">
                {affected.slice(0, 8).map((i) => (
                  <li key={i.id}>
                    {i.code} – {i.name}
                  </li>
                ))}
                {affected.length > 8 ? <li>… et {affected.length - 8} autre(s)</li> : null}
              </ul>
              <p className="mt-1">Pensez à leur choisir un autre fournisseur principal.</p>
            </div>
          ) : null}
          <FormField id="block-reason" label="Motif du blocage" required hint="Entre 5 et 500 caractères. Il sera visible sur la fiche et dans le journal.">
            <TextArea id="block-reason" value={reason} maxLength={500} onChange={(e) => setReason(e.target.value)} data-testid="supplier-block-reason" />
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setMode(null)}>
              Annuler
            </Button>
            <Button type="button" variant="destructive" className="h-11 px-4" disabled={pending} onClick={() => void submitBlock()} data-testid="supplier-block-confirm">
              {pending ? "En cours…" : "Bloquer le fournisseur"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog open={mode === "unblock"} onOpenChange={(o) => (!o ? setMode(null) : undefined)}>
        <DialogContent className="sm:max-w-md" data-testid="supplier-unblock-dialog">
          <DialogHeader>
            <DialogTitle>Débloquer {name} ?</DialogTitle>
            <DialogDescription>Le fournisseur pourra de nouveau recevoir des bons de commande. Le motif du blocage sera effacé de la fiche (il reste dans le journal).</DialogDescription>
          </DialogHeader>
          <FormError message={error} testId="supplier-unblock-error" />
          <FormField id="unblock-status" label="Statut après déblocage">
            <NativeSelect id="unblock-status" value={nextStatus} onChange={(e) => setNextStatus(e.target.value)} data-testid="supplier-unblock-status">
              <option value="ACTIF">Actif</option>
              <option value="EN_EVALUATION">En évaluation</option>
            </NativeSelect>
          </FormField>
          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => setMode(null)}>
              Annuler
            </Button>
            <Button type="button" className="h-11 px-4" disabled={pending} onClick={() => void submitUnblock()} data-testid="supplier-unblock-confirm">
              {pending ? "En cours…" : "Débloquer"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
