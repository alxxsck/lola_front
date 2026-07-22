import {
  expect,
  test,
  type APIRequestContext,
  type Page,
  type TestInfo,
} from "@playwright/test";

const apiOrigin = process.env.E2E_API_ORIGIN ?? "http://127.0.0.1:3000";
const loginName = process.env.E2E_LOGIN;
const password = process.env.E2E_PASSWORD;
const projectPublicKey = process.env.E2E_PROJECT_PUBLIC_KEY ?? "lola_pub_demo";
const serverApiKey = process.env.E2E_SERVER_API_KEY ?? "lola_srv_demo";

function credentials(testInfo: TestInfo) {
  const users = JSON.parse(process.env.E2E_USERS ?? "[]") as Array<{
    email: string;
    password: string;
  }>;
  const projectOffset = testInfo.project.name.includes("mobile") ? 3 : 0;
  return (
    users[projectOffset + 2] ?? {
      email: loginName,
      password,
    }
  );
}

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "Event Schema authoring E2E requires the real backend",
);

async function login(
  page: Page,
  projectName: string,
  user: ReturnType<typeof credentials>,
) {
  if (!user.email || !user.password) {
    throw new Error("E2E_LOGIN and E2E_PASSWORD are required");
  }
  await page.goto("/login");
  await page.getByLabel("Email", { exact: true }).fill(user.email);
  await page.locator("#password").fill(user.password);
  await page.getByRole("button", { name: "Продолжить" }).click();
  const projectChoice = page
    .locator("button.project-option")
    .filter({ hasText: projectName });
  if (await projectChoice.isVisible().catch(() => false)) {
    await projectChoice.click();
  }
  await expect(page).toHaveURL(/\/overview$/);
}

async function cmsContext(
  request: APIRequestContext,
  user: ReturnType<typeof credentials>,
) {
  const auth = await request.post(`${apiOrigin}/api/v1/auth/login`, {
    data: { identifier: user.email, secret: user.password },
  });
  expect(auth.ok()).toBe(true);
  const tokens = (await auth.json()) as { accessToken: string };
  const headers = { Authorization: `Bearer ${tokens.accessToken}` };
  const projects = await request.get(`${apiOrigin}/api/v1/auth/me`, {
    headers,
  });
  expect(projects.ok()).toBe(true);
  const items = (
    (await projects.json()) as {
      projects: Array<{ id: string; name: string; publicKey: string }>;
    }
  ).projects;
  const project = items.find((item) => item.publicKey === projectPublicKey);
  expect(project, `Project ${projectPublicKey} must exist`).toBeTruthy();
  return { headers, projectId: project!.id, projectName: project!.name };
}

test("edits fields, publishes revision 2, ingests it and exposes its Event Log", async ({
  page,
  request,
}, testInfo) => {
  const user = credentials(testInfo);
  const context = await cmsContext(request, user);
  await login(page, context.projectName, user);
  const suffix = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const code = `e2e.schema.${suffix}`;
  const name = `E2E schema ${suffix}`;
  const created = await request.post(
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
  expect(created.ok()).toBe(true);
  const definition = (await created.json()) as {
    definitionKeyId: string;
    revisionId: string;
  };

  await page.goto(`/events/${definition.definitionKeyId}`);
  await page.locator("#event-overview-name").fill(`${name} renamed`);
  await page
    .locator("form.overview-form")
    .getByRole("button", { name: "Сохранить" })
    .click();
  await expect(page.getByText(/Ревизия схемы не изменилась/)).toBeVisible();
  await expect(page.locator('[data-test="schema-revision"]')).toContainText(
    "v1",
  );

  await page.getByRole("tab", { name: "Приём событий" }).click();
  await page.getByLabel("Принимать новые события").uncheck();
  await page.getByLabel("Разрешить приём из браузера").check();
  await page.getByLabel("Учитывать как активность").check();
  await page
    .getByLabel("Причина изменения")
    .fill("Проверка полного policy editor");
  await page.getByRole("button", { name: "Сохранить правила приёма" }).click();
  const disableDialog = page.getByRole("dialog", {
    name: "Выключить приём событий?",
  });
  await expect(disableDialog).toContainText(code);
  await expect(disableDialog).toContainText("будущий приём");
  await disableDialog.getByRole("button", { name: "Выключить приём" }).click();
  await expect(
    page.getByText("Правила приёма событий обновлены без новой версии схемы."),
  ).toBeVisible();
  await page.getByLabel("Принимать новые события").check();
  await page
    .getByLabel("Причина изменения")
    .fill("Повторное включение ingestion");
  await page.getByRole("button", { name: "Сохранить правила приёма" }).click();
  await expect(
    page.getByText("Правила приёма событий обновлены без новой версии схемы."),
  ).toBeVisible();
  await expect(page.locator('[data-test="schema-revision"]')).toContainText(
    "v1",
  );

  const catalogResponse = await request.get(
    `${apiOrigin}/api/v1/admin/projects/${context.projectId}/scenario-authoring/catalog`,
    { headers: context.headers },
  );
  expect(catalogResponse.ok()).toBe(true);
  const catalog = (await catalogResponse.json()) as { revision: string };
  const scenarioResponse = await request.post(
    `${apiOrigin}/api/v1/admin/projects/${context.projectId}/scenario-authoring/scenarios`,
    {
      headers: context.headers,
      data: {
        scenario: {
          code: `e2e-exact-${suffix}`,
          name: `E2E exact dependency ${suffix}`,
          triggerEventDefinitionRevisionId: definition.revisionId,
        },
        draft: {
          catalogRevision: catalog.revision,
          deliveryPolicy: { kind: "IMMEDIATE" },
          graph: {
            actions: [
              {
                position: 0,
                nodeKey: "say",
                nextNodeKey: null,
                type: "SAY",
                config: { text: "Готово" },
              },
            ],
          },
        },
      },
    },
  );
  expect(scenarioResponse.ok()).toBe(true);
  const scenario = (await scenarioResponse.json()) as {
    scenarioId: string;
    draft: { version: number };
  };
  const publishedScenario = await request.post(
    `${apiOrigin}/api/v1/admin/projects/${context.projectId}/scenario-authoring/scenarios/${scenario.scenarioId}/publish`,
    {
      headers: context.headers,
      data: {
        expectedCurrentRevisionId: null,
        expectedDraftVersion: scenario.draft.version,
        catalogRevision: catalog.revision,
        triggerMatchingMode: "EXACT",
      },
    },
  );
  expect(
    publishedScenario.ok(),
    `Scenario publish failed (${publishedScenario.status()}): ${await publishedScenario.text()}`,
  ).toBe(true);

  const policyTab = page.getByRole("tab", { name: "Приём событий" });
  await policyTab.focus();
  await page.keyboard.press("ArrowRight");
  await expect(page.getByRole("tab", { name: "Схема данных" })).toBeFocused();
  const addField = page.getByRole("button", { name: "+ Добавить поле" });
  await addField.focus();
  await page.keyboard.press("Enter");
  await page.locator('[data-test="field-title"]').fill("Валюта");
  await page.locator('[data-test="field-wire-key"]').fill("currency");
  const saveDraft = page.getByRole("button", { name: "Сохранить черновик" });
  await saveDraft.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText(/Черновик v1 сохранён/)).toBeVisible();
  await page.reload();
  const schemaTab = page.getByRole("tab", { name: "Схема данных" });
  await schemaTab.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Черновик v1", { exact: true })).toBeVisible();
  await expect(page.locator('[data-test="field-wire-key"]')).toHaveValue(
    "currency",
  );
  const analyze = page.getByRole("button", { name: "Проверить влияние" });
  await analyze.focus();
  await page.keyboard.press("Enter");
  await expect(page.getByText("Безопасное изменение")).toBeVisible();
  await expect(page.locator('[data-test="impact-summary"]')).toContainText(
    "Блокеров: 1",
  );
  await expect(
    page.getByRole("button", { name: "Опубликовать версию 2" }),
  ).toBeDisabled();
  const screenshotDirectory = process.env.E2E_SCREENSHOT_DIR;
  if (screenshotDirectory) {
    await page.screenshot({
      path: `${screenshotDirectory}/event-schema-impact-blocked-${testInfo.project.name}.png`,
      fullPage: true,
      style: ".mobile-header { position: static !important; }",
    });
  }
  const scenarioDocumentResponse = await request.get(
    `${apiOrigin}/api/v1/admin/projects/${context.projectId}/scenario-authoring/scenarios/${scenario.scenarioId}`,
    { headers: context.headers },
  );
  expect(scenarioDocumentResponse.ok()).toBe(true);
  const scenarioDocument = (await scenarioDocumentResponse.json()) as {
    updatedAt: string;
  };
  const archivedScenario = await request.post(
    `${apiOrigin}/api/v1/admin/projects/${context.projectId}/scenario-authoring/scenarios/${scenario.scenarioId}/archive`,
    {
      headers: context.headers,
      data: {
        expectedUpdatedAt: scenarioDocument.updatedAt,
        reason: "Resolve Event Schema E2E dependency",
      },
    },
  );
  expect(archivedScenario.ok()).toBe(true);
  await analyze.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-test="impact-summary"]')).toContainText(
    "Блокеров: 0",
  );
  await page
    .getByLabel("Причина публикации")
    .fill("Добавлено необязательное поле currency");
  const publish = page.getByRole("button", { name: "Опубликовать версию 2" });
  await publish.focus();
  await page.keyboard.press("Enter");
  await expect(page.locator('[data-test="schema-revision"]')).toContainText(
    "v2",
  );
  if (screenshotDirectory) {
    await page.screenshot({
      path: `${screenshotDirectory}/event-schema-published-${testInfo.project.name}.png`,
      fullPage: true,
      style: ".mobile-header { position: static !important; }",
    });
  }

  await page.reload();
  await expect(page.locator('[data-test="schema-revision"]')).toContainText(
    "v2",
  );
  const draft = await request.get(
    `${apiOrigin}/api/v1/admin/projects/${context.projectId}/event-catalog/event-definitions/${definition.definitionKeyId}/schema-draft`,
    { headers: context.headers },
  );
  expect(draft.status()).toBe(404);

  const ingest = await request.post(`${apiOrigin}/api/v1/events`, {
    headers: {
      Authorization: `Bearer ${serverApiKey}`,
      "Idempotency-Key": `e2e-schema-${suffix}`,
    },
    data: {
      eventCode: code,
      externalUserId: `e2e-user-${suffix}`,
      payload: { currency: "EUR" },
    },
  });
  expect(ingest.status()).toBe(202);
  const oldCompatibleIngest = await request.post(`${apiOrigin}/api/v1/events`, {
    headers: {
      Authorization: `Bearer ${serverApiKey}`,
      "Idempotency-Key": `e2e-schema-old-${suffix}`,
    },
    data: {
      eventCode: code,
      externalUserId: `e2e-user-old-${suffix}`,
      payload: {},
    },
  });
  expect(oldCompatibleIngest.status()).toBe(202);

  const publishedDefinitionResponse = await request.get(
    `${apiOrigin}/api/v1/admin/projects/${context.projectId}/event-catalog/event-definitions/${definition.definitionKeyId}`,
    { headers: context.headers },
  );
  expect(publishedDefinitionResponse.ok()).toBe(true);
  const publishedDefinition = (await publishedDefinitionResponse.json()) as {
    currentRevision: { id: string; number: number };
    policy: { version: number };
  };
  const eventLogsResponse = await request.get(
    `${apiOrigin}/api/v1/admin/projects/${context.projectId}/event-logs?eventCode=${encodeURIComponent(code)}`,
    { headers: context.headers },
  );
  expect(eventLogsResponse.ok()).toBe(true);
  const eventLogs = (await eventLogsResponse.json()) as {
    items: Array<{
      eventDefinition: { id: string; version: number };
      ingestionPolicyVersion: number;
      ingestionPolicySnapshot: Record<string, unknown>;
    }>;
  };
  expect(eventLogs.items).toHaveLength(2);
  for (const item of eventLogs.items) {
    expect(item.eventDefinition).toMatchObject({
      id: publishedDefinition.currentRevision.id,
      version: 2,
    });
    expect(item.ingestionPolicyVersion).toBe(
      publishedDefinition.policy.version,
    );
    expect(item.ingestionPolicySnapshot).toMatchObject({
      enabled: true,
      clientIngestible: true,
      countsAsActivity: true,
      source: "SERVER",
    });
  }

  await page.goto(`/events/${definition.definitionKeyId}`);
  await page.getByRole("tab", { name: "Схема данных" }).click();
  await page.getByRole("button", { name: "+ Добавить поле" }).click();
  await page.locator('[data-test="field-title"]').last().fill("Reference");
  await page.locator('[data-test="field-wire-key"]').last().fill("reference");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await page.getByRole("button", { name: "Отменить черновик" }).click();
  await page.getByLabel("Причина").fill("E2E discard verification");
  await page.getByRole("button", { name: "Удалить черновик" }).click();
  await expect(page.getByText(/Черновик удалён/)).toBeVisible();
  const discardedDraft = await request.get(
    `${apiOrigin}/api/v1/admin/projects/${context.projectId}/event-catalog/event-definitions/${definition.definitionKeyId}/schema-draft`,
    { headers: context.headers },
  );
  expect(discardedDraft.status()).toBe(404);
  await page.goto(`/event-logs?eventCode=${encodeURIComponent(code)}`);
  await expect(page.getByText(code, { exact: false }).first()).toBeVisible();
  const tableLogButton = page
    .getByRole("button", { name: /Открыть лог/ })
    .first();
  if (await tableLogButton.isVisible().catch(() => false)) {
    await tableLogButton.click();
  } else {
    await page.locator(".timeline-item").first().click();
  }
  await expect(page.getByText("Schema revision")).toBeVisible();
  await expect(page.getByText("Ingestion policy")).toBeVisible();
  await expect(page.locator(".identity-grid")).toContainText("v2");
  await expect(page.locator(".identity-grid")).toContainText(
    `v${publishedDefinition.policy.version}`,
  );
  await expect(page.locator('[data-test="policy-snapshot"]')).toContainText(
    "Приём включёнДа",
  );
  await expect(page.locator('[data-test="policy-snapshot"]')).toContainText(
    "Из браузераДа",
  );
  await expect(page.locator('[data-test="policy-snapshot"]')).toContainText(
    "Считает активностьДа",
  );
  await expect(page.locator('[data-test="policy-snapshot"]')).toContainText(
    "ИсточникSERVER",
  );
});
