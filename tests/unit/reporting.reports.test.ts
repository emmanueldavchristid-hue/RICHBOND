import { describe, expect, it } from "vitest";
import {
  averageStock,
  invoiceConformityRate,
  localSharePct,
  meanOf,
  otifRate,
  serviceRate,
  stockCoverageDays,
  stockRotation,
} from "@/modules/reporting/kpi";
import { KPI_DEFS } from "@/modules/reporting/report-defs";
import { formatCell, formatKpiValue } from "@/modules/reporting/report-format";
import { elapsedDays, reportQuerySchema, resolveReportPeriod } from "@/modules/reporting/report-period";
import { reportAccess } from "@/modules/reporting/report-access";
import { buildReportWorkbook } from "@/modules/reporting/report-excel";
import { renderReportPdf } from "@/modules/reporting/report-pdf";
import { REPORT_KINDS, type Report } from "@/modules/reporting/report-types";

describe("KPI du LOT-15 (jeu connu)", () => {
  it("OTIF, taux de service, conformité : pourcentage à 1 décimale, null sans dénominateur", () => {
    expect(otifRate(1, 3)).toBe(33.3);
    expect(otifRate(0, 0)).toBeNull();
    expect(serviceRate(97, 100)).toBe(97);
    expect(invoiceConformityRate(2, 3)).toBe(66.7);
    expect(invoiceConformityRate(0, 0)).toBeNull();
  });

  it("part des achats locaux", () => {
    expect(localSharePct(1_500_000, 2_000_000)).toBe(75);
    expect(localSharePct(0, 0)).toBeNull();
  });

  it("rotation annualisée et couverture : stock moyen 42 000, consommation 20 000 sur 31 jours", () => {
    expect(averageStock(32_000, 52_000)).toBe(42_000);
    expect(stockRotation(20_000, 42_000, 31)).toBe(5.6);
    expect(stockCoverageDays(42_000, 20_000, 31)).toBe(65.1);
  });

  it("rotation et couverture : jamais de division par zéro", () => {
    expect(stockRotation(1000, 0, 30)).toBeNull();
    expect(stockRotation(1000, 500, 0)).toBeNull();
    expect(stockCoverageDays(500, 0, 30)).toBeNull();
    expect(stockRotation(0, 500, 30)).toBe(0);
  });

  it("moyenne de valeurs connues (ignore les absences)", () => {
    expect(meanOf([90, 70])).toBe(80);
    expect(meanOf([null, 1.25, 1.35])).toBe(1.3);
    expect(meanOf([null])).toBeNull();
  });
});

describe("périodes des rapports (Africa/Abidjan)", () => {
  const now = new Date("2026-11-04T10:00:00.000Z"); // mercredi
  it("quotidien : le jour choisi, jour précédent en comparaison", () => {
    const p = resolveReportPeriod("quotidien", { date: "2026-10-20" }, now);
    expect([p.from, p.to, p.days, p.label, p.previous.from]).toEqual(["2026-10-20", "2026-10-20", 1, "20/10/2026", "2026-10-19"]);
    expect(p.period.endExclusive.getTime() - p.period.start.getTime()).toBe(86_400_000);
  });
  it("hebdomadaire : du lundi au dimanche, semaine précédente en comparaison", () => {
    const p = resolveReportPeriod("hebdomadaire", {}, now);
    expect([p.from, p.to, p.previous.from, p.previous.to]).toEqual(["2026-11-02", "2026-11-08", "2026-10-26", "2026-11-01"]);
    expect(p.label).toBe("Semaine du 02/11/2026 au 08/11/2026");
  });
  it("mensuel : mois calendaire, février compris", () => {
    const p = resolveReportPeriod("mensuel", { month: "2028-02" }, now);
    expect([p.from, p.to, p.days, p.label, p.previous.to]).toEqual(["2028-02-01", "2028-02-29", 29, "Février 2028", "2028-01-31"]);
  });
  it("jours écoulés d'un mois en cours : bornés entre 1 et la durée", () => {
    const p = resolveReportPeriod("mensuel", { month: "2026-11" }, now);
    expect(elapsedDays(p, "2026-11-04")).toBe(4);
    expect(elapsedDays(p, "2026-12-15")).toBe(30);
    expect(elapsedDays(p, "2026-10-31")).toBe(1);
  });
});

describe("paramètres des rapports (Zod)", () => {
  it("les champs vides d'un formulaire GET sont ignorés", () => {
    const r = reportQuerySchema.parse({ date: "", category: "", buyerId: "" });
    expect(r).toEqual({});
  });
  it("refuse une date impossible, un mois invalide, une catégorie inconnue", () => {
    expect(reportQuerySchema.safeParse({ date: "2026-02-31" }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ month: "2026-13" }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ category: "AUTRE" }).success).toBe(false);
    expect(reportQuerySchema.safeParse({ date: "2026-02-28", category: "PDR" }).success).toBe(true);
  });
});

describe("droits sur les rapports", () => {
  it("Responsable et Super-admin : tout ; Magasinier : aucun rapport achats", () => {
    expect(reportAccess({ role: "RESPONSABLE_ACHATS" })).toEqual({ allowed: true, scope: null });
    expect(reportAccess({ role: "SUPER_ADMIN" }).allowed).toBe(true);
    expect(reportAccess({ role: "MAGASINIER" }).allowed).toBe(false);
  });
  it("Acheteur : périmètre imposé ; sans périmètre, refusé", () => {
    expect(reportAccess({ role: "ACHETEUR", purchaseScope: "LOCAL" })).toEqual({ allowed: true, scope: "LOCAL" });
    expect(reportAccess({ role: "ACHETEUR", purchaseScope: "IMPORT" })).toEqual({ allowed: true, scope: "IMPORT" });
    expect(reportAccess({ role: "ACHETEUR", purchaseScope: "ALL" })).toEqual({ allowed: true, scope: null });
    expect(reportAccess({ role: "ACHETEUR", purchaseScope: null }).allowed).toBe(false);
  });
});

describe("mise en forme", () => {
  it("montants, dates, vides", () => {
    expect(formatKpiValue("FCFA", 1_250_000)).toBe("1 250 000 FCFA");
    expect(formatKpiValue("PERCENT", 33.3)).toBe("33,3 %");
    expect(formatKpiValue("DAYS", null)).toBe("–");
    expect(formatCell("date", "2026-10-20")).toBe("20/10/2026");
    expect(formatCell("money", null)).toBe("–");
  });
  it("chaque KPI a une définition non vide (infobulle)", () => {
    for (const [key, def] of Object.entries(KPI_DEFS)) {
      expect(def.help.length, key).toBeGreaterThan(20);
      expect(def.label.length, key).toBeGreaterThan(2);
    }
  });
});

describe("génération des fichiers d'un rapport (sans base)", () => {
  const report = (kind: (typeof REPORT_KINDS)[number]): Report => ({
    kind,
    title: `Rapport ${kind}`,
    periodLabel: "Octobre 2026",
    from: "2026-10-01",
    to: "2026-10-31",
    generatedAt: "2026-11-01T12:00:00.000Z",
    company: "RICHBOND CI",
    filters: [{ label: "Périmètre", value: "Achats locaux" }],
    notes: ["Note de test."],
    kpis: [
      { key: "montant-achete", label: "Montant acheté", unit: "FCFA", value: 2_000_000, previous: 1_000_000, variationPct: 100, goodDirection: "NONE", help: "Aide." },
      { key: "delai-da-bc", label: "Délai DA → BC", unit: "DAYS", value: 3.5, previous: null, variationPct: null, goodDirection: "DOWN", help: "Aide." },
      { key: "gains-achats", label: "Gains achats", unit: "FCFA", value: null, previous: null, variationPct: null, goodDirection: "UP", help: "Aide.", unavailable: "Non disponible : module absent." },
    ],
    tables: [
      {
        key: "t1",
        title: "Achats par fournisseur",
        columns: [
          { key: "supplier", label: "Fournisseur", type: "text" },
          { key: "amount", label: "Montant", type: "money" },
          { key: "date", label: "Date", type: "date" },
        ],
        rows: [
          { supplier: "=CMD()|' !A1", amount: 1_250_000, date: "2026-10-05" },
          { supplier: "Autre", amount: 750_000, date: null },
        ],
        emptyText: "Rien.",
      },
      { key: "t2", title: "Vide", columns: [{ key: "a", label: "A", type: "text" }], rows: [], emptyText: "Aucune ligne." },
      { key: "t3", title: "Indisponible", columns: [], rows: [], emptyText: "", unavailable: "Non disponible : module absent." },
    ],
  });

  it.each(REPORT_KINDS)("%s : PDF valide", async (kind) => {
    const bytes = await renderReportPdf(report(kind));
    expect(bytes.subarray(0, 4).toString()).toBe("%PDF");
    expect(bytes.length).toBeGreaterThan(1500);
  });

  it.each(REPORT_KINDS)("%s : Excel valide, formule neutralisée, montant numérique", async (kind) => {
    const ExcelJS = (await import("exceljs")).default;
    const bytes = await buildReportWorkbook(report(kind));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(bytes as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(["Informations", "Indicateurs", "Achats par fournisseur", "Vide", "Indisponible"]);
    const ws = wb.getWorksheet("Achats par fournisseur")!;
    expect(ws.getCell("A2").value).toBe("'=CMD()|' !A1");
    expect(ws.getCell("B2").value).toBe(1_250_000);
    expect(ws.getCell("C2").value).toBeInstanceOf(Date);
    expect(wb.getWorksheet("Indicateurs")!.getCell("B4").value).toBe("Non disponible");
  });
});
