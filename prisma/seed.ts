import "dotenv/config";
import bcrypt from "bcryptjs";
import { createPrismaClient } from "../src/lib/prisma-client";
import type { PurchaseScope, Role } from "../src/generated/prisma/client";

const prisma = createPrismaClient();

const USERS: { name: string; email: string; role: Role; purchaseScope?: PurchaseScope }[] = [
  { name: "Administrateur technique", email: "admin@exemple.ci", role: "SUPER_ADMIN" },
  { name: "Responsable Achats (fictif)", email: "resp.achats@exemple.ci", role: "RESPONSABLE_ACHATS" },
  {
    name: "Acheteur local (fictif)",
    email: "acheteur.local@exemple.ci",
    role: "ACHETEUR",
    purchaseScope: "LOCAL",
  },
  {
    name: "Acheteur import (fictif)",
    email: "acheteur.import@exemple.ci",
    role: "ACHETEUR",
    purchaseScope: "IMPORT",
  },
  { name: "Magasinier (fictif)", email: "magasinier@exemple.ci", role: "MAGASINIER" },
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
      update: { name: u.name, role: u.role, purchaseScope: u.purchaseScope ?? null },
      create: { ...u, passwordHash },
    });
  }

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
