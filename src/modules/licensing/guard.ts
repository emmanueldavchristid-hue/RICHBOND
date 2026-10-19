import "server-only";
import { BusinessError } from "@/lib/errors";
import { computeLicenseState, READ_ONLY_MESSAGE, type LicenseLike } from "./state";
import { getLicenseState } from "./service";

/** Pure : l'état de licence autorise-t-il l'écriture ? (borne stricte now < trialEndsAt) */
export function isWritable(
  license: Pick<LicenseLike, "status" | "trialEndsAt"> | null,
  now: Date,
): boolean {
  if (!license) return false;
  return computeLicenseState({ ...license, trialStartsAt: license.trialEndsAt }, now).writable;
}

/** Version non bloquante pour l'interface : boutons d'écriture désactivés si faux. */
export async function isWritableNow(): Promise<boolean> {
  return (await getLicenseState()).writable;
}

/** Refuse toute écriture si l'essai est expiré. */
export async function requireWritable(): Promise<void> {
  if (!(await getLicenseState()).writable) {
    throw new BusinessError("LICENSE_READ_ONLY", READ_ONLY_MESSAGE);
  }
}
