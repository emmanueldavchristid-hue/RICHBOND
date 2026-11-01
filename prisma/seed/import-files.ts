/**
 * Dossiers import fictifs (LOT-12). Aucune donnée réelle : fournisseur, articles, montants et numéros inventés.
 * - types de frais d'approche et coefficients par défaut (maritime 18 %, aérien 30 %, routier 10 % de la valeur) : upsert ;
 * - fournisseur « Bearing Global Ltd » (USD, CIF), trois roulements importés, un BC import confirmé ;
 * - un dossier IMP-AAAA-NNNN ouvert avec ses 10 jalons (ETA dépassée : alerte de retard), un fret réel en USD,
 *   un transitaire réel et des frais estimés par les coefficients par défaut.
 * Idempotent : types et coefficients en upsert ; fournisseur, articles, BC et dossier ne sont créés qu'une fois.
 */
import { formatInTimeZone } from "date-fns-tz";
import type { Prisma, PrismaClient } from "../../src/generated/prisma/client";
import { estimateCosts } from "../../src/modules/import-files/estimates";
import { MILESTONE_CODES } from "../../src/modules/import-files/labels";
import { toXof } from "../../src/modules/import-files/landed-cost";
import { formatDocumentNumber } from "../../src/modules/numbering/format";
import { nextNumberWith } from "../../src/modules/numbering/next";
import { FULL_INCLUDE } from "../../src/modules/purchase-orders/include";
import { buildSnapshot } from "../../src/modules/purchase-orders/snapshot";
import { computeTotals } from "../../src/modules/purchase-orders/totals";

const TZ = "Africa/Abidjan";
const DAY = 86_400_000;
const dayAt = (offset: number): Date => new Date(`${formatInTimeZone(new Date(Date.now() + offset * DAY), TZ, "yyyy-MM-dd")}T00:00:00.000Z`);
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY + hours * 3_600_000);

type Key = "VALEUR" | "POIDS" | "VOLUME" | "QUANTITE";
type Mode = "MARITIME" | "AERIEN" | "ROUTIER";

const TYPES: { code: string; label: string; sortOrder: number; recoverable?: boolean; key?: Key }[] = [
  { code: "FRET", label: "Fret international", sortOrder: 10 },
  { code: "ASSURANCE", label: "Assurance transport", sortOrder: 20 },
  { code: "DROITS_DOUANE", label: "Droits de douane", sortOrder: 30 },
  { code: "REDEVANCES", label: "Redevances et prélèvements douaniers", sortOrder: 40 },
  { code: "TRANSITAIRE", label: "Frais de transitaire", sortOrder: 50 },
  { code: "ACCONAGE", label: "Manutention / acconage", sortOrder: 60 },
  { code: "MAGASINAGE", label: "Magasinage port", sortOrder: 70 },
  { code: "TRANSPORT_USINE", label: "Transport jusqu'à l'usine", sortOrder: 80 },
  { code: "FRAIS_BANCAIRES", label: "Frais bancaires", sortOrder: 90 },
  { code: "AUTRES", label: "Autres frais", sortOrder: 100 },
  // TVA à l'import : récupérable, donc exclue du coût de revient (hypothèse à confirmer).
  { code: "TVA_IMPORT", label: "TVA à l'import (récupérable)", sortOrder: 110, recoverable: true },
];

/** % de la valeur marchandise par type de frais et par mode (coefficients indicatifs, à confirmer). */
const DEFAULTS: Record<Mode, Record<string, number>> = {
  MARITIME: { FRET: 5, ASSURANCE: 1, DROITS_DOUANE: 6, REDEVANCES: 2, TRANSITAIRE: 1.5, ACCONAGE: 1, MAGASINAGE: 0.5, TRANSPORT_USINE: 1 }, // 18 %
  AERIEN: { FRET: 18, ASSURANCE: 1, DROITS_DOUANE: 6, REDEVANCES: 2, TRANSITAIRE: 1.5, ACCONAGE: 0.5, TRANSPORT_USINE: 1 }, // 30 %
  ROUTIER: { FRET: 4, DROITS_DOUANE: 3, REDEVANCES: 1, TRANSITAIRE: 1, TRANSPORT_USINE: 1 }, // 10 %
};

const ITEMS = [
  { code: "IMP-ART-001", name: "Roulement 6204-2RS (import)", qty: 500, price: 4.8, kg: 0.12, m3: 0.00006 },
  { code: "IMP-ART-002", name: "Roulement conique 32208 (import)", qty: 200, price: 12.5, kg: 0.45, m3: 0.00022 },
  { code: "IMP-ART-003", name: "Roulement à rouleaux 22210 (import)", qty: 80, price: 38, kg: 1.9, m3: 0.0009 },
];

const FILE_BL = "BL-DEMO-0001";

export async function seedImportFiles(prisma: PrismaClient): Promise<void> {
  // ---- types de frais et coefficients par défaut (toujours à jour, jamais dupliqués)
  const typeByCode = new Map<string, { id: string }>();
  for (const t of TYPES) {
    const saved = await prisma.approachCostType.upsert({
      where: { code: t.code },
      update: {},
      create: { code: t.code, label: t.label, sortOrder: t.sortOrder, vatRecoverableDefault: t.recoverable ?? false, defaultKey: t.key ?? "VALEUR" },
    });
    typeByCode.set(t.code, saved);
  }
  for (const [mode, byType] of Object.entries(DEFAULTS) as [Mode, Record<string, number>][]) {
    for (const [code, pct] of Object.entries(byType)) {
      const typeId = typeByCode.get(code)!.id;
      await prisma.approachCoefficientDefault.upsert({ where: { mode_typeId: { mode, typeId } }, update: {}, create: { mode, typeId, pctOfValue: pct } });
    }
  }

  if (await prisma.importFile.findFirst({ where: { blNumber: FILE_BL }, select: { id: true } })) return;
  const importer = await prisma.user.findUnique({ where: { email: "acheteur.import@richbond.test" } });
  const resp = await prisma.user.findUnique({ where: { email: "responsable@richbond.test" } });
  const warehouse = await prisma.warehouse.findUnique({ where: { code: "MAG-PDR" } });
  const usd = await prisma.exchangeRate.findFirst({ where: { currencyCode: "USD", date: { lte: dayAt(0) } }, orderBy: { date: "desc" } });
  if (!importer || !resp || !warehouse || !usd) return; // référentiels absents : rien à créer
  const year = Number(formatInTimeZone(new Date(), TZ, "yyyy"));

  // ---- fournisseur et articles
  const supplier = await prisma.supplier.upsert({
    where: { code: "IMP-FRN-001" },
    update: {},
    create: {
      code: "IMP-FRN-001",
      name: "Bearing Global Ltd",
      type: "IMPORT",
      country: "SG",
      city: "Singapour",
      currencyCode: "USD",
      paymentTerm: "J30",
      incoterm: "CIF",
      leadTimeDays: 40,
      categories: ["PDR"],
      contacts: { create: [{ name: "Export desk", phone: "+65 0000 0001", isPrimary: true }] },
    },
  });
  const items: { id: string; code: string; qty: number; price: number; kg: number; m3: number }[] = [];
  for (const it of ITEMS) {
    const item = await prisma.item.upsert({
      where: { code: it.code },
      update: {},
      create: { code: it.code, name: it.name, category: "PDR", family: "Roulements", stockUnit: "U", purchaseUnit: "U", criticality: "IMPORTANT", defaultWarehouseId: warehouse.id, mainSupplierId: supplier.id },
    });
    await prisma.itemSupplier.upsert({
      where: { itemId_supplierId: { itemId: item.id, supplierId: supplier.id } },
      update: {},
      create: { itemId: item.id, supplierId: supplier.id, lastPrice: it.price, currencyCode: "USD", lastPriceDate: ago(5), priceUnit: "U", leadTimeDays: 40 },
    });
    items.push({ id: item.id, code: it.code, qty: it.qty, price: it.price, kg: it.kg, m3: it.m3 });
  }

  // ---- BC import confirmé (même recette que le seed LOT-05 : événements, instantané de version, numéro du compteur)
  const currency = await prisma.currency.findUniqueOrThrow({ where: { code: "USD" } });
  const totals = computeTotals(items.map((l) => ({ quantity: l.qty, unitPrice: l.price, discountPct: 0, vatRate: 0 })), [], { currencyCode: "USD", decimals: currency.decimals, rate: usd.rate });
  const created = ago(30);
  const t = (hours: number) => new Date(created.getTime() + hours * 3_600_000);
  const poId = await prisma.$transaction(async (tx) => {
    const number = formatDocumentNumber("BC", year, await nextNumberWith(tx, "BC", year));
    const po = await tx.purchaseOrder.create({
      data: {
        number,
        version: 1,
        status: "CONFIRME",
        type: "IMPORT",
        origin: "DIRECT",
        directReason: "Roulements de rechange pour la maintenance : commande import directe (démo LOT-12).",
        supplierId: supplier.id,
        createdById: importer.id,
        currencyCode: "USD",
        exchangeRate: usd.rate,
        rateDate: usd.date,
        paymentTerm: "J30",
        incoterm: "CIF",
        incotermPlace: "Abidjan",
        warehouseId: warehouse.id,
        deliveryAddress: warehouse.address ?? "",
        requestedDate: dayAt(-5),
        promisedDate: dayAt(-3),
        firstPromisedDate: dayAt(-3),
        expectedDate: dayAt(-3),
        totalHt: totals.totalHt.toString(),
        totalVat: totals.totalVat.toString(),
        totalTtc: totals.totalTtc.toString(),
        totalHtXof: totals.totalHtXof,
        totalTtcXof: totals.totalTtcXof,
        submittedAt: t(2),
        approvedAt: t(20),
        approvedById: resp.id,
        sentAt: t(30),
        sentChannel: "EMAIL",
        confirmedAt: t(40),
        createdAt: created,
        lines: {
          create: items.map((l, i) => ({
            lineNo: i + 1,
            itemId: l.id,
            quantity: l.qty,
            unit: "U",
            stockQty: l.qty,
            unitPrice: l.price,
            discountPct: 0,
            vatRate: 0,
            netAmount: totals.lineNets[i].toString(),
            unitWeightKg: l.kg,
            unitVolumeM3: l.m3,
          })),
        },
      },
    });
    const ev = (type: "CREATED" | "SUBMITTED" | "APPROVED" | "SENT" | "CONFIRMED", userId: string, hours: number, from: string | null, to: string, payload?: Prisma.InputJsonValue) =>
      tx.purchaseOrderEvent.create({ data: { orderId: po.id, version: 1, type, userId, fromStatus: from as never, toStatus: to as never, payload, createdAt: t(hours) } });
    await ev("CREATED", importer.id, 0, null, "BROUILLON", { seedKey: "lot12:01", lines: items.length });
    await ev("SUBMITTED", importer.id, 2, "BROUILLON", "A_VALIDER");
    await ev("APPROVED", resp.id, 20, "A_VALIDER", "VALIDE", { number, autoApproved: false, underThreshold: false });
    await ev("SENT", importer.id, 30, "VALIDE", "ENVOYE", { channel: "EMAIL" });
    await ev("CONFIRMED", importer.id, 40, "ENVOYE", "CONFIRME", { promisedDate: dayAt(-3).toISOString().slice(0, 10) });
    const full = await tx.purchaseOrder.findUniqueOrThrow({ where: { id: po.id }, include: FULL_INCLUDE });
    const snap = buildSnapshot(full, { approvedAt: t(20), approvedById: resp.id, approvedByName: resp.name, autoApproved: false, underThreshold: false });
    await tx.purchaseOrderVersion.create({ data: { orderId: po.id, version: 1, snapshot: snap as unknown as Prisma.InputJsonValue, approvedAt: t(20), approvedById: resp.id } });
    return po.id;
  });

  // ---- dossier import
  await prisma.$transaction(async (tx) => {
    const number = formatDocumentNumber("IMP", year, await nextNumberWith(tx, "IMP", year));
    const file = await tx.importFile.create({
      data: {
        number,
        supplierId: supplier.id,
        mode: "MARITIME",
        incoterm: "CIF",
        incotermPlace: "Abidjan",
        loadingPort: "Singapour",
        transitaire: "Transit Atlantique (fictif)",
        blNumber: FILE_BL,
        containerNumber: "DEMO1234567",
        customsRegime: "Mise à la consommation (démo)",
        createdById: importer.id,
        createdAt: ago(30),
        orders: { create: [{ orderId: poId }] },
        milestones: {
          create: MILESTONE_CODES.map((code) => {
            const plan: Partial<Record<(typeof MILESTONE_CODES)[number], [number, number | null]>> = {
              PROFORMA_RECUE: [-45, -45],
              PAIEMENT_OU_CREDOC: [-40, -39],
              MARCHANDISE_PRETE: [-30, -29],
              EMBARQUEMENT_ETD: [-25, -24],
              ARRIVEE_PREVUE_ETA: [-3, null], // ETA dépassée : alerte de retard
              ARRIVEE_PORT: [-2, null],
              DOCUMENTS_RECUS: [-1, null],
              DEDOUANEMENT: [4, null],
              ENLEVEMENT: [6, null],
              RECEPTION_MAGASIN: [8, null],
            };
            const p = plan[code]!;
            return { code, plannedDate: dayAt(p[0]), actualDate: p[1] === null ? null : dayAt(p[1]) };
          }),
        },
      },
    });
    // Frais réels : fret en USD (clé poids), transitaire en FCFA ; le reste est estimé par les coefficients par défaut.
    const goodsXof = toXof(totals.totalHt.toString(), usd.rate);
    const rates = { fret: { amount: 650, rate: usd.rate } };
    await tx.approachCost.create({
      data: { fileId: file.id, typeId: typeByCode.get("FRET")!.id, status: "REEL", amount: rates.fret.amount, currencyCode: "USD", rate: rates.fret.rate, amountXof: toXof(rates.fret.amount, rates.fret.rate), allocationKey: "POIDS", payee: "Armateur (fictif)", createdById: importer.id, createdAt: ago(2) },
    });
    await tx.approachCost.create({
      data: { fileId: file.id, typeId: typeByCode.get("TRANSITAIRE")!.id, status: "REEL", amount: 185000, currencyCode: "XOF", rate: 1, amountXof: 185000, payee: "Transit Atlantique (fictif)", createdById: importer.id, createdAt: ago(1) },
    });
    const defaults = Object.entries(DEFAULTS.MARITIME).filter(([code]) => code !== "FRET" && code !== "TRANSITAIRE");
    const estimates = estimateCosts(goodsXof, defaults.map(([code, pct]) => ({ typeId: typeByCode.get(code)!.id, pctOfValue: pct })));
    for (const e of estimates) {
      await tx.approachCost.create({
        data: { fileId: file.id, typeId: e.typeId, status: "ESTIME", amount: e.amountXof, currencyCode: "XOF", rate: 1, amountXof: e.amountXof, autoEstimate: true, createdById: importer.id, createdAt: ago(30) },
      });
    }
    await tx.auditLog.create({
      data: { userId: importer.id, action: "IMPORT_FILE_CREATE", entity: "ImportFile", entityId: file.id, after: { number, supplier: supplier.name, mode: "MARITIME", seed: "lot12" }, createdAt: ago(30) },
    });
  });
}
