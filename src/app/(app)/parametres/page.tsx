import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { can } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Paramètres – RICHBOND" };

async function ParametresContent() {
  const user = await requirePageAction(null);
  // Même règle que le menu : réservé à ceux qui gèrent les comptes ou les paramètres.
  if (!can(user, "users.manage") && !can(user, "import.manage") && !can(user, "settings.manage") && !can(user, "exchangeRate.manage")) redirect("/acces-refuse");
  const links = [
    { href: "/parametres/utilisateurs", label: "Utilisateurs", text: "Comptes, rôles, mots de passe", ok: can(user, "users.manage") },
    { href: "/parametres/depots", label: "Dépôts", text: "Lieux de stockage", ok: can(user, "settings.manage") },
    { href: "/parametres/services", label: "Services demandeurs", text: "Production, Maintenance, Qualité…", ok: can(user, "settings.manage") },
    {
      href: "/parametres/devises",
      label: "Devises et taux de change",
      text: "FCFA, EUR, USD, CNY : taux datés",
      ok: can(user, "settings.manage") || can(user, "exchangeRate.manage"),
    },
    {
      href: "/parametres/import",
      label: "Import de données",
      text: "Articles, fournisseurs, stock initial (Excel / CSV)",
      ok: can(user, "import.manage"),
    },
    { href: "/parametres/reglages", label: "Réglages", text: "Prix visibles au magasin", ok: can(user, "settings.manage") },
    { href: "/parametres/journal", label: "Journal d'activité", text: "Qui a fait quoi, et quand", ok: can(user, "audit.view") },
    { href: "/parametres/licence", label: "Licence", text: "Période d'essai et activation", ok: can(user, "license.manage") },
  ].filter((l) => l.ok);
  return (
    <>
      <div className="grid gap-3 sm:grid-cols-2" data-testid="parametres-liens">
        {links.map((l) => (
          <Link key={l.href} href={l.href} data-testid={`parametres-lien-${l.href.split("/").pop()}`} className="rounded-lg border bg-card p-5 shadow-sm hover:bg-muted">
            <p className="font-medium">{l.label}</p>
            <p className="text-sm text-muted-foreground">{l.text}</p>
          </Link>
        ))}
      </div>
    </>
  );
}

export default function ParametresPage() {
  return (
    <>
      <PageHeader title="Paramètres" />
      <Suspense fallback={<PageSkeleton />}>
        <ParametresContent />
      </Suspense>
    </>
  );
}
