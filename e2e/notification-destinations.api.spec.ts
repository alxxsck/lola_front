import { expect, test, type Page, type Route } from "@playwright/test";

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "Notification destination fixtures require API mode",
);

const projectId = "00000000-0000-4000-8000-000000000210";
const destinationId = "00000000-0000-4000-8000-000000000211";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installFixtures(page: Page) {
  let destination: Record<string, unknown> | null = null;
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
            name: "Notification Project",
            slug: "notification-project",
            status: "ACTIVE",
            publicKey: "public-key",
            defaultLocale: "ru",
            supportedLocales: ["ru"],
            assistantName: "Lola",
            systemPrompt: "",
            voiceInstructions: "",
            settings: {},
            membershipId: "00000000-0000-4000-8000-000000000212",
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
      return json(route, { items: destination ? [destination] : [] });
    }
    if (path === base && request.method() === "POST") {
      idempotencyKeys.push(request.headers()["idempotency-key"] ?? "");
      const input = request.postDataJSON() as {
        displayName: string;
        webhookUrl: string;
      };
      destination = {
        id: destinationId,
        projectId,
        topic: "AI_PROPOSALS",
        channel: "SLACK_WEBHOOK",
        displayName: input.displayName,
        status: "PENDING_TEST",
        credentialFingerprint: "a1b2c3d4e5f60708",
        secretRevision: 1,
        testedSecretRevision: null,
        lastSuccessfulTestAt: null,
        lastFailureCategory: null,
        version: 1,
        updatedByActorType: "CMS_USER",
        updatedByActorId: "user-1",
        updatedAt: "2026-07-23T12:00:00.000Z",
      };
      expect(JSON.stringify(destination)).not.toContain(input.webhookUrl);
      return json(route, destination, 201);
    }
    if (
      path === `${base}/${destinationId}/test` &&
      request.method() === "POST"
    ) {
      idempotencyKeys.push(request.headers()["idempotency-key"] ?? "");
      destination = {
        ...destination,
        testedSecretRevision: 1,
        lastSuccessfulTestAt: "2026-07-23T12:01:00.000Z",
        version: 2,
      };
      return json(
        route,
        {
          id: "00000000-0000-4000-8000-000000000213",
          destinationId,
          status: "SUCCEEDED",
          errorCode: null,
          finishedAt: "2026-07-23T12:01:00.000Z",
          destinationVersion: 2,
        },
        202,
      );
    }
    if (path === `${base}/${destinationId}` && request.method() === "PATCH") {
      const input = request.postDataJSON() as {
        expectedVersion: number;
        desiredStatus: string;
      };
      expect(input).toEqual({ expectedVersion: 2, desiredStatus: "ACTIVE" });
      destination = { ...destination, status: "ACTIVE", version: 3 };
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

test("Project admin creates, tests and activates a write-only Slack destination", async ({
  page,
}) => {
  const fixture = await installFixtures(page);
  const secret =
    "https://hooks.slack.com/services/T000/B000/never-render-this-secret";

  await page.goto("/settings/integrations");
  await expect(
    page.getByRole("heading", { name: "Интеграции", level: 1 }),
  ).toBeVisible();
  await page.getByLabel("Название подключения").fill("Команда поддержки");
  await page.getByLabel("Incoming Webhook URL", { exact: true }).fill(secret);
  await page.getByRole("button", { name: "Сохранить и проверить" }).click();

  await expect(page.getByText("Проверка Slack прошла успешно")).toBeVisible();
  await expect(page.getByText("a1b2c3d4e5f60708")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(secret);
  await page.getByRole("button", { name: "Активировать" }).click();
  await expect(page.getByText("Подключено")).toBeVisible();
  await expect(page.getByText("Slack-уведомления включены.")).toBeVisible();

  expect(fixture.idempotencyKeys).toHaveLength(2);
  expect(fixture.idempotencyKeys.every((key) => key.length >= 8)).toBe(true);
  expect(new Set(fixture.idempotencyKeys).size).toBe(2);
});
