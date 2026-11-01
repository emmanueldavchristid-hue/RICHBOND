import "server-only";
import type { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { dayKeyOf, todayAbidjan } from "@/lib/dates";
import { BusinessError } from "@/lib/errors";
import type { OrderActor } from "@/modules/purchase-orders/internal";
import { parseInput } from "@/modules/purchase-requests/parse";
import { Decimal } from "@/modules/stock/pmp";
import { defaultCoefficient, suggestCoefficient, type CoefficientSuggestion } from "./coefficient";
import { IMPORT_MODES, MILESTONE_LABELS, type ImportModeCode, type MilestoneCode } from "./labels";
import { currentMilestone, milestoneState, sortMilestones, type MilestoneState } from "./milestones";
import { eligibleOrdersSchema, fileIdSchema, listImportFilesSchema, suggestionSchema, type ListImportFilesInput } from "./schemas";
import { assertImportAccess, canCloseImportFile } from "./scope";
import { computeCostSheet, type CostSheet } from "./sheet";

/**
 * Lectures du module Import (LOT-12). Toutes exigent `importFile.view` au périmètre IMPORT : un Acheteur « local »
 * est refusé (FORBIDDEN), il n'a ni menu ni donnée. Nombres décimaux en chaînes, dates « jour » en `yyyy-MM-dd`.
 */

const day = (d: Date | null) => (d ? dayKeyOf(d) : null);
const NOT_LINKABLE = ["BROUILLON", "A_VALIDER", "REFUSE", "ANNULE"] as const;

export interface MilestoneView extends MilestoneState {
  label: string;
  note: string | null;
}

function milestoneViews(list: { code: MilestoneCode; plannedDate: Date | null; actualDate: Date | null; note: string | null }[], today: string): MilestoneView[] {
  return sortMilestones(list).map((m) => ({
    ...milestoneState({ code: m.code, plannedDate: day(m.plannedDate), actualDate: day(m.actualDate) }, today),
    label: MILESTONE_LABELS[m.code],
    note: m.note,
  }));
}

export interface ImportFileRow {
  id: string;
  number: string;
  status: "OUVERT" | "CLOTURE" | "ANNULE";
  supplier: { id: string; name: string; country: string };
  mode: ImportModeCode;
  incoterm: string | null;
  orderNumbers: string[];
  /** Jalon courant (premier non réalisé) ; null si tout est réalisé. */
  current: MilestoneView | null;
  /** Au moins un jalon en retard. */
  late: boolean;
  eta: string | null;
  coefficient: string | null;
  createdAt: Date;
}

export interface ImportFileList {
  rows: ImportFileRow[];
  total: number;
  page: number;
  pageSize: number;
  /** Dossiers ouverts avec un jalon en retard (tous filtres confondus). */
  lateCount: number;
}

/** Liste des dossiers avec jalon courant et retards. */
export async function listImportFiles(user: OrderActor, raw: unknown = {}, at: Date = now()): Promise<ImportFileList> {
  assertImportAccess(user, "importFile.view");
  const input: ListImportFilesInput = parseInput(listImportFilesSchema, raw);
  const today = todayAbidjan(at);
  const search = input.search?.trim();
  const where: Prisma.ImportFileWhereInput = {
    ...(input.status ? { status: input.status } : {}),
    ...(input.supplierId ? { supplierId: input.supplierId } : {}),
    ...(search
      ? {
          OR: [
            { number: { contains: search, mode: "insensitive" } },
            { supplier: { name: { contains: search, mode: "insensitive" } } },
            { blNumber: { contains: search, mode: "insensitive" } },
            { containerNumber: { contains: search, mode: "insensitive" } },
            { orders: { some: { order: { number: { contains: search, mode: "insensitive" } } } } },
          ],
        }
      : {}),
  };
  const files = await db.importFile.findMany({
    where,
    orderBy: { createdAt: "desc" },
    include: {
      supplier: { select: { id: true, name: true, country: true } },
      milestones: true,
      orders: { select: { order: { select: { number: true } } } },
    },
  });
  const all = files.map((f): ImportFileRow => {
    const views = milestoneViews(f.milestones, today);
    const cur = f.status === "OUVERT" ? currentMilestone(views) : null;
    const eta = views.find((m) => m.code === "ARRIVEE_PREVUE_ETA");
    return {
      id: f.id,
      number: f.number,
      status: f.status,
      supplier: f.supplier,
      mode: f.mode,
      incoterm: f.incoterm,
      orderNumbers: f.orders.map((o) => o.order.number ?? "").filter(Boolean).sort(),
      current: cur ? views.find((v) => v.code === cur.code)! : null,
      late: f.status === "OUVERT" && views.some((v) => v.late),
      eta: eta?.actualDate ?? eta?.plannedDate ?? null,
      coefficient: f.coefficient?.toString() ?? null,
      createdAt: f.createdAt,
    };
  });
  const filtered = all.filter((r) => (!input.milestone || r.current?.code === input.milestone) && (!input.lateOnly || r.late));
  const start = (input.page - 1) * input.pageSize;
  return {
    rows: filtered.slice(start, start + input.pageSize),
    total: filtered.length,
    page: input.page,
    pageSize: input.pageSize,
    lateCount: all.filter((r) => r.late).length,
  };
}

export interface LateMilestone {
  fileId: string;
  number: string;
  supplierName: string;
  code: MilestoneCode;
  label: string;
  plannedDate: string;
  daysLate: number;
}

/** Jalons en retard des dossiers ouverts (alertes LOT-16, accueil), du plus en retard au moins en retard. */
export async function listLateMilestones(user: OrderActor, at: Date = now()): Promise<LateMilestone[]> {
  assertImportAccess(user, "importFile.view");
  const today = todayAbidjan(at);
  const files = await db.importFile.findMany({
    where: { status: "OUVERT" },
    include: { supplier: { select: { name: true } }, milestones: true },
  });
  const out: LateMilestone[] = [];
  for (const f of files) {
    for (const m of milestoneViews(f.milestones, today)) {
      if (m.late) out.push({ fileId: f.id, number: f.number, supplierName: f.supplier.name, code: m.code, label: m.label, plannedDate: m.plannedDate!, daysLate: m.daysLate });
    }
  }
  return out.sort((a, b) => b.daysLate - a.daysLate || a.number.localeCompare(b.number));
}

export interface ImportFileDetail {
  id: string;
  number: string;
  status: "OUVERT" | "CLOTURE" | "ANNULE";
  supplier: { id: string; name: string; country: string; currencyCode: string };
  mode: ImportModeCode;
  incoterm: string | null;
  incotermPlace: string | null;
  loadingPort: string | null;
  transitaire: string | null;
  blNumber: string | null;
  containerNumber: string | null;
  customsDeclaration: string | null;
  customsRegime: string | null;
  notes: string | null;
  coefficient: string | null;
  createdAt: Date;
  closedAt: Date | null;
  cancelledAt: Date | null;
  cancelledReason: string | null;
  milestones: MilestoneView[];
  orders: { id: string; number: string | null; status: string; currencyCode: string; totalHt: string; totalHtXof: number | null; lines: { id: string; lineNo: number; designation: string; quantity: string; unit: string; unitWeightKg: string | null; unitVolumeM3: string | null }[] }[];
  documents: { id: string; type: string; fileName: string; mimeType: string; size: number; createdAt: Date }[];
  adjustments: { id: string; kind: string; costId: string | null; userId: string; before: unknown; after: unknown; reason: string | null; createdAt: Date }[];
  /** Fiche de calcul : en direct tant que le dossier est ouvert, figée après clôture. */
  sheet: CostSheet;
  /** Estimation du coefficient pour ce fournisseur et ce mode (historique, sinon coefficients par défaut). */
  suggestion: Omit<CoefficientSuggestion, "coefficient"> & { coefficient: string };
  closable: { ok: boolean; reasons: string[]; needsEstimateConfirmation: boolean };
  can: { manage: boolean; close: boolean };
}

export async function getImportFile(user: OrderActor, raw: unknown, at: Date = now()): Promise<ImportFileDetail> {
  assertImportAccess(user, "importFile.view");
  const { id } = parseInput(fileIdSchema, raw);
  const today = todayAbidjan(at);
  return db.$transaction(async (tx) => {
    const f = await tx.importFile.findUnique({
      where: { id },
      include: {
        supplier: { select: { id: true, name: true, country: true, currencyCode: true } },
        milestones: true,
        orders: { include: { order: { include: { lines: { orderBy: { lineNo: "asc" }, include: { item: { select: { name: true } } } } } } } },
        documents: { where: { removedAt: null }, orderBy: { createdAt: "asc" } },
        adjustments: { orderBy: { createdAt: "desc" }, take: 200 },
      },
    });
    if (!f) throw new BusinessError("NOT_FOUND", "Dossier import introuvable.");
    const sheet = await computeCostSheet(tx, id, at);
    const suggestion = await suggestFor(tx, f.supplier.id, f.supplier.country, f.mode);
    const pending = f.orders.filter((o) => o.order.status !== "RECU" && o.order.status !== "CLOTURE").map((o) => o.order.number ?? "(brouillon)");
    const reasons: string[] = [];
    if (f.status !== "OUVERT") reasons.push(f.status === "CLOTURE" ? "Dossier déjà clôturé." : "Dossier annulé.");
    else {
      if (f.orders.length === 0) reasons.push("Aucun bon de commande rattaché.");
      if (pending.length > 0) reasons.push(`À réceptionner : ${pending.join(", ")}.`);
    }
    return {
      id: f.id,
      number: f.number,
      status: f.status,
      supplier: f.supplier,
      mode: f.mode,
      incoterm: f.incoterm,
      incotermPlace: f.incotermPlace,
      loadingPort: f.loadingPort,
      transitaire: f.transitaire,
      blNumber: f.blNumber,
      containerNumber: f.containerNumber,
      customsDeclaration: f.customsDeclaration,
      customsRegime: f.customsRegime,
      notes: f.notes,
      coefficient: f.coefficient?.toString() ?? null,
      createdAt: f.createdAt,
      closedAt: f.closedAt,
      cancelledAt: f.cancelledAt,
      cancelledReason: f.cancelledReason,
      milestones: milestoneViews(f.milestones, today),
      orders: f.orders.map((o) => ({
        id: o.order.id,
        number: o.order.number,
        status: o.order.status,
        currencyCode: o.order.currencyCode,
        totalHt: o.order.totalHt.toString(),
        totalHtXof: o.order.totalHtXof,
        lines: o.order.lines.map((l) => ({
          id: l.id,
          lineNo: l.lineNo,
          designation: l.item?.name ?? l.freeDesignation ?? "Article hors catalogue",
          quantity: l.quantity.toString(),
          unit: l.unit,
          unitWeightKg: l.unitWeightKg?.toString() ?? null,
          unitVolumeM3: l.unitVolumeM3?.toString() ?? null,
        })),
      })),
      documents: f.documents.map((d) => ({ id: d.id, type: d.type, fileName: d.fileName, mimeType: d.mimeType, size: d.size, createdAt: d.createdAt })),
      adjustments: f.adjustments.map((a) => ({ id: a.id, kind: a.kind, costId: a.costId, userId: a.userId, before: a.before, after: a.after, reason: a.reason, createdAt: a.createdAt })),
      sheet,
      suggestion: { ...suggestion, coefficient: suggestion.coefficient.toString() },
      closable: { ok: f.status === "OUVERT" && reasons.length === 0, reasons, needsEstimateConfirmation: sheet.totals.estimatedCostCount > 0 },
      can: { manage: f.status === "OUVERT", close: f.status === "OUVERT" && canCloseImportFile(user) },
    };
  });
}

/** Bons de commande import validés du fournisseur, pas encore rattachés à un dossier. */
export async function listEligibleOrders(user: OrderActor, raw: unknown) {
  assertImportAccess(user, "importFile.view");
  const { supplierId } = parseInput(eligibleOrdersSchema, raw);
  const orders = await db.purchaseOrder.findMany({
    where: { supplierId, type: "IMPORT", status: { notIn: [...NOT_LINKABLE] }, importLink: null },
    orderBy: { number: "asc" },
    select: { id: true, number: true, status: true, currencyCode: true, totalHt: true, totalHtXof: true, expectedDate: true },
  });
  return orders.map((o) => ({ id: o.id, number: o.number, status: o.status, currencyCode: o.currencyCode, totalHt: o.totalHt.toString(), totalHtXof: o.totalHtXof, expectedDate: day(o.expectedDate) }));
}

async function suggestFor(tx: Pick<Prisma.TransactionClient, "approachCoefficientHistory" | "approachCoefficientDefault">, supplierId: string, origin: string, mode: ImportModeCode) {
  const history = await tx.approachCoefficientHistory.findMany({ where: { mode, OR: [{ supplierId }, { origin }] }, orderBy: { closedAt: "desc" }, take: 40 });
  const defaults = await tx.approachCoefficientDefault.findMany({ where: { mode, type: { active: true, vatRecoverableDefault: false } }, select: { pctOfValue: true } });
  return suggestCoefficient(
    history.map((h) => ({ supplierId: h.supplierId, origin: h.origin, mode: h.mode, coefficient: h.coefficient })),
    { supplierId, origin, mode },
    defaultCoefficient(defaults.map((d) => d.pctOfValue)),
  );
}

/** Coefficient d'approche suggéré pour un prochain achat (aussi utilisé par le coût complet, LOT-10). */
export async function getCoefficientSuggestion(user: OrderActor, raw: unknown) {
  assertImportAccess(user, "importFile.view");
  const { supplierId, mode } = parseInput(suggestionSchema, raw);
  const supplier = await db.supplier.findUnique({ where: { id: supplierId }, select: { country: true } });
  if (!supplier) throw new BusinessError("NOT_FOUND", "Fournisseur introuvable.");
  const s = await suggestFor(db, supplierId, supplier.country, mode);
  return { ...s, coefficient: s.coefficient.toString() };
}

/** Historique des coefficients réels (dossiers clôturés), du plus récent au plus ancien. */
export async function listCoefficientHistory(user: OrderActor, raw: unknown = {}) {
  assertImportAccess(user, "importFile.view");
  const supplierId = typeof (raw as { supplierId?: unknown })?.supplierId === "string" ? (raw as { supplierId: string }).supplierId : undefined;
  const rows = await db.approachCoefficientHistory.findMany({
    where: supplierId ? { supplierId } : {},
    orderBy: { closedAt: "desc" },
    take: 200,
    include: { file: { select: { number: true } } },
  });
  return rows.map((h) => ({ fileId: h.fileId, number: h.file.number, supplierId: h.supplierId, origin: h.origin, mode: h.mode, coefficient: h.coefficient.toString(), goodsValueXof: h.goodsValueXof, costsXof: h.costsXof, closedAt: h.closedAt }));
}

export interface CostTypeView {
  id: string;
  code: string;
  label: string;
  defaultKey: string;
  vatRecoverableDefault: boolean;
  sortOrder: number;
  active: boolean;
  /** % de la valeur marchandise par mode de transport. */
  defaults: Record<ImportModeCode, string>;
}

/** Types de frais et coefficients par défaut (paramétrables par le Responsable : `saveCostType`, `setCoefficientDefault`). */
export async function listCostTypes(user: OrderActor): Promise<{ types: CostTypeView[]; defaultCoefficients: Record<ImportModeCode, string> }> {
  assertImportAccess(user, "importFile.view");
  const types = await db.approachCostType.findMany({ orderBy: [{ sortOrder: "asc" }, { label: "asc" }], include: { defaults: true } });
  const views = types.map((t): CostTypeView => ({
    id: t.id,
    code: t.code,
    label: t.label,
    defaultKey: t.defaultKey,
    vatRecoverableDefault: t.vatRecoverableDefault,
    sortOrder: t.sortOrder,
    active: t.active,
    defaults: Object.fromEntries(IMPORT_MODES.map((m) => [m, t.defaults.find((d) => d.mode === m)?.pctOfValue.toString() ?? "0"])) as Record<ImportModeCode, string>,
  }));
  const defaultCoefficients = Object.fromEntries(
    IMPORT_MODES.map((m) => [m, defaultCoefficient(views.filter((t) => t.active && !t.vatRecoverableDefault).map((t) => new Decimal(t.defaults[m]))).toString()]),
  ) as Record<ImportModeCode, string>;
  return { types: views, defaultCoefficients };
}
