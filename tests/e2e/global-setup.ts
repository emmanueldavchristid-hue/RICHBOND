import "dotenv/config";
import { execSync } from "node:child_process";
import { Client } from "pg";

/** Réinitialise la base de TEST (jamais la base de dev) puis rejoue le seed fictif. */
export default async function globalSetup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) throw new Error("DATABASE_URL_TEST est absente : les tests e2e exigent une base de test dédiée.");
  if (url === process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL_TEST doit différer de DATABASE_URL (risque d'effacer la base de dev).");
  }
  const env = { ...process.env, DATABASE_URL: url };
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });

  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const { rows } = await client.query<{ tablename: string }>(
      "SELECT tablename FROM pg_tables WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'",
    );
    if (rows.length > 0) {
      const names = rows.map((r) => `"${r.tablename}"`).join(", ");
      await client.query(`TRUNCATE TABLE ${names} RESTART IDENTITY CASCADE`);
    }
  } finally {
    await client.end();
  }
  execSync("npx prisma db seed", { stdio: "inherit", env });
}
