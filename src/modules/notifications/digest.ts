import "server-only";
import { db } from "@/lib/db";
import { now as clockNow } from "@/lib/clock";
import { todayAbidjan } from "@/lib/dates";
import { log } from "@/modules/audit/log";
import { buyerDashboard, ruptureRisks, storekeeperDashboard } from "@/modules/reporting";
import { countOrdersLate } from "@/modules/reporting/queries";
import { invoiceCounters } from "@/modules/invoices/queries";
import {
  DIGEST_ENTITY,
  DIGEST_LOCK,
  DIGEST_TYPE,
  composeDigest,
  digestKey,
  slotFor,
  type DigestContent,
  type DigestLine,
  type DigestSlot,
} from "./digest-format";

export { slotFor, digestKey, type DigestSlot, type DigestContent } from "./digest-format";

const UNCONFIRMED_AFTER_DAYS = 3;
const DAY_MS = 86_400_000;

export interface DigestUser {
  id: string;
  role: "RESPONSABLE_ACHATS" | "ACHETEUR" | "MAGASINIER" | "SUPER_ADMIN";
}

/** BC envoyés au fournisseur depuis au moins 3 jours, toujours sans confirmation. */
export async function countUnconfirmedOrders(at: Date, createdById?: string): Promise<number> {
  return db.purchaseOrder.count({
    where: {
      status: "ENVOYE",
      sentAt: { lte: new Date(at.getTime() - UNCONFIRMED_AFTER_DAYS * DAY_MS) },
      ...(createdById ? { createdById } : {}),
    },
  });
}

/**
 * Contenu du digest d'un utilisateur, ou null s'il n'y a rien à signaler (aucune notification vide).
 * Les sujets sans source de données (jalons import, inventaires, consultations, réceptions
 * non validées : la réception est validée en une étape) sont volontairement omis.
 */
export async function buildDigestFor(
  user: DigestUser,
  at: Date = clockNow(),
  slot: DigestSlot = slotFor(at),
): Promise<DigestContent | null> {
  const today = todayAbidjan(at);
  let lines: DigestLine[] = [];

  if (user.role === "RESPONSABLE_ACHATS") {
    const [da, stops, bc, late, risks, unconfirmed, inv] = await Promise.all([
      db.purchaseRequest.count({ where: { status: "SOUMISE" } }),
      db.purchaseRequest.count({ where: { status: "SOUMISE", priority: 0 } }),
      db.purchaseOrder.count({ where: { status: "A_VALIDER" } }),
      countOrdersLate(today),
      ruptureRisks(at),
      countUnconfirmedOrders(at),
      invoiceCounters(at),
    ]);
    lines = [
      { label: "DA à valider", count: da, href: "/achats/demandes?onglet=a-valider", tone: stops > 0 ? "critical" : "attention" },
      { label: "dont arrêts de production", count: stops, href: "/achats/demandes?onglet=a-valider", tone: "critical" },
      { label: "BC à valider", count: bc, href: "/achats/commandes?onglet=a-valider", tone: "attention" },
      { label: "BC en retard", count: late, href: "/achats/commandes?onglet=en-retard", tone: "critical" },
      { label: "Articles critiques en risque de rupture", count: risks.total, href: "/stock/reappro", tone: "critical" },
      { label: `BC sans confirmation depuis ${UNCONFIRMED_AFTER_DAYS} jours`, count: unconfirmed, href: "/achats/commandes?onglet=en-cours&statut=ENVOYE", tone: "attention" },
      { label: "Factures à mettre en bon à payer", count: inv.conforme, href: "/achats/factures?onglet=a-traiter", tone: "attention" },
      { label: "Factures en écart", count: inv.ecart, href: "/achats/factures?onglet=ecarts", tone: "attention" },
    ];
  } else if (user.role === "ACHETEUR") {
    const [dash, unconfirmed, inv] = await Promise.all([buyerDashboard(user, at), countUnconfirmedOrders(at, user.id), invoiceCounters(at, user)]);
    lines = [
      ...dash.cards.map((c) => ({
        label: c.label,
        count: c.count,
        href: c.href,
        tone: c.key === "mes-bc-en-retard" ? ("critical" as const) : ("attention" as const),
      })),
      { label: `BC sans confirmation depuis ${UNCONFIRMED_AFTER_DAYS} jours`, count: unconfirmed, href: `/achats/commandes?onglet=en-cours&statut=ENVOYE&acheteur=${user.id}`, tone: "attention" },
      { label: "Factures à échéance cette semaine", count: inv.dueWeek, href: "/achats/factures?echeance=semaine", tone: "attention" },
    ];
  } else if (user.role === "MAGASINIER") {
    const dash = await storekeeperDashboard(user, at);
    lines = dash.cards
      .filter((c) => c.key !== "livraisons-semaine")
      .map((c) => ({
        label: c.label,
        count: c.count,
        href: c.href,
        tone: c.key === "livraisons-retard" ? ("critical" as const) : ("attention" as const),
      }));
  } else {
    return null; // Super-admin : pas de digest métier.
  }
  return composeDigest(lines, slot);
}

export interface DigestRunResult {
  key: string;
  slot: DigestSlot;
  created: number;
  skipped: number;
}

/**
 * Crée une notification DIGEST par utilisateur actif pour le créneau. Idempotent : clé
 * `entity='digest'`, `entityId='<jour Abidjan>-<créneau>'`, vérifiée sous verrou consultatif
 * (deux appels simultanés ou répétés ne créent aucun doublon).
 */
export async function runAlertDigest(
  slot: DigestSlot = slotFor(clockNow()),
  at: Date = clockNow(),
): Promise<DigestRunResult> {
  const key = digestKey(at, slot);
  const users = await db.user.findMany({ where: { active: true }, select: { id: true, role: true } });
  const contents = new Map<string, DigestContent>();
  for (const u of users) {
    const c = await buildDigestFor(u, at, slot);
    if (c) contents.set(u.id, c);
  }

  return db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${DIGEST_LOCK}))`;
    const existing = await tx.notification.findMany({
      where: { type: DIGEST_TYPE, entity: DIGEST_ENTITY, entityId: key },
      select: { recipientId: true },
    });
    const done = new Set(existing.map((e) => e.recipientId));
    const data = [...contents]
      .filter(([id]) => !done.has(id))
      .map(([recipientId, c]) => ({
        recipientId,
        type: DIGEST_TYPE,
        severity: c.severity,
        title: c.title,
        body: c.body,
        link: c.link,
        entity: DIGEST_ENTITY,
        entityId: key,
      }));
    if (data.length > 0) {
      await tx.notification.createMany({ data });
      await log(tx, { userId: null, action: "DIGEST_RUN", entity: "Notification", entityId: key, after: { slot, created: data.length } });
    }
    return { key, slot, created: data.length, skipped: users.length - data.length };
  });
}
