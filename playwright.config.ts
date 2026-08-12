import { defineConfig, devices } from "@playwright/test";

const apiMode = process.env.VITE_DATA_MODE === "api";
const frontendPort = Number(process.env.E2E_FRONTEND_PORT ?? 4173);
const frontendOrigin = `http://localhost:${frontendPort}`;

export default defineConfig({
  testDir: "./e2e",
  timeout: apiMode ? 120_000 : 30_000,
  fullyParallel: true,
  // The graph-heavy mock suite shares one Vite server. More than two browser
  // workers makes its layout assertions CPU-scheduling dependent on local and
  // CI runners, while API mode must remain serialized for mutable fixtures.
  workers: apiMode ? 1 : 2,
  forbidOnly: Boolean(process.env.CI),
  retries: apiMode ? 0 : process.env.CI ? 2 : 0,
  reporter: process.env.CI ? "github" : "list",
  use: {
    baseURL: frontendOrigin,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
  },
  projects: apiMode
    ? [
        { name: "api-chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "api-mobile-chromium", use: { ...devices["Pixel 7"] } },
      ]
    : [
        { name: "chromium", use: { ...devices["Desktop Chrome"] } },
        { name: "mobile-chromium", use: { ...devices["Pixel 7"] } },
        {
          name: "tablet-chromium",
          use: { ...devices["Desktop Chrome"], viewport: { width: 768, height: 1024 } },
        },
        {
          name: "compact-chromium",
          use: { ...devices["Desktop Chrome"], viewport: { width: 320, height: 568 } },
        },
      ],
  webServer: {
    command: apiMode
      ? `npm run api:check && npx vue-tsc -p tsconfig.app.json --noEmit --incremental false && npx tsc -p tsconfig.node.json --noEmit --incremental false && npx vite build --configLoader runner && npx vite preview --host 127.0.0.1 --port ${frontendPort}`
      : `VITE_DATA_MODE=mock npm run dev -- --host 127.0.0.1 --port ${frontendPort}`,
    url: `${frontendOrigin}/login`,
    reuseExistingServer: apiMode ? false : !process.env.CI,
    timeout: 120_000,
  },
});
