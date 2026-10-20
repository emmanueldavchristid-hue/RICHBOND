import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * Captures d'écran de contrôle visuel (DESIGN.md §7), hors suite de tests : `npm run captures`.
 * Même base de TEST et même seed fictif que les e2e ; les images vont dans docs/captures/.
 */
process.env.SEED_DEFAULT_PASSWORD ||= "E2e-Passw0rd-Test!";

if (!process.env.DATABASE_URL_TEST) {
  throw new Error("DATABASE_URL_TEST est absente : les captures utilisent la base de test dédiée.");
}

export default defineConfig({
  testDir: "scripts/captures",
  testMatch: "**/*.capture.ts",
  globalSetup: "./tests/e2e/global-setup.ts",
  timeout: 900_000,
  expect: { timeout: 20_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", ...devices["Desktop Chrome"], locale: "fr-FR", timezoneId: "Africa/Abidjan" },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
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
});
