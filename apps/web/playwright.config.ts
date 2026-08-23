import { defineConfig } from "@playwright/test";
import { existsSync } from "node:fs";

const chromePath =
  process.env.PLAYWRIGHT_CHROME_PATH ??
  (existsSync("/opt/chrome/chrome")
    ? "/opt/chrome/chrome"
    : "/usr/bin/google-chrome");

export default defineConfig({
  testDir: "./test",
  testMatch: "**/*.e2e.spec.ts",
  webServer: {
    command: "pnpm e2e:server",
    url: "http://127.0.0.1:3100/",
    reuseExistingServer: process.env.PLAYWRIGHT_REUSE_SERVER === "1",
  },
  use: {
    baseURL: "http://127.0.0.1:3100",
    launchOptions: { executablePath: chromePath },
  },
});
