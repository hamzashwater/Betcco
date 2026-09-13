import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 30_000,
  // Registration uses the shared local development mail/database stack. Keeping
  // these end-to-end flows serial avoids cold-start contention and makes the
  // default developer command deterministic.
  workers: 1,
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000",
    trace: "retain-on-failure",
  },
  webServer: {
    command: process.env.CI
      ? `node ${process.env.BETCCO_NEXT_DIST_DIR ?? ".next"}/standalone/server.js`
      : "pnpm dev",
    port: 3000,
    reuseExistingServer: !process.env.CI,
  },
});
