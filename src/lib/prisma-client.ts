import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@/generated/prisma/client";

/** Crée un client Prisma (utilisable hors Next : seed, tests). */
export function createPrismaClient(connectionString?: string): PrismaClient {
  const url = connectionString ?? process.env.DATABASE_URL;
  if (!url) {
    throw new Error("DATABASE_URL est absente de l'environnement.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString: url }) });
}
