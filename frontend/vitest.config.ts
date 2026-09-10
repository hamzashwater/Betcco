import { fileURLToPath } from "node:url";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) } },
  test: {
    environment: "jsdom",
    setupFiles: ["./tests/setup.ts"],
    // Next's standalone output contains third-party test files. Exclude all
    // generated directories so only BETCCO's source tests are discovered.
    exclude: [
      "tests/e2e/**",
      "node_modules/**",
      ".next/**",
      ".next-*/**",
      "coverage/**",
    ],
  },
});
