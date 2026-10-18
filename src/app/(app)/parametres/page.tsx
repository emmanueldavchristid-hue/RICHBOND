import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Paramètres – RICHBOND" };

export default async function ParametresPage() {
  const user = await requirePageAction(null);
  // Même règle que le menu : réservé à ceux qui gèrent les comptes ou les paramètres.
  if (!can(user, "users.manage") && !can(user, "settings.manage")) redirect("/acces-refuse");
  const links = [
    { href: "/parametres/utilisateurs", label: "Utilisateurs", text: "Comptes, rôles, mots de passe", ok: can(user, "users.manage") },
    { href: "/parametres/journal", label: "Journal d'activité", text: "Qui a fait quoi, et quand", ok: can(user, "audit.view") },
  ].filter((l) => l.ok);
  return (
    <>
      <PageHeader title="Paramètres" />
      <div className="grid gap-3 sm:grid-cols-2" data-testid="parametres-liens">
        {links.map((l) => (
          <Link key={l.href} href={l.href} className="rounded-lg border bg-card p-5 shadow-sm hover:bg-muted">
            <p className="font-medium">{l.label}</p>
            <p className="text-sm text-muted-foreground">{l.text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
