"use client";

import { useState, useTransition } from "react";
import { useForm, useWatch } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { NativeSelect } from "@/components/native-select";
import { createUserSchema, type CreateUserInput } from "@/modules/users/schemas";
import { ROLE_LABELS, type RoleCode, type ScopeCode } from "@/lib/permissions";
import { createUserAction, updateUserAction } from "./actions";

export interface UserFormTarget {
  id: string;
  name: string;
  email: string;
  role: RoleCode;
  purchaseScope: ScopeCode | null;
}

type FormValues = CreateUserInput;

const EMPTY: FormValues = { name: "", email: "", role: "MAGASINIER", purchaseScope: null };

const SCOPE_OPTIONS: { value: ScopeCode; label: string }[] = [
  { value: "LOCAL", label: "Local" },
  { value: "IMPORT", label: "Import" },
  { value: "ALL", label: "Local et import" },
];

function UserForm({
  onOpenChange,
  target,
  canAssignAdmin,
  onCreated,
  onSaved,
}: {
  onOpenChange: (open: boolean) => void;
  /** null = création. */
  target: UserFormTarget | null;
  canAssignAdmin: boolean;
  onCreated: (info: { name: string; email: string; temporaryPassword: string }) => void;
  onSaved: () => void;
}) {
  const [pending, startTransition] = useTransition();
  const [serverError, setServerError] = useState<string | null>(null);
  const {
    register,
    handleSubmit,
    control,
    formState: { errors },
  } = useForm<FormValues>({ resolver: zodResolver(createUserSchema), defaultValues: target ? { ...target } : EMPTY });
  const role = useWatch({ control, name: "role" });

  function onSubmit(values: FormValues) {
    setServerError(null);
    const payload = { ...values, purchaseScope: values.role === "ACHETEUR" ? values.purchaseScope : null };
    startTransition(async () => {
      if (target) {
        const res = await updateUserAction({ ...payload, id: target.id });
        if (res.ok) {
          toast.success("Utilisateur modifié.");
          onOpenChange(false);
          onSaved();
        } else {
          setServerError(res.message);
          toast.error(res.message);
        }
      } else {
        const res = await createUserAction(payload);
        if (res.ok) {
          toast.success("Utilisateur créé.");
          onOpenChange(false);
          onCreated({
            name: res.data.user.name,
            email: res.data.user.email,
            temporaryPassword: res.data.temporaryPassword,
          });
        } else {
          setServerError(res.message);
          toast.error(res.message);
        }
      }
    });
  }

  const roles = (Object.keys(ROLE_LABELS) as RoleCode[]).filter((r) => canAssignAdmin || r !== "SUPER_ADMIN");

  return (
    <>
        <DialogHeader>
          <DialogTitle>{target ? "Modifier l'utilisateur" : "Nouvel utilisateur"}</DialogTitle>
          <DialogDescription>
            {target
              ? "Modifiez les informations du compte."
              : "Un mot de passe temporaire sera généré. Il devra être changé à la première connexion."}
          </DialogDescription>
        </DialogHeader>
        <form onSubmit={handleSubmit(onSubmit)} className="space-y-4" noValidate>
          {serverError ? (
            <div
              role="alert"
              data-testid="user-form-error"
              className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800"
            >
              {serverError}
            </div>
          ) : null}
          <div className="space-y-1.5">
            <Label htmlFor="user-name">Nom complet</Label>
            <Input id="user-name" className="h-11" autoComplete="off" {...register("name")} />
            {errors.name ? <p className="text-sm text-red-700">{errors.name.message}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-email">Adresse email</Label>
            <Input id="user-email" type="email" className="h-11" autoComplete="off" {...register("email")} />
            {errors.email ? <p className="text-sm text-red-700">{errors.email.message}</p> : null}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="user-role">Rôle</Label>
            <NativeSelect id="user-role" {...register("role")}>
              {roles.map((r) => (
                <option key={r} value={r}>
                  {ROLE_LABELS[r]}
                </option>
              ))}
            </NativeSelect>
          </div>
          {role === "ACHETEUR" ? (
            <div className="space-y-1.5">
              <Label htmlFor="user-scope">Périmètre d&apos;achat</Label>
              <NativeSelect id="user-scope" {...register("purchaseScope", { setValueAs: (v) => v || null })}>
                <option value="">Choisir…</option>
                {SCOPE_OPTIONS.map((s) => (
                  <option key={s.value} value={s.value}>
                    {s.label}
                  </option>
                ))}
              </NativeSelect>
              {errors.purchaseScope ? <p className="text-sm text-red-700">{errors.purchaseScope.message}</p> : null}
            </div>
          ) : null}
          <div className="flex justify-end gap-2 pt-2">
            <Button type="button" variant="outline" className="h-11 px-4" onClick={() => onOpenChange(false)}>
              Annuler
            </Button>
            <Button type="submit" className="h-11 px-4" disabled={pending} data-testid="user-form-submit">
              {pending ? "Enregistrement…" : target ? "Enregistrer" : "Créer l'utilisateur"}
            </Button>
          </div>
        </form>
    </>
  );
}

export function UserFormDialog({
  open,
  onOpenChange,
  ...rest
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  target: UserFormTarget | null;
  canAssignAdmin: boolean;
  onCreated: (info: { name: string; email: string; temporaryPassword: string }) => void;
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md" data-testid="user-form-dialog">
        <UserForm onOpenChange={onOpenChange} {...rest} />
      </DialogContent>
    </Dialog>
  );
}
