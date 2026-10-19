import { formatInTimeZone } from "date-fns-tz";
import { APP_TZ } from "@/lib/dates";
import { formatQty } from "@/lib/money";

/** Engagement ouvert sur un article : DA en cours (LOT-04) ou BC en cours (LOT-05, via `OpenOrderSource`). */
export interface Commitment {
  source: "DA" | "BC";
  number: string;
  qty: string | number;
  unit: string;
  /** Date de besoin (DA) ou date attendue (BC). */
  date: Date | string | null;
}

const shortDate = (d: Date | string) => formatInTimeZone(new Date(d), APP_TZ, "dd/MM");

/**
 * « Déjà demandé : DA-2026-00012, 50 U, besoin le 12/11 »
 * « Déjà commandé : BC-2026-00042, 50 U attendues le 12/11 »
 */
export function formatCommitment(c: Commitment): string {
  const qty = `${formatQty(c.qty)} ${c.unit}`;
  const ref = c.number ? `${c.number}, ` : "";
  if (c.source === "DA") {
    return `Déjà demandé : ${ref}${qty}${c.date ? `, besoin le ${shortDate(c.date)}` : ""}`;
  }
  return `Déjà commandé : ${ref}${qty}${c.date ? ` attendues le ${shortDate(c.date)}` : ""}`;
}

/** Un message par engagement ; liste vide si aucun. */
export function formatCommitments(list: Commitment[]): string[] {
  return list.map(formatCommitment);
}
