import {
  expect,
  test,
  type APIRequestContext,
  type Page,
} from "@playwright/test";

const apiOrigin = process.env.E2E_API_ORIGIN ?? "http://127.0.0.1:3000";
const loginName = process.env.E2E_LOGIN;
const password = process.env.E2E_PASSWORD;
const projectPublicKey = process.env.E2E_PROJECT_PUBLIC_KEY ?? "lola_pub_demo";
const serverApiKey = process.env.E2E_SERVER_API_KEY ?? "lola_srv_demo";

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "Event Definition lifecycle E2E requires the real backend",
);

async function login(page: Page, projectName: string) {
  if (!loginName || !password) {
    throw new Error("E2E_LOGIN and E2E_PASSWORD are required");
  }
  await page.goto("/login");
  await page.getByLabel("Email или имя пользователя").fill(loginName);
  await page.locator("#password").fill(password);
  await page.getByRole("button", { name: "Продолжить" }).click();
  const projectChoice = page.locator("button.project-option").filter({ hasText: projectName });
  if (await projectChoice.isVisible().catch(() => false)) await projectChoice.click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function cmsContext(request: APIRequestContext) {
  const auth = await request.post(`${apiOrigin}/api/v1/auth/login`, {
    data: { login: loginName, password },
  });
  expect(auth.ok()).toBe(true);
  const tokens = (await auth.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${tokens.accessToken}` };
  const projects = await request.get(`${apiOrigin}/api/v1/admin/projects`, {
    headers,
  });
  expect(projects.ok()).toBe(true);
  const items = (await projects.json()) as Array<{
    id: string;
    name: string;
    publicKey: string;
  }>;
  const project = items.find((item) => item.publicKey === projectPublicKey);
  expect(project, `Project ${projectPublicKey} must exist`).toBeTruthy();
  return { headers, projectId: project!.id, projectName: project!.name };
}

async function createDefinition(
  request: APIRequestContext,
  context: Awaited<ReturnType<typeof cmsContext>>,
  code: string,
  name: string,
) {
  const response = await request.post(
    `${apiOrigin}/api/v1/admin/projects/${context.projectId}/event-catalog/event-definitions`,
    {
      headers: context.headers,
      data: {
        code,
        name,
        payloadSchema: {
          type: "object",
          additionalProperties: false,
          properties: {},
        },
      },
    },
  );
  expect(response.ok()).toBe(true);
  return (await response.json()) as {
    id: string;
    code: string;
    policy: { enabled: boolean };
  };
}

test("unused custom Event is physically deleted and stays absent after reload", async ({
  page,
  request,
}) => {
  const context = await cmsContext(request);
  await login(page, context.projectName);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const code = `e2e.delete.${suffix}`;
  const name = `E2E delete ${suffix}`;
  const definition = await createDefinition(request, context, code, name);

  await page.goto(`/events/${definition.id}`);
  await expect(page.getByRole("heading", { name })).toBeVisible();
  await page.getByRole("button", { name: "Удалить", exact: true }).click();
  await page.getByLabel("Причина удаления").fill("Disposable E2E definition");
  await page.getByLabel(`Введите код ${code}`).fill(code);
  await page.getByRole("button", { name: "Удалить навсегда" }).click();
  await expect(page).toHaveURL(/\/events$/);
  await page.reload();
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);

  const proof = await request.get(
    `${apiOrigin}/api/v1/admin/projects/${context.projectId}/event-catalog/event-definitions/${definition.id}`,
    { headers: context.headers },
  );
  expect(proof.status()).toBe(404);
});

test("Event-Log-only definition archives, keeps history, and restores disabled", async ({
  page,
  request,
}) => {
  const context = await cmsContext(request);
  await login(page, context.projectName);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const code = `e2e.archive.${suffix}`;
  const name = `E2E archive ${suffix}`;
  const definition = await createDefinition(request, context, code, name);
  const ingest = await request.post(`${apiOrigin}/api/v1/events`, {
    headers: {
      Authorization: `Bearer ${serverApiKey}`,
      "Idempotency-Key": `e2e-archive-${suffix}`,
    },
    data: {
      eventCode: code,
      externalUserId: `e2e-user-${suffix}`,
      payload: {},
    },
  });
  expect(ingest.status()).toBe(202);

  await page.goto(`/events/${definition.id}`);
  await page.getByRole("button", { name: "Архивировать", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Архивировать событие?" })
    .getByRole("button", { name: "Архивировать", exact: true })
    .click();
  await expect(page).toHaveURL(/\/events\?lifecycle=ARCHIVED$/);
  const archivedCard = page.locator("article.event-card").filter({
    hasText: name,
  });
  await expect(archivedCard).toBeVisible();
  await expect(
    archivedCard.getByText("В архиве", { exact: true }),
  ).toBeVisible();

  await page.goto("/events");
  await expect(page.getByText(name, { exact: true })).toHaveCount(0);
  await page.goto(`/event-logs?eventCode=${encodeURIComponent(code)}`);
  await expect(page.getByText(code, { exact: false }).first()).toBeVisible();

  await page.goto(`/events/${definition.id}`);
  await page.getByRole("button", { name: "Восстановить" }).click();
  await expect(page.locator('[data-test="lifecycle-state"]')).toHaveText(
    "Выключено",
  );
  await page.reload();
  await expect(page.locator('[data-test="lifecycle-state"]')).toHaveText(
    "Выключено",
  );

  const restored = await request.get(
    `${apiOrigin}/api/v1/admin/projects/${context.projectId}/event-catalog/event-definitions/${definition.id}`,
    { headers: context.headers },
  );
  expect(restored.ok()).toBe(true);
  expect((await restored.json()) as object).toMatchObject({
    lifecycle: "ACTIVE",
    policy: { enabled: false },
  });
});
