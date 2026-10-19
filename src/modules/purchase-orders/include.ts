import type { Prisma } from "@/generated/prisma/client";

/** Chargement complet d'un BC (lignes, allocations, frais, fournisseur). */
export const FULL_INCLUDE = {
  lines: { orderBy: { lineNo: "asc" as const }, include: { allocations: true, item: true } },
  charges: { orderBy: { id: "asc" as const } },
  supplier: { include: { contacts: { where: { active: true }, orderBy: [{ isPrimary: "desc" as const }, { name: "asc" as const }] } } },
  warehouse: true,
  currency: true,
  createdBy: { select: { id: true, name: true } },
  approvedBy: { select: { id: true, name: true } },
} satisfies Prisma.PurchaseOrderInclude;

export type FullOrder = Prisma.PurchaseOrderGetPayload<{ include: typeof FULL_INCLUDE }>;

