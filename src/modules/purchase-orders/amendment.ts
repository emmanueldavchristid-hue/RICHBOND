import "server-only";
import { Prisma } from "@/generated/prisma/client";
import { db } from "@/lib/db";
import { now } from "@/lib/clock";
import { log } from "@/modules/audit";
import { notify } from "@/modules/notifications";
import { parseInput } from "@/modules/purchase-requests/parse";
import { refreshOrderedStatus } from "@/modules/purchase-requests/service";
import { loadFull, loadLocked, lockRequests, orderLink, orderedByRequestLine, orderResult, recordEvent, sourceRequests, toWorkflow, type OrderActor, type OrderResult } from "./internal";
import { displayOrderNumber } from "./labels";
import { abandonAmendmentSchema, startAmendmentSchema } from "./schemas";
import { restorePreviousVersion } from "./service";
import { buildSnapshot } from "./snapshot";
import { assertTransition } from "./workflow";

/**
 * D16 : avenant sur un BC validé / envoyé / confirmé dont rien n'a été reçu. Le BC repasse en BROUILLON avec
 * `version + 1` ; il garde son numéro (affiché « BC-2026-00042 v2 »). Après soumission puis validation, il repart
 * « validé » (à renvoyer au fournisseur) ; refusé ou abandonné, il retrouve exactement la version précédente.
 */
export async function startAmendment(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<OrderResult> {
  const input = parseInput(startAmendmentSchema, raw);
  return db.$transaction(async (tx) => {
    const po = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    assertTransition(toWorkflow(po), "startAmendment", actor);
    // La version courante doit exister en instantané pour pouvoir être restaurée (BC validés avant le LOT-05 : on la fige ici).
    const known = await tx.purchaseOrderVersion.findUnique({ where: { orderId_version: { orderId: po.id, version: po.version } } });
    if (!known) {
      const snap = buildSnapshot(po, {
        approvedAt: po.approvedAt ?? at,
        approvedById: po.approvedById ?? actor.id,
        approvedByName: po.approvedBy?.name ?? "",
        autoApproved: false,
        underThreshold: false,
      });
      await tx.purchaseOrderVersion.create({
        data: { orderId: po.id, version: po.version, snapshot: snap as unknown as Prisma.InputJsonValue, approvedAt: po.approvedAt ?? at, approvedById: po.approvedById ?? actor.id },
      });
    }
    const after = await tx.purchaseOrder.update({
      where: { id: po.id },
      data: { version: po.version + 1, resumeStatus: po.status, status: "BROUILLON", submittedAt: null },
    });
    await recordEvent(tx, { orderId: po.id, version: after.version, type: "AMENDMENT_STARTED", userId: actor.id, from: po.status, to: "BROUILLON", comment: input.reason, at });
    await log(tx, {
      userId: actor.id,
      action: "PO_AMEND_START",
      entity: "PurchaseOrder",
      entityId: po.id,
      before: { status: po.status, version: po.version },
      after: { status: after.status, version: after.version, resumeStatus: po.status, reason: input.reason },
      ip,
    });
    if (po.createdById !== actor.id) {
      await notify(tx, [po.createdById], {
        type: "PO_AMENDMENT",
        title: `Avenant ouvert sur ${displayOrderNumber(po)}`,
        body: input.reason.slice(0, 200),
        link: orderLink(po.id),
        entity: "PurchaseOrder",
        entityId: po.id,
      });
    }
    return orderResult(after);
  });
}

/** Abandon d'un avenant (brouillon ou à valider) : version précédente et statut d'origine restaurés à l'identique. */
export async function abandonAmendment(actor: OrderActor, raw: unknown, ip?: string | null, at: Date = now()): Promise<OrderResult> {
  const input = parseInput(abandonAmendmentSchema, raw);
  return db.$transaction(async (tx) => {
    const po = await loadLocked(tx, input.id, input.expectedUpdatedAt);
    const { to } = assertTransition(toWorkflow(po), "abandonAmendment", actor);
    await restorePreviousVersion(tx, po);
    const after = await loadFull(tx, po.id);
    await recordEvent(tx, { orderId: po.id, version: po.version, type: "AMENDMENT_ABANDONED", userId: actor.id, from: po.status, to: to!, comment: input.reason, at });
    await log(tx, {
      userId: actor.id,
      action: "PO_AMEND_ABANDON",
      entity: "PurchaseOrder",
      entityId: po.id,
      before: { status: po.status, version: po.version },
      after: { status: after.status, version: after.version, reason: input.reason },
      ip,
    });
    const sources = await sourceRequests(tx, after);
    await lockRequests(tx, sources.map((s) => s.id));
    for (const s of sources) await refreshOrderedStatus(tx, s.id, await orderedByRequestLine(tx, s.id), actor, at);
    return orderResult(after);
  });
}
