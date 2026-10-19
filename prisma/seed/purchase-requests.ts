/**
 * Demandes d'achat fictives (LOT-04) dans tous les statuts utiles à la démonstration.
 * Aucune donnée réelle. Idempotent : clé = motif commençant par « [démo] » ; une DA déjà présente n'est pas recréée
 * (et ne consomme donc aucun numéro). Les numéros DA-AAAA-NNNNN sont pris dans le compteur, dans l'ordre de soumission.
 */
import { formatInTimeZone } from "date-fns-tz";
import type { Prisma } from "../../src/generated/prisma/client";
import type {
  NotificationSeverity,
  PrismaClient,
  PurchaseRequestEventType,
  PurchaseRequestKind,
  PurchaseRequestStatus,
  PurchaseRequestType,
  PurchaseRequestUrgency,
} from "../../src/generated/prisma/client";
import { formatDocumentNumber } from "../../src/modules/numbering/format";
import { nextNumberWith } from "../../src/modules/numbering/next";
import { estimatedTotal } from "../../src/modules/purchase-requests/totals";

const TZ = "Africa/Abidjan";
const DAY = 86_400_000;

function dayAt(offsetDays: number): Date {
  const d = new Date(Date.now() + offsetDays * DAY);
  return new Date(`${formatInTimeZone(d, TZ, "yyyy-MM-dd")}T00:00:00.000Z`);
}
const ago = (days: number, hours = 0) => new Date(Date.now() - days * DAY + hours * 3_600_000);

interface LineSeed {
  item?: string; // nom d'article du seed
  free?: string;
  unit?: string; // obligatoire pour une désignation libre
  qty: number;
  price?: number; // FCFA par unité saisie
  approved?: number;
}

interface PrSeed {
  reason: string;
  status: PurchaseRequestStatus;
  kind?: PurchaseRequestKind;
  urgency?: PurchaseRequestUrgency;
  type: PurchaseRequestType;
  creator: string; // e-mail
  dept: string; // code service
  requester: string;
  neededIn: number; // jours
  createdDaysAgo: number;
  buyer?: string; // e-mail de l'acheteur assigné
  comment?: string; // motif de refus / annulation, commentaire de retour
  resubmitted?: boolean;
  lines: LineSeed[];
}

const RESP = "responsable@richbond.test";
const LOCAL = "acheteur.local@richbond.test";
const IMPORT = "acheteur.import@richbond.test";
const MAG = "magasinier@richbond.test";

const PRS: PrSeed[] = [
  {
    reason: "[démo] Courroies de rechange pour la matelasseuse",
    status: "BROUILLON", type: "LOCAL", creator: LOCAL, dept: "MAINT", requester: "Kouadio Yao", neededIn: 20, createdDaysAgo: 1,
    lines: [{ item: "Courroie trapézoïdale SPZ 1250", qty: 4, price: 8500 }, { item: "Courroie crantée HTD 8M", qty: 2, price: 21000 }],
  },
  {
    reason: "[démo] Capteur laser de positionnement pour la découpe",
    status: "BROUILLON", type: "IMPORT", creator: IMPORT, dept: "PROD", requester: "Awa Traoré", neededIn: 45, createdDaysAgo: 2,
    lines: [{ free: "Capteur laser de positionnement (référence à confirmer)", unit: "U", qty: 1, price: 450000 }],
  },
  {
    reason: "[démo] Fournitures de bureau du trimestre",
    status: "SOUMISE", type: "LOCAL", creator: LOCAL, dept: "ADM", requester: "Mariam Koné", neededIn: 12, createdDaysAgo: 3,
    lines: [{ item: "Rame papier A4", qty: 20, price: 3200 }, { item: "Toner imprimante", qty: 2, price: 48000 }],
  },
  {
    reason: "[démo] Réapprovisionnement polyol avant le pic de production",
    status: "SOUMISE", urgency: "URGENTE", type: "IMPORT", creator: IMPORT, dept: "PROD", requester: "Serge N'Guessan", neededIn: 10, createdDaysAgo: 2,
    lines: [{ item: "Polyol polyéther PO-3000", qty: 20, price: 249000 }],
  },
  {
    reason: "[démo] Ligne mousse continue arrêtée – roulement 6308",
    status: "SOUMISE", urgency: "ARRET_PRODUCTION", type: "LOCAL", creator: LOCAL, dept: "MAINT", requester: "Kouadio Yao", neededIn: 0, createdDaysAgo: 0,
    lines: [{ item: "Roulement 6308", qty: 2, price: 38000 }],
  },
  {
    reason: "[démo] Capteurs de proximité pour l'ensacheuse",
    status: "A_COMPLETER", type: "LOCAL", creator: LOCAL, dept: "MAINT", requester: "Ibrahim Diallo", neededIn: 15, createdDaysAgo: 5,
    comment: "Précisez le modèle du capteur et la machine concernée.",
    lines: [{ item: "Capteur de proximité inductif", qty: 3, price: 27500 }],
  },
  {
    reason: "[démo] Roulements et joints pour la presse hydraulique",
    status: "VALIDEE", type: "LOCAL", creator: IMPORT, dept: "MAINT", requester: "Kouadio Yao", neededIn: 18, createdDaysAgo: 6, buyer: LOCAL,
    lines: [{ item: "Roulement 6205", qty: 10, price: 6500, approved: 6 }, { item: "Joint hydraulique 63 mm", qty: 4, price: 14500 }],
  },
  {
    reason: "[démo] Tissu matelassé pour la commande export",
    status: "VALIDEE", type: "IMPORT", creator: IMPORT, dept: "PROD", requester: "Awa Traoré", neededIn: 40, createdDaysAgo: 8, buyer: IMPORT,
    lines: [{ item: "Tissu jacquard damassé", qty: 6, price: 410000 }],
  },
  {
    reason: "[démo] Moteur de rechange pour le convoyeur",
    status: "REFUSEE", type: "LOCAL", creator: LOCAL, dept: "MAINT", requester: "Ibrahim Diallo", neededIn: 30, createdDaysAgo: 9,
    comment: "Un moteur identique est disponible en stock : utilisez-le avant d'acheter.",
    lines: [{ item: "Moteur asynchrone 7,5 kW", qty: 1, price: 780000 }],
  },
  {
    reason: "[démo] Gants de manutention (doublon saisi par erreur)",
    status: "ANNULEE", type: "LOCAL", creator: LOCAL, dept: "LOG", requester: "Fatou Bamba", neededIn: 14, createdDaysAgo: 10,
    comment: "Doublon avec une autre demande.",
    lines: [{ item: "Gants de manutention", qty: 50, price: 1800 }],
  },
  {
    reason: "[démo] Réapprovisionnement EPI du magasin",
    status: "SOUMISE", kind: "REAPPRO", type: "A_DEFINIR", creator: MAG, dept: "LOG", requester: "Fatou Bamba", neededIn: 9, createdDaysAgo: 1,
    lines: [{ item: "Gants de manutention", qty: 100 }, { item: "Bouchons d'oreille", qty: 200 }],
  },
];

const PRIORITY = { ARRET_PRODUCTION: 0, URGENTE: 1, NORMALE: 2 } as const;

export async function seedPurchaseRequests(prisma: PrismaClient): Promise<void> {
  const users = new Map((await prisma.user.findMany({ select: { id: true, email: true } })).map((u) => [u.email, u.id]));
  const depts = new Map((await prisma.department.findMany({ select: { id: true, code: true } })).map((d) => [d.code, d.id]));
  const items = new Map((await prisma.item.findMany()).map((i) => [i.name, i]));
  if (!users.has(RESP) || items.size === 0) return; // référentiels absents : rien à créer

  const uid = (email: string) => {
    const id = users.get(email);
    if (!id) throw new Error(`Seed DA : utilisateur introuvable (${email}).`);
    return id;
  };
  const year = Number(formatInTimeZone(new Date(), TZ, "yyyy"));

  for (const s of PRS) {
    if (await prisma.purchaseRequest.findFirst({ where: { reason: s.reason }, select: { id: true } })) continue;
    const urgency = s.urgency ?? "NORMALE";
    const kind = s.kind ?? "STANDARD";
    const submitted = s.status !== "BROUILLON";
    const created = ago(s.createdDaysAgo, -2);
    const t = (hours: number) => new Date(created.getTime() + hours * 3_600_000);

    const lines = s.lines.map((l, i) => {
      const it = l.item ? items.get(l.item) : undefined;
      if (l.item && !it) throw new Error(`Seed DA : article introuvable (${l.item}).`);
      const unit = it ? it.purchaseUnit : l.unit!;
      const stockQty = it ? Math.round(l.qty * Number(it.conversionFactor) * 1000) / 1000 : null;
      return {
        lineNo: i + 1,
        itemId: it?.id ?? null,
        freeDesignation: it ? null : (l.free ?? null),
        quantity: l.qty,
        approvedQty: s.status === "VALIDEE" ? (l.approved ?? l.qty) : null,
        unit,
        stockQty,
        estimatedUnitPrice: kind === "REAPPRO" ? null : (l.price ?? null),
      };
    });
    const total = estimatedTotal(lines.map((l) => ({ quantity: l.quantity, approvedQty: l.approvedQty, estimatedUnitPrice: l.estimatedUnitPrice })));

    await prisma.$transaction(async (tx) => {
      const number = submitted ? formatDocumentNumber("DA", year, await nextNumberWith(tx, "DA", year)) : null;
      const approvedAt = s.status === "VALIDEE" ? t(20) : null;
      const pr = await tx.purchaseRequest.create({
        data: {
          number,
          status: s.status,
          kind,
          urgency,
          priority: PRIORITY[urgency],
          type: s.type,
          departmentId: depts.get(s.dept) ?? [...depts.values()][0],
          requesterName: s.requester,
          reason: s.reason,
          neededBy: dayAt(s.neededIn),
          estimatedTotal: kind === "REAPPRO" ? null : total,
          createdById: uid(s.creator),
          submittedAt: submitted ? t(2) : null,
          approvedAt,
          approvedById: approvedAt ? uid(RESP) : null,
          rejectedReason: s.status === "REFUSEE" ? s.comment : null,
          cancelledReason: s.status === "ANNULEE" ? s.comment : null,
          cancelledAt: s.status === "ANNULEE" ? t(26) : null,
          cancelledById: s.status === "ANNULEE" ? uid(s.creator) : null,
          assignedBuyerId: s.buyer ? uid(s.buyer) : null,
          createdAt: created,
          lines: { create: lines },
        },
      });

      const ev = (type: PurchaseRequestEventType, email: string, hours: number, extra: { from?: PurchaseRequestStatus; to?: PurchaseRequestStatus; comment?: string; payload?: Record<string, unknown> } = {}) =>
        tx.purchaseRequestEvent.create({
          data: {
            requestId: pr.id,
            type,
            userId: uid(email),
            fromStatus: extra.from ?? null,
            toStatus: extra.to ?? null,
            comment: extra.comment ?? null,
            payload: extra.payload as Prisma.InputJsonValue | undefined,
            createdAt: t(hours),
          },
        });
      await ev("CREATED", s.creator, 0, { to: "BROUILLON" });
      if (submitted) await ev("SUBMITTED", s.creator, 2, { from: "BROUILLON", to: "SOUMISE", payload: { number } });
      if (s.status === "A_COMPLETER") await ev("RETURNED", RESP, 20, { from: "SOUMISE", to: "A_COMPLETER", comment: s.comment });
      if (s.status === "REFUSEE") await ev("REJECTED", RESP, 20, { from: "SOUMISE", to: "REFUSEE", comment: s.comment });
      if (s.status === "ANNULEE") await ev("CANCELLED", s.creator, 26, { from: "SOUMISE", to: "ANNULEE", comment: s.comment });
      if (s.status === "VALIDEE") {
        for (const [i, l] of s.lines.entries()) {
          if (l.approved !== undefined && l.approved !== l.qty) {
            await ev("QTY_CHANGED", RESP, 20, {
              payload: { lineNo: i + 1, designation: l.item ?? l.free ?? "", before: String(l.qty), after: String(l.approved) },
            });
          }
        }
        await ev("APPROVED", RESP, 21, {
          from: "SOUMISE",
          to: "VALIDEE",
          payload: { autoApproved: false, type: s.type, assignedBuyerId: s.buyer ? uid(s.buyer) : null },
        });
      }

      // Notifications de démonstration (cloche de l'en-tête)
      const notify = async (to: string, type: string, severity: NotificationSeverity, title: string, body?: string) => {
        await tx.notification.create({
          data: { recipientId: uid(to), type, severity, title, body: body ?? null, link: `/achats/demandes/${pr.id}`, entity: "PurchaseRequest", entityId: pr.id, createdAt: t(21) },
        });
      };
      if (s.status === "SOUMISE") {
        await notify(
          RESP,
          "PR_SUBMITTED",
          urgency === "ARRET_PRODUCTION" ? "CRITIQUE" : urgency === "URGENTE" ? "IMPORTANT" : "INFO",
          urgency === "ARRET_PRODUCTION" ? `Arrêt de production : ${number} à valider` : `${number} à valider`,
          s.reason.replace("[démo] ", ""),
        );
      }
      if (s.status === "VALIDEE" && s.buyer) await notify(s.buyer, "PR_ASSIGNED", "INFO", `${number} validée et assignée à vous`);
      if (s.status === "A_COMPLETER") await notify(s.creator, "PR_RETURNED", "IMPORTANT", `${number} renvoyée pour complément`, s.comment);
      if (s.status === "REFUSEE") await notify(s.creator, "PR_REJECTED", "IMPORTANT", `${number} refusée`, s.comment);
    });
  }
}
