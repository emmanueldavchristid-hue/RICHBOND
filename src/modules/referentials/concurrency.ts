import { BusinessError } from "@/lib/errors";

export const CONFLICT_MESSAGE = "Cette fiche a été modifiée par un autre utilisateur. Rechargez la page.";

/** R16 : verrou optimiste sur `updatedAt`. */
export function assertFresh(current: Date, expected: Date): void {
  if (current.getTime() !== expected.getTime()) throw new BusinessError("CONFLICT", CONFLICT_MESSAGE);
}
