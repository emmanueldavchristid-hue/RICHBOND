import { Suspense } from "react";
import type { Metadata } from "next";
import { formatInTimeZone } from "date-fns-tz";
import { fr } from "date-fns/locale";
import { LayoutDashboard } from "lucide-react";
import { BuyerBoard } from "@/components/dashboard/buyer-dashboard";
import { DashboardSkeleton } from "@/components/dashboard/dashboard-skeleton";
import { ResponsibleBoard } from "@/components/dashboard/responsible-dashboard";
import { StorekeeperBoard } from "@/components/dashboard/storekeeper-dashboard";
import { EmptyState } from "@/components/empty-state";
import { PageHeader } from "@/components/page-header";
import { getNow } from "@/lib/clock";
import { APP_TZ } from "@/lib/dates";
import { can, roleLabel } from "@/lib/permissions";
import { requirePageAction } from "@/modules/auth/session";
import { dashboardFor } from "@/modules/reporting";

export const metadata: Metadata = { title: "Accueil – RICHBOND" };

async function AccueilContent() {
  const user = await requirePageAction(null);
  const { now } = await getNow();
  const today = formatInTimeZone(now, APP_TZ, "EEEE d MMMM yyyy", { locale: fr });
  const data = can(user, "dashboard.view") ? await dashboardFor(user, now) : null;

  return (
    <div className="space-y-5">
      <p className="text-sm text-muted-foreground" data-testid="accueil-bonjour">
        <span className="text-[15px] font-semibold text-foreground">Bonjour {user.name}.</span> Connecté en
        tant que {roleLabel(user)} · <span className="first-letter:uppercase">{today}</span>
      </p>
      {data?.kind === "RESPONSABLE" ? <ResponsibleBoard data={data} /> : null}
      {data?.kind === "ACHETEUR" ? <BuyerBoard data={data} /> : null}
      {data?.kind === "MAGASINIER" ? (
        <StorekeeperBoard
          data={data}
          canReceive={can(user, "receipt.create")}
          canIssue={can(user, "stock.issue")}
        />
      ) : null}
      {!data ? (
        <EmptyState
          icon={<LayoutDashboard aria-hidden />}
          title="Aucun tableau de bord pour votre profil"
          description="Utilisez le menu à gauche pour accéder à vos écrans."
        />
      ) : null}
    </div>
  );
}

export default function AccueilPage() {
  return (
    <>
      <PageHeader title="Accueil" description="Ce qui demande votre attention aujourd'hui." />
      <Suspense fallback={<DashboardSkeleton />}>
        <AccueilContent />
      </Suspense>
    </>
  );
}
