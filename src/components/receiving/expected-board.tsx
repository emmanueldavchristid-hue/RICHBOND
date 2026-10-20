"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { PackageCheck, Search } from "lucide-react";
import { DateCell } from "@/components/date-cell";
import { DocNumber } from "@/components/doc-number";
import { EmptyState } from "@/components/empty-state";
import { StatusBadge } from "@/components/status-badge";
import { buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";
import type { ExpectedOrder } from "@/modules/receiving/types";

type BlockKey = "today" | "week" | "late";

const BLOCKS: { key: BlockKey; title: string; help: string; empty: string }[] = [
  { key: "late", title: "En retard", help: "Bons de commande dont la date attendue est dépassée.", empty: "Aucune livraison en retard." },
  { key: "today", title: "Attendues aujourd'hui", help: "Bons de commande attendus à la date du jour.", empty: "Aucune livraison attendue aujourd'hui." },
  { key: "week", title: "Attendues cette semaine", help: "Bons de commande attendus d'ici la fin de la semaine.", empty: "Aucune autre livraison attendue cette semaine." },
];

function normalize(s: string): string {
  return s.normalize("NFD").replace(/[̀-ͯ]/g, "").toLowerCase();
}

function Row({ row, block, canReceive }: { row: ExpectedOrder; block: BlockKey; canReceive: boolean }) {
  return (
    <li
      className="flex min-h-14 flex-wrap items-center gap-x-4 gap-y-2 px-4 py-2.5 transition-colors hover:bg-background"
      data-testid={`rec-expected-${row.number}`}
    >
      <div className="min-w-0 flex-1 basis-56">
        <Link href={`/achats/commandes/${row.orderId}`} className="text-primary underline-offset-4 hover:underline">
          <DocNumber value={row.number} />
        </Link>
        <p className="truncate text-sm">{row.supplierName}</p>
      </div>
      <div className="w-28 text-sm tabular-nums" aria-label="Date attendue">
        <span className="block text-xs text-muted-foreground">Attendue le</span>
        <DateCell value={row.expectedDate} />
      </div>
      <div className="flex w-44 flex-col items-start gap-1">
        <StatusBadge status={row.status} />
        {block === "late" && row.daysLate > 0 ? (
          <span className="text-xs font-medium text-red-700 dark:text-red-400">En retard de {row.daysLate} j</span>
        ) : null}
      </div>
      <div className="w-36 text-right text-sm whitespace-nowrap text-muted-foreground tabular-nums">
        {row.openLineCount} ligne{row.openLineCount > 1 ? "s" : ""} à recevoir
      </div>
      {canReceive ? (
        <Link
          href={`/stock/receptions/nouvelle?bc=${row.orderId}`}
          className={cn(buttonVariants({ variant: block === "late" ? "default" : "outline" }), "h-11 px-4")}
          data-testid={`rec-receive-${row.number}`}
        >
          <PackageCheck aria-hidden /> Réceptionner
        </Link>
      ) : null}
    </li>
  );
}

/** Les trois blocs de livraisons attendues, avec recherche par n° de BC ou fournisseur (filtrage immédiat). */
export function ExpectedBoard({
  late,
  today,
  week,
  canReceive,
}: {
  late: ExpectedOrder[];
  today: ExpectedOrder[];
  week: ExpectedOrder[];
  canReceive: boolean;
}) {
  const [q, setQ] = useState("");
  const data = { late, today, week };
  const needle = normalize(q.trim());
  const filtered = useMemo(() => {
    const f = (rows: ExpectedOrder[]) => (needle ? rows.filter((r) => normalize(`${r.number} ${r.supplierName}`).includes(needle)) : rows);
    return { late: f(late), today: f(today), week: f(week) };
  }, [late, today, week, needle]);
  const total = late.length + today.length + week.length;

  return (
    <div className="space-y-5" data-testid="rec-expected">
      <div className="relative max-w-md">
        <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" aria-hidden />
        <Input
          type="search"
          value={q}
          onChange={(e) => setQ(e.target.value)}
          placeholder="Rechercher un n° de BC ou un fournisseur"
          aria-label="Rechercher un n° de BC ou un fournisseur"
          className="h-11 pl-9"
          data-testid="rec-search"
        />
      </div>
      {total === 0 ? (
        <EmptyState title="Aucune livraison attendue" description="Les bons de commande envoyés ou confirmés apparaissent ici dès qu'une date de livraison est connue." />
      ) : (
        BLOCKS.map((b) => {
          const rows = filtered[b.key];
          return (
            <section key={b.key} aria-labelledby={`rec-block-${b.key}-title`} data-testid={`rec-block-${b.key}`}>
              <div className="mb-2 flex items-baseline gap-2">
                <h2 id={`rec-block-${b.key}-title`} className="text-[15px] font-semibold">
                  {b.title}
                </h2>
                <span
                  className={cn(
                    "inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular-nums",
                    b.key === "late" && data[b.key].length > 0 ? "bg-red-100 text-red-800 dark:bg-red-950 dark:text-red-300" : "bg-muted text-muted-foreground",
                  )}
                  data-testid={`rec-block-${b.key}-count`}
                >
                  {rows.length}
                </span>
                <span className="text-xs text-muted-foreground">{b.help}</span>
              </div>
              {rows.length === 0 ? (
                <p className="rounded-xl border border-dashed bg-card px-4 py-4 text-sm text-muted-foreground" data-testid={`rec-block-${b.key}-empty`}>
                  {needle ? "Aucun résultat pour cette recherche." : b.empty}
                </p>
              ) : (
                <ul className="divide-y overflow-hidden rounded-xl border bg-card">
                  {rows.map((r) => (
                    <Row key={r.orderId} row={r} block={b.key} canReceive={canReceive} />
                  ))}
                </ul>
              )}
            </section>
          );
        })
      )}
    </div>
  );
}
