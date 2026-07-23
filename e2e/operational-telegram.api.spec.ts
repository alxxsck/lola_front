import { expect, test, type Page, type Route } from "@playwright/test";

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "Operational Telegram fixtures require API mode",
);

const projectId = "00000000-0000-4000-8000-000000000310";
const destinationId = "00000000-0000-4000-8000-000000000311";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installFixtures(page: Page) {
  let destination: Record<string, unknown> | null = null;
  let readsAfterChallenge = 0;
  const idempotencyKeys: string[] = [];
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/api/v1/auth/refresh") {
      return json(route, {
        kind: "AUTHENTICATED",
        tokenType: "Bearer",
        accessToken: "e2e_access_token",
        expiresIn: 900,
        refreshExpiresIn: 86_400,
        user: {
          id: "user-1",
          email: "operator@example.com",
          displayName: "Оператор",
        },
      });
    }
    if (request.method() === "GET" && path === "/api/v1/auth/me") {
      return json(route, {
        user: {
          id: "user-1",
          email: "operator@example.com",
          displayName: "Оператор",
        },
        platformPermissionCodes: [],
        projects: [
          {
            id: projectId,
            name: "Telegram Project",
            slug: "telegram-project",
            status: "ACTIVE",
            publicKey: "public-key",
            defaultLocale: "ru",
            supportedLocales: ["ru"],
            assistantName: "Lola",
            systemPrompt: "",
            voiceInstructions: "",
            settings: {},
            membershipId: "00000000-0000-4000-8000-000000000312",
            membershipStatus: "ACTIVE",
            membershipVersion: 1,
            roleKeys: ["PROJECT_ADMIN"],
            effectivePermissionCodes: [
              "project.notifications.read",
              "project.notifications.manage",
            ],
          },
        ],
      });
    }
    const base = `/api/v1/admin/projects/${projectId}/notification-destinations`;
    if (path === base && request.method() === "GET") {
      if (destination && readsAfterChallenge > 0) {
        readsAfterChallenge += 1;
        if (readsAfterChallenge >= 2 && !destination.destinationChatId) {
          destination = {
            ...destination,
            destinationChatId: "-100123",
            destinationTitle: "Lola Ops",
            telegramInstallationStatus: "BOUND",
            routingRevision: 2,
            version: 2,
          };
        }
      }
      return json(route, { items: destination ? [destination] : [] });
    }
    if (
      path === `${base}/telegram-operational` &&
      request.method() === "POST"
    ) {
      idempotencyKeys.push(request.headers()["idempotency-key"] ?? "");
      const input = request.postDataJSON() as {
        displayName: string;
        botToken: string;
      };
      destination = {
        id: destinationId,
        projectId,
        topic: "AI_PROPOSALS",
        channel: "TELEGRAM_OPERATIONAL",
        displayName: input.displayName,
        status: "PENDING_TEST",
        credentialFingerprint: "0123456789abcdef",
        secretRevision: 1,
        routingRevision: 1,
        testedSecretRevision: null,
        testedRoutingRevision: null,
        lastSuccessfulTestAt: null,
        lastFailureCategory: null,
        version: 1,
        updatedByActorType: "CMS_USER",
        updatedByActorId: "user-1",
        updatedAt: "2026-07-23T12:00:00.000Z",
        botUsername: "LolaOpsBot",
        telegramBotId: "10001",
        destinationChatId: null,
        destinationTitle: null,
        telegramInstallationStatus: "PENDING_BINDING",
        telegramWebhookSetupStatus: "SUCCEEDED",
      };
      expect(JSON.stringify(destination)).not.toContain(input.botToken);
      return json(route, destination, 201);
    }
    if (
      path === `${base}/${destinationId}/telegram-binding-challenges` &&
      request.method() === "POST"
    ) {
      readsAfterChallenge = 1;
      return json(
        route,
        {
          id: "00000000-0000-4000-8000-000000000313",
          command: "/connect AbCdEf1234567890abcd",
          expiresAt: "2026-07-23T12:05:00.000Z",
          botUsername: "LolaOpsBot",
        },
        201,
      );
    }
    if (
      path === `${base}/${destinationId}/telegram-test` &&
      request.method() === "POST"
    ) {
      idempotencyKeys.push(request.headers()["idempotency-key"] ?? "");
      destination = {
        ...destination,
        testedSecretRevision: 1,
        testedRoutingRevision: 2,
        lastSuccessfulTestAt: "2026-07-23T12:02:00.000Z",
        version: 3,
      };
      return json(
        route,
        {
          id: "00000000-0000-4000-8000-000000000314",
          destinationId,
          status: "SUCCEEDED",
          errorCode: null,
          finishedAt: "2026-07-23T12:02:00.000Z",
          destinationVersion: 2,
        },
        202,
      );
    }
    if (
      path === `${base}/${destinationId}/telegram-operational` &&
      request.method() === "PATCH"
    ) {
      const input = request.postDataJSON() as {
        expectedVersion: number;
        desiredStatus?: "ACTIVE";
        botToken?: string;
      };
      if (input.botToken) {
        expect(input.expectedVersion).toBe(destination?.version);
        destination = {
          ...destination,
          status: "PENDING_TEST",
          credentialFingerprint: "fedcba9876543210",
          secretRevision: Number(destination?.secretRevision ?? 1) + 1,
          routingRevision: Number(destination?.routingRevision ?? 1) + 1,
          testedSecretRevision: null,
          testedRoutingRevision: null,
          lastSuccessfulTestAt: null,
          version: input.expectedVersion + 1,
          destinationChatId: null,
          destinationTitle: null,
          telegramInstallationStatus: "PENDING_BINDING",
          telegramWebhookSetupStatus: "PENDING",
        };
        readsAfterChallenge = 0;
        expect(JSON.stringify(destination)).not.toContain(input.botToken);
        return json(route, destination);
      }
      expect(input).toEqual({
        expectedVersion: 3,
        desiredStatus: "ACTIVE",
      });
      destination = { ...destination, status: "ACTIVE", version: 4 };
      return json(route, destination);
    }
    return json(
      route,
      {
        error: {
          code: "UNHANDLED_FIXTURE",
          message: `${request.method()} ${path}`,
        },
      },
      501,
    );
  });
  return { idempotencyKeys };
}

test("Project admin binds, tests and activates a separate operational Telegram bot", async ({
  page,
}) => {
  const fixture = await installFixtures(page);
  const token = `123456789:${"A".repeat(32)}`;
  await page.goto("/settings/integrations");

  await page.getByLabel("Название служебного подключения").fill("Operations");
  await page.getByLabel("Bot token от BotFather").fill(token);
  await page.getByRole("button", { name: "Проверить бота" }).click();
  await page.getByRole("button", { name: "Получить команду привязки" }).click();
  await expect(page.getByText("/connect AbCdEf1234567890abcd")).toBeVisible();
  await expect(page.locator('[data-field="telegram-bot-id"]')).toContainText(
    "10001",
  );
  await expect(
    page.locator('[data-field="telegram-last-failure"]'),
  ).toContainText("Нет");
  await expect(
    page.locator('[data-field="telegram-updated-by"]'),
  ).toContainText("Пользователь · user-1");
  await expect(
    page.locator('[data-field="telegram-updated-at"]'),
  ).not.toContainText("—");
  await expect(page.locator("body")).not.toContainText(token);

  await page.getByRole("button", { name: "Проверить привязку" }).click();
  await expect(page.getByText("Lola Ops")).toBeVisible();
  await page.getByRole("button", { name: "Проверить подключение" }).click();
  await expect(page.getByText("Тестовое сообщение отправлено")).toBeVisible();
  await page.getByRole("button", { name: "Активировать" }).click();
  await expect(
    page.getByText("Служебные Telegram-уведомления включены."),
  ).toBeVisible();

  expect(fixture.idempotencyKeys).toHaveLength(2);
  expect(fixture.idempotencyKeys.every((key) => key.length >= 8)).toBe(true);
});

test("Token rotation invalidates the old command while webhook setup is pending", async ({
  page,
}) => {
  await installFixtures(page);
  const token = `123456789:${"A".repeat(32)}`;
  const replacementToken = `987654321:${"B".repeat(32)}`;
  await page.goto("/settings/integrations");

  await page.getByLabel("Название служебного подключения").fill("Operations");
  await page.getByLabel("Bot token от BotFather").fill(token);
  await page.getByRole("button", { name: "Проверить бота" }).click();
  await page.getByRole("button", { name: "Получить команду привязки" }).click();
  await expect(page.getByText("/connect AbCdEf1234567890abcd")).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Новый bot token").fill(replacementToken);
  await page.getByRole("button", { name: "Заменить token" }).click();

  await expect(page.getByText("Регистрируем защищённый webhook")).toBeVisible();
  await expect(
    page.getByText("/connect AbCdEf1234567890abcd"),
  ).not.toBeVisible();
  await expect(
    page.getByRole("button", { name: "Получить команду привязки" }),
  ).not.toBeVisible();
  await expect(page.locator("body")).not.toContainText(replacementToken);
});
