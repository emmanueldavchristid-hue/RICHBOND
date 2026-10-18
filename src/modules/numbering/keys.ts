import { z } from "zod";

/** Préfixe et largeur de chaque type de pièce (hypothèse H3). */
export const COUNTER_KEYS = {
  DA: { prefix: "DA", width: 5 },
  BC: { prefix: "BC", width: 5 },
  REC: { prefix: "REC", width: 5 },
  SOR: { prefix: "SOR", width: 5 },
  INV: { prefix: "INV", width: 4 },
  IMP: { prefix: "IMP", width: 4 },
} as const;

export type CounterKey = keyof typeof COUNTER_KEYS;

export const counterKeySchema = z.enum(Object.keys(COUNTER_KEYS) as [CounterKey, ...CounterKey[]]);
