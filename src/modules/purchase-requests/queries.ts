import "server-only";
import { db } from "@/lib/db";
import { BusinessError } from "@/lib/errors";
import { canViewRequest } from "@/lib/permissions";
import type { Prisma } from "@/generated/prisma/client";
import { EXPORT_MAX_ROWS, toPage, type Page } from "@/modules/referentials/list-query";
import { serialize } from "@/modules/referentials/serialize";
import { getSettings } from "@/modules/settings";
import { buyerCoversType, pickLeastLoaded, type BuyerLoad } from "./assignment";
import { exceedsThreshold } from "./approval-level";
import { displayNumber, type PrKind, type PrStatus, type PrType, type PrUrgency } from "./labels";
import { listRequestsSchema, searchItemsForRequestSchema, type ListRequestsFilters, type ListRequestsInput } from "./schemas";
import { lineTotal } from "./totals";
import { availableActions, type PrAction, type WorkflowUser } from "./workflow";
import { parseInput } from "./parse";

export type RequestViewer = WorkflowUser;

const OPEN_FOR_BUYER: PrStatus[] = ["VALIDEE", "EN_CONSULTATION", "PARTIELLEMENT_COMMANDEE"];

/** Filtre partagé par la liste et l'export : visibilité (H48), onglet, filtres. Les brouillons d'autrui restent privés. */
export function buildRequestWhere(user: RequestViewer, f: ListRequestsFilters): Prisma.PurchaseRequestWhereInput {
  const and: Prisma.PurchaseRequestWhereInput[] = [{ NOT: { status: "BROUILLON", createdById: { not: user.id } } }];
  if (user.role === "MAGASINIER") and.push({ OR: [{ createdById: user.id }, { kind: "REAPPRO" }] });
  if (f.onglet === "a-valider") and.push({ status: "SOUMISE" });
  if (f.onglet === "mes-demandes") and.push({ createdById: user.id });
  if (f.onglet === "assignees") and.push({ assignedBuyerId: user.id });
  if (f.statut) and.push({ status: f.statut });
  if (f.urgence) and.push({ urgency: f.urgence });
  if (f.service) and.push({ departmentId: f.service });
  if (f.acheteur) and.push({ assignedBuyerId: f.acheteur });
  if (f.type) and.push({ type: f.type });
  if (f.q) {
    and.push({
      OR: [
        { number: { contains: f.q, mode: "insensitive" } },
        { reason: { contains: f.q, mode: "insensitive" } },
        { requesterName: { contains: f.q, mode: "insensitive" } },
        {
          lines: {
            some: {
              OR: [
                { freeDesignation: { contains: f.q, mode: "insensitive" } },
                { item: { code: { contains: f.q, mode: "insensitive" } } },
                { item: { name: { contains: f.q, mode: "insensitive" } } },
              ],
            },
          },
        },
      ],
    });
  }
  return { AND: and };
}

/** D5 : l'arrêt de production reste en tête de toutes les listes, quel que soit le tri choisi ensuite. */
export function buildRequestOrder(f: Pick<ListRequestsFilters, "tri" | "ordre" | "onglet">): Prisma.PurchaseRequestOrderByWithRelationInput[] {
  // `priority` vaut 2 pour les DA closes (REFUSEE, ANNULEE, COMMANDEE) : l'arrêt de production ne concerne que les DA ouvertes.
  const order: Prisma.PurchaseRequestOrderByWithRelationInput[] = [{ priority: "asc" }];
  if (f.tri) order.push({ [f.tri]: f.ordre });
  if (f.onglet === "a-valider") {
    order.push({ neededBy: "asc" }, { submittedAt: { sort: "asc", nulls: "last" } }, { id: "asc" });
  } else {
    // Hors « À valider » : les plus récentes d'abord (les brouillons non soumis suivent leur date de création).
    order.push({ createdAt: "desc" }, { id: "asc" });
  }
  return order;
}

export interface RequestRow {
  id: string;
  number: string | null;
  displayNumber: string;
  status: PrStatus;
  kind: PrKind;
  urgency: PrUrgency;
  priority: number;
  type: PrType;
  department: { id: string; code: string; name: string };
  requesterName: string;
  reason: string;
  neededBy: Date;
  /** Null si l'utilisateur ne voit pas les prix (Magasinier). */
  estimatedTotal: number | null;
  createdBy: { id: string; name: string };
  assignedBuyer: { id: string; name: string } | null;
  submittedAt: Date | null;
  lineCount: number;
  updatedAt: Date;
}

export async function listRequests(
  user: RequestViewer,
  raw: ListRequestsInput = {},
  opts: { showPrices: boolean },
): Promise<Page<RequestRow> & { toValidate: number }> {
  const f = parseInput(listRequestsSchema, raw);
  const where = buildRequestWhere(user, f);
  const [rows, total, toValidate] = await Promise.all([
    db.purchaseRequest.findMany({
      where,
      orderBy: buildRequestOrder(f),
      skip: (f.page - 1) * f.taille,
      take: f.taille,
      include: {
        department: { select: { id: true, code: true, name: true } },
        createdBy: { select: { id: true, name: true } },
        assignedBuyer: { select: { id: true, name: true } },
        _count: { select: { lines: true } },
      },
    }),
    db.purchaseRequest.count({ where }),
    db.purchaseRequest.count({ where: buildRequestWhere(user, parseInput(listRequestsSchema, { onglet: "a-valider" })) }),
  ]);
  const mapped: RequestRow[] = rows.map((r) => ({
    id: r.id,
    number: r.number,
    displayNumber: displayNumber(r),
    status: r.status,
    kind: r.kind,
    urgency: r.urgency,
    priority: r.priority,
    type: r.type,
    department: r.department,
    requesterName: r.requesterName,
    reason: r.reason,
    neededBy: r.neededBy,
    estimatedTotal: opts.showPrices ? r.estimatedTotal : null,
    createdBy: r.createdBy,
    assignedBuyer: r.assignedBuyer,
    submittedAt: r.submittedAt,
    lineCount: r._count.lines,
    updatedAt: r.updatedAt,
  }));
  return { ...toPage(mapped, total, f), toValidate };
}

/** Export : une ligne par ligne de DA ; mêmes filtres que la liste ; prix exclus si `showPrices` est faux. */
export async function exportRequests(user: RequestViewer, raw: ListRequestsInput = {}, opts: { showPrices: boolean }) {
  const f = parseInput(listRequestsSchema, raw);
  const where = buildRequestWhere(user, f);
  // Plafond sur le nombre de lignes exportées (une ligne Excel par ligne de DA).
  const total = await db.purchaseRequestLine.count({ where: { request: where } });
  if (total > EXPORT_MAX_ROWS) {
    throw new BusinessError("EXPORT_TOO_LARGE", `Trop de lignes (${total}) : affinez les filtres (maximum ${EXPORT_MAX_ROWS}).`);
  }
  const prs = await db.purchaseRequest.findMany({
    where,
    orderBy: buildRequestOrder(f),
    include: {
      department: { select: { name: true } },
      createdBy: { select: { name: true } },
      assignedBuyer: { select: { name: true } },
      lines: { orderBy: { lineNo: "asc" }, include: { item: { select: { code: true, name: true } } } },
    },
  });
  const rows = prs.flatMap((pr) =>
    (pr.lines.length ? pr.lines : [null]).map((l) => ({
      number: displayNumber(pr),
      status: pr.status,
      kind: pr.kind,
      urgency: pr.urgency,
      type: pr.type,
      department: pr.department.name,
      requesterName: pr.requesterName,
      reason: pr.reason,
      neededBy: pr.neededBy,
      createdBy: pr.createdBy.name,
      assignedBuyer: pr.assignedBuyer?.name ?? null,
      lineNo: l?.lineNo ?? null,
      itemCode: l?.item?.code ?? null,
      designation: l ? (l.item?.name ?? l.freeDesignation) : null,
      quantity: l ? Number(l.quantity) : null,
      approvedQty: l?.approvedQty != null ? Number(l.approvedQty) : null,
      unit: l?.unit ?? null,
      unitPrice: opts.showPrices ? (l?.estimatedUnitPrice ?? null) : null,
      lineTotal: opts.showPrices && l ? lineTotal(l.approvedQty ?? l.quantity, l.estimatedUnitPrice) : null,
      estimatedTotal: opts.showPrices ? pr.estimatedTotal : null,
    })),
  );
  return rows;
}

export async function getRequest(user: RequestViewer, id: string, opts: { showPrices: boolean }) {
  const pr = await db.purchaseRequest.findUnique({
    where: { id },
    include: {
      department: { select: { id: true, code: true, name: true } },
      createdBy: { select: { id: true, name: true } },
      approvedBy: { select: { id: true, name: true } },
      assignedBuyer: { select: { id: true, name: true } },
      lines: { orderBy: { lineNo: "asc" }, include: { item: { select: { id: true, code: true, name: true, purchaseUnit: true, stockUnit: true, conversionFactor: true } } } },
      events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }], include: { user: { select: { id: true, name: true } } } },
      attachments: { where: { removedAt: null }, orderBy: { createdAt: "asc" }, include: {} },
    },
  });
  if (!pr) throw new BusinessError("NOT_FOUND", "Demande d'achat introuvable.");
  if (!canViewRequest(user, pr)) throw new BusinessError("FORBIDDEN", "Vous n'avez pas accès à cette demande d'achat.");
  const threshold = (await getSettings()).purchaseRequestApprovalThreshold;
  const actions: PrAction[] = availableActions(pr, user);
  const { lines, events, attachments, ...head } = pr;
  return serialize({
    ...head,
    estimatedTotal: opts.showPrices ? pr.estimatedTotal : null,
    displayNumber: displayNumber(pr),
    lines: lines.map((l) => ({
      ...l,
      estimatedUnitPrice: opts.showPrices ? l.estimatedUnitPrice : null,
      lineTotal: opts.showPrices ? lineTotal(l.approvedQty ?? l.quantity, l.estimatedUnitPrice) : null,
    })),
    events,
    attachments: attachments.map((a) => ({
      id: a.id,
      fileName: a.fileName,
      mimeType: a.mimeType,
      size: a.size,
      createdAt: a.createdAt,
    })),
    actions,
    approvalThreshold: opts.showPrices ? threshold : 0,
    exceedsThreshold: opts.showPrices && exceedsThreshold(pr.estimatedTotal, threshold),
  });
}

export type RequestDetail = Awaited<ReturnType<typeof getRequest>>;

/** Bandeau rouge du Responsable : arrêts de production en attente de décision. */
export async function listCriticalPending() {
  const rows = await db.purchaseRequest.findMany({
    where: { status: "SOUMISE", urgency: "ARRET_PRODUCTION" },
    orderBy: [{ neededBy: "asc" }, { submittedAt: "asc" }],
    take: 10,
    select: { id: true, number: true, reason: true, department: { select: { name: true } } },
  });
  return rows.map((r) => ({ id: r.id, number: r.number, reason: r.reason, department: r.department.name }));
}

/** Acheteurs pouvant traiter ce type de DA, du moins chargé au plus chargé (le premier est proposé). */
export async function listAssignableBuyers(type: "LOCAL" | "IMPORT") {
  const buyers = await db.user.findMany({
    where: { role: "ACHETEUR", active: true, purchaseScope: { in: ["LOCAL", "IMPORT", "ALL"] } },
    select: { id: true, name: true, purchaseScope: true },
  });
  const eligible = buyers.filter((b) => buyerCoversType(b.purchaseScope, type));
  const counts = await db.purchaseRequest.groupBy({
    by: ["assignedBuyerId"],
    where: { assignedBuyerId: { in: eligible.map((b) => b.id) }, status: { in: OPEN_FOR_BUYER } },
    _count: { _all: true },
  });
  const byId = new Map(counts.map((c) => [c.assignedBuyerId, c._count._all]));
  const loads: (BuyerLoad & { purchaseScope: string | null })[] = eligible.map((b) => ({
    id: b.id,
    name: b.name,
    purchaseScope: b.purchaseScope,
    openCount: byId.get(b.id) ?? 0,
  }));
  const proposed = pickLeastLoaded(loads);
  return {
    proposedId: proposed?.id ?? null,
    buyers: loads.sort((a, b) => a.openCount - b.openCount || a.name.localeCompare(b.name, "fr")),
  };
}

/** Recherche d'articles pour une ligne de DA : code ou désignation, articles actifs (stockés seulement pour le Magasinier). */
export async function searchItemsForRequest(user: RequestViewer, raw: unknown) {
  const { q, limit } = parseInput(searchItemsForRequestSchema, raw);
  const rows = await db.item.findMany({
    where: {
      status: "ACTIF",
      ...(user.role === "MAGASINIER" ? { stocked: true } : {}),
      ...(q ? { OR: [{ code: { contains: q, mode: "insensitive" } }, { name: { contains: q, mode: "insensitive" } }] } : {}),
    },
    orderBy: { code: "asc" },
    take: limit,
    select: { id: true, code: true, name: true, category: true, stockUnit: true, purchaseUnit: true, conversionFactor: true, stocked: true },
  });
  return serialize(rows);
}

export interface HomeRequestSummary {
  /** DA soumises en attente de validation (Responsable). */
  toValidate: number;
  /** Dont arrêts de production (DA ouvertes, priorité 0). */
  stops: number;
  /** DA validées assignées à l'utilisateur et encore à traiter (Acheteur). */
  assignedToMe: number;
}

/** I1 : pastilles de l'accueil. Les compteurs non pertinents pour le rôle valent 0. */
export async function homeRequestSummary(user: RequestViewer): Promise<HomeRequestSummary> {
  if (user.role === "RESPONSABLE_ACHATS") {
    const base = buildRequestWhere(user, parseInput(listRequestsSchema, { onglet: "a-valider" }));
    const [toValidate, stops] = await Promise.all([
      db.purchaseRequest.count({ where: base }),
      db.purchaseRequest.count({ where: { AND: [base, { priority: 0 }] } }),
    ]);
    return { toValidate, stops, assignedToMe: 0 };
  }
  if (user.role === "ACHETEUR") {
    const assignedToMe = await db.purchaseRequest.count({ where: { assignedBuyerId: user.id, status: { in: OPEN_FOR_BUYER } } });
    return { toValidate: 0, stops: 0, assignedToMe };
  }
  return { toValidate: 0, stops: 0, assignedToMe: 0 };
}
