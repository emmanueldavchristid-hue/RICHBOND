import "dotenv/config";
import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

// Secret fictif de test (jamais un secret réel).
const TEST_LICENSE_SECRET = "test-only-license-secret-0123456789abcdef";
const serverOnlyStub = path.resolve(__dirname, "tests/setup/server-only.ts");

export default defineConfig({
  plugins: [tsconfigPaths()],
  resolve: { alias: { "server-only": serverOnlyStub } },
  test: {
    exclude: ["tests/e2e/**", "node_modules/**"],
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["tests/unit/**/*.test.ts"],
          env: { LICENSE_SECRET: TEST_LICENSE_SECRET },
        },
      },
      {
        extends: true,
        test: {
          name: "integration",
          environment: "node",
          include: ["tests/integration/**/*.test.ts"],
          fileParallelism: false,
          globalSetup: ["tests/setup/integration-global.ts"],
          testTimeout: 20_000,
          hookTimeout: 30_000,
          env: {
            DATABASE_URL: process.env.DATABASE_URL_TEST ?? "",
            BCRYPT_COST: "4",
            // Logo de test : jamais le dossier réel storage/branding.
            BRANDING_DIR: path.resolve(__dirname, "storage/branding-test"),
            LICENSE_SECRET: TEST_LICENSE_SECRET,
          },
        },
      },
    ],
  },
});
