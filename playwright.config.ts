import { defineConfig, devices } from "@playwright/test";

const webPort = process.env.POP_WEB_PORT ?? "5173";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: `http://127.0.0.1:${webPort}`,
    trace: "on-first-retry",
  },
  projects: [
    {
      name: "mobile",
      use: { ...devices["iPhone 13"], browserName: "chromium" },
    },
    {
      name: "desktop",
      use: {
        ...devices["Desktop Chrome"],
        viewport: { width: 1440, height: 900 },
      },
    },
  ],
  webServer: {
    command: "make dev",
    url: `http://127.0.0.1:${webPort}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
});
