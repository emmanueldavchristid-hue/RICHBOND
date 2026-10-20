import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { ArrowRight, BarChart3, KeyRound, Package, Settings, Ship, ShoppingCart, Truck, Warehouse, type LucideIcon } from "lucide-react";
import { KpiCard } from "@/components/kpi-card";
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
  "/stock/articles": "Catalogue des articles : codes, unités, fournisseurs et prix.",
  "/fournisseurs": "Fiches fournisseurs, conditions et évaluations.",
  "/rapports": "Tableaux de bord et exports pour suivre achats et stocks.",
  "/parametres": "Utilisateurs, journal d'activité et réglages.",
  "/parametres/licence": "Période d'essai, activation et prolongation.",
};

const ICONS: Record<string, LucideIcon> = { ShoppingCart, Ship, Warehouse, Package, Truck, BarChart3, Settings, KeyRound };

async function AccueilContent() {
  const user = await requirePageAction(null);
  const links = visibleNav(user).filter((n) => n.href !== "/accueil");
  const sum = can(user, "purchaseRequest.view") ? await homeRequestSummary(user) : null;
  // LOT-05 : BC à valider (Responsable), BC en retard et à relancer (Responsable : tous, acheteur : les siens). Jamais pour le Magasinier.
  const { now } = await getNow();
  const orders = can(user, "purchaseOrder.view") ? await homeOrderSummary(user, now) : null;
  const requestCards = sum !== null && (sum.toValidate > 0 || sum.assignedToMe > 0 || user.role === "RESPONSABLE_ACHATS");
  return (
    <div className="space-y-6">
      <div>
        <p className="text-[15px] font-semibold" data-testid="accueil-bonjour">
          Bonjour {user.name}. Connecté en tant que {roleLabel(user)}.
        </p>
        <p className="mt-0.5 text-sm text-muted-foreground">Voici ce qui demande votre attention aujourd&apos;hui.</p>
      </div>

      {requestCards || orders ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4" data-testid="accueil-kpis">
          {sum && (sum.toValidate > 0 || user.role === "RESPONSABLE_ACHATS") ? (
            <KpiCard
              testId="kpi-da-a-valider"
              label="DA à valider"
              value={String(sum.toValidate)}
              hint={sum.stops > 0 ? `dont ${sum.stops} arrêt${sum.stops > 1 ? "s" : ""} de production` : "Aucun arrêt de production"}
              help="Demandes d'achat soumises et en attente de votre décision. Les arrêts de production passent en tête."
              href={sum.toValidate > 0 ? "/achats/demandes?onglet=a-valider" : undefined}
              linkTestId="accueil-a-valider"
              linkLabel={`À valider : ${sum.toValidate} DA`}
            />
          ) : null}
          {sum && sum.assignedToMe > 0 ? (
            <KpiCard
              testId="kpi-da-assignees"
              label="DA assignées à vous"
              value={String(sum.assignedToMe)}
              help="Demandes validées qui vous ont été confiées et qui ne sont pas encore entièrement commandées."
              href="/achats/demandes?onglet=assignees"
              linkTestId="accueil-assignees"
              linkLabel={sum.assignedToMe === 1 ? "1 DA vous est assignée" : `${sum.assignedToMe} DA vous sont assignées`}
            />
          ) : null}
          {orders && user.role === "RESPONSABLE_ACHATS" ? (
            <KpiCard
              testId="kpi-bc-a-valider"
              label="BC à valider"
              value={String(orders.toValidate)}
              help="Bons de commande soumis par les acheteurs et en attente de votre validation."
              href={orders.toValidate > 0 ? "/achats/commandes?onglet=a-valider" : undefined}
              linkTestId="accueil-bc-a-valider"
              linkLabel={`BC à valider : ${orders.toValidate}`}
            />
          ) : null}
          {orders ? (
            <KpiCard
              testId="kpi-bc-en-retard"
              label="BC en retard"
              value={String(orders.late)}
              deltaGood={false}
              help="Bons de commande dont la date promise (ou demandée) est dépassée sans réception complète."
              href={orders.late > 0 ? "/achats/commandes?onglet=en-retard" : undefined}
              linkTestId="accueil-bc-en-retard"
              linkLabel={orders.late === 1 ? "1 BC en retard" : `${orders.late} BC en retard`}
            />
          ) : null}
          {orders ? (
            <KpiCard
              testId="kpi-bc-a-relancer"
              label="BC à relancer"
              value={String(orders.toRemind)}
              help="Bons envoyés et non confirmés depuis plusieurs jours ouvrés (réglage dans Paramètres), ou en retard."
              href={orders.toRemind > 0 ? "/achats/commandes?onglet=en-cours&relance=1" : undefined}
              linkTestId="accueil-bc-a-relancer"
              linkLabel={orders.toRemind === 1 ? "1 BC à relancer" : `${orders.toRemind} BC à relancer`}
            />
          ) : null}
        </div>
      ) : null}

      <section aria-labelledby="acces-rapide">
        <h2 id="acces-rapide" className="mb-3 text-[15px] font-semibold">
          Accès rapide
        </h2>
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3" data-testid="accueil-liens">
          {links.map((n) => {
            const Icon = ICONS[n.icon] ?? ShoppingCart;
            return (
              <Link
                key={n.href}
                href={n.href}
                className="group flex min-h-16 items-center gap-3 rounded-xl border bg-card p-4 transition-colors hover:border-input hover:bg-background"
              >
                <span className="inline-flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                  <Icon className="size-[18px]" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-medium">{n.label}</span>
                  {DESCRIPTIONS[n.href] ? <span className="mt-0.5 block text-[13px] text-muted-foreground">{DESCRIPTIONS[n.href]}</span> : null}
                </span>
                <ArrowRight className="size-4 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover:opacity-100" aria-hidden />
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}

export default function AccueilPage() {
  return (
    <>
      <PageHeader title="Accueil" description="Votre tableau de bord achats et stocks." />
      <Suspense fallback={<PageSkeleton rows={4} />}>
        <AccueilContent />
      </Suspense>
    </>
  );
}
