import { Suspense } from "react";
import type { Metadata } from "next";
import { addDays } from "date-fns";
import { formatInTimeZone } from "date-fns-tz";
import { PageHeader, PageSkeleton } from "@/components/page-header";
import { DateCell } from "@/components/date-cell";
import { StatusBadge } from "@/components/status-badge";
import { requirePageAction } from "@/modules/auth/session";
import { formatCountdown, getLicenseState } from "@/modules/licensing";
import { ActivateForm } from "./activate-form";
import { ExtendForm } from "./extend-form";

export const metadata: Metadata = { title: "Licence – RICHBOND" };

async function LicenceContent() {
  await requirePageAction("license.manage");
  const l = await getLicenseState();

  if (l.status === "ACTIVE") {
    return (
      <p
        role="status"
        data-testid="licence-active"
        className="rounded-lg border border-emerald-200 bg-emerald-50 p-4 text-base font-medium text-emerald-900"
      >
        Licence active – {l.licensedTo ?? "RICHBOND CI"} – activée le <DateCell value={l.activatedAt} />
      </p>
    );
  }

  const tomorrow = formatInTimeZone(addDays(l.serverNow, 1), "Africa/Abidjan", "yyyy-MM-dd");
  const expired = l.status === "EXPIRED";
  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-[10rem_1fr] items-center gap-y-2 rounded-lg border bg-card p-4 text-sm" data-testid="licence-etat">
        <dt className="text-muted-foreground">Statut</dt>
        <dd data-testid="licence-statut">
          <StatusBadge status={expired ? "LICENCE_EXPIREE" : "LICENCE_ESSAI"} />
        </dd>
        <dt className="text-muted-foreground">Début de l&apos;essai</dt>
        <dd data-testid="licence-debut">
          <DateCell value={l.trialStartsAt} />
        </dd>
        <dt className="text-muted-foreground">Fin de l&apos;essai</dt>
        <dd data-testid="licence-fin">
          <DateCell value={l.trialEndsAt} />
        </dd>
        <dt className="text-muted-foreground">Temps restant</dt>
        <dd data-testid="licence-restant">
          {expired ? "Terminé : consultation seule" : `${l.daysLeft} j (${formatCountdown(l.msLeft)})`}
        </dd>
      </dl>
      <ExtendForm minDate={tomorrow} />
      <ActivateForm />
    </div>
  );
}

export default function LicencePage() {
  return (
    <>
      <PageHeader title="Licence" description="Prolonger la période d'essai ou activer la licence." />
      <Suspense fallback={<PageSkeleton />}>
        <LicenceContent />
      </Suspense>
    </>
  );
}
