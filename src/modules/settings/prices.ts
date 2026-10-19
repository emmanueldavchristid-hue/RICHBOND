import "server-only";
import { canSeePurchasePrice, type PermissionUser } from "@/lib/permissions";
import { getSettings } from "./service";

/** R15 : le Magasinier ne reçoit les prix d'achat que si le réglage l'autorise ; sinon ils ne quittent pas le serveur. */
export async function viewerCanSeePrices(user: PermissionUser): Promise<boolean> {
  return canSeePurchasePrice(user, await getSettings());
}
