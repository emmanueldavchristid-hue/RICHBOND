/**
 * Factures fournisseurs fictives (LOT-13), saisies par le service (numéros FAC, rapprochement, quantités facturées, audit) :
 * - BC « reçu » du seed (lot05:11) : facture conforme, toutes lignes, au prix du BC ;
 * - BC des EPI (lot05:06, 30 gants acceptés) : facture avec prix majoré de 5 % (écart de prix, 20 unités), puis facture de
 *   20 unités au prix du BC qui dépasse le facturable restant (écart de quantité).
 * Aucune donnée réelle. Idempotent : rien n'est créé si une facture existe déjà.
 */
import Module from "node:module";
import { formatInTimeZone } from "date-fns-tz";
import type { PrismaClient } from "../../src/generated/prisma/client";

const DAY = 86_400_000;
const day = (offset: number) => formatInTimeZone(new Date(Date.now() + offset * DAY), "Africa/Abidjan", "yyyy-MM-dd");

function allowServerOnly() {
  const m = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
  const original = m._load;
  m._load = function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return original.call(this, request, ...rest);
  };
}

export async function seedInvoices(prisma: PrismaClient): Promise<void> {
  if ((await prisma.supplierInvoice.count()) > 0) return;
  const buyer = await prisma.user.findUnique({ where: { email: "acheteur.local@richbond.test" } });
  if (!buyer) return;
  const seeded = async (key: string) =>
    prisma.purchaseOrder.findFirst({
      where: { events: { some: { payload: { path: ["seedKey"], equals: key } } } },
      include: { lines: { orderBy: { lineNo: "asc" } } },
    });
  const full = await seeded("lot05:11");
  const partial = await seeded("lot05:06");

  allowServerOnly();
  const { createInvoice } = await import("../../src/modules/invoices/service");
  const { db } = await import("../../src/lib/db");
  const actor = { id: buyer.id, role: buyer.role, purchaseScope: buyer.purchaseScope };
  try {
    if (full && full.status === "RECU" && full.lines.every((l) => l.receivedQty.gt(0))) {
      await createInvoice(actor, {
        supplierId: full.supplierId,
        supplierInvoiceNo: "FA-DEMO-0001",
        invoiceDate: day(-3),
        notes: "Facture fictive conforme (démo).",
        lines: full.lines.map((l) => ({ orderLineId: l.id, quantity: Number(l.receivedQty), unitPrice: Number(l.unitPrice), discountPct: Number(l.discountPct) })),
      });
    }
    const line = partial?.lines[0];
    if (partial && line && partial.status === "PARTIELLEMENT_RECU" && line.receivedQty.gte(30)) {
      await createInvoice(actor, {
        supplierId: partial.supplierId,
        supplierInvoiceNo: "FA-DEMO-0002",
        invoiceDate: day(-1),
        notes: "Facture fictive : prix majoré de 5 % (démo).",
        lines: [{ orderLineId: line.id, quantity: 20, unitPrice: Math.round(Number(line.unitPrice) * 1.05), discountPct: Number(line.discountPct) }],
      });
      await createInvoice(actor, {
        supplierId: partial.supplierId,
        supplierInvoiceNo: "FA-DEMO-0003",
        invoiceDate: day(0),
        notes: "Facture fictive : quantité supérieure au reçu (démo).",
        lines: [{ orderLineId: line.id, quantity: 20, unitPrice: Number(line.unitPrice), discountPct: Number(line.discountPct) }],
      });
    }
  } finally {
    await db.$disconnect();
  }
}
