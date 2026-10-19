"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { activateLicenseAction } from "./actions";

export function ActivateForm() {
  const router = useRouter();
  const [licensedTo, setLicensedTo] = useState("RICHBOND CI");
  const [key, setKey] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pending, startTransition] = useTransition();

  function activate() {
    setError(null);
    startTransition(async () => {
      const res = await activateLicenseAction({ licensedTo, key });
      setConfirmOpen(false);
      if (res.ok) {
        toast.success("Licence activée.");
        router.refresh();
      } else {
        setError(res.message);
        toast.error(res.message);
      }
    });
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (key.trim().length < 10) {
          setError("Saisissez la clé de licence complète.");
          return;
        }
        setError(null);
        setConfirmOpen(true);
      }}
      className="space-y-3 rounded-lg border bg-card p-4"
      data-testid="activate-form"
      noValidate
    >
      <h2 className="text-lg font-semibold">Activer la licence</h2>
      <p className="text-sm text-muted-foreground">
        La clé est fournie par Christ-Emmanuel Mouhi. L&apos;activation est définitive.
      </p>
      {error ? (
        <div role="alert" data-testid="activate-error" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="licensed-to">Bénéficiaire</Label>
        <Input
          id="licensed-to"
          value={licensedTo}
          onChange={(e) => setLicensedTo(e.target.value)}
          className="h-11 max-w-md"
          data-testid="activate-licensed-to"
        />
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="license-key">Clé de licence</Label>
        <Input
          id="license-key"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="RB-XXXXX-XXXXX-XXXXX-XXXXX"
          autoComplete="off"
          spellCheck={false}
          className="h-11 max-w-md font-mono uppercase"
          data-testid="activate-key"
        />
      </div>
      <Button type="submit" className="h-11 px-5" disabled={pending} data-testid="activate-submit">
        Activer la licence
      </Button>
      <ConfirmDialog
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        title="Activer la licence ?"
        description={`La licence sera activée pour « ${licensedTo.trim()} ». Cette opération est définitive.`}
        confirmLabel="Activer"
        pending={pending}
        onConfirm={activate}
        testId="activate-confirm"
      />
    </form>
  );
}
