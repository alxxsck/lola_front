import { mkdir } from "node:fs/promises";
import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const apiOrigin = process.env.E2E_API_ORIGIN ?? "http://127.0.0.1:3000";
const projectPublicKey = process.env.E2E_PROJECT_PUBLIC_KEY ?? "lola_pub_demo";

type SmokeUser = {
  accessToken: string;
  cmsUserId: string;
  email: string;
  password: string;
};

function credentials(testInfo: TestInfo): SmokeUser {
  const users = JSON.parse(process.env.E2E_USERS ?? "[]") as SmokeUser[];
  const offset = testInfo.project.name.includes("mobile") ? 3 : 0;
  const user = users[offset] ?? {
    email: process.env.E2E_LOGIN,
    password: process.env.E2E_PASSWORD,
  };
  if (!user.email || !user.password)
    throw new Error("E2E_LOGIN and E2E_PASSWORD are required");
  if (!user.accessToken || !user.cmsUserId)
    throw new Error("The HTTP smoke must supply a phishing-resistant session");
  return user as SmokeUser;
}

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "Event Query API E2E requires the real backend",
);

async function cmsContext(request: APIRequestContext, user: SmokeUser) {
  const headers = { Authorization: `Bearer ${user.accessToken}` };
  const session = await request.get(`${apiOrigin}/api/v1/auth/me`, { headers });
  expect(session.ok()).toBe(true);
  const project = (
    (await session.json()) as {
      projects: Array<{ id: string; name: string; publicKey: string }>;
    }
  ).projects.find((item) => item.publicKey === projectPublicKey);
  expect(project, `Project ${projectPublicKey} must exist`).toBeTruthy();
  return { headers, project: project! };
}

async function restoreUiSession(page: Page, user: SmokeUser) {
  await page.route("**/api/v1/auth/refresh", async (route) => {
    await route.fulfill({
      contentType: "application/json",
      status: 200,
      body: JSON.stringify({
        kind: "AUTHENTICATED",
        accessToken: user.accessToken,
        expiresIn: 900,
        refreshExpiresIn: 900,
        tokenType: "Bearer",
        user: {
          id: user.cmsUserId,
          email: user.email,
          displayName: "Event Query E2E",
        },
      }),
    });
  });
}

test("loads a real published policy and previews only the seeded user's typed events", async ({
  page,
  request,
}, testInfo) => {
  const user = credentials(testInfo);
  const context = await cmsContext(request, user);
  await restoreUiSession(page, user);

  const policyResponse = await request.get(
    `${apiOrigin}/api/v1/admin/projects/${context.project.id}/event-query-policy`,
    { headers: context.headers },
  );
  expect(policyResponse.ok()).toBe(true);
  const policy = (await policyResponse.json()) as {
    published: {
      version: number;
      document: {
        enabled: boolean;
        items: Array<{ stableCode: string }>;
      };
    };
  };
  expect(policy.published.document.enabled).toBe(true);
  expect(policy.published.document.items).toContainEqual(
    expect.objectContaining({ stableCode: "deposit.succeeded" }),
  );

  const profilesResponse = await request.get(
    `${apiOrigin}/api/v1/admin/projects/${context.project.id}/end-users`,
    {
      headers: context.headers,
      params: { externalUserId: "event-query-demo-user", limit: 10 },
    },
  );
  expect(profilesResponse.ok()).toBe(true);
  const profiles = (await profilesResponse.json()) as {
    items: Array<{ endUserId: string; externalUserId: string }>;
  };
  const endUser = profiles.items.find(
    (item) => item.externalUserId === "event-query-demo-user",
  );
  expect(endUser).toBeTruthy();

  const query = {
    eventCodes: ["deposit.succeeded"],
    mode: "SUMMARY",
    timeRange: { kind: "LAST_24_HOURS" },
  };
  const previewResponse = await request.post(
    `${apiOrigin}/api/v1/admin/projects/${context.project.id}/event-query-policy/preview`,
    {
      headers: context.headers,
      data: { endUserId: endUser!.endUserId, query },
    },
  );
  expect(
    previewResponse.ok(),
    `Preview failed (${previewResponse.status()}): ${await previewResponse.text()}`,
  ).toBe(true);
  const preview = (await previewResponse.json()) as {
    complete: boolean;
    matchedCount: number;
    serializedBytes: number;
    status: string;
    summaries: unknown[];
  };
  expect(preview).toMatchObject({
    complete: true,
    matchedCount: 3,
    status: "COMPLETED",
  });
  expect(preview.serializedBytes).toBeGreaterThan(0);
  expect(JSON.stringify(preview)).not.toContain("payload");
  expect(JSON.stringify(preview)).not.toContain(endUser!.endUserId);

  await page.goto("/project");
  await page
    .getByRole("button", { name: "Развернуть раздел «Доступ ИИ к событиям»" })
    .click();
  await expect(
    page
      .locator(".definition-list")
      .getByText("deposit.succeeded", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText(/Опубликована ревизия/)).toBeVisible();
  await page.getByLabel("End User ID").fill(endUser!.endUserId);
  await page.getByLabel("Тип события").selectOption("deposit.succeeded");
  await page.getByRole("button", { name: "Выполнить preview" }).click();
  await expect(page.getByText("COMPLETED", { exact: true })).toBeVisible();
  await expect(
    page
      .locator(".preview-result .metric-grid > div")
      .filter({ hasText: "Найдено" }),
  ).toContainText("3");
  await expect(page.locator(".preview-result")).not.toContainText("payload");

  const directory = process.env.E2E_SCREENSHOT_DIR;
  if (directory) {
    await mkdir(directory, { recursive: true });
    await page.locator(".event-query-policy").screenshot({
      path: `${directory}/event-query-real-${testInfo.project.name}.png`,
    });
  }
});
