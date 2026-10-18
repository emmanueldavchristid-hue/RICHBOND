"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { PasswordInput } from "@/components/password-input";
import { changePasswordSchema } from "@/modules/auth/schemas";
import { changePasswordAction } from "./actions";

type FormValues = { currentPassword: string; newPassword: string; confirmPassword: string };

export function ChangePasswordForm({ forced }: { forced: boolean }) {
  const router = useRouter();
  const [serverError, setServerError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const {
    register,
    handleSubmit,
    reset,
    formState: { errors },
  } = useForm<FormValues>({
    resolver: zodResolver(changePasswordSchema),
    defaultValues: { currentPassword: "", newPassword: "", confirmPassword: "" },
  });

  function onSubmit(values: FormValues) {
    setServerError(null);
    startTransition(async () => {
      const res = await changePasswordAction(values);
      if (res.ok) {
        toast.success("Mot de passe modifié.");
        reset();
        router.push("/accueil");
        router.refresh();
      } else {
        setServerError(res.message);
        toast.error(res.message);
      }
    });
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-4 rounded-lg border bg-card p-4"
      data-testid="change-password-form"
      noValidate
    >
      <h2 className="text-lg font-semibold">{forced ? "Définir mon mot de passe" : "Changer mon mot de passe"}</h2>
      {serverError ? (
        <div role="alert" data-testid="password-error" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">
          {serverError}
        </div>
      ) : null}
      <div className="space-y-1.5">
        <Label htmlFor="currentPassword">{forced ? "Mot de passe temporaire" : "Mot de passe actuel"}</Label>
        <PasswordInput id="currentPassword" autoComplete="current-password" {...register("currentPassword")} />
        {errors.currentPassword ? <p className="text-sm text-red-700">{errors.currentPassword.message}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="newPassword">Nouveau mot de passe</Label>
        <PasswordInput id="newPassword" autoComplete="new-password" {...register("newPassword")} />
        <p className="text-xs text-muted-foreground">8 caractères minimum.</p>
        {errors.newPassword ? <p className="text-sm text-red-700">{errors.newPassword.message}</p> : null}
      </div>
      <div className="space-y-1.5">
        <Label htmlFor="confirmPassword">Confirmer le nouveau mot de passe</Label>
        <PasswordInput id="confirmPassword" autoComplete="new-password" {...register("confirmPassword")} />
        {errors.confirmPassword ? <p className="text-sm text-red-700">{errors.confirmPassword.message}</p> : null}
      </div>
      <Button type="submit" className="h-12 w-full text-base" disabled={pending} data-testid="password-submit">
        {pending ? "Enregistrement…" : "Enregistrer le mot de passe"}
      </Button>
    </form>
  );
}
