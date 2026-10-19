import { Prisma } from "@/generated/prisma/client";

/** Decimal -> string (les Decimal ne traversent pas la frontière des server actions). */
export type Serialized<T> = T extends Prisma.Decimal
  ? string
  : T extends Date
    ? Date
    : T extends readonly (infer U)[]
      ? Serialized<U>[]
      : T extends object
        ? { [K in keyof T]: Serialized<T[K]> }
        : T;

export function serialize<T>(value: T): Serialized<T> {
  return walk(value) as Serialized<T>;
}

function walk(v: unknown): unknown {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return v;
  if (Prisma.Decimal.isDecimal(v)) return (v as Prisma.Decimal).toString();
  if (Array.isArray(v)) return v.map(walk);
  if (typeof v === "object") {
    return Object.fromEntries(Object.entries(v as Record<string, unknown>).map(([k, x]) => [k, walk(x)]));
  }
  return v;
}
