import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { getNow } from "@/lib/clock";
import { can, roleLabel, visibleNav } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";
import { homeOrderSummary } from "@/modules/purchase-orders";
import { homeRequestSummary } from "@/modules/purchase-requests/queries";

export const metadata: Metadata = { title: "Accueil – RICHBOND" };

const DESCRIPTIONS: Record<string, string> = {
  "/achats": "Demandes d'achat, consultations et bons de commande.",
  "/import": "Dossiers d'import, suivi des expéditions et frais d'approche.",
  "/stock": "Niveaux de stock, réceptions, sorties et inventaires.",
  "/fournisseurs": "Fiches fournisseurs, conditions et évaluations.",
  "/rapports": "Tableaux de bord et exports pour suivre achats et stocks.",
  "/parametres": "Utilisateurs, journal d'activité et réglages.",
};

async function AccueilContent() {
  const user = await requirePageAction(null);
  const links = visibleNav(user).filter((n) => n.href !== "/accueil");
  const sum = can(user, "purchaseRequest.view") ? await homeRequestSummary(user) : null;
  // LOT-05 : BC à valider (Responsable), BC en retard et à relancer (Responsable : tous, acheteur : les siens). Jamais pour le Magasinier.
  const { now } = await getNow();
  const orders = can(user, "purchaseOrder.view") ? await homeOrderSummary(user, now) : null;
  const hasOrderAlert = orders !== null && (orders.toValidate > 0 || orders.late > 0 || orders.toRemind > 0);
  return (
    <>
      {hasOrderAlert ? (
        <div className="mb-4 flex flex-wrap gap-3" data-testid="accueil-bc">
          {orders.toValidate > 0 ? (
            <Link
              href="/achats/commandes?onglet=a-valider"
              className="inline-flex min-h-12 items-center rounded-lg border border-amber-300 bg-amber-50 px-4 text-base font-medium text-amber-950 shadow-sm"
              data-testid="accueil-bc-a-valider"
            >
              BC à valider : {orders.toValidate}
            </Link>
          ) : null}
          {orders.late > 0 ? (
            <Link
              href="/achats/commandes?onglet=en-retard"
              className="inline-flex min-h-12 items-center rounded-lg border border-red-300 bg-red-50 px-4 text-base font-medium text-red-900 shadow-sm"
              data-testid="accueil-bc-en-retard"
            >
              {orders.late === 1 ? "1 BC en retard" : `${orders.late} BC en retard`}
            </Link>
          ) : null}
          {orders.toRemind > 0 ? (
            <Link
              href="/achats/commandes?onglet=en-cours&relance=1"
              className="inline-flex min-h-12 items-center rounded-lg border border-amber-300 bg-amber-50 px-4 text-base font-medium text-amber-950 shadow-sm"
              data-testid="accueil-bc-a-relancer"
            >
              {orders.toRemind === 1 ? "1 BC à relancer" : `${orders.toRemind} BC à relancer`}
            </Link>
          ) : null}
        </div>
      ) : null}
      {sum && (sum.toValidate > 0 || sum.assignedToMe > 0) ? (
        <Link
          href="/achats/demandes"
          className="mb-4 flex flex-wrap items-center gap-3 rounded-lg border border-amber-300 bg-amber-50 p-4 text-base font-medium text-amber-950 shadow-sm"
          data-testid="accueil-a-valider"
        >
          {sum.toValidate > 0 ? (
            <span>
              À valider : {sum.toValidate} DA
              {sum.stops > 0 ? <span className="ml-2 rounded bg-red-700 px-2 py-0.5 text-sm text-white">{sum.stops} arrêt{sum.stops > 1 ? "s" : ""} de production</span> : null}
            </span>
          ) : null}
          {sum.assignedToMe > 0 ? <span>{sum.assignedToMe === 1 ? "1 DA vous est assignée" : `${sum.assignedToMe} DA vous sont assignées`}</span> : null}
        </Link>
      ) : null}
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
