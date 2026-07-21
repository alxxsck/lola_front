import { defineConfig, devices } from "@playwright/test";

const apiMode = process.env.VITE_DATA_MODE === "api";
const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 4173);
const frontendOrigin = `http://127.0.0.1:${frontendPort}`;

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: frontendOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: apiMode
    ? [{ name: "api-chromium", use: { ...devices["Desktop Chrome"] } }]
    : [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
      ],
  webServer: {
    command: apiMode
      ? `npm run build && npm run preview -- --host 127.0.0.1 --port ${frontendPort}`
      : `VITE_DATA_MODE=mock npm run dev -- --host 127.0.0.1 --port ${frontendPort}`,
    url: `${frontendOrigin}/login`,
    reuseExistingServer: apiMode ? false : !process.env.CI,
    timeout: 120_000,
  },
});
