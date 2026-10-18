import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: { baseURL: "http://localhost:3100", trace: "retain-on-failure" },
  webServer: {
    command: "npm run dev -- -p 3100",
    url: "http://localhost:3100",
    env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? "" },
    reuseExistingServer: false,
    timeout: 120_000,
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"] } },
    { name: "tablette", use: { ...devices["iPad (gen 7) landscape"], browserName: "chromium" } },
  ],
});
