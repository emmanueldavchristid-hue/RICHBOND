import { db } from "@/lib/db";
import { hashPassword } from "@/modules/auth/password";
import type { PurchaseScope, Role } from "@/generated/prisma/client";

export const TEST_PASSWORD = "Test-Passw0rd!";
const PREFIX = "it-";

export async function createTestUser(
  key: string,
  opts: {
    role?: Role;
    purchaseScope?: PurchaseScope | null;
    active?: boolean;
    mustChangePassword?: boolean;
  } = {},
) {
  return db.user.create({
    data: {
      name: `Test ${key}`,
      email: `${PREFIX}${key}@richbond.test`,
      passwordHash: await hashPassword(TEST_PASSWORD),
      role: opts.role ?? "MAGASINIER",
      purchaseScope: opts.purchaseScope ?? null,
      active: opts.active ?? true,
      mustChangePassword: opts.mustChangePassword ?? false,
    },
  });
}

/** Supprime les comptes et journaux créés par les tests (base de test uniquement). */
export async function cleanTestUsers() {
  const users = await db.user.findMany({
    where: { email: { startsWith: PREFIX } },
    select: { id: true },
  });
  const ids = users.map((u) => u.id);
  await db.auditLog.deleteMany({
    where: { OR: [{ userId: { in: ids } }, { entityId: { in: ids } }] },
  });
  await db.user.deleteMany({ where: { id: { in: ids } } });
}
