import type { Prisma } from "@/generated/prisma/client";
import { BusinessError } from "@/lib/errors";
import { buyerCoversType } from "@/modules/purchase-requests/assignment";
import type { OrderActor } from "@/modules/purchase-orders/internal";

/**
 * Périmètre de l'Acheteur (local / import / les deux) appliqué aux factures : une facture est visible et modifiable
 * si tous les bons de commande qu'elle vise sont dans son périmètre. Le Responsable (et le Super admin) voient tout.
 */
const isRestricted = (user: OrderActor) => user.role === "ACHETEUR";

export const OUT_OF_SCOPE_MESSAGE =
  "Cette facture concerne un type d'achat (local ou import) hors de votre périmètre.";

export function invoiceScopeWhere(user: OrderActor | null | undefined): Prisma.SupplierInvoiceWhereInput {
  if (!user || !isRestricted(user)) return {};
  const scope = user.purchaseScope;
  if (scope === "ALL") return {};
  if (scope !== "LOCAL" && scope !== "IMPORT") return { id: { in: [] } };
  return { lines: { none: { orderLine: { order: { type: { not: scope } } } } } };
}

export function orderScopeWhere(user: OrderActor): Prisma.PurchaseOrderWhereInput {
  if (!isRestricted(user)) return {};
  const scope = user.purchaseScope;
  if (scope === "ALL") return {};
  if (scope !== "LOCAL" && scope !== "IMPORT") return { id: { in: [] } };
  return { type: scope };
}

export function assertCoversTypes(user: OrderActor, types: Iterable<"LOCAL" | "IMPORT">): void {
  if (!isRestricted(user)) return;
  for (const t of types) {
    if (!buyerCoversType(user.purchaseScope, t)) throw new BusinessError("FORBIDDEN", OUT_OF_SCOPE_MESSAGE);
  }
}

interface InvoiceReader {
  supplierInvoiceLine: {
    findMany(args: {
      where: { invoiceId: string };
      select: { orderLine: { select: { order: { select: { type: true } } } } };
    }): Promise<{ orderLine: { order: { type: "LOCAL" | "IMPORT" } } }[]>;
  };
}

/** Refuse (FORBIDDEN) l'accès à une facture dont un BC est hors du périmètre de l'utilisateur. */
export async function assertInvoiceInScope(
  client: unknown,
  user: OrderActor,
  invoiceId: string,
): Promise<void> {
  if (!isRestricted(user) || user.purchaseScope === "ALL") return;
  const lines = await (client as InvoiceReader).supplierInvoiceLine.findMany({
    where: { invoiceId },
    select: { orderLine: { select: { order: { select: { type: true } } } } },
  });
  assertCoversTypes(
    user,
    lines.map((l) => l.orderLine.order.type),
  );
}
