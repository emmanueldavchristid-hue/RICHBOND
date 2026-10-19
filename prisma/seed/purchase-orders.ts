/**
 * Bons de commande fictifs (LOT-05) dans tous les statuts utiles à la démonstration, rattachés aux DA validées du seed.
 * Aucune donnée réelle. Idempotent : chaque BC porte une clé technique (`seedKey`, dans le payload du premier événement,
 * invisible dans l'interface) ; un BC déjà présent n'est pas recréé et ne consomme donc aucun numéro. Les numéros
 * BC-AAAA-NNNNN viennent du compteur, dans l'ordre de validation. Les statuts des DA rattachées sont rendus cohérents.
 */
import { formatInTimeZone } from "date-fns-tz";
import type { Prisma } from "../../src/generated/prisma/client";
import type { PrismaClient, PurchaseOrderEventType, PurchaseOrderStatus } from "../../src/generated/prisma/client";
import { FULL_INCLUDE } from "../../src/modules/purchase-orders/include";
import { buildSnapshot } from "../../src/modules/purchase-orders/snapshot";
import { computeTotals } from "../../src/modules/purchase-orders/totals";
import { checkPrice } from "../../src/modules/purchase-orders/price-check";
import { formatDocumentNumber } from "../../src/modules/numbering/format";
import { nextNumberWith } from "../../src/modules/numbering/next";

const TZ = "Africa/Abidjan";
const DAY = 86_400_000;

const dayAt = (offsetDays: number): Date => new Date(`${formatInTimeZone(new Date(Date.now() + offsetDays * DAY), TZ, "yyyy-MM-dd")}T00:00:00.000Z`);
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY + hours * 3_600_000);

const RESP = "responsable@richbond.test";
const LOCAL = "acheteur.local@richbond.test";
const IMPORT = "acheteur.import@richbond.test";

interface LineSeed {
  item: string; // nom d'article du seed
  qty: number; // unité d'achat
  discount?: number;
  /** Prix unitaire ; défaut = prix du lien article-fournisseur du seed. */
  price?: number;
  /** Dernier prix connu de l'article (référence du contrôle de prix) ; défaut = le prix de la ligne. */
  refPrice?: number;
  alloc?: { da: string; line: number; qty: number }; // DA identifiée par son motif, ligne 1-based
  received?: number;
}

type Step = "SUBMITTED" | "APPROVED" | "SENT" | "CONFIRMED" | "CANCELLED" | "RECEIVED" | "AMENDED";

interface PoSeed {
  key: string;
  supplier: number; // numéro de fournisseur du seed (FRS-000NN)
  creator: string;
  status: PurchaseOrderStatus;
  direct?: string; // motif de commande directe
  warehouse?: string;
  incoterm?: string;
  incotermPlace?: string;
  lines: LineSeed[];
  charges?: { label: string; amount: number }[];
  requestedIn: number; // jours depuis aujourd'hui (négatif = passé)
  promisedIn?: number;
  /** Jours écoulés depuis la création ; les étapes s'étalent ensuite. */
  createdDaysAgo: number;
  sentDaysAgo?: number;
  steps: Step[];
  /** Avenant : quantités de la ligne 1 en version 2. */
  amendedQty?: number;
  cancelReason?: string;
  notes?: string;
}

const DA1 = "[démo] Roulements et joints pour la presse hydraulique";
const DA2 = "[démo] Tissu matelassé pour la commande export";

const POS: PoSeed[] = [
  {
    key: "lot05:01", supplier: 4, creator: LOCAL, status: "BROUILLON", warehouse: "MAG-PDR", requestedIn: 14, createdDaysAgo: 1, steps: [],
    lines: [{ item: "Roulement 6205", qty: 2, alloc: { da: DA1, line: 1, qty: 2 } }],
  },
  {
    key: "lot05:02", supplier: 10, creator: LOCAL, status: "A_VALIDER", warehouse: "MAG-PDR", requestedIn: 12, createdDaysAgo: 4, steps: ["SUBMITTED"],
    notes: "Prix de la dernière consultation : à confirmer avec le fournisseur.",
    lines: [{ item: "Joint hydraulique 63 mm", qty: 4, price: 8450, refPrice: 6500, alloc: { da: DA1, line: 2, qty: 4 } }],
  },
  {
    key: "lot05:03", supplier: 4, creator: LOCAL, status: "VALIDE", warehouse: "MAG-PDR", requestedIn: 10, createdDaysAgo: 3, steps: ["SUBMITTED", "APPROVED"],
    lines: [{ item: "Roulement 6205", qty: 3, alloc: { da: DA1, line: 1, qty: 3 } }],
  },
  {
    key: "lot05:04", supplier: 18, creator: IMPORT, status: "VALIDE", warehouse: "MAG-CENTRAL", incoterm: "FOB", incotermPlace: "Shanghai", requestedIn: 60, createdDaysAgo: 2, steps: ["SUBMITTED", "APPROVED"],
    charges: [{ label: "Frais de transit et d'approche estimés", amount: 450 }],
    lines: [{ item: "Tissu jacquard damassé", qty: 6, alloc: { da: DA2, line: 1, qty: 6 } }],
  },
  {
    key: "lot05:05", supplier: 6, creator: RESP, status: "ENVOYE", direct: "Fournitures du trimestre : commande directe sans demande d'achat (démo).", warehouse: "MAG-CENTRAL", requestedIn: 3, createdDaysAgo: 9, sentDaysAgo: 7, steps: ["SUBMITTED", "APPROVED", "SENT"],
    lines: [{ item: "Rame papier A4", qty: 20 }],
  },
  {
    key: "lot05:06", supplier: 7, creator: RESP, status: "CONFIRME", direct: "Renouvellement des EPI : commande directe sans demande d'achat (démo).", warehouse: "MAG-CENTRAL", requestedIn: -12, promisedIn: -4, createdDaysAgo: 24, sentDaysAgo: 22, steps: ["SUBMITTED", "APPROVED", "SENT", "CONFIRMED"],
    lines: [{ item: "Gants de manutention", qty: 50, discount: 5 }],
  },
  {
    key: "lot05:07", supplier: 1, creator: RESP, status: "CONFIRME", direct: "Réapprovisionnement colle : commande directe sans demande d'achat (démo).", warehouse: "MAG-CENTRAL", requestedIn: 4, promisedIn: 6, createdDaysAgo: 6, sentDaysAgo: 5, steps: ["SUBMITTED", "APPROVED", "SENT", "CONFIRMED"],
    lines: [{ item: "Colle de contrecollage", qty: 2 }],
  },
  {
    key: "lot05:08", supplier: 23, creator: RESP, status: "VALIDE", direct: "Achat opportuniste de polyol : commande directe sans demande d'achat (démo).", warehouse: "MAG-CENTRAL", incoterm: "FOB", incotermPlace: "Shanghai", requestedIn: 70, createdDaysAgo: 1, steps: ["SUBMITTED", "APPROVED"],
    lines: [{ item: "Polyol polyéther PO-3000", qty: 20 }],
  },
  {
    key: "lot05:09", supplier: 5, creator: RESP, status: "VALIDE", direct: "Contacteurs pour l'armoire de la fermeuse : commande directe (démo).", warehouse: "MAG-PDR", requestedIn: 8, createdDaysAgo: 10, steps: ["SUBMITTED", "APPROVED", "AMENDED"], amendedQty: 12,
    lines: [{ item: "Contacteur 25 A", qty: 10 }],
  },
  {
    key: "lot05:10", supplier: 3, creator: RESP, status: "ANNULE", direct: "Ouate pour le lot export : commande directe sans demande d'achat (démo).", warehouse: "MAG-CENTRAL", requestedIn: 15, createdDaysAgo: 14, steps: ["SUBMITTED", "APPROVED", "CANCELLED"], cancelReason: "Commande export reportée par le client (démo).",
    lines: [{ item: "Ouate polyester 250 g/m²", qty: 10 }],
  },
  {
    key: "lot05:11", supplier: 2, creator: RESP, status: "RECU", direct: "Film étirable pour l'expédition : commande directe (démo).", warehouse: "MAG-CENTRAL", requestedIn: -5, promisedIn: -6, createdDaysAgo: 30, sentDaysAgo: 28, steps: ["SUBMITTED", "APPROVED", "SENT", "CONFIRMED", "RECEIVED"],
    lines: [{ item: "Film étirable", qty: 5, received: 5 }],
  },
];

const EVENT_AUDIT: Partial<Record<PurchaseOrderEventType, string>> = {
  CREATED: "PO_CREATE",
  SUBMITTED: "PO_SUBMIT",
  APPROVED: "PO_APPROVE",
  SENT: "PO_SEND",
  CONFIRMED: "PO_CONFIRM",
  CANCELLED: "PO_CANCEL",
  AMENDMENT_STARTED: "PO_AMEND_START",
  STATUS_SYNC: "PO_STATUS_SYNC",
};

const COMPANY_SETTINGS: Record<string, string> = {
  "company.name": "RICHBOND CI (données fictives)",
  "company.address": "Zone industrielle de Yopougon, 01 BP 0000 Abidjan 01 (adresse fictive)",
  "company.phone": "+225 27 00 00 00 00",
  "company.email": "achats@richbond.exemple.test",
  "company.legalIds": "NCC 0000000A – RCCM CI-ABJ-0000-B-00000 (fictifs)",
  "purchaseOrder.pdfFooter": "RICHBOND CI – Service Achats – document généré par l'application Achats et Stocks",
  "purchaseOrder.pdfConditions": "Paiement selon les conditions indiquées. Livraison franco magasin. Toute livraison doit être accompagnée d'un bon de livraison mentionnant le numéro du bon de commande.",
};

const WAREHOUSE_ADDRESSES: Record<string, string> = {
  "MAG-CENTRAL": "Magasin central – Zone industrielle de Yopougon, Abidjan (adresse fictive)",
  "MAG-PDR": "Magasin pièces de rechange – Zone industrielle de Yopougon, Abidjan (adresse fictive)",
};

export async function seedPurchaseOrders(prisma: PrismaClient): Promise<void> {
  // Paramètres société et adresses de dépôt : valeurs fictives, jamais écrasées si déjà saisies.
  await prisma.setting.createMany({ data: Object.entries(COMPANY_SETTINGS).map(([key, value]) => ({ key, value })), skipDuplicates: true });
  for (const [code, address] of Object.entries(WAREHOUSE_ADDRESSES)) {
    await prisma.warehouse.updateMany({ where: { code, address: null }, data: { address } });
  }

  const users = new Map((await prisma.user.findMany({ select: { id: true, email: true, name: true } })).map((u) => [u.email, u]));
  const uid = (email: string) => {
    const u = users.get(email);
    if (!u) throw new Error(`Seed BC : utilisateur introuvable (${email}).`);
    return u;
  };
  if (!users.has(RESP)) return;
  const suppliers = new Map((await prisma.supplier.findMany()).map((s) => [s.code, s]));
  const items = new Map((await prisma.item.findMany()).map((i) => [i.name, i]));
  const warehouses = new Map((await prisma.warehouse.findMany()).map((w) => [w.code, w]));
  if (items.size === 0 || suppliers.size === 0) return; // référentiels absents : rien à créer
  const year = Number(formatInTimeZone(new Date(), TZ, "yyyy"));
  const supplierCode = (n: number) => `FRS-${String(n).padStart(5, "0")}`;

  async function rateFor(currency: string): Promise<{ rate: Prisma.Decimal; date: Date } | null> {
    if (currency === "XOF") return null;
    const r = await prisma.exchangeRate.findFirst({ where: { currencyCode: currency, date: { lte: dayAt(0) } }, orderBy: { date: "desc" } });
    return r ? { rate: r.rate, date: r.date } : null;
  }

  for (const s of POS) {
    const exists = await prisma.purchaseOrderEvent.findFirst({ where: { payload: { path: ["seedKey"], equals: s.key } }, select: { id: true } });
    if (exists) continue;
    const supplier = suppliers.get(supplierCode(s.supplier));
    if (!supplier) throw new Error(`Seed BC : fournisseur introuvable (${supplierCode(s.supplier)}).`);
    const wh = warehouses.get(s.warehouse ?? "MAG-CENTRAL");
    if (!wh) throw new Error("Seed BC : dépôt introuvable.");
    const currency = await prisma.currency.findUniqueOrThrow({ where: { code: supplier.currencyCode } });
    const rate = await rateFor(currency.code);
    const isImport = supplier.type === "IMPORT";

    // ---- lignes
    const prepared: {
      lineNo: number; itemId: string; supplierRef: string | null; quantity: number; unit: string; stockQty: number; unitPrice: number; discountPct: number; vatRate: number;
      allocation: { requestLineId: string; qty: number } | null; received: number;
    }[] = [];
    for (const [i, l] of s.lines.entries()) {
      const item = items.get(l.item);
      if (!item) throw new Error(`Seed BC : article introuvable (${l.item}).`);
      const link = await prisma.itemSupplier.findUnique({ where: { itemId_supplierId: { itemId: item.id, supplierId: supplier.id } } });
      const price = l.price ?? (link?.currencyCode === currency.code && link.lastPrice ? Number(link.lastPrice) : 0);
      if (!price) throw new Error(`Seed BC : aucun prix pour ${l.item} chez ${supplier.code}.`);
      let allocation: { requestLineId: string; qty: number } | null = null;
      if (l.alloc) {
        const da = await prisma.purchaseRequest.findFirst({ where: { reason: l.alloc.da }, include: { lines: { orderBy: { lineNo: "asc" } } } });
        const dl = da?.lines[l.alloc.line - 1];
        if (!da || !dl) throw new Error(`Seed BC : DA introuvable (${l.alloc.da}).`);
        allocation = { requestLineId: dl.id, qty: l.alloc.qty };
      }
      prepared.push({
        lineNo: i + 1,
        itemId: item.id,
        supplierRef: link?.supplierRef ?? null,
        quantity: l.qty,
        unit: item.purchaseUnit,
        stockQty: Math.round(l.qty * Number(item.conversionFactor) * 1000) / 1000,
        unitPrice: price,
        discountPct: l.discount ?? 0,
        vatRate: isImport ? 0 : 18,
        allocation,
        received: l.received ?? 0,
      });
    }
    const charges = s.charges ?? [];
    const totals = computeTotals(
      prepared.map((l) => ({ quantity: l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, vatRate: l.vatRate })),
      charges.map((c) => ({ amount: c.amount, vatRate: isImport ? 0 : 18 })),
      { currencyCode: currency.code, decimals: currency.decimals, rate: rate?.rate ?? null },
    );

    // ---- référence du contrôle de prix : un dernier prix récent et sans ambiguïté par article (données fictives)
    for (const [i, l] of prepared.entries()) {
      const ref = s.lines[i].refPrice ?? l.unitPrice;
      const refKey = `seed:lot05:ref:${s.key}`;
      if (await prisma.itemPriceHistory.findFirst({ where: { itemId: l.itemId, supplierId: supplier.id, sourceRef: refKey } })) continue;
      await prisma.itemPriceHistory.create({
        data: { itemId: l.itemId, supplierId: supplier.id, price: ref, currencyCode: currency.code, rateToXof: currency.code === "XOF" ? null : (rate?.rate ?? null), priceUnit: l.unit, source: "MANUEL", sourceRef: refKey, date: ago(2) },
      });
    }

    // ---- contrôle de prix (BC soumis au moins) : dernier prix de l'article, tous fournisseurs
    const priceChecks = await Promise.all(
      prepared.map(async (l) => {
        const last = await prisma.itemPriceHistory.findFirst({ where: { itemId: l.itemId }, orderBy: [{ date: "desc" }, { createdAt: "desc" }] });
        return checkPrice({
          unitPrice: l.unitPrice,
          discountPct: l.discountPct,
          currencyCode: currency.code,
          rate: rate?.rate ?? null,
          unit: l.unit,
          last: last ? { price: last.price, currencyCode: last.currencyCode, rateToXof: last.rateToXof, priceUnit: last.priceUnit, date: last.date } : null,
        });
      }),
    );

    const creator = uid(s.creator);
    const resp = uid(RESP);
    const created = ago(s.createdDaysAgo, -2);
    const t = (hours: number) => new Date(created.getTime() + hours * 3_600_000);
    const validated = s.steps.includes("APPROVED");
    const requestedDate = dayAt(s.requestedIn);
    const promisedDate = s.promisedIn !== undefined ? dayAt(s.promisedIn) : null;
    const sentAt = s.steps.includes("SENT") ? ago(s.sentDaysAgo ?? Math.max(s.createdDaysAgo - 2, 0), 0) : null;
    const amendment = s.steps.includes("AMENDED");

    await prisma.$transaction(async (tx) => {
      const number = validated ? formatDocumentNumber("BC", year, await nextNumberWith(tx, "BC", year)) : null;
      const po = await tx.purchaseOrder.create({
        data: {
          number,
          version: 1,
          status: s.status,
          type: supplier.type,
          origin: s.direct ? "DIRECT" : "DA",
          directReason: s.direct ?? null,
          supplierId: supplier.id,
          createdById: creator.id,
          currencyCode: currency.code,
          exchangeRate: rate?.rate ?? null,
          rateDate: rate?.date ?? null,
          paymentTerm: supplier.paymentTerm,
          incoterm: isImport ? ((s.incoterm as never) ?? supplier.incoterm) : null,
          incotermPlace: isImport ? (s.incotermPlace ?? null) : null,
          warehouseId: wh.id,
          deliveryAddress: wh.address ?? WAREHOUSE_ADDRESSES[wh.code] ?? "",
          requestedDate,
          promisedDate,
          firstPromisedDate: promisedDate,
          expectedDate: promisedDate ?? requestedDate,
          notes: s.notes ?? null,
          totalHt: totals.totalHt.toString(),
          totalVat: totals.totalVat.toString(),
          totalTtc: totals.totalTtc.toString(),
          totalHtXof: totals.totalHtXof,
          totalTtcXof: totals.totalTtcXof,
          submittedAt: s.steps.includes("SUBMITTED") ? t(2) : null,
          approvedAt: validated ? t(20) : null,
          approvedById: validated ? resp.id : null,
          sentAt,
          sentChannel: sentAt ? "EMAIL" : null,
          confirmedAt: s.steps.includes("CONFIRMED") ? ago(Math.max((s.sentDaysAgo ?? 2) - 1, 0), 0) : null,
          cancelledAt: s.steps.includes("CANCELLED") ? t(48) : null,
          cancelledById: s.steps.includes("CANCELLED") ? resp.id : null,
          cancelledReason: s.cancelReason ?? null,
          createdAt: created,
          lines: {
            create: prepared.map((l, i) => ({
              lineNo: l.lineNo,
              itemId: l.itemId,
              supplierRef: l.supplierRef,
              quantity: l.quantity,
              unit: l.unit,
              stockQty: l.stockQty,
              unitPrice: l.unitPrice,
              discountPct: l.discountPct,
              vatRate: l.vatRate,
              netAmount: totals.lineNets[i].toString(),
              lastPriceXof: s.steps.includes("SUBMITTED") ? priceChecks[i].lastPriceXof : null,
              priceDeltaPct: s.steps.includes("SUBMITTED") ? priceChecks[i].deltaPct?.toString() : null,
              receivedQty: l.received,
              allocations: l.allocation ? { create: [l.allocation] } : undefined,
            })),
          },
          charges: { create: charges.map((c) => ({ label: c.label, amount: c.amount, vatRate: isImport ? 0 : 18 })) },
        },
      });

      const ev = (type: PurchaseOrderEventType, userId: string, hours: number, extra: { from?: PurchaseOrderStatus; to?: PurchaseOrderStatus; comment?: string; payload?: Record<string, unknown>; version?: number } = {}) =>
        tx.purchaseOrderEvent.create({
          data: {
            orderId: po.id,
            version: extra.version ?? 1,
            type,
            userId,
            fromStatus: extra.from ?? null,
            toStatus: extra.to ?? null,
            comment: extra.comment ?? null,
            payload: extra.payload as Prisma.InputJsonValue | undefined,
            createdAt: t(hours),
          },
        });
      const audit = (type: PurchaseOrderEventType, userId: string, hours: number, after: Record<string, unknown>) => {
        const action = EVENT_AUDIT[type];
        return action ? tx.auditLog.create({ data: { userId, action, entity: "PurchaseOrder", entityId: po.id, after: after as Prisma.InputJsonValue, createdAt: t(hours) } }) : undefined;
      };

      await ev("CREATED", creator.id, 0, { to: "BROUILLON", payload: { seedKey: s.key, lines: prepared.length } });
      await audit("CREATED", creator.id, 0, { status: "BROUILLON", origin: s.direct ? "DIRECT" : "DA" });
      if (s.steps.includes("SUBMITTED")) {
        await ev("SUBMITTED", creator.id, 2, { from: "BROUILLON", to: "A_VALIDER" });
        await audit("SUBMITTED", creator.id, 2, { status: "A_VALIDER" });
      }
      if (validated) {
        await ev("APPROVED", resp.id, 20, { from: "A_VALIDER", to: "VALIDE", payload: { number, autoApproved: s.creator === RESP, underThreshold: false } });
        await audit("APPROVED", resp.id, 20, { status: "VALIDE", number });
        // Version 1 : instantané pour le PDF et l'avenant.
        const full = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: FULL_INCLUDE });
        const snap = buildSnapshot(full, { approvedAt: t(20), approvedById: resp.id, approvedByName: resp.name, autoApproved: s.creator === RESP, underThreshold: false });
        await tx.purchaseOrderVersion.create({ data: { orderId: po.id, version: 1, snapshot: snap as unknown as Prisma.InputJsonValue, approvedAt: t(20), approvedById: resp.id } });
        // Historique de prix : le prix du BC validé devient le dernier prix (même mécanique que le service).
        for (const l of prepared) {
          const price = Math.round(l.unitPrice * (1 - l.discountPct / 100) * 100) / 100;
          await tx.itemPriceHistory.create({
            data: { itemId: l.itemId, supplierId: supplier.id, price, currencyCode: currency.code, rateToXof: currency.code === "XOF" ? null : (rate?.rate ?? null), priceUnit: l.unit, source: "BC", sourceRef: number, date: t(20), createdById: resp.id },
          });
        }
      }
      if (s.steps.includes("SENT")) {
        await ev("SENT", creator.id, 30, { from: "VALIDE", to: "ENVOYE", payload: { channel: "EMAIL" } });
        await audit("SENT", creator.id, 30, { status: "ENVOYE", channel: "EMAIL" });
      }
      if (s.steps.includes("CONFIRMED")) {
        await ev("CONFIRMED", creator.id, 40, { from: "ENVOYE", to: "CONFIRME", payload: { promisedDate: promisedDate?.toISOString().slice(0, 10) } });
        await audit("CONFIRMED", creator.id, 40, { status: "CONFIRME" });
      }
      if (s.steps.includes("RECEIVED")) {
        await ev("STATUS_SYNC", resp.id, 60, { from: "CONFIRME", to: "RECU" });
        await audit("STATUS_SYNC", resp.id, 60, { status: "RECU" });
      }
      if (s.steps.includes("CANCELLED")) {
        await ev("CANCELLED", resp.id, 48, { from: "VALIDE", to: "ANNULE", comment: s.cancelReason });
        await audit("CANCELLED", resp.id, 48, { status: "ANNULE", reason: s.cancelReason });
      }

      // Avenant : v2 validé (même numéro), quantité de la ligne 1 modifiée ; v1 reste en instantané.
      if (amendment && s.amendedQty) {
        const line1 = prepared[0];
        const v2 = computeTotals(
          prepared.map((l, i) => ({ quantity: i === 0 ? s.amendedQty! : l.quantity, unitPrice: l.unitPrice, discountPct: l.discountPct, vatRate: l.vatRate })),
          [],
          { currencyCode: currency.code, decimals: currency.decimals, rate: rate?.rate ?? null },
        );
        const lineRow = await tx.purchaseOrderLine.findFirstOrThrow({ where: { orderId: po.id, lineNo: 1 } });
        await ev("AMENDMENT_STARTED", creator.id, 100, { from: "VALIDE", to: "BROUILLON", comment: "Besoin supplémentaire constaté (démo).", version: 2 });
        await audit("AMENDMENT_STARTED", creator.id, 100, { version: 2 });
        await ev("SUBMITTED", creator.id, 101, { from: "BROUILLON", to: "A_VALIDER", version: 2 });
        await ev("APPROVED", resp.id, 110, { from: "A_VALIDER", to: "VALIDE", version: 2, payload: { number, amendment: true, autoApproved: s.creator === RESP } });
        await audit("APPROVED", resp.id, 110, { status: "VALIDE", number, version: 2 });
        await tx.purchaseOrderLine.update({
          where: { id: lineRow.id },
          data: { quantity: s.amendedQty, stockQty: Math.round(s.amendedQty * (line1.stockQty / line1.quantity) * 1000) / 1000, netAmount: v2.lineNets[0].toString() },
        });
        await tx.purchaseOrder.update({
          where: { id: po.id },
          data: { version: 2, totalHt: v2.totalHt.toString(), totalVat: v2.totalVat.toString(), totalTtc: v2.totalTtc.toString(), totalHtXof: v2.totalHtXof, totalTtcXof: v2.totalTtcXof, approvedAt: t(110), approvedById: resp.id },
        });
        const full2 = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: FULL_INCLUDE });
        const snap2 = buildSnapshot(full2, { approvedAt: t(110), approvedById: resp.id, approvedByName: resp.name, autoApproved: s.creator === RESP, underThreshold: false });
        await tx.purchaseOrderVersion.create({ data: { orderId: po.id, version: 2, snapshot: snap2 as unknown as Prisma.InputJsonValue, approvedAt: t(110), approvedById: resp.id } });
      }

      // Notifications de démonstration (cloche de l'en-tête)
      const label = number ?? "Bon de commande";
      if (s.status === "A_VALIDER") {
        await tx.notification.create({
          data: { recipientId: resp.id, type: "PO_SUBMITTED", severity: "INFO", title: `${label} à valider`, body: `${supplier.name} – alerte de prix à contrôler`, link: `/achats/commandes/${po.id}`, entity: "PurchaseOrder", entityId: po.id, createdAt: t(2) },
        });
      }
      if (s.status === "VALIDE" && s.creator !== RESP) {
        await tx.notification.create({
          data: { recipientId: creator.id, type: "PO_APPROVED", severity: "INFO", title: `${label} validé`, body: supplier.name, link: `/achats/commandes/${po.id}`, entity: "PurchaseOrder", entityId: po.id, createdAt: t(20) },
        });
      }
    });
  }

  // ---- statuts des DA rattachées : cohérents avec les quantités commandées (BC validés et au-delà).
  const lines = await prisma.purchaseOrderLineAllocation.findMany({
    where: { orderLine: { order: { events: { some: { payload: { path: ["seedKey"], string_starts_with: "lot05:" } } } } } },
    select: { requestLine: { select: { requestId: true } } },
  });
  for (const requestId of new Set(lines.map((l) => l.requestLine.requestId))) {
    const pr = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: requestId }, include: { lines: true } });
    if (!["VALIDEE", "PARTIELLEMENT_COMMANDEE", "COMMANDEE", "EN_CONSULTATION"].includes(pr.status)) continue;
    const allocs = await prisma.purchaseOrderLineAllocation.findMany({
      where: { requestLine: { requestId }, orderLine: { order: { status: { in: ["VALIDE", "ENVOYE", "CONFIRME", "PARTIELLEMENT_RECU", "RECU", "CLOTURE"] } } } },
    });
    const ordered = (lineId: string) => allocs.filter((a) => a.requestLineId === lineId).reduce((sum, a) => sum + Number(a.qty), 0);
    const needed = pr.lines.map((l) => ({ id: l.id, need: Number(l.approvedQty ?? l.quantity) })).filter((l) => l.need > 0);
    const complete = needed.length > 0 && needed.every((l) => ordered(l.id) >= l.need);
    const started = needed.some((l) => ordered(l.id) > 0);
    const target = complete ? "COMMANDEE" : started ? "PARTIELLEMENT_COMMANDEE" : null;
    if (!target || target === pr.status) continue;
    await prisma.$transaction(async (tx) => {
      await tx.purchaseRequest.update({ where: { id: requestId }, data: { status: target, ...(target === "COMMANDEE" ? { priority: 2 } : {}) } });
      await tx.purchaseRequestEvent.create({ data: { requestId, type: "STATUS_SYNC", userId: uid(RESP).id, fromStatus: pr.status, toStatus: target, createdAt: ago(1) } });
      await tx.auditLog.create({ data: { userId: uid(RESP).id, action: "PR_STATUS_SYNC", entity: "PurchaseRequest", entityId: requestId, before: { status: pr.status }, after: { status: target }, createdAt: ago(1) } });
    });
  }
}
