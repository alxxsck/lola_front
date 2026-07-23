import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "Telegram broadcast fixtures require API mode",
);

const projectId = "00000000-0000-4000-8000-000000000710";
const broadcastId = "00000000-0000-4000-8000-000000000711";
const endUserExternalId = "customer-anna";
const revisionId = "00000000-0000-4000-8000-000000000713";
const testId = "00000000-0000-4000-8000-000000000714";
const contentHash =
  "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

type FixtureStatus =
  | "DRAFT"
  | "APPROVED"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "CANCELLED";

async function installFixtures(
  page: Page,
  initial: {
    created?: boolean;
    status?: FixtureStatus;
    version?: number;
    scheduledAt?: string | null;
  } = {},
) {
  const commands: Array<{
    path: string;
    status: number;
    idempotencyKey: string;
    body: Record<string, unknown>;
  }> = [];
  let created = initial.created ?? false;
  let status: FixtureStatus = initial.status ?? "DRAFT";
  let version = initial.version ?? 1;
  let latestTest:
    | {
        id: string;
        label: string;
        revisionId: string;
        status: "SENT";
        currentRevision: boolean;
        sentAt: string;
      }
    | null = null;
  let approval:
    | {
        id: string;
        revisionId: string;
        contentHash: string;
        recipientCount: number;
        successfulTestId: string;
        audiencePolicy: string;
        approvedAt: string;
        approvedByActorId: string;
        approvedByActorType: string;
      }
    | null = null;
  let scheduledAt: string | null = initial.scheduledAt ?? null;

  const allowedActions = () => {
    if (status === "DRAFT")
      return latestTest
        ? ["EDIT", "PREVIEW", "TEST_SEND", "APPROVE", "CANCEL"]
        : ["EDIT", "PREVIEW", "TEST_SEND", "CANCEL"];
    if (status === "APPROVED") return ["SCHEDULE", "START", "CANCEL"];
    if (status === "SCHEDULED") return ["START", "PAUSE", "CANCEL"];
    if (status === "RUNNING") return ["PAUSE", "CANCEL"];
    if (status === "PAUSED") return ["RESUME", "CANCEL"];
    return [];
  };
  const revision = () => ({
    id: revisionId,
    revisionNumber: 1,
    contentHash,
    text: "В Lola появилось новое обновление.",
    createdAt: "2026-07-23T10:00:00.000Z",
  });
  const summary = () => ({
    id: broadcastId,
    projectId,
    title: "Июльское обновление",
    status,
    version,
    revision: revision(),
    recipientCount: approval?.recipientCount ?? 0,
    scheduledAt,
    allowedActions: allowedActions(),
    createdAt: "2026-07-23T10:00:00.000Z",
    updatedAt: "2026-07-23T10:10:00.000Z",
  });
  const detail = () => ({
    ...summary(),
    latestTest,
    approval,
    progress: {
      total: approval?.recipientCount ?? 0,
      pending: status === "RUNNING" ? 4 : 0,
      sending: 0,
      sent: status === "RUNNING" || status === "PAUSED" ? 6 : 0,
      retryWait: 1,
      outcomeUnknown: 0,
      failedPermanent: 0,
      suppressedLink: 1,
      suppressedConsent: 0,
      suppressedInstallation: 0,
      cancelled: status === "CANCELLED" ? 4 : 0,
    },
  });

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();
    if (method === "POST" && path === "/api/v1/auth/refresh") {
      return json(route, {
        kind: "AUTHENTICATED",
        tokenType: "Bearer",
        accessToken: "telegram_broadcast_e2e_token",
        expiresIn: 900,
        refreshExpiresIn: 86_400,
        user: {
          id: "operator-1",
          email: "operator@example.com",
          displayName: "Оператор",
        },
      });
    }
    if (method === "GET" && path === "/api/v1/auth/me") {
      return json(route, {
        user: {
          id: "operator-1",
          email: "operator@example.com",
          displayName: "Оператор",
        },
        platformPermissionCodes: [],
        projects: [
          {
            id: projectId,
            name: "Broadcast Project",
            slug: "broadcast-project",
            status: "ACTIVE",
            publicKey: "public-key",
            defaultLocale: "ru",
            supportedLocales: ["ru"],
            assistantName: "Lola",
            systemPrompt: "",
            voiceInstructions: "",
            settings: {},
            membershipId: "00000000-0000-4000-8000-000000000715",
            membershipStatus: "ACTIVE",
            membershipVersion: 1,
            roleKeys: ["BROADCAST_OPERATOR"],
            effectivePermissionCodes: [
              "project.telegram.broadcasts.read",
              "project.telegram.broadcasts.draft",
              "project.telegram.broadcasts.approve",
              "project.telegram.broadcasts.operate",
            ],
          },
        ],
      });
    }
    const base = `/api/v1/admin/projects/${projectId}/telegram-broadcasts`;
    if (method === "GET" && path === base) {
      return json(route, {
        items: created ? [summary()] : [],
        nextCursor: null,
        total: created ? 1 : 0,
      });
    }
    if (method === "POST" && path === base) {
      created = true;
      const body = request.postDataJSON();
      commands.push({
        path,
        status: 201,
        idempotencyKey: request.headers()["idempotency-key"] ?? "",
        body,
      });
      return json(route, summary(), 201);
    }
    if (method === "GET" && path === `${base}/${broadcastId}`)
      return json(route, detail());
    if (method === "POST" && path === `${base}/${broadcastId}/preview`) {
      return json(route, {
        version,
        revisionId,
        contentHash,
        renderedText: revision().text,
        eligibleRecipientCount: 12,
        totalEvaluated: 15,
        exclusions: {
          consentNotActive: 1,
          staleConsent: 0,
          noActiveLink: 1,
          installationUnavailable: 1,
        },
      });
    }
    if (method === "POST" && path === `${base}/${broadcastId}/tests`) {
      const body = request.postDataJSON();
      latestTest = {
        id: testId,
        label: String(body.label),
        revisionId,
        status: "SENT",
        currentRevision: true,
        sentAt: "2026-07-23T10:05:00.000Z",
      };
      commands.push({
        path,
        status: 201,
        idempotencyKey: request.headers()["idempotency-key"] ?? "",
        body,
      });
      return json(route, { ...latestTest, version }, 201);
    }
    if (method === "POST" && path === `${base}/${broadcastId}/approve`) {
      const body = request.postDataJSON();
      approval = {
        id: "approval-1",
        revisionId,
        contentHash,
        recipientCount: 12,
        successfulTestId: testId,
        audiencePolicy: "ALL_EXPLICITLY_OPTED_IN",
        approvedAt: "2026-07-23T10:06:00.000Z",
        approvedByActorId: "operator-1",
        approvedByActorType: "CMS_USER",
      };
      status = "APPROVED";
      version += 1;
      commands.push({
        path,
        status: 200,
        idempotencyKey: request.headers()["idempotency-key"] ?? "",
        body,
      });
      return json(route, summary());
    }
    for (const action of ["schedule", "start", "pause", "resume", "cancel"]) {
      if (method !== "POST" || path !== `${base}/${broadcastId}/${action}`)
        continue;
      const body = request.postDataJSON();
      if (action === "schedule") {
        status = "SCHEDULED";
        scheduledAt = String(body.scheduledAt);
      }
      if (action === "start") status = "RUNNING";
      if (action === "pause") status = "PAUSED";
      if (action === "resume") status = "RUNNING";
      if (action === "cancel") status = "CANCELLED";
      version += 1;
      commands.push({
        path,
        status: 200,
        idempotencyKey: request.headers()["idempotency-key"] ?? "",
        body,
      });
      return json(route, summary());
    }
    if (method === "GET" && path === `${base}/${broadcastId}/outcomes`) {
      return json(route, {
        items:
          status === "DRAFT" || status === "APPROVED" ? [] : [
            {
              id: "opaque-outcome-1",
              status: "SUPPRESSED_LINK",
              errorCode: "TELEGRAM_BROADCAST_LINK_STALE",
              createdAt: "2026-07-23T10:07:00.000Z",
              finishedAt: "2026-07-23T10:07:01.000Z",
            },
          ],
        nextCursor: null,
        total: status === "DRAFT" || status === "APPROVED" ? 0 : 1,
      });
    }
    return json(
      route,
      {
        error: {
          code: "UNHANDLED_FIXTURE",
          message: `${method} ${path}`,
        },
      },
      501,
    );
  });
  return { commands };
}

test("runs the approved Telegram broadcast lifecycle through generated API contracts", async ({
  page,
}) => {
  const fixture = await installFixtures(page);
  await page.goto("/telegram/broadcasts");
  await page.getByRole("button", { name: "Создать рассылку" }).click();
  await page.getByLabel("Название рассылки").fill("Июльское обновление");
  await page
    .getByLabel("Сообщение")
    .fill("В Lola появилось новое обновление.");
  await page.getByRole("button", { name: "Сохранить черновик" }).click();

  await expect(page).toHaveURL(
    new RegExp(`/telegram/broadcasts/${broadcastId}$`),
  );
  await page.getByRole("button", { name: "Сформировать предпросмотр" }).click();
  await expect(page.getByText("12 получателей")).toBeVisible();
  await page.getByLabel("External ID пользователя").fill(endUserExternalId);
  await page.getByLabel("Метка теста").fill("Проверка Анны");
  await page.getByRole("button", { name: "Отправить тест" }).click();
  await expect(page.getByText("Тестовое сообщение: SENT")).toBeVisible();
  await page.getByRole("button", { name: "Подтвердить рассылку" }).click();
  const approvalDialog = page.getByRole("dialog", {
    name: "Подтвердить рассылку «Июльское обновление»",
  });
  await expect(approvalDialog).toContainText(contentHash);
  await expect(approvalDialog).toContainText("12");
  await expect(approvalDialog).toContainText(
    "Проверка Анны · SENT · текущая ревизия",
  );
  await approvalDialog
    .getByRole("button", { name: "Подтвердить и зафиксировать" })
    .click();

  await expect(page.getByText("Одобрена")).toBeVisible();
  const approvedEvidence = page.getByRole("region", {
    name: "Доказательства подтверждения",
  });
  await expect(approvedEvidence).toBeVisible();
  await expect(
    approvedEvidence.getByText("Проверка Анны · SENT · текущая ревизия"),
  ).toBeVisible();
  await page.getByLabel("Дата и время запуска").fill("2026-07-25T12:00");
  await page.getByRole("button", { name: "Запланировать" }).click();
  await expect(page.getByText("Запланирована")).toBeVisible();
  await page.getByRole("button", { name: "Запустить сейчас" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Отправляется" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Приостановить" }).click();
  await expect(page.getByText("Приостановлена")).toBeVisible();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Отправляется" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Отменить рассылку" }).click();
  const cancelDialog = page.getByRole("dialog", {
    name: "Отменить рассылку «Июльское обновление»",
  });
  await cancelDialog
    .getByRole("button", { name: "Отменить рассылку" })
    .click();
  await expect(page.getByText("Отменена")).toBeVisible();

  expect(fixture.commands[0]).toMatchObject({
    status: 201,
    body: {
      title: "Июльское обновление",
      text: "В Lola появилось новое обновление.",
    },
  });
  const testCommand = fixture.commands.find((item) =>
    item.path.endsWith("/tests"),
  );
  expect(testCommand).toMatchObject({
    status: 201,
    body: {
      expectedVersion: 1,
      endUserExternalId,
      label: "Проверка Анны",
    },
  });
  const approvalCommand = fixture.commands.find((item) =>
    item.path.endsWith("/approve"),
  );
  expect(approvalCommand?.body).toEqual({
    expectedVersion: 1,
    expectedContentHash: contentHash,
    expectedRecipientCount: 12,
    successfulTestId: testId,
  });
  expect(
    fixture.commands.every((command) => command.idempotencyKey.length >= 8),
  ).toBe(true);
  const accessibility = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("pauses a scheduled broadcast through the API contract", async ({
  page,
}) => {
  const fixture = await installFixtures(page, {
    created: true,
    status: "SCHEDULED",
    version: 3,
    scheduledAt: "2026-07-25T12:00:00.000Z",
  });
  await page.goto(`/telegram/broadcasts/${broadcastId}`);

  await expect(page.getByText("Запланирована")).toBeVisible();
  await page.getByRole("button", { name: "Приостановить" }).click();
  await expect(page.getByText("Приостановлена")).toBeVisible();

  const pauseCommand = fixture.commands.find((item) =>
    item.path.endsWith("/pause"),
  );
  expect(pauseCommand).toMatchObject({
    status: 200,
    body: { expectedVersion: 3 },
  });
});
