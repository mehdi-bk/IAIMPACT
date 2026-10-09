import { defineConfig, devices } from "@playwright/test"

// E2E tests run against `next dev` on a dedicated port and an isolated DB file.
// Set PW_CHROMIUM=/usr/bin/chromium to use a system browser instead of the
// Playwright-managed one.
const PORT = 3100

export default defineConfig({
  testDir: "tests/e2e",
  timeout: 90_000,
  expect: { timeout: 15_000 },
  fullyParallel: false,
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://localhost:${PORT}`,
    locale: "fr-FR",
    timezoneId: "Europe/Paris",
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    launchOptions: process.env.PW_CHROMIUM ? { executablePath: process.env.PW_CHROMIUM } : {},
  },
  projects: [
    { name: "mobile", use: { ...devices["Pixel 7"], viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true } },
  ],
  webServer: {
    command: `npx next dev -p ${PORT}`,
    url: `http://localhost:${PORT}/api/health`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: { COMPASS_DB_PATH: "data/e2e.db", NEXT_DIST_DIR: ".next-e2e" },
  },
})
