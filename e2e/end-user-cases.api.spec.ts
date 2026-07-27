import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const apiOrigin = process.env.E2E_API_ORIGIN ?? "http://127.0.0.1:3000";
const projectPublicKey = process.env.E2E_PROJECT_PUBLIC_KEY ?? "lola_pub_demo";

function credentials(testInfo: TestInfo) {
  const users = JSON.parse(process.env.E2E_USERS ?? "[]") as Array<{
    accessToken: string;
    cmsUserId: string;
    email: string;
    password: string;
  }>;
  const offset = testInfo.project.name.includes("mobile") ? 3 : 0;
  const user = users[offset] ?? {
    email: process.env.E2E_LOGIN,
    password: process.env.E2E_PASSWORD,
  };
  if (!user.email || !user.password)
    throw new Error("E2E_LOGIN and E2E_PASSWORD are required");
  if (!user.accessToken || !user.cmsUserId)
    throw new Error("The HTTP smoke must supply a phishing-resistant CMS session");
  return user;
}

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "End User Cases API E2E requires the real backend",
);

async function resolveCmsContext(
  request: APIRequestContext,
  user: ReturnType<typeof credentials>,
) {
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

async function restoreUiSession(
  page: Page,
  user: ReturnType<typeof credentials>,
) {
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
          displayName: "End User Cases E2E",
        },
      }),
    });
  });
}

test("loads the real Case inbox and persists policy preview, draft and publish", async ({
  page,
  request,
}, testInfo) => {
  const user = credentials(testInfo);
  const context = await resolveCmsContext(request, user);
  await restoreUiSession(page, user);

  const list = await request.get(
    `${apiOrigin}/api/v1/admin/projects/${context.project.id}/end-user-cases`,
    { headers: context.headers },
  );
  expect(list.ok()).toBe(true);
  expect(await list.json()).toEqual(
    expect.objectContaining({ items: expect.any(Array) }),
  );

  await page.goto("/cases");
  await expect(
    page.getByRole("heading", { level: 1, name: "Обращения пользователей" }),
  ).toBeVisible();
  await expect(page.getByText("Не удалось связаться с сервером")).toHaveCount(0);

  await page.goto("/cases/settings");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Категории и приоритеты",
    }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.getByText("Правила корректны.")).toBeVisible();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Черновик сохранён.")).toBeVisible();
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(
    page.getByText("Правила опубликованы и применяются к новым анализам."),
  ).toBeVisible();

  const policy = await request.get(
    `${apiOrigin}/api/v1/admin/projects/${context.project.id}/end-user-case-policy`,
    { headers: context.headers },
  );
  expect(policy.ok()).toBe(true);
  expect(await policy.json()).toEqual(
    expect.objectContaining({
      published: expect.objectContaining({
        status: "PUBLISHED",
        version: expect.any(Number),
      }),
      draft: null,
    }),
  );

  const screenshotDirectory = process.env.E2E_SCREENSHOT_DIR;
  if (screenshotDirectory) {
    await page.screenshot({
      path: `${screenshotDirectory}/end-user-cases-settings-${testInfo.project.name}.png`,
      fullPage: true,
      style: ".mobile-header { position: static !important; }",
    });
  }
});
