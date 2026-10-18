import "dotenv/config";
import path from "node:path";
import tsconfigPaths from "vite-tsconfig-paths";
import { defineConfig } from "vitest/config";

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
          env: { DATABASE_URL: process.env.DATABASE_URL_TEST ?? "" },
        },
      },
    ],
  },
});
