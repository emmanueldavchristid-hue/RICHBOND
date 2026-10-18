import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader } from "@/components/page-header";
import { roleLabel, visibleNav } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Accueil – RICHBOND" };

export default async function AccueilPage() {
  const user = await requirePageAction(null);
  const links = visibleNav(user).filter((n) => n.href !== "/accueil");
  return (
    <>
      <PageHeader
        title={`Bonjour ${user.name}`}
        description={`Connecté en tant que ${roleLabel(user)}. Choisissez une rubrique pour commencer.`}
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="accueil-liens">
        {links.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="rounded-lg border bg-card p-5 text-base font-medium shadow-sm transition-colors hover:bg-muted"
          >
            {n.label}
          </Link>
        ))}
      </div>
    </>
  );
}
