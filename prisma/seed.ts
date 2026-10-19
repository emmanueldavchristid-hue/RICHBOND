import "dotenv/config";
import bcrypt from "bcryptjs";
import { createPrismaClient } from "../src/lib/prisma-client";
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

  if ((await prisma.license.count()) === 0) {
    const now = new Date();
    await prisma.license.create({
      data: {
        status: "TRIAL",
        trialStartsAt: now,
        trialEndsAt: new Date(now.getTime() + 30 * 24 * 3600 * 1000),
      },
    });
  }
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (e) => {
    console.error(e);
    await prisma.$disconnect();
    process.exit(1);
  });
