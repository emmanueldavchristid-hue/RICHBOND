import type { z } from "zod";
import { BusinessError } from "@/lib/errors";

/** Validation Zod → `BusinessError("VALIDATION")` (jamais d'erreur technique opaque). */
export function parseInput<S extends z.ZodType>(schema: S, raw: unknown): z.output<S> {
  const r = schema.safeParse(raw);
  if (!r.success) throw new BusinessError("VALIDATION", r.error.issues[0]?.message ?? "Les données saisies sont invalides.");
  return r.data;
}
