import { defineConfig } from "@playwright/test";
export default defineConfig({
  testDir: "./tests/browser",
  timeout: 60000,
  expect: { timeout: 20000 },
  fullyParallel: false,
  use: {
    baseURL: "http://127.0.0.1:3000",
    headless: true,
    viewport: { width: 1440, height: 1000 },
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROME_PATH
        ? { executablePath: process.env.PLAYWRIGHT_CHROME_PATH }
        : {}),
    },
    screenshot: "only-on-failure",
  },
  reporter: "list",
});
