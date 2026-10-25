import Link from "next/link";
import { CheckCircle2, PackageCheck, Send } from "lucide-react";
import { DocNumber } from "@/components/doc-number";
import { MoneyCell } from "@/components/money-cell";
import { LateBadge, RemindBadge } from "@/components/purchase-orders/late-badge";
import { UrgencyBadge } from "@/components/purchase-requests/urgency-badge";
import { StatusBadge } from "@/components/status-badge";
import { formatDate } from "@/lib/dates";
import type { PrUrgency } from "@/modules/purchase-requests/labels";
import type { BuyerOrderRow, BuyerRequestRow } from "@/modules/reporting/types";
import { formatDay } from "./format";
import { Panel, PanelEmpty } from "./panel";
import { ReminderButton } from "./reminder-button";

function More({
  total,
  shown,
  href,
  testId,
}: {
  total: number;
  shown: number;
  href: string;
  testId: string;
}) {
  if (total <= shown) return null;
  return (
    <p className="border-t px-4 py-2.5 text-xs text-muted-foreground" data-testid={testId}>
      {total - shown} autre{total - shown > 1 ? "s" : ""} :{" "}
      <Link href={href} className="font-medium text-primary hover:underline">
        voir toute la liste
      </Link>
    </p>
  );
}

/** Mes demandes d'achat assignées, à traiter (les arrêts de production en tête). */
export function MyRequestsList({
  total,
  rows,
  href,
}: {
  total: number;
  rows: BuyerRequestRow[];
  href: string;
}) {
  return (
    <Panel
      title="Mes demandes d'achat à traiter"
      description="Demandes validées qui vous sont assignées."
      testId="dash-my-requests"
      href={href}
    >
      {rows.length === 0 ? (
        <PanelEmpty
          icon={<CheckCircle2 aria-hidden />}
          title="Aucune demande en attente"
          hint="Les demandes validées qui vous seront assignées apparaîtront ici."
        />
      ) : (
        <>
          <ul className="divide-y border-t">
            {rows.map((r) => (
              <li
                key={r.id}
                className="relative flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-background"
                data-testid={`dash-request-${r.number}`}
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={r.href}
                    className="rounded outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <DocNumber value={r.number} />
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground">
                    {r.departmentName} · {r.requesterName}
                  </p>
                </div>
                <UrgencyBadge urgency={r.urgency as PrUrgency} />
                <div className="hidden w-28 text-right text-xs text-muted-foreground sm:block">
                  <p>Besoin {formatDay(r.neededBy)}</p>
                  <p>{r.ageDays === 0 ? "aujourd'hui" : `depuis ${r.ageDays} j`}</p>
                </div>
                <div className="hidden w-28 text-right text-[13px] tabular-nums xl:block">
                  <MoneyCell value={r.estimatedTotal} />
                </div>
              </li>
            ))}
          </ul>
          <More total={total} shown={rows.length} href={href} testId="dash-my-requests-more" />
        </>
      )}
    </Panel>
  );
}

type OrderListKind = "send" | "late" | "remind";

const EMPTY: Record<OrderListKind, { title: string; hint: string; icon: React.ReactNode }> = {
  send: {
    title: "Aucun bon à envoyer",
    hint: "Les bons validés prêts à partir chez le fournisseur apparaîtront ici.",
    icon: <Send aria-hidden />,
  },
  late: {
    title: "Aucun retard",
    hint: "Tous vos bons de commande sont dans les délais.",
    icon: <PackageCheck aria-hidden />,
  },
  remind: {
    title: "Aucune relance à faire",
    hint: "Les bons envoyés sans confirmation apparaîtront ici au bout de quelques jours ouvrés.",
    icon: <CheckCircle2 aria-hidden />,
  },
};

/** Liste de bons de commande : à envoyer, en retard ou à relancer (bouton « Relancer » direct). */
export function OrdersList({
  kind,
  title,
  description,
  total,
  rows,
  href,
  testId,
}: {
  kind: OrderListKind;
  title: string;
  description: string;
  total: number;
  rows: BuyerOrderRow[];
  href: string;
  testId: string;
}) {
  const empty = EMPTY[kind];
  return (
    <Panel title={title} description={description} testId={testId} href={href}>
      {rows.length === 0 ? (
        <PanelEmpty icon={empty.icon} title={empty.title} hint={empty.hint} />
      ) : (
        <>
          <ul className="divide-y border-t">
            {rows.map((o) => (
              <li
                key={o.id}
                className="relative flex min-h-14 items-center gap-3 px-4 py-2 hover:bg-background"
                data-testid={`${testId}-row-${o.number}`}
              >
                <div className="min-w-0 flex-1">
                  <Link
                    href={o.href}
                    className="rounded outline-none after:absolute after:inset-0 focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <DocNumber value={o.displayNumber} />
                  </Link>
                  <p className="mt-0.5 truncate text-xs text-muted-foreground" title={o.supplierName}>
                    {o.supplierName}
                  </p>
                </div>
                <div className="hidden text-right text-xs sm:block">
                  {kind === "send" ? (
                    <StatusBadge status={o.status} />
                  ) : o.daysLate > 0 ? (
                    <LateBadge daysLate={o.daysLate} />
                  ) : o.needsReminder ? (
                    <RemindBadge />
                  ) : null}
                  <p className="mt-1 text-muted-foreground">Livraison {formatDay(o.expectedDate)}</p>
                </div>
                <div className="hidden w-28 text-right text-[13px] tabular-nums xl:block">
                  <MoneyCell value={o.totalXof} />
                </div>
                {kind === "send" ? (
                  <Link
                    href={o.href}
                    className="relative z-10 inline-flex h-9 items-center gap-1.5 rounded-lg border bg-background px-3 text-sm font-medium transition-colors hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                    data-testid={`dash-send-${o.id}`}
                  >
                    <Send className="size-4" aria-hidden /> Envoyer
                  </Link>
                ) : (
                  <div className="relative z-10 flex flex-col items-end gap-0.5">
                    <ReminderButton order={o} />
                    {o.lastRemindedAt ? (
                      <span className="text-[11px] text-muted-foreground">
                        Relancé le {formatDate(new Date(o.lastRemindedAt))}
                      </span>
                    ) : null}
                  </div>
                )}
              </li>
            ))}
          </ul>
          <More total={total} shown={rows.length} href={href} testId={`${testId}-more`} />
        </>
      )}
    </Panel>
  );
}
