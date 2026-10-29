import "dotenv/config";
import bcrypt from "bcryptjs";
import { computeTrialEnd } from "../src/modules/licensing/state";
import { createPrismaClient } from "../src/lib/prisma-client";
import { seedReferentials } from "./seed/referentials";
import { seedPurchaseRequests } from "./seed/purchase-requests";
import { seedPurchaseOrders } from "./seed/purchase-orders";
import { seedReceipts } from "./seed/receipts";
import { seedInvoices } from "./seed/invoices";
import { seedStock } from "./seed/stock";
import { seedHistory } from "./seed/history";
import { seedInventories } from "./seed/inventories";
import type { PurchaseScope, Role } from "../src/generated/prisma/client";

const prisma = createPrismaClient();

const USERS: { name: string; email: string; role: Role; purchaseScope?: PurchaseScope }[] = [
  { name: "Jason (super-admin)", email: "admin@richbond.test", role: "SUPER_ADMIN" },
  { name: "Responsable Achats (démo)", email: "responsable@richbond.test", role: "RESPONSABLE_ACHATS" },
  { name: "Acheteur Local", email: "acheteur.local@richbond.test", role: "ACHETEUR", purchaseScope: "LOCAL" },
  { name: "Acheteur Import", email: "acheteur.import@richbond.test", role: "ACHETEUR", purchaseScope: "IMPORT" },
  { name: "Magasinier", email: "magasinier@richbond.test", role: "MAGASINIER" },
];

async function main() {
  const password = process.env.SEED_DEFAULT_PASSWORD;
  if (!password) {
    throw new Error(
      "SEED_DEFAULT_PASSWORD est obligatoire : définissez-le dans votre environnement local avant de lancer le seed.",
    );
  }
  const passwordHash = await bcrypt.hash(password, 12);

  for (const u of USERS) {
    await prisma.user.upsert({
      where: { email: u.email },
      update: {
        name: u.name,
        role: u.role,
        purchaseScope: u.purchaseScope ?? null,
        active: true,
        mustChangePassword: false,
        failedLoginCount: 0,
        lockedUntil: null,
      },
      create: { ...u, passwordHash, mustChangePassword: false },
    });
  }

  // Anciens comptes fictifs du LOT-00 : désactivés, jamais supprimés (historique).
  await prisma.user.updateMany({
    where: { email: { endsWith: "@exemple.ci" }, active: true },
    data: { active: false, deactivatedAt: new Date(), sessionVersion: { increment: 1 } },
  });

  // Licence unique (idempotent) : même règle que ensureLicense() (B4/B5), sans server-only.
  const start = new Date();
  const { trialEndsAt, warnings } = computeTrialEnd(process.env, start);
  for (const w of warnings) console.warn(w);
  const created = await prisma.license.createMany({
    data: [{ status: "TRIAL", trialStartsAt: start, trialEndsAt }],
    skipDuplicates: true,
  });
  if (created.count === 1) {
    const license = await prisma.license.findFirstOrThrow({ where: { singleton: true } });
    await prisma.auditLog.create({
      data: {
        userId: null,
        action: "LICENSE_INIT",
        entity: "License",
        entityId: license.id,
        after: { status: "TRIAL", trialStartsAt: start.toISOString(), trialEndsAt: trialEndsAt.toISOString() },
      },
    });
  }
}

async function seedAll() {
  await main();
  await seedReferentials(prisma);
  await seedPurchaseRequests(prisma);
  await seedPurchaseOrders(prisma);
  await seedReceipts(prisma);
  await seedInvoices(prisma);
  await seedStock(prisma);
  await seedHistory(prisma);
  await seedInventories(prisma);
}

seedAll()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
