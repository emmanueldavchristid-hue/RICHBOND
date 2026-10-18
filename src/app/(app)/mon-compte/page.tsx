import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { KeyRound } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { roleLabel } from "@/lib/permissions";
import { getCurrentUser } from "@/modules/auth/session";
import { ChangePasswordForm } from "./change-password-form";

export const metadata: Metadata = { title: "Mon compte – RICHBOND" };

export default async function MonComptePage() {
  const user = await getCurrentUser();
  if (!user) redirect("/connexion");
  return (
    <div className="mx-auto max-w-xl">
      <PageHeader title="Mon compte" />
      {user.mustChangePassword ? (
        <div
          role="status"
          data-testid="premiere-connexion"
          className="mb-6 flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-4 text-amber-900"
        >
          <KeyRound className="mt-0.5 size-5 shrink-0" />
          <div>
            <p className="font-semibold">Vous devez définir votre mot de passe</p>
            <p className="text-sm">
              Pour des raisons de sécurité, remplacez le mot de passe temporaire reçu par un mot de passe
              personnel avant de continuer.
            </p>
          </div>
        </div>
      ) : null}
      <dl className="mb-6 grid grid-cols-[8rem_1fr] gap-y-2 rounded-lg border bg-card p-4 text-sm" data-testid="compte-infos">
        <dt className="text-muted-foreground">Nom</dt>
        <dd data-testid="compte-nom">{user.name}</dd>
        <dt className="text-muted-foreground">Email</dt>
        <dd data-testid="compte-email">{user.email}</dd>
        <dt className="text-muted-foreground">Rôle</dt>
        <dd data-testid="compte-role">{roleLabel(user)}</dd>
      </dl>
      <ChangePasswordForm forced={user.mustChangePassword} />
    </div>
  );
}
