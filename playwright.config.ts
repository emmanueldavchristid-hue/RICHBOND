import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

// Mot de passe fictif des comptes du seed pour la base de test (si non fourni par l'environnement).
process.env.SEED_DEFAULT_PASSWORD ||= "E2e-Passw0rd-Test!";

if (!process.env.DATABASE_URL_TEST) {
  throw new Error("DATABASE_URL_TEST est absente : les tests e2e exigent une base de test dédiée.");
}

export default defineConfig({
  testDir: "tests/e2e",
  // Scripts jetables de débogage/recette (non suivis par git) : jamais joués par la suite.
  testIgnore: ["**/_dbg/**", "**/_recette/**"],
  globalSetup: "./tests/e2e/global-setup.ts",
  // Serveur de dev : la première visite d'une page compile à la volée (plusieurs secondes) ; scénarios multi-rôles longs.
  timeout: 180_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    // AUTH_URL forcé : sinon Auth.js réécrit les redirections vers le port du .env de dev.
    env: {
      DATABASE_URL: process.env.DATABASE_URL_TEST,
      AUTH_URL: "http://localhost:3100",
      NEXTAUTH_URL: "http://localhost:3100",
      ALLOW_TEST_NOW: "1",
      // TEST UNIQUEMENT : secret fictif, jamais utilisé hors tests.
      LICENSE_SECRET: "e2e-only-license-secret-0123456789abcdef",
    },
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "tablette", use: { ...devices["iPad (gen 7) landscape"], browserName: "chromium" } },
  ],
});
