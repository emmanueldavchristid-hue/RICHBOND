import { KpiCard } from "@/components/kpi-card";
import { formatVariation } from "@/modules/reporting/kpi";
import { formatCell, formatKpiValue, isNumericType } from "@/modules/reporting/report-format";
import type { Report, ReportKpi, ReportTable } from "@/modules/reporting/report-types";
import { cn } from "@/lib/utils";

function Kpi({ k }: { k: ReportKpi }) {
  const directional = k.goodDirection !== "NONE";
  const comparison = k.variationPct !== null && !k.unavailable ? `${formatVariation(k.variationPct)} vs période précédente` : null;
  const hint = k.unavailable ?? [!directional ? comparison : null, k.hint].filter(Boolean).join(" · ") ?? undefined;
  return (
    <KpiCard
      testId={`rpt-kpi-${k.key}`}
      label={k.label}
      value={k.unavailable ? "—" : formatKpiValue(k.unit, k.value)}
      help={k.help}
      delta={directional && !k.unavailable ? k.variationPct : undefined}
      deltaGood={k.goodDirection === "UP"}
      hint={hint || undefined}
    />
  );
}

export function ReportTableView({ t }: { t: ReportTable }) {
  return (
    <section className="rounded-xl border bg-card" data-testid={`rpt-table-${t.key}`} aria-labelledby={`rpt-h-${t.key}`}>
      <header className="border-b px-4 py-3">
        <h2 id={`rpt-h-${t.key}`} className="text-[15px] font-semibold">
          {t.title}
        </h2>
        {t.note ? <p className="mt-0.5 text-xs text-muted-foreground">{t.note}</p> : null}
      </header>
      {t.unavailable ? (
        <p className="px-4 py-6 text-sm text-muted-foreground" data-testid={`rpt-unavailable-${t.key}`}>
          {t.unavailable}
        </p>
      ) : t.rows.length === 0 ? (
        <p className="px-4 py-6 text-sm text-muted-foreground">{t.emptyText}</p>
      ) : (
        <div className="max-h-[28rem] overflow-auto">
          <table className="w-full min-w-[32rem] text-sm">
            <thead className="sticky top-0 bg-card text-left text-xs font-medium text-muted-foreground">
              <tr className="border-b">
                {t.columns.map((c) => (
                  <th key={c.key} className={cn("h-10 px-3 font-medium", isNumericType(c.type) && "text-right")}>
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {t.rows.map((r, i) => (
                <tr key={i} className="h-11 hover:bg-background">
                  {t.columns.map((c) => {
                    const text = formatCell(c.type, r[c.key] ?? null);
                    const empty = text === "–";
                    return (
                      <td
                        key={c.key}
                        className={cn("px-3", isNumericType(c.type) && "text-right tabular-nums", c.type === "doc" && !empty && "doc-number", empty && "text-muted-foreground/70")}
                      >
                        {text}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}

/** Rapport à l'écran : indicateurs (avec définition en infobulle) puis tableaux. */
export function ReportView({ report }: { report: Report }) {
  return (
    <div className="space-y-5" data-testid="rpt-view">
      <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4" data-testid="rpt-kpis">
        {report.kpis.map((k) => (
          <Kpi key={k.key} k={k} />
        ))}
      </div>
      <div className="grid gap-4 xl:grid-cols-2">
        {report.tables.map((t) => (
          <ReportTableView key={t.key} t={t} />
        ))}
      </div>
      {report.notes.length > 0 ? (
        <ul className="space-y-1 text-xs text-muted-foreground" data-testid="rpt-notes">
          {report.notes.map((n, i) => (
            <li key={i}>{n}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
