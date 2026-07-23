import { expect, test, type Page, type Route } from "@playwright/test";

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "Product Telegram fixtures require API mode",
);

const projectId = "00000000-0000-4000-8000-000000000410";
const installationId = "00000000-0000-4000-8000-000000000411";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installFixtures(page: Page) {
  let installation: Record<string, unknown> | null = null;
  let testAttempt = 0;
  let setupRead = 0;
  const createKeys: string[] = [];
  const testKeys: string[] = [];

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/api/v1/auth/refresh") {
      return json(route, {
        kind: "AUTHENTICATED",
        tokenType: "Bearer",
        accessToken: "product_telegram_e2e_token",
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
            name: "Product Telegram Project",
            slug: "product-telegram-project",
            status: "ACTIVE",
            publicKey: "public-key",
            defaultLocale: "ru",
            supportedLocales: ["ru"],
            assistantName: "Lola",
            systemPrompt: "",
            voiceInstructions: "",
            settings: {},
            membershipId: "00000000-0000-4000-8000-000000000412",
            membershipStatus: "ACTIVE",
            membershipVersion: 1,
            roleKeys: ["PROJECT_ADMIN"],
            effectivePermissionCodes: [
              "project.integrations.read",
              "project.integrations.manage",
            ],
          },
        ],
      });
    }

    const base = `/api/v1/admin/projects/${projectId}/telegram-channel`;
    if (path === base && request.method() === "GET") {
      if (
        installation &&
        ["PENDING", "PROCESSING", "RETRY_WAIT"].includes(
          String(installation.webhookSetupStatus),
        )
      ) {
        setupRead += 1;
        installation =
          setupRead === 1
            ? { ...installation, webhookSetupStatus: "PROCESSING" }
            : {
                ...installation,
                status: "ACTIVE",
                webhookSetupStatus: "SUCCEEDED",
                healthStatus: "HEALTHY",
              };
      }
      return json(route, installation);
    }
    if (path === base && request.method() === "POST") {
      const input = request.postDataJSON() as { botToken: string };
      createKeys.push(request.headers()["idempotency-key"] ?? "");
      installation = {
        id: installationId,
        projectId,
        botUsername: "LolaProductBot",
        deepLinkBase: "https://t.me/LolaProductBot",
        telegramBotId: "9007199254740993",
        credentialFingerprint: "0123456789abcdef",
        status: "PENDING_SETUP",
        webhookSetupStatus: "PENDING",
        webhookSetupErrorCode: null,
        healthStatus: "NOT_TESTED",
        lastTestedAt: null,
        lastTestFailureCode: null,
        linkedUserCount: 12,
        updatedByActorType: "CMS_USER",
        updatedByActorId: "user-1",
        version: 1,
        updatedAt: "2026-07-23T12:00:00.000Z",
      };
      setupRead = 0;
      expect(JSON.stringify(installation)).not.toContain(input.botToken);
      return json(route, installation, 201);
    }
    if (
      path === `${base}/${installationId}/test` &&
      request.method() === "POST"
    ) {
      const input = request.postDataJSON() as { expectedVersion: number };
      expect(input.expectedVersion).toBe(installation?.version);
      testKeys.push(request.headers()["idempotency-key"] ?? "");
      testAttempt += 1;
      if (testAttempt === 1) {
        return json(
          route,
          {
            id: "00000000-0000-4000-8000-000000000413",
            installationVersion: 1,
            status: "PROCESSING",
            errorCode: null,
            finishedAt: null,
            createdAt: "2026-07-23T12:01:00.000Z",
          },
          202,
        );
      }
      installation = {
        ...installation,
        status: "ACTIVE",
        webhookSetupStatus: "SUCCEEDED",
        healthStatus: "HEALTHY",
        lastTestedAt: "2026-07-23T12:01:30.000Z",
        updatedAt: "2026-07-23T12:01:30.000Z",
      };
      return json(
        route,
        {
          id: "00000000-0000-4000-8000-000000000413",
          installationVersion: 1,
          status: "SUCCEEDED",
          errorCode: null,
          finishedAt: "2026-07-23T12:01:30.000Z",
          createdAt: "2026-07-23T12:01:00.000Z",
        },
        202,
      );
    }
    if (path === base && request.method() === "PATCH") {
      const input = request.postDataJSON() as {
        botToken: string;
        expectedVersion: number;
      };
      expect(input.expectedVersion).toBe(installation?.version);
      installation = {
        ...installation,
        credentialFingerprint: "fedcba9876543210",
        status: "PENDING_SETUP",
        webhookSetupStatus: "PENDING",
        healthStatus: "NOT_TESTED",
        lastTestedAt: null,
        version: input.expectedVersion + 1,
        updatedAt: "2026-07-23T12:02:00.000Z",
      };
      setupRead = 0;
      expect(JSON.stringify(installation)).not.toContain(input.botToken);
      return json(route, installation);
    }
    if (path === `${base}/disable` && request.method() === "POST") {
      const input = request.postDataJSON() as { expectedVersion: number };
      expect(input.expectedVersion).toBe(installation?.version);
      installation = {
        ...installation,
        status: "DISABLED",
        version: input.expectedVersion + 1,
        updatedAt: "2026-07-23T12:03:00.000Z",
      };
      return json(route, installation);
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

  return { createKeys, testKeys };
}

test("project admin creates, tests, rotates and disables the separate product bot", async ({
  page,
}) => {
  const fixture = await installFixtures(page);
  const token = `123456789:${"A".repeat(32)}`;
  const replacementToken = `987654321:${"B".repeat(32)}`;
  await page.goto("/settings/integrations");

  await expect(
    page.getByRole("heading", {
      name: "Telegram · Пользователи продукта",
    }),
  ).toBeVisible();
  await expect(page.getByText("Не подключено", { exact: true })).toBeVisible();
  await page.getByLabel("Bot token", { exact: true }).fill(token);
  await page.getByRole("button", { name: "Подключить product bot" }).click();

  await expect(page.getByText("@LolaProductBot")).toBeVisible();
  await expect(page.getByText("0123456789abcdef")).toBeVisible();
  await expect(page.getByText("12", { exact: true })).toBeVisible();
  await expect(page.locator("body")).not.toContainText(token);

  await page.getByRole("button", { name: "Проверить bot identity" }).click();
  await expect(
    page.getByText("Telegram подтвердил bot identity."),
  ).toBeVisible();

  page.on("dialog", (dialog) => dialog.accept());
  await page.getByLabel("Новый bot token").fill(replacementToken);
  await page.getByRole("button", { name: "Заменить token" }).click();
  await expect(page.getByText("fedcba9876543210")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(replacementToken);

  await page.getByRole("button", { name: "Отключить" }).click();
  await expect(page.getByText("Отключено", { exact: true })).toBeVisible();

  expect(fixture.createKeys).toHaveLength(1);
  expect(fixture.createKeys[0]?.length).toBeGreaterThanOrEqual(8);
  expect(fixture.testKeys).toHaveLength(2);
  expect(new Set(fixture.testKeys).size).toBe(1);
});
