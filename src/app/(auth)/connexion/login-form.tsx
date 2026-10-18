"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { loginAction } from "./actions";

export function LoginForm({ retour }: { retour?: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    const email = String(form.get("email") ?? "");
    const password = String(form.get("password") ?? "");
    setError(null);
    startTransition(async () => {
      const res = await loginAction({ email, password, retour });
      if (res.ok) {
        router.push(res.data.redirectTo);
        router.refresh();
      } else {
        setError(res.message);
      }
    });
  }

  return (
    <div className="w-full max-w-md rounded-xl border bg-card p-8 shadow-sm" data-testid="login-card">
      <div className="mb-6 text-center">
        <p className="text-3xl font-bold tracking-wide text-primary">RICHBOND</p>
        <h1 className="mt-1 text-base text-muted-foreground">Achats &amp; Stocks</h1>
      </div>
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        {error ? (
          <div
            role="alert"
            data-testid="login-error"
            className="flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
          >
            <AlertCircle className="mt-0.5 size-4 shrink-0" />
            <span>{error}</span>
          </div>
        ) : null}
        <div className="space-y-1.5">
          <Label htmlFor="email">Adresse email</Label>
          <Input
            id="email"
            name="email"
            type="email"
            autoComplete="username"
            inputMode="email"
            required
            className="h-11"
            data-testid="login-email"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password">Mot de passe</Label>
          <PasswordInput
            id="password"
            name="password"
            autoComplete="current-password"
            required
            data-testid="login-password"
          />
        </div>
        <Button type="submit" className="h-12 w-full text-base" disabled={pending} data-testid="login-submit">
          {pending ? "Connexion en cours…" : "Se connecter"}
        </Button>
      </form>
    </div>
  );
}
