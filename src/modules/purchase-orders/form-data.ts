import "server-only";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { can, requireAction } from "@/lib/permissions";
import { listCurrencies } from "@/modules/currencies";
import { serialize } from "@/modules/referentials/serialize";
import { listWarehouses } from "@/modules/warehouses";
import type { OrderActor } from "./internal";

/** Options des filtres de la liste des BC : fournisseurs et acheteurs qui figurent réellement sur des bons. */
export async function orderListOptions(user: OrderActor) {
  requireAction(user, "purchaseOrder.view");
  const [suppliers, buyers, currencies] = await Promise.all([
    db.supplier.findMany({ where: { purchaseOrders: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, code: true, name: true } }),
    db.user.findMany({ where: { purchaseOrdersCreated: { some: {} } }, orderBy: { name: "asc" }, select: { id: true, name: true } }),
    db.purchaseOrder.findMany({ distinct: ["currencyCode"], select: { currencyCode: true }, orderBy: { currencyCode: "asc" } }),
  ]);
  return { suppliers, buyers, currencies: currencies.map((c) => c.currencyCode) };
}

export interface SupplierChoice {
  id: string;
  code: string;
  name: string;
  type: "LOCAL" | "IMPORT";
  status: "ACTIF" | "EN_EVALUATION" | "BLOQUE";
  currencyCode: string;
  paymentTerm: string;
  paymentTermNote: string | null;
  incoterm: string | null;
  /** Le périmètre de l'utilisateur permet de commander à ce fournisseur. */
  allowed: boolean;
}

/**
 * Listes de choix du formulaire de BC : fournisseurs (bloqués exclus, hors périmètre grisés), dépôts actifs avec adresse,
 * devises actives avec dernier taux indicatif, et TVA par défaut.
 */
export async function orderFormOptions(user: OrderActor) {
  requireAction(user, "purchaseOrder.create");
  const [suppliers, warehouses, currencies] = await Promise.all([
    db.supplier.findMany({
      where: { status: { not: "BLOQUE" } },
      orderBy: { name: "asc" },
      select: { id: true, code: true, name: true, type: true, status: true, currencyCode: true, paymentTerm: true, paymentTermNote: true, incoterm: true },
    }),
    listWarehouses({ activeOnly: true }),
    listCurrencies({ activeOnly: true, at: now() }),
  ]);
  return serialize({
    suppliers: suppliers.map<SupplierChoice>((s) => ({ ...s, allowed: can(user, "purchaseOrder.create", { scope: s.type }) })),
    warehouses: warehouses.map((w) => ({ id: w.id, code: w.code, name: w.name, address: w.address })),
    currencies: currencies.map((c) => ({
      code: c.code,
      name: c.name,
      symbol: c.symbol,
      decimals: c.decimals,
      rate: c.isBase ? null : (c.latestRate?.rate ?? null),
      rateDate: c.latestRate?.date ?? null,
      stale: c.latestRate?.stale ?? false,
    })),
  });
}
