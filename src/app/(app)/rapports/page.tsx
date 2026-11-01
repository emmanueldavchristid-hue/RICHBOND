import { Suspense } from "react";
import type { Metadata } from "next";
import Link from "next/link";
import { BarChart3, CalendarDays, CalendarRange, FileBarChart } from "lucide-react";
import { EmptyState } from "@/components/empty-state";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { requirePageAction } from "@/modules/auth/session";
import { reportAccess } from "@/modules/reporting/report-access";

export const metadata: Metadata = { title: "Rapports – RICHBOND" };

const REPORTS = [
  {
    href: "/rapports/quotidien",
    title: "Rapport quotidien",
    icon: FileBarChart,
    description: "DA créées et validées, BC émis, réceptions, entrées et sorties de stock du jour, retards et ruptures.",
    testId: "rpt-card-quotidien",
  },
  {
    href: "/rapports/hebdomadaire",
    title: "Rapport hebdomadaire",
    icon: CalendarDays,
    description: "Synthèse de la semaine, BC en retard, inventaires et fiabilité, top des consommations.",
    testId: "rpt-card-hebdomadaire",
  },
  {
    href: "/rapports/mensuel",
    title: "Rapport mensuel",
    icon: CalendarRange,
    description: "Achats par type, catégorie et fournisseur, délais, OTIF, rotation, dormants, coût d'approche import, conformité des factures.",
    testId: "rpt-card-mensuel",
  },
] as const;

async function ReportsContent() {
  const user = await requirePageAction(null);
  const access = reportAccess(user);
  return (
    <>
      <PageHeader title="Rapports" description="Les rapports à présenter à la direction, générés en un clic, exportables en PDF et en Excel." />
      {!access.allowed ? (
        <EmptyState
          icon={<BarChart3 aria-hidden />}
          title="Aucun rapport disponible pour votre profil"
          description="Les rapports achats sont réservés au Responsable Achats et aux Acheteurs."
        />
      ) : (
        <div className="grid gap-4 md:grid-cols-3" data-testid="rpt-list">
          {REPORTS.map((r) => (
            <Link
              key={r.href}
              href={r.href}
              data-testid={r.testId}
              className="group rounded-xl border bg-card p-5 transition-colors duration-150 hover:border-input hover:bg-background focus-visible:ring-2 focus-visible:ring-ring"
            >
              <r.icon className="size-6 stroke-[1.5] text-primary" aria-hidden />
              <h2 className="mt-3 text-[15px] font-semibold">{r.title}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{r.description}</p>
              <p className="mt-3 text-sm font-medium text-primary group-hover:underline">Ouvrir le rapport</p>
            </Link>
          ))}
          {access.scope ? (
            <p className="text-xs text-muted-foreground md:col-span-3" data-testid="rpt-scope-note">
              Vos rapports portent sur les achats {access.scope === "LOCAL" ? "locaux" : "import"} (votre périmètre).
            </p>
          ) : null}
        </div>
      )}
    </>
  );
}

export default function ReportsPage() {
  return (
    <Suspense fallback={<PageSkeleton rows={3} />}>
      <ReportsContent />
    </Suspense>
  );
}
