import { defineConfig, devices } from "@playwright/test";

const distDir = process.env.BETCCO_NEXT_DIST_DIR ?? ".next";
const tlsEnabled = Boolean(
  process.env.BETCCO_UAT_TLS_CERT && process.env.BETCCO_UAT_TLS_KEY,
);
const appPort = tlsEnabled ? 3001 : 3000;
const baseURL =
  process.env.BETCCO_UAT_BASE_URL ??
  (tlsEnabled ? "https://localhost:3000" : "http://localhost:3000");
const chromiumHttpsUse = tlsEnabled
  ? { launchOptions: { args: ["--ignore-certificate-errors"] } }
  : {};

const standaloneServer = {
  command: `node ${distDir}/standalone/server.js`,
  url: `http://127.0.0.1:${appPort}`,
  reuseExistingServer: false,
  timeout: 120_000,
  env: {
    HOSTNAME: "127.0.0.1",
    PORT: String(appPort),
  },
};

export default defineConfig({
  testDir: "./tests/e2e",
  timeout: 600_000,
  expect: { timeout: 15_000 },
  workers: 1,
  retries: 0,
  reporter: [["html", { open: "never" }], ["list"]],
  use: {
    baseURL,
    ignoreHTTPSErrors: tlsEnabled,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium-desktop-1440",
      grep: /@public-matrix|@golden-path/,
      use: {
        ...devices["Desktop Chrome"],
        ...chromiumHttpsUse,
        viewport: { width: 1440, height: 900 },
      },
    },
    {
      name: "chromium-mobile-360",
      grep: /@public-matrix|@mobile-student/,
      use: {
        ...devices["Desktop Chrome"],
        ...chromiumHttpsUse,
        viewport: { width: 360, height: 800 },
        isMobile: true,
        hasTouch: true,
      },
    },
    {
      name: "firefox-tablet-834",
      grep: /@public-matrix/,
      use: {
        ...devices["Desktop Firefox"],
        viewport: { width: 834, height: 1112 },
        hasTouch: true,
      },
    },
    {
      name: "webkit-iphone-14",
      grep: /@public-matrix/,
      use: { ...devices["iPhone 14"] },
    },
  ],
  webServer: tlsEnabled
    ? [
        standaloneServer,
        {
          command: "node tests/e2e/uat-https-proxy.mjs",
          url: baseURL,
          ignoreHTTPSErrors: true,
          reuseExistingServer: false,
          timeout: 120_000,
        },
      ]
    : standaloneServer,
});
