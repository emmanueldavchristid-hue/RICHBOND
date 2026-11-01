import { Document, Page, renderToBuffer, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDate } from "@/lib/dates";
import { fixed, moneyText } from "@/modules/purchase-orders/pdf/document";
import { ALLOCATION_KEY_LABELS, COST_STATUS_LABELS, IMPORT_MODE_LABELS } from "./labels";
import type { CostSheet } from "./sheet";

/** Fiche de calcul du coût de revient import (LOT-12), A4 paysage. Document pur : n'accède à aucune base. */
const C = { ink: "#1a1a1a", muted: "#555555", line: "#999999", head: "#e9e9e9" };
const s = StyleSheet.create({
  page: { paddingTop: 30, paddingBottom: 40, paddingHorizontal: 30, fontFamily: "Helvetica", fontSize: 8, color: C.ink },
  title: { fontSize: 15, fontWeight: "bold" },
  sub: { color: C.muted, marginTop: 2, marginBottom: 8 },
  h2: { fontSize: 10, fontWeight: "bold", marginTop: 10, marginBottom: 4 },
  row: { flexDirection: "row" },
  tHead: { flexDirection: "row", backgroundColor: C.head, borderWidth: 0.7, borderColor: C.line, fontWeight: "bold" },
  tRow: { flexDirection: "row", borderLeftWidth: 0.7, borderRightWidth: 0.7, borderBottomWidth: 0.5, borderColor: C.line },
  cell: { paddingVertical: 2.5, paddingHorizontal: 3 },
  num: { textAlign: "right" },
  total: { marginTop: 6, alignSelf: "flex-end", width: 280 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 1.5 },
  grand: { borderTopWidth: 0.9, borderColor: C.ink, marginTop: 2, paddingTop: 3, fontWeight: "bold", fontSize: 9.5 },
  warn: { marginTop: 6, color: C.muted },
  footer: { position: "absolute", left: 30, right: 30, bottom: 18, fontSize: 7, color: C.muted, flexDirection: "row", justifyContent: "space-between" },
});

function Table<T>({ cols, rows }: { cols: { label: string; w: string; num?: boolean; v: (r: T) => string }[]; rows: T[] }) {
  return (
    <View>
      <View style={s.tHead}>
        {cols.map((c) => (
          <Text key={c.label} style={[s.cell, { width: c.w }, c.num ? s.num : {}]}>
            {c.label}
          </Text>
        ))}
      </View>
      {rows.map((r, i) => (
        <View key={i} style={s.tRow} wrap={false}>
          {cols.map((c) => (
            <Text key={c.label} style={[s.cell, { width: c.w }, c.num ? s.num : {}]}>
              {c.v(r)}
            </Text>
          ))}
        </View>
      ))}
    </View>
  );
}

export function CostSheetDocument({ sheet, company }: { sheet: CostSheet; company: string }) {
  const f = sheet.file;
  const coef = sheet.totals.coefficient ? sheet.totals.coefficient.replace(".", ",") : "–";
  return (
    <Document title={`Fiche de calcul ${f.number}`} author={company}>
      <Page size="A4" orientation="landscape" style={s.page}>
        <Text style={s.title}>Fiche de calcul du coût de revient import – {f.number}</Text>
        <Text style={s.sub}>
          {company} · {f.supplierName} ({f.supplierCountry}) · {IMPORT_MODE_LABELS[f.mode]}
          {f.incoterm ? ` · ${f.incoterm}${f.incotermPlace ? ` ${f.incotermPlace}` : ""}` : ""}
          {f.orders.length ? ` · BC ${f.orders.join(", ")}` : ""}
          {f.blNumber ? ` · BL/LTA ${f.blNumber}` : ""}
          {f.containerNumber ? ` · Conteneur ${f.containerNumber}` : ""}
          {sheet.final ? " · Fiche définitive (dossier clôturé)" : " · Fiche provisoire (dossier ouvert)"}
        </Text>

        <Text style={s.h2}>Marchandises</Text>
        <Table
          rows={sheet.lines}
          cols={[
            { label: "BC / ligne", w: "11%", v: (l) => `${l.orderNumber}/${l.lineNo}` },
            { label: "Désignation", w: "25%", v: (l) => `${l.itemCode ? `${l.itemCode} – ` : ""}${l.designation}` },
            { label: "Quantité", w: "8%", num: true, v: (l) => `${fixed(l.qty, 3).replace(/,?0+$/, "")} ${l.stockUnit ?? ""}` },
            { label: "Valeur marchandise", w: "14%", num: true, v: (l) => moneyText(l.goodsValueXof, "XOF", 0) },
            { label: "Frais répartis", w: "13%", num: true, v: (l) => moneyText(l.allocatedXof, "XOF", 0) },
            { label: "Coût dédouané", w: "14%", num: true, v: (l) => moneyText(l.landedValueXof, "XOF", 0) },
            { label: "Coût unit. dédouané", w: "11%", num: true, v: (l) => fixed(l.unitLandedCost, 2) },
            { label: "Coeff.", w: "4%", num: true, v: (l) => (l.coefficient ? l.coefficient.replace(".", ",") : "–") },
          ]}
        />

        <Text style={s.h2}>Frais d&apos;approche</Text>
        <Table
          rows={sheet.costs}
          cols={[
            { label: "Frais", w: "20%", v: (c) => c.typeLabel },
            { label: "Statut", w: "8%", v: (c) => COST_STATUS_LABELS[c.status] },
            { label: "Montant", w: "14%", num: true, v: (c) => moneyText(c.amount, c.currencyCode, c.currencyCode === "XOF" ? 0 : 2) },
            { label: "Taux figé", w: "10%", num: true, v: (c) => (c.currencyCode === "XOF" ? "–" : fixed(c.rate, 2)) },
            { label: "Équivalent FCFA", w: "14%", num: true, v: (c) => moneyText(c.amountXof, "XOF", 0) },
            { label: "Clé de répartition", w: "14%", v: (c) => (c.excluded ? "Exclu (récupérable)" : `${ALLOCATION_KEY_LABELS[c.keyUsed]}${c.fallback ? " (repli)" : ""}`) },
            { label: "Fournisseur du frais", w: "20%", v: (c) => c.payee ?? "" },
          ]}
        />

        <View style={s.total}>
          <View style={s.totalRow}>
            <Text>Valeur marchandise</Text>
            <Text>{moneyText(sheet.totals.goodsValueXof, "XOF", 0)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text>Frais d&apos;approche intégrés</Text>
            <Text>{moneyText(sheet.totals.costsXof, "XOF", 0)}</Text>
          </View>
          {sheet.totals.excludedXof > 0 ? (
            <View style={s.totalRow}>
              <Text>Frais récupérables (hors coût)</Text>
              <Text>{moneyText(sheet.totals.excludedXof, "XOF", 0)}</Text>
            </View>
          ) : null}
          <View style={[s.totalRow, s.grand]}>
            <Text>Coût d&apos;arrivée dédouané</Text>
            <Text>{moneyText(sheet.totals.landedXof, "XOF", 0)}</Text>
          </View>
          <View style={s.totalRow}>
            <Text>Coefficient d&apos;approche</Text>
            <Text>{coef}</Text>
          </View>
        </View>

        {sheet.reappraisal.length > 0 ? (
          <View>
            <Text style={s.h2}>Réajustement du PMP (stock restant)</Text>
            <Table
              rows={sheet.reappraisal}
              cols={[
                { label: "Article", w: "30%", v: (r) => `${r.itemCode} – ${r.designation}` },
                { label: "Dépôt", w: "14%", v: (r) => r.warehouseName },
                { label: "Reçu", w: "8%", num: true, v: (r) => r.receivedQty },
                { label: "Stock actuel", w: "9%", num: true, v: (r) => r.stockQty },
                { label: "Surcoût ajouté au stock", w: "13%", num: true, v: (r) => moneyText(r.appliedXof, "XOF", 0) },
                { label: "Déjà sorti (non réécrit)", w: "13%", num: true, v: (r) => moneyText(r.exposedXof, "XOF", 0) },
                { label: "PMP avant → après", w: "13%", num: true, v: (r) => `${fixed(r.pmpBefore, 2)} → ${fixed(r.pmpAfter, 2)}` },
              ]}
            />
          </View>
        ) : null}
        {sheet.warnings.map((w) => (
          <Text key={w} style={s.warn}>
            Attention : {w}
          </Text>
        ))}
        <View style={s.footer} fixed>
          <Text>Édité le {formatDate(new Date(sheet.generatedAt))}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}

export function renderCostSheetPdf(sheet: CostSheet, company: string): Promise<Buffer> {
  return renderToBuffer(<CostSheetDocument sheet={sheet} company={company} />);
}
