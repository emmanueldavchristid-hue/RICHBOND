import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateTime } from "@/lib/dates";
import { formatCell, formatKpiValue, isNumericType, EMPTY } from "./report-format";
import { formatVariation } from "./kpi";
import type { Report, ReportKpi, ReportTable } from "./report-types";

/**
 * PDF d'un rapport (LOT-15) : A4 paysage, en-tête RICHBOND, période et filtres, indicateurs puis tableaux.
 * Police Helvetica standard. Document pur : reçoit le rapport déjà calculé, n'accède à aucune base.
 */
const C = { ink: "#111318", muted: "#6b6f78", line: "#d4d4d0", head: "#f1f1ee", brand: "#2f5bea", bad: "#b91c1c", good: "#15803d" };
const s = StyleSheet.create({
  page: { paddingTop: 28, paddingBottom: 40, paddingHorizontal: 30, fontFamily: "Helvetica", fontSize: 8, color: C.ink },
  top: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-end", borderBottomWidth: 1.2, borderColor: C.brand, paddingBottom: 6, marginBottom: 8 },
  brand: { fontSize: 15, fontWeight: "bold", letterSpacing: 1.2 },
  brandSub: { fontSize: 8, color: C.muted, marginTop: 1 },
  title: { fontSize: 14, fontWeight: "bold", textAlign: "right" },
  period: { fontSize: 9.5, textAlign: "right", marginTop: 2 },
  meta: { color: C.muted, marginBottom: 8, lineHeight: 1.35 },
  grid: { flexDirection: "row", flexWrap: "wrap", marginHorizontal: -3, marginBottom: 4 },
  card: { width: "25%", padding: 3 },
  cardIn: { borderWidth: 0.7, borderColor: C.line, borderRadius: 4, padding: 6, minHeight: 50 },
  cardLabel: { fontSize: 7.5, color: C.muted },
  cardValue: { fontSize: 13, fontWeight: "bold", marginTop: 2 },
  cardSub: { fontSize: 7, color: C.muted, marginTop: 2 },
  h2: { fontSize: 10, fontWeight: "bold", marginTop: 10, marginBottom: 2 },
  note: { fontSize: 7, color: C.muted, marginBottom: 3 },
  tHead: { flexDirection: "row", backgroundColor: C.head, borderWidth: 0.6, borderColor: C.line, fontWeight: "bold" },
  tRow: { flexDirection: "row", borderLeftWidth: 0.6, borderRightWidth: 0.6, borderBottomWidth: 0.4, borderColor: C.line },
  cell: { paddingVertical: 2.5, paddingHorizontal: 3 },
  num: { textAlign: "right" },
  empty: { color: C.muted, paddingVertical: 4 },
  footer: { position: "absolute", left: 30, right: 30, bottom: 18, fontSize: 7, color: C.muted, flexDirection: "row", justifyContent: "space-between" },
});

function KpiCardPdf({ k }: { k: ReportKpi }) {
  const variation = k.variationPct;
  const tone = variation === null || variation === 0 || k.goodDirection === "NONE" ? C.muted : (variation > 0) === (k.goodDirection === "UP") ? C.good : C.bad;
  return (
    <View style={s.card} wrap={false}>
      <View style={s.cardIn}>
        <Text style={s.cardLabel}>{k.label}</Text>
        <Text style={s.cardValue}>{k.unavailable ? "Non disponible" : formatKpiValue(k.unit, k.value)}</Text>
        {k.unavailable ? (
          <Text style={s.cardSub}>{k.unavailable}</Text>
        ) : (
          <>
            {variation !== null ? <Text style={[s.cardSub, { color: tone }]}>{formatVariation(variation)} vs période précédente</Text> : null}
            {k.hint ? <Text style={s.cardSub}>{k.hint}</Text> : null}
          </>
        )}
      </View>
    </View>
  );
}

function TablePdf({ t }: { t: ReportTable }) {
  const total = t.columns.length || 1;
  const w = `${100 / total}%`;
  return (
    <View>
      <Text style={s.h2}>{t.title}</Text>
      {t.note ? <Text style={s.note}>{t.note}</Text> : null}
      {t.unavailable ? (
        <Text style={s.empty}>{t.unavailable}</Text>
      ) : t.rows.length === 0 ? (
        <Text style={s.empty}>{t.emptyText}</Text>
      ) : (
        <View>
          <View style={s.tHead} wrap={false}>
            {t.columns.map((c) => (
              <Text key={c.key} style={[s.cell, { width: w }, isNumericType(c.type) ? s.num : {}]}>
                {c.label}
              </Text>
            ))}
          </View>
          {t.rows.map((r, i) => (
            <View key={i} style={s.tRow} wrap={false}>
              {t.columns.map((c) => (
                <Text key={c.key} style={[s.cell, { width: w }, isNumericType(c.type) ? s.num : {}]}>
                  {formatCell(c.type, r[c.key] ?? null) || EMPTY}
                </Text>
              ))}
            </View>
          ))}
        </View>
      )}
    </View>
  );
}

export function ReportDocument({ report }: { report: Report }) {
  const filters = report.filters.map((f) => `${f.label} : ${f.value}`).join(" · ");
  return (
    <Document title={`${report.title} – ${report.periodLabel}`} author={report.company}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <View style={s.top} fixed>
          <View>
            <Text style={s.brand}>RICHBOND</Text>
            <Text style={s.brandSub}>Achats & Stocks · {report.company}</Text>
          </View>
          <View>
            <Text style={s.title}>{report.title}</Text>
            <Text style={s.period}>{report.periodLabel}</Text>
          </View>
        </View>
        <Text style={s.meta}>
          Généré le {formatDateTime(new Date(report.generatedAt))}
          {filters ? ` · ${filters}` : " · Aucun filtre"}
        </Text>
        <View style={s.grid}>
          {report.kpis.map((k) => (
            <KpiCardPdf key={k.key} k={k} />
          ))}
        </View>
        {report.tables.map((t) => (
          <TablePdf key={t.key} t={t} />
        ))}
        {report.notes.map((n, i) => (
          <Text key={i} style={[s.note, { marginTop: i === 0 ? 8 : 0 }]}>
            {n}
          </Text>
        ))}
        <View style={s.footer} fixed>
          <Text>
            {report.title} · {report.periodLabel}
          </Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

/** Les polices PDF standard (WinAnsi) n'ont pas la flèche « → » : on la remplace par « -> » avant le rendu. */
export async function renderReportPdf(report: Report): Promise<Buffer> {
  const safe = JSON.parse(JSON.stringify(report).replaceAll("→", "->")) as Report;
  return renderToBuffer(<ReportDocument report={safe} />);
}
