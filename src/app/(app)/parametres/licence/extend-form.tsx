"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { extendTrialAction } from "./actions";

export function ExtendForm({ minDate }: { minDate: string }) {
  const router = useRouter();
  const [date, setDate] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function submit(confirmShorten: boolean) {
    setError(null);
    startTransition(async () => {
      const res = await extendTrialAction(confirmShorten ? { date, confirmShorten: true } : { date });
      if (res.ok) {
        toast.success("Période d'essai mise à jour.");
        setConfirmOpen(false);
        setDate("");
        router.refresh();
      } else if (res.code === "CONFIRMATION_REQUIRED") {
        setConfirmOpen(true);
      } else {
        setConfirmOpen(false);
        setError(res.message);
        toast.error(res.message);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (!date) {
          setError("Choisissez la nouvelle date de fin.");
          return;
        }
        submit(false);
      }}
      className="space-y-3 rounded-lg border bg-card p-4"
      data-testid="extend-form"
      noValidate
    >
      <h2 className="text-lg font-semibold">Prolonger l&apos;essai</h2>
      <p className="text-sm text-muted-foreground">
        L&apos;essai reste ouvert jusqu&apos;à 23 h 59 (heure d&apos;Abidjan) de la date choisie.
      </p>
      {error ? (
        <div role="alert" data-testid="extend-error" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="extend-date">Nouvelle date de fin</Label>
        <Input
          id="extend-date"
          type="date"
          min={minDate}
          value={date}
          onChange={(e) => setDate(e.target.value)}
          className="h-11 max-w-60"
          data-testid="extend-date"
        />
      </div>
      <Button type="submit" className="h-11 px-5" disabled={pending} data-testid="extend-submit">
        {pending ? "Enregistrement…" : "Prolonger l'essai"}
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Raccourcir l'essai ?"
        description="Cette date est antérieure à la fin actuelle : l'essai sera raccourci. Voulez-vous continuer ?"
        confirmLabel="Raccourcir"
        destructive
        pending={pending}
        onConfirm={() => submit(true)}
        testId="extend-confirm"
      />
    </form>
  );
}
