import { z } from "zod";

/**
 * Préfixe et largeur de chaque type de pièce (hypothèse H3).
 * `annual: false` : compteur unique (année 0), format sans année (ART-00001).
 */
export const COUNTER_KEYS = {
  DA: { prefix: "DA", width: 5, annual: true },
  BC: { prefix: "BC", width: 5, annual: true },
  REC: { prefix: "REC", width: 5, annual: true },
  SOR: { prefix: "SOR", width: 5, annual: true },
  NC: { prefix: "NC", width: 5, annual: true },
  RET: { prefix: "RET", width: 5, annual: true },
  TRF: { prefix: "TRF", width: 5, annual: true },
  AJU: { prefix: "AJU", width: 5, annual: true },
  FAC: { prefix: "FAC", width: 5, annual: true },
  INV: { prefix: "INV", width: 4, annual: true },
  IMP: { prefix: "IMP", width: 4, annual: true },
  ART: { prefix: "ART", width: 5, annual: false },
  FRS: { prefix: "FRS", width: 5, annual: false },
} as const;

export type CounterKey = keyof typeof COUNTER_KEYS;

/** Année 0 = compteur non annuel. */
export const yearSchema = z.union([z.literal(0), z.number().int().min(2000).max(9999)]);

export const counterKeySchema = z.enum(Object.keys(COUNTER_KEYS) as [CounterKey, ...CounterKey[]]);
