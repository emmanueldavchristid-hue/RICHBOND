/**
 * Réceptions fictives (LOT-06), créées par le service de réception (numéros REC/NC, mouvements de stock, PMP, statut du BC
 * et audit, comme en production) :
 * - le BC fictif « reçu » du seed LOT-05 (lot05:11) est réceptionné en totalité (ses quantités reçues posées à la main par
 *   le seed LOT-05 sont remises à zéro, puis recalculées par la réception) ;
 * - le BC des EPI (lot05:06) est livré en partie : 30 gants acceptés, 20 abîmés refusés -> non-conformité ouverte et BC partiellement reçu.
 * Aucune donnée réelle. Idempotent : un BC qui a déjà une réception n'est pas retouché.
 */
import Module from "node:module";
import { formatInTimeZone } from "date-fns-tz";
import type { PrismaClient } from "../../src/generated/prisma/client";

const DAY = 86_400_000;
const day = (offset: number) => formatInTimeZone(new Date(Date.now() + offset * DAY), "Africa/Abidjan", "yyyy-MM-dd");

/** `server-only` interdit l'import hors Next.js ; le seed est un script serveur : on le neutralise pour ce processus. */
function allowServerOnly() {
  const m = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
  const original = m._load;
  m._load = function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return original.call(this, request, ...rest);
  };
}

export async function seedReceipts(prisma: PrismaClient): Promise<void> {
  const magasinier = await prisma.user.findUnique({ where: { email: "magasinier@richbond.test" } });
  if (!magasinier) return;
  const seeded = async (key: string) =>
    prisma.purchaseOrder.findFirst({
      where: { events: { some: { payload: { path: ["seedKey"], equals: key } } } },
      include: { lines: { orderBy: { lineNo: "asc" } }, receipts: { select: { id: true } } },
    });
  const full = await seeded("lot05:11");
  const partial = await seeded("lot05:06");
  const todo = [full, partial].filter((o) => o && o.receipts.length === 0);
  if (todo.length === 0) return;

  allowServerOnly();
  const { createReceipt } = await import("../../src/modules/receiving/service");
  const { db } = await import("../../src/lib/db");
  const actor = { id: magasinier.id, role: magasinier.role, purchaseScope: magasinier.purchaseScope };

  try {
    if (full && full.receipts.length === 0) {
      // Le seed LOT-05 a posé `receivedQty` et le statut « reçu » sans réception : on repart d'un BC confirmé.
      await prisma.purchaseOrderLine.updateMany({ where: { orderId: full.id }, data: { receivedQty: 0 } });
      await prisma.purchaseOrder.update({ where: { id: full.id }, data: { status: "CONFIRME" } });
      await createReceipt(actor, {
        orderId: full.id,
        deliveryNoteRef: "BL-DEMO-0001",
        receivedAt: day(-4),
        carrier: "Transporteur local (démo)",
        comment: "Livraison complète, conforme (données fictives).",
        lines: full.lines.map((l) => ({ orderLineId: l.id, deliveredQty: Number(l.quantity), acceptedQty: Number(l.quantity) })),
      });
    }
    if (partial && partial.receipts.length === 0 && partial.status === "CONFIRME") {
      const line = partial.lines[0];
      await createReceipt(actor, {
        orderId: partial.id,
        deliveryNoteRef: "BL-DEMO-0002",
        receivedAt: day(-1),
        carrier: "Transporteur local (démo)",
        comment: "20 gants abîmés à l'ouverture des cartons (données fictives).",
        lines: [{ orderLineId: line.id, deliveredQty: 50, acceptedQty: 30, refusedQty: 20, refusalReason: "ABIME" }],
      });
    }
  } finally {
    await db.$disconnect();
  }
}
