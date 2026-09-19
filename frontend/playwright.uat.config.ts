import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 300_000,
  expect: { timeout: 12_000 },
  workers: 1,
  retries: 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL: "http://localhost:3000",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop-1440",
      use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } },
    },
    {
      name: "chromium-mobile-360",
      use: { ...devices["Desktop Chrome"], viewport: { width: 360, height: 800 }, isMobile: true, hasTouch: true },
    },
    {
      name: "firefox-tablet-834",
      use: { ...devices["Desktop Firefox"], viewport: { width: 834, height: 1112 }, hasTouch: true },
    },
    {
      name: "webkit-iphone-14",
      use: { ...devices["iPhone 14"] },
    },
  ],
  webServer: {
    command: `node ${process.env.BETCCO_NEXT_DIST_DIR ?? ".next"}/standalone/server.js`,
    port: 3000,
    reuseExistingServer: false,
    timeout: 120_000,
  },
});
