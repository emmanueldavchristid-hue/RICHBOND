import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { roleLabel, visibleNav } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";

export const metadata: Metadata = { title: "Accueil – RICHBOND" };

const DESCRIPTIONS: Record<string, string> = {
  "/achats/demandes": "Demandes d'achat, consultations et bons de commande.",
  "/import": "Dossiers d'import, suivi des expéditions et frais d'approche.",
  "/stock": "Niveaux de stock, réceptions, sorties et inventaires.",
  "/fournisseurs": "Fiches fournisseurs, conditions et évaluations.",
  "/rapports": "Tableaux de bord et exports pour suivre achats et stocks.",
  "/parametres": "Utilisateurs, journal d'activité et réglages.",
};

async function AccueilContent() {
  const user = await requirePageAction(null);
  const links = visibleNav(user).filter((n) => n.href !== "/accueil");
  return (
    <>
      <p className="mb-4 text-sm text-muted-foreground" data-testid="accueil-bonjour">
        Bonjour {user.name}. Connecté en tant que {roleLabel(user)}.
      </p>
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="accueil-liens">
        {links.map((n) => (
          <Link
            key={n.href}
            href={n.href}
            className="rounded-lg border bg-card p-5 text-base font-medium shadow-sm transition-colors hover:bg-muted"
          >
            <span className="block">{n.label}</span>
            {DESCRIPTIONS[n.href] ? (
              <span className="mt-1 block text-sm font-normal text-muted-foreground">{DESCRIPTIONS[n.href]}</span>
            ) : null}
          </Link>
        ))}
      </div>
    </>
  );
}

export default function AccueilPage() {
  return (
    <>
      <PageHeader title="Accueil" description="Choisissez une rubrique pour commencer." />
      <Suspense fallback={<PageSkeleton />}>
        <AccueilContent />
      </Suspense>
    </>
  );
}
