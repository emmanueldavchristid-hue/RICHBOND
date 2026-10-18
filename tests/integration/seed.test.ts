import { execSync } from "node:child_process";
import { afterAll, describe, expect, it } from "vitest";
import { db } from "@/lib/db";

afterAll(async () => {
  await db.$disconnect();
});

describe("seed idempotent", () => {
  it("exécuté deux fois : pas de doublon", async () => {
    // Base de test uniquement (DATABASE_URL forcé à DATABASE_URL_TEST par vitest.config.ts).
    await db.auditLog.deleteMany();
    await db.user.deleteMany();
    await db.license.deleteMany();
    const run = () =>
      execSync("npx tsx prisma/seed.ts", {
        stdio: "pipe",
        env: {
          ...process.env,
          DATABASE_URL: process.env.DATABASE_URL!,
          SEED_DEFAULT_PASSWORD: "Test-seed-2026",
        },
      });
    run();
    run();
    expect(await db.user.count()).toBe(5);
    expect(await db.license.count()).toBe(1);
  }, 60_000);
});
