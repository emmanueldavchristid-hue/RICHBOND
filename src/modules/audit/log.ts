import type { Prisma } from "@/generated/prisma/client";
import { redactSecrets } from "./redact";

export type AuditAction =
  | "USER_CREATE"
  | "USER_UPDATE"
  | "USER_DEACTIVATE"
  | "USER_REACTIVATE"
  | "USER_UNLOCK"
  | "USER_PASSWORD_RESET"
  | "PASSWORD_CHANGE"
  | "LOGIN_SUCCESS"
  | "LOGIN_FAILED"
  | "ACCOUNT_LOCKED"
  | "LOGOUT"
  | (string & {});

export interface AuditEntry {
  userId: string | null;
  action: AuditAction;
  entity: string;
  entityId: string;
  before?: unknown;
  after?: unknown;
  ip?: string | null;
}

/** Écrit dans la même transaction que l'opération auditée. */
export async function log(
  tx: Pick<Prisma.TransactionClient, "auditLog">,
  e: AuditEntry,
): Promise<void> {
  const json = (v: unknown) =>
    v === undefined ? undefined : (JSON.parse(JSON.stringify(redactSecrets(v))) as Prisma.InputJsonValue);
  await tx.auditLog.create({
    data: {
      userId: e.userId,
      action: e.action,
      entity: e.entity,
      entityId: e.entityId,
      before: json(e.before),
      after: json(e.after),
      ip: e.ip ?? null,
    },
  });
}
