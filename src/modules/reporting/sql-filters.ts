import { Prisma } from "@/generated/prisma/client";

/**
 * Filtres des rapports (LOT-15) traduits en fragments SQL paramétrés. Aucune valeur n'est concaténée : les valeurs passent
 * par des paramètres ; seuls les alias de tables (constantes écrites dans le code) sont insérés tels quels.
 * Un filtre absent donne `TRUE` : les requêtes du tableau de bord (sans filtre) restent inchangées.
 */
export interface QueryFilter {
  /** Périmètre imposé à un Acheteur (LOCAL ou IMPORT) ; null/absent = pas de limite de type. */
  scope?: "LOCAL" | "IMPORT" | null;
  /** Code `ItemCategory`. */
  category?: string;
  /** Utilisateur qui a créé le BC (acheteur). */
  buyerId?: string;
  supplierId?: string;
  warehouseId?: string;
}

const raw = (s: string) => Prisma.raw(s);
const and = (parts: Prisma.Sql[]): Prisma.Sql => (parts.length === 0 ? Prisma.sql`TRUE` : Prisma.join(parts, " AND "));

/** BC (alias `po` par défaut) : périmètre, acheteur, fournisseur, dépôt de livraison, catégorie d'au moins une ligne. */
export function poWhere(f: QueryFilter | undefined, a = "po"): Prisma.Sql {
  if (!f) return Prisma.sql`TRUE`;
  const p: Prisma.Sql[] = [];
  if (f.scope) p.push(Prisma.sql`${raw(a)}.type::text = ${f.scope}`);
  if (f.buyerId) p.push(Prisma.sql`${raw(a)}.created_by_id = ${f.buyerId}`);
  if (f.supplierId) p.push(Prisma.sql`${raw(a)}.supplier_id = ${f.supplierId}`);
  if (f.warehouseId) p.push(Prisma.sql`${raw(a)}.warehouse_id = ${f.warehouseId}`);
  if (f.category)
    p.push(
      Prisma.sql`EXISTS (SELECT 1 FROM purchase_order_lines cl JOIN items ci ON ci.id = cl.item_id WHERE cl.order_id = ${raw(a)}.id AND ci.category::text = ${f.category})`,
    );
  return and(p);
}

/** Réception (alias `r`) : fournisseur, dépôt, et filtres du BC d'origine (périmètre, acheteur, catégorie). */
export function receiptWhere(f: QueryFilter | undefined, a = "r"): Prisma.Sql {
  if (!f) return Prisma.sql`TRUE`;
  const p: Prisma.Sql[] = [];
  if (f.supplierId) p.push(Prisma.sql`${raw(a)}.supplier_id = ${f.supplierId}`);
  if (f.warehouseId) p.push(Prisma.sql`${raw(a)}.warehouse_id = ${f.warehouseId}`);
  if (f.scope || f.buyerId || f.category) {
    const inner = poWhere({ scope: f.scope, buyerId: f.buyerId, category: f.category }, "rpo");
    p.push(Prisma.sql`EXISTS (SELECT 1 FROM purchase_orders rpo WHERE rpo.id = ${raw(a)}.order_id AND ${inner})`);
  }
  return and(p);
}

/** Mouvements de stock (alias `m`) joints à l'article (alias `i`) : dépôt et catégorie. */
export function movementWhere(f: QueryFilter | undefined, m = "m", i = "i"): Prisma.Sql {
  if (!f) return Prisma.sql`TRUE`;
  const p: Prisma.Sql[] = [];
  if (f.warehouseId) p.push(Prisma.sql`${raw(m)}.warehouse_id = ${f.warehouseId}`);
  if (f.category) p.push(Prisma.sql`${raw(i)}.category::text = ${f.category}`);
  return and(p);
}

/** Niveaux de stock (alias `sl`) joints à l'article (alias `i`) : dépôt et catégorie. */
export function levelWhere(f: QueryFilter | undefined): Prisma.Sql {
  return movementWhere(f, "sl", "i");
}

/** DA (alias `pr`) : acheteur assigné, catégorie d'une ligne, périmètre (une DA « à définir » reste visible). */
export function prWhere(f: QueryFilter | undefined, a = "pr"): Prisma.Sql {
  if (!f) return Prisma.sql`TRUE`;
  const p: Prisma.Sql[] = [];
  if (f.scope) p.push(Prisma.sql`${raw(a)}.type::text IN (${f.scope}, 'A_DEFINIR')`);
  if (f.buyerId) p.push(Prisma.sql`${raw(a)}.assigned_buyer_id = ${f.buyerId}`);
  if (f.category)
    p.push(
      Prisma.sql`EXISTS (SELECT 1 FROM purchase_request_lines cl JOIN items ci ON ci.id = cl.item_id WHERE cl.request_id = ${raw(a)}.id AND ci.category::text = ${f.category})`,
    );
  return and(p);
}

/** Factures (alias `si`) : fournisseur, créateur, périmètre du BC rapproché. */
export function invoiceWhere(f: QueryFilter | undefined, a = "si"): Prisma.Sql {
  if (!f) return Prisma.sql`TRUE`;
  const p: Prisma.Sql[] = [];
  if (f.supplierId) p.push(Prisma.sql`${raw(a)}.supplier_id = ${f.supplierId}`);
  if (f.buyerId) p.push(Prisma.sql`${raw(a)}.created_by_id = ${f.buyerId}`);
  if (f.scope)
    p.push(
      Prisma.sql`EXISTS (SELECT 1 FROM supplier_invoice_lines il JOIN purchase_order_lines ol ON ol.id = il.order_line_id JOIN purchase_orders ipo ON ipo.id = ol.order_id WHERE il.invoice_id = ${raw(a)}.id AND ipo.type::text = ${f.scope})`,
    );
  return and(p);
}
