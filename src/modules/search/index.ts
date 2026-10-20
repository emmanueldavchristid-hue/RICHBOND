import "server-only";
import { db } from "@/lib/db";
import { can } from "@/lib/permissions";
import { now } from "@/lib/clock";
import { buildOrderWhere, displayOrderNumber, listOrdersSchema, type OrderActor } from "@/modules/purchase-orders";
import { buildRequestWhere, displayNumber, listRequestsSchema, parseInput, type RequestViewer } from "@/modules/purchase-requests";
import { globalSearchSchema, MAX_HITS_PER_KIND, type GlobalSearchHit } from "./schemas";

export * from "./schemas";

type Searcher = RequestViewer & OrderActor;

/**
 * Recherche globale (Ctrl+K) : DA et BC par numéro, articles par code ou désignation, fournisseurs par nom ou code.
 * Chaque famille respecte les droits et la visibilité de la liste correspondante (brouillons privés, magasinier restreint…).
 */
export async function globalSearch(user: Searcher, raw: unknown): Promise<GlobalSearchHit[]> {
  const { q } = parseInput(globalSearchSchema, raw);
  const contains = { contains: q, mode: "insensitive" as const };
  const [requests, orders, items, suppliers] = await Promise.all([
    can(user, "purchaseRequest.view")
      ? db.purchaseRequest.findMany({
          where: buildRequestWhere(user, parseInput(listRequestsSchema, { onglet: "toutes", q })),
          select: { id: true, number: true, status: true, reason: true, department: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: MAX_HITS_PER_KIND,
        })
      : [],
    can(user, "purchaseOrder.view")
      ? db.purchaseOrder.findMany({
          where: buildOrderWhere(user, parseInput(listOrdersSchema, { q }), now()),
          select: { id: true, number: true, version: true, status: true, supplier: { select: { name: true } } },
          orderBy: { createdAt: "desc" },
          take: MAX_HITS_PER_KIND,
        })
      : [],
    can(user, "item.view")
      ? db.item.findMany({
          where: { OR: [{ code: contains }, { name: contains }, { barcode: contains }] },
          select: { id: true, code: true, name: true, status: true },
          orderBy: { code: "asc" },
          take: MAX_HITS_PER_KIND,
        })
      : [],
    can(user, "supplier.view")
      ? db.supplier.findMany({
          where: { OR: [{ code: contains }, { name: contains }] },
          select: { id: true, code: true, name: true, status: true },
          orderBy: { name: "asc" },
          take: MAX_HITS_PER_KIND,
        })
      : [],
  ]);
  return [
    ...requests.map((r): GlobalSearchHit => ({ kind: "DA", id: r.id, ref: displayNumber(r), label: `${r.department.name} – ${r.reason}`, status: r.status, href: `/achats/demandes/${r.id}` })),
    ...orders.map((o): GlobalSearchHit => ({ kind: "BC", id: o.id, ref: displayOrderNumber(o), label: o.supplier.name, status: o.status, href: `/achats/commandes/${o.id}` })),
    ...items.map((i): GlobalSearchHit => ({ kind: "ARTICLE", id: i.id, ref: i.code, label: i.name, status: i.status === "ACTIF" ? undefined : i.status, href: `/stock/articles/${i.id}` })),
    ...suppliers.map((s): GlobalSearchHit => ({ kind: "FOURNISSEUR", id: s.id, ref: s.code, label: s.name, status: s.status === "ACTIF" ? undefined : s.status, href: `/fournisseurs/${s.id}` })),
  ];
}
