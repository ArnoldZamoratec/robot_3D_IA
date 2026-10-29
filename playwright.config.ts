import { defineConfig } from "@playwright/test";

// Uses the locally installed Chrome (channel: "chrome") so no browser download is required.
export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  use: {
    baseURL: "http://localhost:5173",
    channel: "chrome",
    launchOptions: { args: ["--use-angle=swiftshader", "--enable-unsafe-swiftshader"] },
  },
  webServer: {
    command: "npm run dev",
    url: "http://localhost:5173",
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
