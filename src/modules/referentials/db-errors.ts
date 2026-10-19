import { Prisma } from "@/generated/prisma/client";
import { BusinessError } from "@/lib/errors";

/** Cibles de violation d'unicité Prisma P2002 (champs ou nom de contrainte). */
export function uniqueTargets(e: unknown): string[] | null {
  if (!(e instanceof Prisma.PrismaClientKnownRequestError) || e.code !== "P2002") return null;
  const meta = e.meta as
    | { target?: unknown; driverAdapterError?: { cause?: { constraint?: { fields?: string[]; index?: string } } } }
    | undefined;
  const t = meta?.target;
  if (Array.isArray(t)) return t.map(String);
  if (typeof t === "string") return [t];
  const c = meta?.driverAdapterError?.cause?.constraint;
  if (Array.isArray(c?.fields)) return c.fields.map(String);
  return c?.index ? [c.index] : [];
}

/** Traduit P2002 en BusinessError selon un dictionnaire champ -> erreur. */
export function rethrowUnique(e: unknown, map: Record<string, BusinessError>, fallback?: BusinessError): never {
  const targets = uniqueTargets(e);
  if (targets) {
    for (const [field, err] of Object.entries(map)) {
      if (targets.some((t) => t === field || t.includes(`_${field}_`))) throw err;
    }
    if (fallback) throw fallback;
  }
  throw e;
}

export const codeExists = () => new BusinessError("CODE_EXISTS", "Ce code existe déjà.");
