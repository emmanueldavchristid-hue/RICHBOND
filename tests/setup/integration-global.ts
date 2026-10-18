import "dotenv/config";
import { execSync } from "node:child_process";

/** Applique les migrations sur la base de test (jamais sur la base de dev). */
export default function setup() {
  const url = process.env.DATABASE_URL_TEST;
  if (!url) {
    throw new Error(
      "DATABASE_URL_TEST est absente : les tests d'intégration exigent une base de test dédiée.",
    );
  }
  if (url === process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL_TEST doit différer de DATABASE_URL (risque d'effacer la base de dev).");
  }
  execSync("npx prisma migrate deploy", {
    stdio: "inherit",
    env: { ...process.env, DATABASE_URL: url },
  });
}
