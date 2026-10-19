import { COUNTER_KEYS, counterKeySchema, type CounterKey } from "./keys";

/** Pure : DA, 2026, 1 -> "DA-2026-00001" ; ART, 0, 1 -> "ART-00001" (non annuel). */
export function formatDocumentNumber(key: CounterKey, year: number, value: number): string {
  const k = counterKeySchema.parse(key);
  const { prefix, width, annual } = COUNTER_KEYS[k];
  if (!Number.isInteger(value) || value < 1) throw new RangeError("Numéro d'ordre invalide.");
  const seq = String(value).padStart(width, "0");
  if (!annual) return `${prefix}-${seq}`;
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new RangeError("Année invalide.");
  return `${prefix}-${year}-${seq}`;
}
