import assert from "node:assert/strict";
import test from "node:test";
import { validateVercelEnvironment } from "./validate-vercel-env.mjs";

test("local builds stay independent of deployment configuration", () => {
  assert.deepEqual(validateVercelEnvironment({}), []);
});

test("Vercel builds fail closed without an API-mode HTTPS backend", () => {
  const errors = validateVercelEnvironment({
    VERCEL: "1",
    VITE_DATA_MODE: "mock",
    VITE_API_BASE_URL: "http://localhost:3000",
  });
  assert.deepEqual(errors, [
    "VITE_DATA_MODE must be api for a Vercel deployment",
    "VITE_API_BASE_URL must use https",
    "VITE_API_BASE_URL must not target localhost",
  ]);
});

test("Vercel accepts the explicit production API configuration", () => {
  assert.deepEqual(
    validateVercelEnvironment({
      VERCEL: "1",
      VITE_DATA_MODE: "api",
      VITE_API_BASE_URL: "https://retenive-back.example/api/v1",
    }),
    [],
  );
});
