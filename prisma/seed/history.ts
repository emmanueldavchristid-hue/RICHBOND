/**
 * Historique fictif sur 6 mois (LOT-08) pour que le tableau de bord soit parlant en démonstration.
 *
 * Tout passe par les services métier, avec l'heure du jour historique (`at`) : demandes d'achat (création, soumission,
 * validation), bons de commande (brouillon, soumission, validation, envoi, confirmation), réceptions (mouvements de stock,
 * PMP, statut du BC, non-conformités) et `applyMovement` pour les sorties. Numéros, audit et événements sont donc ceux de la
 * production. Aucune donnée réelle.
 *
 * Contenu : ~40 BC validés sur 6 mois (local et import), la plupart reçus, quelques livraisons en retard, 2 non-conformités
 * ouvertes, 2 BC en retard à relancer (un par acheteur), des BC à envoyer ou à valider, des DA à valider et assignées,
 * 3 articles vidés (ruptures) et un taux de change plus ancien (-200 j) pour les BC import les plus anciens.
 *
 * Idempotent : chaque BC porte un marqueur dans sa note interne (`seed:lot08:NN`), chaque DA dans son motif ; une entrée
 * déjà présente n'est pas recréée. À lancer après `seedStock` (les articles du scénario S3 ne sont pas touchés).
 */
import Module from "node:module";
import { formatInTimeZone } from "date-fns-tz";
import type { PrismaClient } from "../../src/generated/prisma/client";

const TZ = "Africa/Abidjan";
const DAY = 86_400_000;
const MARK = "Données fictives (seed LOT-08)";

type Step = "SUBMITTED" | "APPROVED" | "SENT" | "CONFIRMED";
const STEP_ORDER: Step[] = ["SUBMITTED", "APPROVED", "SENT", "CONFIRMED"];

interface Entry {
  n: number;
  /** Jours écoulés depuis la validation du BC. */
  a: number;
  /** Numéro du fournisseur du seed (FRS-000NN). */
  sup: number;
  lines: [item: string, qty: number][];
  /** Délai promis (jours après la validation). */
  lead: number;
  /** Retard de réception en jours (négatif = en avance). */
  late: number;
  /** Jours entre la validation de la DA et celle du BC. */
  da: number;
  /** Arrêt du parcours (BC resté à ce stade). */
  stop?: Step;
  refuse?: { item: string; qty: number; reason: "ABIME" | "NON_CONFORME" };
}

const ENTRIES: Entry[] = [
  { n: 1, a: 176, sup: 3, lines: [["Tissu matelassé 180 g/m²", 20]], lead: 9, late: 0, da: 4 },
  { n: 2, a: 170, sup: 5, lines: [["Capteur de proximité inductif", 10], ["Contacteur 25 A", 8]], lead: 8, late: 0, da: 3 },
  { n: 3, a: 164, sup: 19, lines: [["TDI 80/20", 12]], lead: 38, late: 4, da: 6 },
  { n: 4, a: 158, sup: 7, lines: [["Gants de manutention", 40], ["Bouchons d'oreille", 30]], lead: 5, late: 0, da: 2 },
  { n: 5, a: 153, sup: 1, lines: [["Colle de contrecollage", 6]], lead: 10, late: 0, da: 3 },
  { n: 6, a: 147, sup: 3, lines: [["Ouate polyester 250 g/m²", 10], ["Fil de couture bord de matelas", 12]], lead: 10, late: 2, da: 5 },
  { n: 7, a: 142, sup: 21, lines: [["Vérin pneumatique Ø63", 6], ["Électrovanne 24 V", 12]], lead: 22, late: 0, da: 4 },
  { n: 8, a: 136, sup: 6, lines: [["Toner imprimante", 4]], lead: 3, late: 0, da: 2 },
  { n: 9, a: 130, sup: 5, lines: [["Moteur asynchrone 7,5 kW", 1], ["Résistance chauffante ensacheuse", 4]], lead: 15, late: 5, da: 7 },
  { n: 10, a: 125, sup: 14, lines: [["Fil polyester 40/2", 120]], lead: 40, late: 0, da: 5 },
  { n: 11, a: 118, sup: 3, lines: [["Tissu jacquard damassé", 14]], lead: 12, late: 0, da: 4 },
  { n: 12, a: 112, sup: 9, lines: [["Filtre à air compresseur", 6]], lead: 6, late: 3, da: 3 },
  { n: 13, a: 106, sup: 19, lines: [["MDI polymérique", 8], ["Catalyseur amine", 3]], lead: 35, late: 0, da: 6 },
  { n: 14, a: 100, sup: 7, lines: [["Cutter de découpe", 60], ["Gants de manutention", 60]], lead: 5, late: 0, da: 2 },
  { n: 15, a: 95, sup: 1, lines: [["Chlorure de méthylène", 4]], lead: 9, late: 0, da: 3 },
  { n: 16, a: 88, sup: 5, lines: [["Contacteur 25 A", 10], ["Capteur de proximité inductif", 8]], lead: 8, late: 4, da: 4 },
  { n: 17, a: 82, sup: 24, lines: [["Ressorts ensachés 7 zones", 6]], lead: 52, late: 0, da: 8 },
  { n: 18, a: 76, sup: 3, lines: [["Tissu matelassé 180 g/m²", 25]], lead: 10, late: 0, da: 3 },
  { n: 19, a: 70, sup: 21, lines: [["Électrovanne 24 V", 10], ["Vérin pneumatique Ø63", 5]], lead: 22, late: 6, da: 5 },
  { n: 20, a: 65, sup: 6, lines: [["Toner imprimante", 3]], lead: 3, late: 0, da: 2 },
  { n: 21, a: 58, sup: 3, lines: [["Ouate polyester 250 g/m²", 12], ["Tissu jacquard damassé", 10]], lead: 10, late: 0, da: 4 },
  { n: 22, a: 52, sup: 5, lines: [["Moteur asynchrone 7,5 kW", 1], ["Contacteur 25 A", 12]], lead: 14, late: 3, da: 5 },
  { n: 23, a: 47, sup: 19, lines: [["TDI 80/20", 14], ["Catalyseur amine", 4]], lead: 36, late: 0, da: 7 },
  { n: 24, a: 41, sup: 7, lines: [["Gants de manutention", 80]], lead: 5, late: 0, da: 2 },
  { n: 25, a: 36, sup: 9, lines: [["Filtre à air compresseur", 5]], lead: 6, late: 0, da: 3 },
  { n: 26, a: 33, sup: 1, lines: [["Colle de contrecollage", 8], ["Chlorure de méthylène", 5]], lead: 9, late: 2, da: 3 },
  { n: 27, a: 27, sup: 3, lines: [["Tissu matelassé 180 g/m²", 28]], lead: 10, late: 0, da: 4 },
  { n: 28, a: 24, sup: 14, lines: [["Fil polyester 40/2", 150]], lead: 40, late: 0, da: 6 },
  { n: 29, a: 20, sup: 5, lines: [["Capteur de proximité inductif", 14], ["Contacteur 25 A", 12]], lead: 8, late: 0, da: 3 },
  { n: 30, a: 18, sup: 3, lines: [["Ouate polyester 250 g/m²", 14]], lead: 10, late: 0, da: 3 },
  { n: 31, a: 14, sup: 21, lines: [["Vérin pneumatique Ø63", 4], ["Électrovanne 24 V", 8]], lead: 22, late: 0, da: 4 },
  { n: 32, a: 11, sup: 7, lines: [["Cutter de découpe", 40], ["Bouchons d'oreille", 50]], lead: 5, late: 1, da: 2 },
  { n: 33, a: 8, sup: 19, lines: [["MDI polymérique", 10]], lead: 38, late: 0, da: 6 },
  { n: 34, a: 6, sup: 5, lines: [["Moteur asynchrone 7,5 kW", 1], ["Résistance chauffante ensacheuse", 5]], lead: 15, late: 0, da: 5 },
  { n: 35, a: 4, sup: 9, lines: [["Filtre à air compresseur", 4]], lead: 6, late: 0, da: 3 },
  // Non-conformités ouvertes : livraison en avance, avec une partie refusée (le BC reste partiellement reçu, non en retard).
  { n: 36, a: 12, sup: 3, lines: [["Tissu jacquard damassé", 10]], lead: 14, late: -6, da: 3, refuse: { item: "Tissu jacquard damassé", qty: 1, reason: "ABIME" } },
  { n: 37, a: 20, sup: 1, lines: [["Colle de contrecollage", 8]], lead: 20, late: -8, da: 3, refuse: { item: "Colle de contrecollage", qty: 1, reason: "NON_CONFORME" } },
  // BC en retard, à relancer (un par acheteur).
  { n: 38, a: 26, sup: 4, lines: [["Courroie trapézoïdale SPB 2000", 6]], lead: 7, late: 0, da: 3, stop: "SENT" },
  { n: 39, a: 21, sup: 15, lines: [["Courroie crantée HTD 8M", 40]], lead: 15, late: 0, da: 5, stop: "CONFIRMED" },
  // BC validés à envoyer, et BC à valider.
  { n: 40, a: 2, sup: 7, lines: [["Gants de manutention", 100]], lead: 6, late: 0, da: 2, stop: "APPROVED" },
  { n: 41, a: 1, sup: 21, lines: [["Filtre à air compresseur", 3]], lead: 25, late: 0, da: 3, stop: "APPROVED" },
  { n: 42, a: 1, sup: 10, lines: [["Joint hydraulique 63 mm", 8]], lead: 10, late: 0, da: 2, stop: "SUBMITTED" },
];

/** Articles vidés après une réception (ruptures de la période) : le stock est ramené à 0 par une sortie. */
const DRAINS: { after: number; item: string; daysAgo: number }[] = [
  { after: 20, item: "Toner imprimante", daysAgo: 40 },
  { after: 29, item: "Capteur de proximité inductif", daysAgo: 5 },
  { after: 32, item: "Cutter de découpe", daysAgo: 3 },
];

interface RequestOnly {
  n: number;
  daysAgo: number;
  buyer: "local" | "import";
  item: string;
  qty: number;
  status: "SOUMISE" | "VALIDEE";
  urgency?: "NORMALE" | "URGENTE" | "ARRET_PRODUCTION";
  reason: string;
}

const REQUESTS: RequestOnly[] = [
  { n: 1, daysAgo: 3, buyer: "local", item: "Aiguille de matelasseuse", qty: 4, status: "VALIDEE", reason: "Aiguilles de matelasseuse pour la ligne de matelassage." },
  { n: 2, daysAgo: 2, buyer: "import", item: "Résistance chauffante ensacheuse", qty: 6, status: "VALIDEE", reason: "Stock de résistances chauffantes pour l'ensacheuse." },
  { n: 3, daysAgo: 1, buyer: "local", item: "Courroie trapézoïdale SPZ 1250", qty: 6, status: "SOUMISE", urgency: "ARRET_PRODUCTION", reason: "Matelasseuse à l'arrêt : courroie coupée, remplacement urgent." },
  { n: 4, daysAgo: 1, buyer: "local", item: "Étalonnage des balances", qty: 1, status: "SOUMISE", reason: "Étalonnage annuel des balances de réception." },
];

const dayIso = (daysAgo: number): string => formatInTimeZone(new Date(Date.now() - daysAgo * DAY), TZ, "yyyy-MM-dd");
/** Instant du jour historique à `hh:mm` (Abidjan = UTC), jamais dans le futur. */
const atDay = (daysAgo: number, hh: number, mm = 0): Date => {
  const d = new Date(`${dayIso(daysAgo)}T${String(hh).padStart(2, "0")}:${String(mm).padStart(2, "0")}:00.000Z`);
  return d.getTime() > Date.now() ? new Date() : d;
};
const pad2 = (n: number) => String(n).padStart(2, "0");

/** `server-only` interdit l'import hors Next.js ; le seed est un script serveur : on le neutralise pour ce processus. */
function allowServerOnly() {
  const m = Module as unknown as { _load: (request: string, ...rest: unknown[]) => unknown };
  const original = m._load;
  m._load = function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return original.call(this, request, ...rest);
  };
}

export async function seedHistory(prisma: PrismaClient): Promise<void> {
  const users = new Map((await prisma.user.findMany({ select: { id: true, email: true, role: true, purchaseScope: true } })).map((u) => [u.email, u]));
  const resp = users.get("responsable@richbond.test");
  const local = users.get("acheteur.local@richbond.test");
  const imp = users.get("acheteur.import@richbond.test");
  const store = users.get("magasinier@richbond.test");
  if (!resp || !local || !imp || !store) return;
  const suppliers = new Map((await prisma.supplier.findMany()).map((s) => [s.code, s]));
  const items = new Map((await prisma.item.findMany()).map((i) => [i.name, i]));
  const warehouses = new Map((await prisma.warehouse.findMany()).map((w) => [w.code, w]));
  const department = await prisma.department.findFirst({ where: { code: "PROD" } });
  if (suppliers.size === 0 || items.size === 0 || !department) return; // référentiels absents : rien à créer

  // Taux plus anciens (-200 j) pour les BC import les plus anciens : copie du taux le plus ancien du seed.
  for (const code of ["EUR", "USD", "CNY"]) {
    const oldest = await prisma.exchangeRate.findFirst({ where: { currencyCode: code }, orderBy: { date: "asc" } });
    const target = new Date(`${dayIso(200)}T00:00:00.000Z`);
    if (oldest && oldest.date > target) {
      await prisma.exchangeRate.upsert({
        where: { currencyCode_date: { currencyCode: code, date: target } },
        update: {},
        create: { currencyCode: code, date: target, rate: oldest.rate, note: MARK },
      });
    }
  }

  allowServerOnly();
  const { db } = await import("../../src/lib/db");
  const { createRequest, submitRequest, approveRequest } = await import("../../src/modules/purchase-requests/service");
  const po = await import("../../src/modules/purchase-orders/service");
  const { createReceipt } = await import("../../src/modules/receiving/service");
  const { applyMovement } = await import("../../src/modules/stock/movements");
  const { classifyAbc } = await import("../../src/modules/stock/abc");

  const actor = (u: { id: string; role: "SUPER_ADMIN" | "RESPONSABLE_ACHATS" | "ACHETEUR" | "MAGASINIER"; purchaseScope: "LOCAL" | "IMPORT" | "ALL" | null }) => ({
    id: u.id,
    role: u.role,
    purchaseScope: u.purchaseScope,
  });
  const respA = actor(resp);
  const storeA = actor(store);
  const buyerFor = (type: "LOCAL" | "IMPORT") => actor(type === "IMPORT" ? imp : local);
  const reqVersion = async (id: string) => (await prisma.purchaseRequest.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })).updatedAt;
  const poVersion = async (id: string) => (await prisma.purchaseOrder.findUniqueOrThrow({ where: { id }, select: { updatedAt: true } })).updatedAt;
  const log = (m: string) => console.log(`[seed historique] ${m}`);

  try {
    // ---------------------------------------------------------------- BC historiques (du plus ancien au plus récent)
    for (const e of [...ENTRIES].sort((x, y) => y.a - x.a)) {
      const marker = `seed:lot08:${pad2(e.n)}`;
      if (await prisma.purchaseOrder.findFirst({ where: { internalNote: marker }, select: { id: true } })) continue;
      const supplier = suppliers.get(`FRS-${String(e.sup).padStart(5, "0")}`);
      if (!supplier) throw new Error(`Seed historique : fournisseur ${e.sup} introuvable.`);
      const buyer = buyerFor(supplier.type);
      const lines = await Promise.all(
        e.lines.map(async ([name, qty]) => {
          const item = items.get(name);
          if (!item) throw new Error(`Seed historique : article introuvable (${name}).`);
          const link = await prisma.itemSupplier.findUnique({ where: { itemId_supplierId: { itemId: item.id, supplierId: supplier.id } } });
          if (!link?.lastPrice || link.currencyCode !== supplier.currencyCode) throw new Error(`Seed historique : pas de prix de ${name} chez ${supplier.code}.`);
          return { item, qty, price: Number(link.lastPrice) };
        }),
      );
      const allPdr = lines.every((l) => l.item.category === "PDR");
      const warehouse = warehouses.get(allPdr ? "MAG-PDR" : "MAG-CENTRAL");
      if (!warehouse) throw new Error("Seed historique : dépôt introuvable.");

      const promisedDaysAgo = e.a - e.lead; // peut être négatif (futur)
      const promisedIso = dayIso(promisedDaysAgo);
      const daDay = e.a + e.da;

      // Demande d'achat (créée, soumise et validée le jour historique).
      const reason = `[démo historique ${pad2(e.n)}] ${lines.map((l) => l.item.name).join(", ")}`.slice(0, 200);
      let pr = await prisma.purchaseRequest.findFirst({ where: { reason }, include: { lines: true } });
      if (!pr) {
        const created = await createRequest(
          buyer,
          {
            departmentId: department.id,
            requesterName: "Service demandeur (démo)",
            reason,
            urgency: "NORMALE",
            neededBy: promisedIso < dayIso(daDay) ? dayIso(daDay) : promisedIso,
            type: supplier.type,
            lines: lines.map((l) => ({ itemId: l.item.id, quantity: l.qty, unit: l.item.purchaseUnit })),
          },
          null,
          atDay(daDay, 9),
        );
        await submitRequest(buyer, { id: created.id, expectedUpdatedAt: await reqVersion(created.id) }, null, atDay(daDay, 9, 30));
        await approveRequest(
          respA,
          { id: created.id, expectedUpdatedAt: await reqVersion(created.id), type: supplier.type, buyerId: buyer.id },
          null,
          atDay(daDay, 10),
        );
        pr = await prisma.purchaseRequest.findUniqueOrThrow({ where: { id: created.id }, include: { lines: true } });
      }
      const lineOf = (itemId: string) => pr!.lines.find((l) => l.itemId === itemId);

      // Bon de commande.
      const draft = await po.createDraft(
        buyer,
        {
          supplierId: supplier.id,
          origin: "DA",
          warehouseId: warehouse.id,
          requestedDate: promisedIso < dayIso(e.a + 1) ? dayIso(e.a + 1) : promisedIso,
          incoterm: supplier.type === "IMPORT" ? (supplier.incoterm ?? "FOB") : null,
          incotermPlace: supplier.type === "IMPORT" ? "Port de départ (fictif)" : null,
          internalNote: marker,
          lines: lines.map((l) => ({
            itemId: l.item.id,
            quantity: l.qty,
            unit: l.item.purchaseUnit,
            unitPrice: l.price,
            allocations: [{ requestLineId: lineOf(l.item.id)!.id, qty: l.qty }],
          })),
        },
        null,
        atDay(e.a + 1, 10),
      );
      const reached = (s: Step) => !e.stop || STEP_ORDER.indexOf(e.stop) >= STEP_ORDER.indexOf(s);
      await po.submitOrder(buyer, { id: draft.id, expectedUpdatedAt: await poVersion(draft.id) }, null, atDay(e.a + 1, 11));
      if (reached("APPROVED")) {
        await po.approveOrder(respA, { id: draft.id, expectedUpdatedAt: await poVersion(draft.id) }, null, atDay(e.a, 9, 30));
      }
      if (reached("SENT") && e.stop !== "APPROVED") {
        await po.markSent(buyer, { id: draft.id, expectedUpdatedAt: await poVersion(draft.id), channel: "EMAIL", sentDate: dayIso(e.a), contact: null }, null, atDay(e.a, 14));
      }
      if (reached("CONFIRMED") && e.stop !== "APPROVED" && e.stop !== "SENT") {
        await po.confirmOrder(
          buyer,
          { id: draft.id, expectedUpdatedAt: await poVersion(draft.id), promisedDate: promisedIso, supplierRef: null },
          null,
          atDay(Math.max(e.a - 1, 0), 10),
        );
      }

      // Réception (jour = date promise + retard), seulement si elle est passée et que le BC n'a pas été arrêté avant.
      const receiptDaysAgo = e.a - e.lead - e.late;
      if (!e.stop && receiptDaysAgo >= 0) {
        const poLines = await prisma.purchaseOrderLine.findMany({ where: { orderId: draft.id }, orderBy: { lineNo: "asc" } });
        await createReceipt(
          storeA,
          {
            orderId: draft.id,
            deliveryNoteRef: `BL-H${pad2(e.n)}`,
            receivedAt: dayIso(receiptDaysAgo),
            carrier: "Transporteur (démo)",
            comment: `Livraison fictive (${MARK}).`,
            lines: poLines.map((l) => {
              const isRefused = e.refuse && items.get(e.refuse.item)?.id === l.itemId;
              const qty = Number(l.quantity);
              return isRefused
                ? { orderLineId: l.id, deliveredQty: qty, acceptedQty: qty - e.refuse!.qty, refusedQty: e.refuse!.qty, refusalReason: e.refuse!.reason }
                : { orderLineId: l.id, deliveredQty: qty, acceptedQty: qty };
            }),
          },
          null,
          atDay(receiptDaysAgo, 15),
        );
      }
      log(`BC ${pad2(e.n)} créé`);

      // Articles vidés juste après leur dernière réception : rupture de la période.
      for (const d of DRAINS.filter((x) => x.after === e.n)) {
        const item = items.get(d.item);
        if (!item) continue;
        if (await prisma.stockMovement.findFirst({ where: { itemId: item.id, type: "SORTIE", comment: MARK }, select: { id: true } })) continue;
        const levels = await prisma.stockLevel.findMany({ where: { itemId: item.id, quantity: { gt: 0 } } });
        for (const lv of levels) {
          await prisma.$transaction(async (tx) => {
            await applyMovement(tx, {
              itemId: item.id,
              warehouseId: lv.warehouseId,
              type: "SORTIE",
              quantity: -Number(lv.quantity),
              documentType: "SORTIE",
              documentRef: `SOR-DEMO-H${pad2(e.n)}`,
              comment: MARK,
              occurredAt: atDay(d.daysAgo, 11),
              createdById: store.id,
            });
          });
        }
      }
    }

    // ---------------------------------------------------------------- DA à valider et DA assignées (sans BC)
    for (const r of REQUESTS) {
      const reason = `[démo historique DA${pad2(r.n)}] ${r.reason}`;
      if (await prisma.purchaseRequest.findFirst({ where: { reason }, select: { id: true } })) continue;
      const item = items.get(r.item);
      if (!item) continue;
      const buyer = buyerFor(r.buyer === "import" ? "IMPORT" : "LOCAL");
      const created = await createRequest(
        buyer,
        {
          departmentId: department.id,
          requesterName: "Service demandeur (démo)",
          reason,
          urgency: r.urgency ?? "NORMALE",
          neededBy: r.urgency === "ARRET_PRODUCTION" ? null : dayIso(-14),
          type: r.buyer === "import" ? "IMPORT" : "LOCAL",
          lines: [{ itemId: item.id, quantity: r.qty, unit: item.purchaseUnit }],
        },
        null,
        atDay(r.daysAgo, 9),
      );
      await submitRequest(buyer, { id: created.id, expectedUpdatedAt: await reqVersion(created.id) }, null, atDay(r.daysAgo, 9, 30));
      if (r.status === "VALIDEE") {
        await approveRequest(
          respA,
          { id: created.id, expectedUpdatedAt: await reqVersion(created.id), type: r.buyer === "import" ? "IMPORT" : "LOCAL", buyerId: buyer.id },
          null,
          atDay(r.daysAgo, 10),
        );
      }
    }

    // ---------------------------------------------------------------- classe ABC recalculée (mêmes règles que « Recalculer »)
    const from = new Date(Date.now() - 365 * DAY);
    const [all, sums] = await Promise.all([
      prisma.item.findMany({ where: { stocked: true }, select: { id: true } }),
      prisma.stockMovement.groupBy({ by: ["itemId"], where: { type: "SORTIE", occurredAt: { gte: from } }, _sum: { value: true } }),
    ]);
    const valueById = new Map(sums.map((s) => [s.itemId, -(s._sum.value ?? 0)]));
    const classes = classifyAbc(all.map((i) => ({ id: i.id, value: valueById.get(i.id) ?? 0 })));
    const computedAt = new Date();
    for (const cls of ["A", "B", "C"] as const) {
      const ids = all.filter((i) => classes.get(i.id) === cls).map((i) => i.id);
      if (ids.length) await prisma.item.updateMany({ where: { id: { in: ids } }, data: { abcClass: cls, abcComputedAt: computedAt } });
    }
  } finally {
    await db.$disconnect();
  }
}
