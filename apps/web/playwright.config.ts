import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.e2e.spec.ts",
  webServer: {
    command: "pnpm e2e:server",
    url: "http://127.0.0.1:3100/",
    reuseExistingServer: false,
  },
  use: {
    baseURL: "http://127.0.0.1:3100",
    launchOptions: { executablePath: "/usr/bin/google-chrome" },
  },
});
