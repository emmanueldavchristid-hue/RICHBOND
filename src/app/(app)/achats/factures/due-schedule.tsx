import type { ReactNode } from "react";
import Link from "next/link";
import { AlertTriangle, CalendarClock, CalendarDays } from "lucide-react";
import { MoneyCell } from "@/components/money-cell";
import { cn } from "@/lib/utils";
import type { DueBucket, DueSchedule } from "@/modules/invoices/types";
import type { Serialized } from "@/modules/referentials/serialize";

type Filter = "en-retard" | "semaine" | "mois";

function Tile({
  href,
  active,
  label,
  help,
  bucket,
  icon,
  danger,
  testId,
}: {
  href: string;
  active: boolean;
  label: string;
  help: string;
  bucket: Serialized<DueBucket>;
  icon: ReactNode;
  danger?: boolean;
  testId: string;
}) {
  const alert = danger && bucket.count > 0;
  return (
    <Link
      href={active ? "/achats/factures" : href}
      title={help}
      aria-pressed={active}
      data-testid={testId}
      className={cn(
        "flex min-h-20 flex-1 items-start gap-3 rounded-xl border bg-card p-4 transition-colors hover:bg-muted/50",
        active && "ring-2 ring-primary",
        alert && "border-red-200 bg-red-50 hover:bg-red-100/70",
      )}
    >
      <span className={cn("mt-0.5 text-muted-foreground [&_svg]:size-5", alert && "text-red-700")}>{icon}</span>
      <span className="min-w-0">
        <span className="block text-xs text-muted-foreground">{label}</span>
        <span className="block text-xl font-semibold tabular-nums" data-testid={`${testId}-count`}>
          {bucket.count} {bucket.count > 1 ? "factures" : "facture"}
        </span>
        <span className="block text-xs text-muted-foreground">
          <MoneyCell value={bucket.totalXof} currency="XOF" />
          {bucket.unknownXof > 0 ? ` + ${bucket.unknownXof} sans équivalent FCFA` : ""}
        </span>
      </span>
    </Link>
  );
}

/** Échéancier de trésorerie : information seulement (l'application ne gère pas les paiements). Cliquer filtre la liste. */
export function DueSchedulePanel({ schedule, activeFilter }: { schedule: Serialized<DueSchedule>; activeFilter: Filter | null }) {
  return (
    <section aria-label="Échéancier" className="mb-5" data-testid="inv-schedule">
      <div className="flex flex-col gap-3 md:flex-row">
        <Tile
          href="/achats/factures?echeance=en-retard"
          active={activeFilter === "en-retard"}
          label="En retard de paiement"
          help="Factures non transmises à la comptabilité dont l'échéance est dépassée."
          bucket={schedule.late}
          icon={<AlertTriangle />}
          danger
          testId="inv-due-late"
        />
        <Tile
          href="/achats/factures?echeance=semaine"
          active={activeFilter === "semaine"}
          label="À payer cette semaine"
          help="Échéance aujourd'hui ou dans les 6 jours qui suivent."
          bucket={schedule.week}
          icon={<CalendarClock />}
          testId="inv-due-week"
        />
        <Tile
          href="/achats/factures?echeance=mois"
          active={activeFilter === "mois"}
          label="À payer ce mois-ci"
          help="Échéance d'aujourd'hui à la fin du mois."
          bucket={schedule.month}
          icon={<CalendarDays />}
          testId="inv-due-month"
        />
      </div>
      <p className="mt-2 text-xs text-muted-foreground">Information pour la trésorerie : l&apos;application ne gère pas les paiements.</p>
    </section>
  );
}
