import "server-only";
import { formatInTimeZone } from "date-fns-tz";
import { db } from "@/lib/db";
import { getNow, now as clockNow } from "@/lib/clock";
import { BusinessError } from "@/lib/errors";
import * as audit from "@/modules/audit";
import type { Prisma } from "@/generated/prisma/client";
import { fingerprint, getLicenseSecret, normalizeLicensedTo, verifyLicenseKey } from "./key";
import type { ActivateLicenseInput, ExtendTrialInput } from "./schemas";
import { computeLicenseState, computeTrialEnd, effectiveNow, endOfDayAbidjan, type LicenseState } from "./state";

type Tx = Pick<Prisma.TransactionClient, "license" | "auditLog">;type Actor = { id: string };

const MAX_FAILURES = 5;
const FAILURE_WINDOW_MS = 15 * 60_000;
const LAST_SEEN_STEP_MS = 3_600_000;

/** Crée la licence unique si absente (idempotent, sûr en concurrence). */
export async function ensureLicense(tx: Tx = db) {
  const existing = await tx.license.findFirst({ where: { singleton: true } });
  if (existing) return existing;
  const start = clockNow();
  const { trialEndsAt, warnings } = computeTrialEnd(process.env, start);
  for (const w of warnings) console.warn(w);
  const created = await tx.license.createMany({
    data: [{ status: "TRIAL", trialStartsAt: start, trialEndsAt }],
    skipDuplicates: true,
  });
  const license = await tx.license.findFirstOrThrow({ where: { singleton: true } });
  if (created.count === 1) {
    await audit.log(tx, {
      userId: null,
      action: "LICENSE_INIT",
      entity: "License",
      entityId: license.id,
      after: { status: license.status, trialStartsAt: license.trialStartsAt, trialEndsAt: license.trialEndsAt },
    });
  }
  return license;
}

export interface LicenseView extends LicenseState {
  /** Heure serveur utilisée pour le calcul (le client en déduit son décalage). */
  serverNow: Date;
}

/** État courant (statut calculé, jamais persisté : B1) avec anti-recul d'horloge (B3). */
export async function getLicenseState(): Promise<LicenseView> {
  const license = await ensureLicense();
  const { now, simulated } = await getNow();
  const effective = simulated ? now : effectiveNow(now, license.lastSeenAt);
  if (!simulated && (!license.lastSeenAt || now.getTime() - license.lastSeenAt.getTime() > LAST_SEEN_STEP_MS)) {
    await db.license
      .updateMany({
        where: { id: license.id, OR: [{ lastSeenAt: null }, { lastSeenAt: { lt: now } }] },
        data: { lastSeenAt: now },
      })
      .catch(() => undefined);
  }
  return { ...computeLicenseState(license, effective), serverNow: effective };
}

/** Prolonge (ou raccourcit, avec confirmation) l'essai. Super-admin uniquement (garde dans l'action). */
export async function extendTrial(user: Actor, input: ExtendTrialInput) {
  const { now } = await getNow();
  return db.$transaction(async (tx) => {
    const license = await ensureLicense(tx);
    if (license.status === "ACTIVE") {
      throw new BusinessError("LICENSE_ALREADY_ACTIVE", "La licence est déjà active : aucune prolongation possible.");
    }
    const today = formatInTimeZone(effectiveNow(now, license.lastSeenAt), "Africa/Abidjan", "yyyy-MM-dd");
    if (input.date <= today) {
      throw new BusinessError("INVALID_DATE", "La nouvelle date de fin doit être postérieure à aujourd'hui.");
    }
    const trialEndsAt = endOfDayAbidjan(input.date);
    if (trialEndsAt < license.trialEndsAt && !input.confirmShorten) {
      throw new BusinessError(
        "CONFIRMATION_REQUIRED",
        "Cette date raccourcit l'essai en cours. Confirmez pour continuer.",
      );
    }
    const updated = await tx.license.update({
      where: { id: license.id },
      data: { status: "TRIAL", trialEndsAt, lastSeenAt: null },
    });
    await audit.log(tx, {
      userId: user.id,
      action: "LICENSE_TRIAL_EXTEND",
      entity: "License",
      entityId: license.id,
      before: { status: license.status, trialEndsAt: license.trialEndsAt },
      after: { status: updated.status, trialEndsAt: updated.trialEndsAt },
    });
    return updated;
  });
}

/** Active la licence avec une clé fournie par Jason. Jamais la clé ni le secret dans l'audit. */
export async function activateLicense(user: Actor, input: ActivateLicenseInput) {
  const secret = getLicenseSecret();
  if (!secret) {
    throw new BusinessError(
      "LICENSE_SECRET_MISSING",
      "Activation impossible : clé serveur non configurée. Contactez Christ-Emmanuel Mouhi.",
    );
  }
  await ensureLicense();
  const licensedTo = normalizeLicensedTo(input.licensedTo);
  const { now } = await getNow();
  // Verrou de ligne : comptage des échecs, vérification, activation et audit sont sérialisés.
  // L'échec est renvoyé (et non levé) pour que son audit soit validé avec la transaction.
  const outcome = await db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM licenses WHERE singleton = true FOR UPDATE`;
    const license = await tx.license.findFirstOrThrow({ where: { singleton: true } });
    if (license.status === "ACTIVE") return { error: "ACTIVE" as const };
    const recent = await tx.auditLog.count({
      where: {
        action: "LICENSE_ACTIVATION_FAILED",
        createdAt: { gte: new Date(Date.now() - FAILURE_WINDOW_MS) },
      },
    });
    if (recent >= MAX_FAILURES) return { error: "TOO_MANY" as const };
    if (!verifyLicenseKey(secret, licensedTo, input.key)) {
      await audit.log(tx, {
        userId: user.id,
        action: "LICENSE_ACTIVATION_FAILED",
        entity: "License",
        entityId: license.id,
        after: { licensedTo },
      });
      return { error: "INVALID" as const };
    }
    const updated = await tx.license.update({
      where: { id: license.id },
      data: { status: "ACTIVE", licensedTo, activatedAt: now, keyFingerprint: fingerprint(input.key) },
    });
    await audit.log(tx, {
      userId: user.id,
      action: "LICENSE_ACTIVATE",
      entity: "License",
      entityId: license.id,
      before: { status: license.status },
      after: { status: "ACTIVE", licensedTo, activatedAt: now, keyFingerprint: updated.keyFingerprint },
    });
    return { updated };
  });
  if (outcome.updated) return outcome.updated;
  if (outcome.error === "ACTIVE") {
    throw new BusinessError("LICENSE_ALREADY_ACTIVE", "La licence est déjà active.");
  }
  if (outcome.error === "TOO_MANY") {
    throw new BusinessError("LICENSE_TOO_MANY_ATTEMPTS", "Trop de tentatives, réessayez dans 15 min.");
  }
  throw new BusinessError(
    "LICENSE_KEY_INVALID",
    "Clé de licence invalide. Vérifiez la clé et le nom du bénéficiaire (RICHBOND CI).",
  );
}
