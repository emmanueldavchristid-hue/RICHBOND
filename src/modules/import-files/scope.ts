import { BusinessError } from "@/lib/errors";
import { can, requireAction, type Action } from "@/lib/permissions";
import type { OrderActor } from "@/modules/purchase-orders/internal";

/**
 * Périmètre du module Import (LOT-12) : tous les dossiers sont des achats import. Un Acheteur au périmètre LOCAL n'y
 * a aucun accès (ni menu, ni lecture, ni écriture) ; périmètre IMPORT ou ALL : accès complet. Le Responsable et le
 * Super-admin (lecture) ne sont pas restreints.
 */
export const IMPORT_OUT_OF_SCOPE_MESSAGE = "Le module Import n'est pas accessible avec votre périmètre d'achat (local).";

export function assertImportAccess(actor: OrderActor, action: Action): void {
  if (actor.role === "ACHETEUR" && actor.purchaseScope !== "IMPORT" && actor.purchaseScope !== "ALL") {
    throw new BusinessError("FORBIDDEN", IMPORT_OUT_OF_SCOPE_MESSAGE);
  }
  requireAction(actor, action, { scope: "IMPORT" });
}

export function canCloseImportFile(actor: OrderActor): boolean {
  return can(actor, "importFile.close", { scope: "IMPORT" });
}
