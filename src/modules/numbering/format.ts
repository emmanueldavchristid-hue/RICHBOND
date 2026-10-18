import { COUNTER_KEYS, counterKeySchema, type CounterKey } from "./keys";

/** Pure : DA, 2026, 1 -> "DA-2026-00001". */
export function formatDocumentNumber(key: CounterKey, year: number, value: number): string {
  const k = counterKeySchema.parse(key);
  if (!Number.isInteger(year) || year < 2000 || year > 9999) throw new RangeError("Année invalide.");
  if (!Number.isInteger(value) || value < 1) throw new RangeError("Numéro d'ordre invalide.");
  const { prefix, width } = COUNTER_KEYS[k];
  return `${prefix}-${year}-${String(value).padStart(width, "0")}`;
}
