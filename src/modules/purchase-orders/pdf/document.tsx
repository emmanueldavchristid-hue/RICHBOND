import { Document, Image, Page, StyleSheet, Text, View } from "@react-pdf/renderer";
import { formatDateOnly } from "@/lib/dates";
import { formatQty } from "@/lib/money";
import { INCOTERM_LABELS, PAYMENT_TERM_LABELS } from "@/modules/referentials/labels";
import type { OrderSnapshot } from "../snapshot";

/**
 * D28 : bon de commande A4. Police Helvetica standard (l'espace insécable U+00A0 des montants y est géré).
 * Document pur : reçoit un instantané de version, les coordonnées société et le logo ; n'accède à aucune base.
 */
export interface CompanyInfo {
  name: string;
  address: string;
  phone: string;
  email: string;
  legalIds: string;
  footer: string;
  conditions: string;
}

export interface LogoInput {
  data: Buffer;
  format: "png" | "jpg";
}

export interface OrderDocumentProps {
  snapshot: OrderSnapshot;
  company: CompanyInfo;
  logo?: LogoInput | null;
  /** Aperçu d'un bon non validé : filigrane et aucun numéro. */
  preview?: boolean;
}

const NBSP = " ";

/** Nombre au nombre de décimales de la devise : « 1 250 000 » ou « 1 250,50 ». */
export function fixed(value: string | number, decimals: number): string {
  const n = Number(value);
  const [i, f] = Math.abs(n).toFixed(decimals).split(".");
  const int = i.replace(/\B(?=(\d{3})+(?!\d))/g, NBSP);
  return `${n < 0 ? "-" : ""}${int}${f ? `,${f}` : ""}`;
}

export function moneyText(value: string | number, currency: string, decimals: number): string {
  return `${fixed(value, decimals)}${NBSP}${currency === "XOF" ? "FCFA" : currency}`;
}

const C = { ink: "#1a1a1a", muted: "#555555", line: "#999999", head: "#e9e9e9", warn: "#d9d9d9" };

const s = StyleSheet.create({
  page: { paddingTop: 34, paddingBottom: 54, paddingHorizontal: 34, fontFamily: "Helvetica", fontSize: 8.5, color: C.ink },
  row: { flexDirection: "row" },
  header: { flexDirection: "row", justifyContent: "space-between", marginBottom: 14 },
  logo: { height: 42, marginBottom: 4, objectFit: "contain", alignSelf: "flex-start" },
  company: { fontSize: 12, fontWeight: "bold", marginBottom: 2 },
  muted: { color: C.muted },
  title: { fontSize: 17, fontWeight: "bold", textAlign: "right" },
  titleNumber: { fontSize: 12, fontWeight: "bold", textAlign: "right", marginTop: 3 },
  right: { textAlign: "right" },
  boxes: { flexDirection: "row", gap: 10, marginBottom: 12 },
  box: { flexGrow: 1, flexBasis: 0, borderWidth: 0.7, borderColor: C.line, padding: 7 },
  boxTitle: { fontSize: 7.5, fontWeight: "bold", color: C.muted, marginBottom: 3, textTransform: "uppercase" },
  bold: { fontWeight: "bold" },
  tHead: { flexDirection: "row", backgroundColor: C.head, borderWidth: 0.7, borderColor: C.line, fontWeight: "bold" },
  tRow: { flexDirection: "row", borderLeftWidth: 0.7, borderRightWidth: 0.7, borderBottomWidth: 0.5, borderColor: C.line },
  cell: { paddingVertical: 3, paddingHorizontal: 3 },
  num: { textAlign: "right" },
  totals: { alignSelf: "flex-end", width: 250, marginTop: 8 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 2 },
  grand: { borderTopWidth: 0.9, borderColor: C.ink, marginTop: 2, paddingTop: 3, fontSize: 10, fontWeight: "bold" },
  section: { marginTop: 10 },
  sign: { marginTop: 16, flexDirection: "row", justifyContent: "flex-end" },
  signBox: { width: 210, borderWidth: 0.7, borderColor: C.line, padding: 7, minHeight: 62 },
  footer: { position: "absolute", left: 34, right: 34, bottom: 22, flexDirection: "row", justifyContent: "space-between", fontSize: 7.5, color: C.muted, borderTopWidth: 0.5, borderColor: C.line, paddingTop: 4 },
  watermark: { position: "absolute", top: 330, left: 20, width: 555, textAlign: "center", fontSize: 28, fontWeight: "bold", color: C.warn, transform: "rotate(-28deg)" },
});

const COLS = [
  { key: "n", label: "N°", w: "4%", align: "left" },
  { key: "code", label: "Code", w: "11%", align: "left" },
  { key: "ref", label: "Réf. fourn.", w: "11%", align: "left" },
  { key: "des", label: "Désignation", w: "27%", align: "left" },
  { key: "qty", label: "Qté", w: "8%", align: "right" },
  { key: "unit", label: "Unité", w: "6%", align: "left" },
  { key: "pu", label: "P.U.", w: "11%", align: "right" },
  { key: "disc", label: "Rem.", w: "5%", align: "right" },
  { key: "vat", label: "TVA", w: "5%", align: "right" },
  { key: "net", label: "Montant", w: "12%", align: "right" },
] as const;

export function PurchaseOrderDocument({ snapshot: o, company, logo, preview = false }: OrderDocumentProps) {
  const dec = o.currencyDecimals;
  const label = o.number ? (o.version > 1 ? `${o.number} v${o.version}` : o.number) : "BROUILLON";
  const money = (v: string | number) => moneyText(v, o.currencyCode, dec);
  const isForeign = o.currencyCode !== "XOF";
  const orderDate = o.orderDate ? formatDateOnly(new Date(`${o.orderDate}T00:00:00Z`)) : "";
  const contactLine = [o.supplier.contact?.name, o.supplier.contact?.phone ?? o.supplier.phone, o.supplier.contact?.email ?? o.supplier.email].filter(Boolean).join(" – ");
  const incoterm = o.incoterm ? `${INCOTERM_LABELS[o.incoterm as keyof typeof INCOTERM_LABELS] ?? o.incoterm}${o.incotermPlace ? ` – ${o.incotermPlace}` : ""}` : null;
  const payment = `${PAYMENT_TERM_LABELS[o.paymentTerm as keyof typeof PAYMENT_TERM_LABELS] ?? o.paymentTerm}${o.paymentTermNote ? ` – ${o.paymentTermNote}` : ""}`;

  return (
    <Document title={`Bon de commande ${label}`} author={company.name} subject="Bon de commande">
      <Page size="A4" style={s.page}>
        {preview ? (
          <Text style={s.watermark} fixed>
            NON VALIDÉ – NE PAS ENVOYER
          </Text>
        ) : null}

        <View style={s.header}>
          <View style={{ maxWidth: 300 }}>
            {/* Image de @react-pdf/renderer (pas un <img> HTML) : pas d'attribut alt dans un PDF. */}
            {/* eslint-disable-next-line jsx-a11y/alt-text */}
            {logo ? <Image style={s.logo} src={{ data: logo.data, format: logo.format }} /> : null}
            <Text style={s.company}>{company.name}</Text>
            {company.address ? <Text style={s.muted}>{company.address}</Text> : null}
            {company.phone || company.email ? <Text style={s.muted}>{[company.phone, company.email].filter(Boolean).join(" – ")}</Text> : null}
            {company.legalIds ? <Text style={s.muted}>{company.legalIds}</Text> : null}
          </View>
          <View>
            <Text style={s.title}>BON DE COMMANDE</Text>
            <Text style={s.titleNumber}>{preview ? "Aperçu – numéro attribué à la validation" : `N°${NBSP}${label}`}</Text>
            {!preview ? <Text style={[s.right, s.muted, { marginTop: 3 }]}>Date : {orderDate}</Text> : null}
            {o.version > 1 && !preview ? <Text style={[s.right, s.bold, { marginTop: 2 }]}>Avenant – version {o.version}</Text> : null}
          </View>
        </View>

        <View style={s.boxes}>
          <View style={s.box}>
            <Text style={s.boxTitle}>Fournisseur</Text>
            <Text style={s.bold}>
              {o.supplier.name} ({o.supplier.code})
            </Text>
            {o.supplier.address ? <Text>{o.supplier.address}</Text> : null}
            <Text>{[o.supplier.city, o.supplier.country].filter(Boolean).join(", ")}</Text>
            {contactLine ? <Text style={s.muted}>{contactLine}</Text> : null}
            {o.supplierRef ? <Text style={s.muted}>Votre réf. : {o.supplierRef}</Text> : null}
          </View>
          <View style={s.box}>
            <Text style={s.boxTitle}>Livraison</Text>
            <Text style={s.bold}>{o.warehouse.name}</Text>
            <Text>{o.deliveryAddress}</Text>
            <Text style={{ marginTop: 3 }}>Livraison demandée le {formatDateOnly(new Date(`${o.requestedDate}T00:00:00Z`))}</Text>
            <Text>Paiement : {payment}</Text>
            {incoterm ? <Text>Incoterm : {incoterm}</Text> : null}
          </View>
        </View>

        <View style={s.tHead} fixed>
          {COLS.map((c) => (
            <Text key={c.key} style={[s.cell, { width: c.w, textAlign: c.align }]}>
              {c.label}
            </Text>
          ))}
        </View>
        {o.lines.map((l) => {
          const cells: Record<(typeof COLS)[number]["key"], string> = {
            n: String(l.lineNo),
            code: l.itemCode ?? "",
            ref: l.supplierRef ?? "",
            des: l.note ? `${l.designation} (${l.note})` : l.designation,
            qty: formatQty(l.quantity),
            unit: l.unit,
            pu: fixed(l.unitPrice, dec),
            disc: Number(l.discountPct) > 0 ? `${formatQty(l.discountPct)} %` : "",
            vat: `${formatQty(l.vatRate)} %`,
            net: fixed(l.netAmount, dec),
          };
          return (
            <View key={l.lineNo} style={s.tRow} wrap={false}>
              {COLS.map((c) => (
                <Text key={c.key} style={[s.cell, { width: c.w, textAlign: c.align }]}>
                  {cells[c.key]}
                </Text>
              ))}
            </View>
          );
        })}
        {o.charges.map((c, i) => (
          <View key={`c${i}`} style={s.tRow} wrap={false}>
            <Text style={[s.cell, { width: "4%" }]}> </Text>
            <Text style={[s.cell, { width: "11%" }]}> </Text>
            <Text style={[s.cell, { width: "11%" }]}> </Text>
            <Text style={[s.cell, { width: "27%" }]}>{c.label}</Text>
            <Text style={[s.cell, { width: "8%" }]}> </Text>
            <Text style={[s.cell, { width: "6%" }]}> </Text>
            <Text style={[s.cell, { width: "11%" }]}> </Text>
            <Text style={[s.cell, { width: "5%" }]}> </Text>
            <Text style={[s.cell, s.num, { width: "5%" }]}>{formatQty(c.vatRate)} %</Text>
            <Text style={[s.cell, s.num, { width: "12%" }]}>{fixed(c.amount, dec)}</Text>
          </View>
        ))}

        <View style={s.totals} wrap={false}>
          <View style={s.totalRow}>
            <Text>Total HT</Text>
            <Text>{money(o.totals.totalHt)}</Text>
          </View>
          {o.totals.vat
            .filter((v) => Number(v.base) !== 0)
            .map((v) => (
              <View key={v.rate} style={s.totalRow}>
                <Text style={s.muted}>
                  TVA {v.rate} % sur {fixed(v.base, dec)}
                </Text>
                <Text>{money(v.vat)}</Text>
              </View>
            ))}
          <View style={s.totalRow}>
            <Text>Total TVA</Text>
            <Text>{money(o.totals.totalVat)}</Text>
          </View>
          <View style={[s.totalRow, s.grand]}>
            <Text>Total TTC</Text>
            <Text>{money(o.totals.totalTtc)}</Text>
          </View>
          {isForeign && o.totals.totalTtcXof !== null ? (
            <View style={s.totalRow}>
              <Text style={s.muted}>
                Équivalent FCFA (taux {o.exchangeRate ? fixed(o.exchangeRate, 2) : ""}
                {o.rateDate ? ` du ${formatDateOnly(new Date(`${o.rateDate}T00:00:00Z`))}` : ""})
              </Text>
              <Text>{moneyText(o.totals.totalTtcXof, "XOF", 0)}</Text>
            </View>
          ) : null}
        </View>

        {o.notes ? (
          <View style={s.section} wrap={false}>
            <Text style={s.bold}>Observations</Text>
            <Text>{o.notes}</Text>
          </View>
        ) : null}
        {company.conditions ? (
          <View style={s.section} wrap={false}>
            <Text style={s.bold}>Conditions</Text>
            <Text style={s.muted}>{company.conditions}</Text>
          </View>
        ) : null}

        <View style={s.sign} wrap={false}>
          <View style={s.signBox}>
            <Text style={s.boxTitle}>Responsable Achats</Text>
            {o.approval && !preview ? (
              <>
                <Text style={s.bold}>{o.approval.underThreshold ? "Validé automatiquement (montant sous le seuil)" : o.approval.approvedByName}</Text>
                <Text style={s.muted}>Le {formatDateOnly(new Date(o.approval.approvedAt))}</Text>
              </>
            ) : null}
          </View>
        </View>

        <View style={s.footer} fixed>
          <Text>{company.footer || company.name}</Text>
          <Text render={({ pageNumber, totalPages }) => `Page ${pageNumber}/${totalPages}`} />
        </View>
      </Page>
    </Document>
  );
}
