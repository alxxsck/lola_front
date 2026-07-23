import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page, type Route } from "@playwright/test";

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "Notification operations fixtures require API mode",
);

const projectId = "00000000-0000-4000-8000-000000000810";
const deliveryId = "00000000-0000-4000-8000-000000000811";
const integrationId = "00000000-0000-4000-8000-000000000812";
const maskedIdentity = "Slack •••• 000812";
const rawWebhookUrl =
  "https://hooks.slack.example/services/private/notification-operations";
const rawRecipientEmail = "private-recipient@example.com";
const rawProviderRef = "provider-secret-reference";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

interface CapturedCommand {
  path: string;
  headers: Record<string, string>;
  body: unknown;
}

interface FixtureOptions {
  permissions?: string[];
  revokeReadAfterFirstContext?: boolean;
  replayStatus?: number;
  logoutStatus?: number;
}

async function installFixtures(page: Page, options: FixtureOptions = {}) {
  const commands: CapturedCommand[] = [];
  const protectedReads: string[] = [];
  let deliveryVisible = true;
  let quarantined = false;
  let contextReads = 0;
  let logoutCalls = 0;
  const permissions = options.permissions ?? [
    "platform.notifications.operations.read",
    "platform.notifications.operations.operate",
  ];

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    const method = request.method();

    if (method === "POST" && path === "/api/v1/auth/refresh") {
      return json(route, {
        kind: "AUTHENTICATED",
        tokenType: "Bearer",
        accessToken: "notification_operations_e2e_token",
        expiresIn: 900,
        refreshExpiresIn: 86_400,
        user: {
          id: "platform-operator-1",
          email: "operator@example.com",
          displayName: "Platform Operator",
        },
      });
    }
    if (method === "GET" && path === "/api/v1/auth/me") {
      contextReads += 1;
      return json(route, {
        user: {
          id: "platform-operator-1",
          email: "operator@example.com",
          displayName: "Platform Operator",
        },
        platformPermissionCodes:
          options.revokeReadAfterFirstContext && contextReads > 1
            ? permissions.filter(
                (permission) =>
                  permission !== "platform.notifications.operations.read",
              )
            : permissions,
        projects: [],
      });
    }
    if (method === "POST" && path === "/api/v1/auth/logout") {
      logoutCalls += 1;
      if (options.logoutStatus && options.logoutStatus !== 200)
        return json(
          route,
          { error: { code: "LOGOUT_FAILED", message: "unsafe logout text" } },
          options.logoutStatus,
        );
      return json(route, { status: "LOGGED_OUT" });
    }

    const base = "/api/v1/admin/platform/notification-operations";
    if (method === "GET" && path === `${base}/health`) {
      protectedReads.push(path);
      if (options.revokeReadAfterFirstContext)
        return json(
          route,
          {
            error: {
              code: "NOTIFICATION_OPERATIONS_FORBIDDEN",
              message: "unsafe permission text",
            },
          },
          403,
        );
      return json(route, {
        observedAt: "2026-07-23T10:00:00.000Z",
        queues: [
          {
            queueKind: "OPERATIONAL_NOTIFICATION",
            channel: "SLACK_WEBHOOK",
            status: "DEAD_LETTER",
            count: deliveryVisible ? 1 : 0,
            oldestAgeSeconds: deliveryVisible ? 300 : 0,
            attemptsInWindow: 3,
          },
        ],
        permanentCount: deliveryVisible ? 1 : 0,
        ambiguousCount: 0,
        suppressedCount: quarantined ? 2 : 0,
        deadLetterCount: deliveryVisible ? 1 : 0,
        providers: [{ channel: "SLACK_WEBHOOK", state: "HEALTHY" }],
        telegramProductAdmission: [],
        retention: {
          notificationPayloadBacklog: 1,
          personalContentBacklog: 2,
          broadcastContentBacklog: 3,
          linkSecretBacklog: 4,
          operationalEvidenceBacklog: 5,
          lastSuccessfulBatchAt: null,
        },
        webhookUrl: rawWebhookUrl,
      });
    }
    if (method === "GET" && path === `${base}/deliveries`) {
      protectedReads.push(path);
      return json(route, {
        items: deliveryVisible
          ? [
              {
                id: deliveryId,
                projectId,
                channel: "SLACK_WEBHOOK",
                status: "DEAD_LETTER",
                errorCategory: "TRANSIENT",
                attemptCount: 3,
                operationsVersion: 2,
                replayEligibility: "ELIGIBLE_KNOWN_NOT_ACCEPTED",
                contentAvailable: false,
                createdAt: "2026-07-23T09:00:00.000Z",
                updatedAt: "2026-07-23T10:00:00.000Z",
                recipientEmail: rawRecipientEmail,
                providerRef: rawProviderRef,
              },
            ]
          : [],
        nextCursor: null,
      });
    }
    if (method === "GET" && path === `${base}/integrations`) {
      protectedReads.push(path);
      return json(route, {
        items: [
          {
            integrationId,
            kind: "SLACK_DESTINATION",
            projectId,
            status: quarantined ? "DISABLED" : "ACTIVE",
            version: quarantined ? 5 : 4,
            maskedIdentity,
            quarantineAllowed: !quarantined,
            webhookUrl: rawWebhookUrl,
            providerRef: rawProviderRef,
          },
        ],
        nextCursor: null,
      });
    }
    if (
      method === "POST" &&
      path === `${base}/deliveries/${deliveryId}/replay`
    ) {
      commands.push({
        path,
        headers: request.headers(),
        body: request.postData() ? request.postDataJSON() : null,
      });
      if (options.replayStatus && options.replayStatus !== 200)
        return json(
          route,
          {
            error: {
              code: "REAUTHENTICATION_REQUIRED",
              message: "unsafe reauthentication text",
            },
          },
          options.replayStatus,
        );
      deliveryVisible = false;
      return json(route, {
        id: deliveryId,
        projectId,
        channel: "SLACK_WEBHOOK",
        status: "PENDING",
        operationsVersion: 3,
        attemptCount: 3,
        contentAvailable: false,
        replayed: false,
      });
    }
    if (
      method === "POST" &&
      path ===
        `${base}/integrations/SLACK_DESTINATION/${integrationId}/quarantine`
    ) {
      commands.push({
        path,
        headers: request.headers(),
        body: request.postDataJSON(),
      });
      quarantined = true;
      return json(route, {
        integrationId,
        kind: "SLACK_DESTINATION",
        projectId,
        status: "DISABLED",
        version: 5,
        maskedIdentity,
        suppressedQueuedCount: 2,
        replayed: false,
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

  return {
    commands,
    protectedReads,
    logoutCalls: () => logoutCalls,
  };
}

test("replays one proven delivery and quarantines one integration without exposing sensitive data", async ({
  page,
}) => {
  const fixture = await installFixtures(page);
  await page.goto("/platform/notification-operations");

  await expect(
    page.getByRole("heading", { name: "Доставка и восстановление" }),
  ).toBeVisible();
  await expect(page.getByText(deliveryId)).toBeVisible();
  await expect(page.getByText(maskedIdentity)).toBeVisible();

  const initialDocument = await page.content();
  const initialStorage = await page.evaluate(() =>
    JSON.stringify({
      localStorage: Object.entries(localStorage),
      sessionStorage: Object.entries(sessionStorage),
    }),
  );
  for (const secret of [rawWebhookUrl, rawRecipientEmail, rawProviderRef]) {
    expect(initialDocument).not.toContain(secret);
    expect(initialStorage).not.toContain(secret);
  }

  await page
    .getByRole("button", { name: `Повторить доставку ${deliveryId}` })
    .click();
  const replayDialog = page.getByRole("dialog", {
    name: "Вернуть delivery в очередь?",
  });
  await replayDialog.getByRole("checkbox").check();
  await replayDialog.getByRole("button", { name: "Вернуть в очередь" }).click();

  await expect(
    page.getByText(
      "Доставка возвращена в очередь без создания второй business delivery.",
    ),
  ).toBeVisible();
  await expect(page.getByText(deliveryId)).toHaveCount(0);

  await page
    .getByRole("button", { name: `Поместить в карантин ${maskedIdentity}` })
    .click();
  const quarantineDialog = page.getByRole("dialog", {
    name: "Поместить интеграцию в карантин?",
  });
  await quarantineDialog
    .getByLabel("Причина quarantine")
    .selectOption("CREDENTIAL_COMPROMISED");
  await quarantineDialog
    .getByLabel("Подтверждение masked identity")
    .fill(maskedIdentity);
  await quarantineDialog
    .getByRole("button", { name: "Поместить в карантин" })
    .click();

  await expect(
    page.getByText(
      "Интеграция помещена в карантин. Подавлено ожидающих отправок: 2.",
    ),
  ).toBeVisible();
  await expect(
    page.getByRole("button", {
      name: `Поместить в карантин ${maskedIdentity}`,
    }),
  ).toHaveCount(0);

  expect(fixture.commands).toHaveLength(2);
  expect(fixture.commands[0]).toMatchObject({
    path: `/api/v1/admin/platform/notification-operations/deliveries/${deliveryId}/replay`,
    body: null,
    headers: { "expected-version": "2" },
  });
  expect(fixture.commands[1]).toMatchObject({
    path:
      `/api/v1/admin/platform/notification-operations/integrations/` +
      `SLACK_DESTINATION/${integrationId}/quarantine`,
    body: {
      reason: "CREDENTIAL_COMPROMISED",
      confirmation: maskedIdentity,
    },
    headers: { "expected-version": "4" },
  });
  expect(
    fixture.commands.every(
      (command) => command.headers["idempotency-key"]?.length >= 8,
    ),
  ).toBe(true);

  const finalDocument = await page.content();
  const finalStorage = await page.evaluate(() =>
    JSON.stringify({
      localStorage: Object.entries(localStorage),
      sessionStorage: Object.entries(sessionStorage),
    }),
  );
  for (const secret of [rawWebhookUrl, rawRecipientEmail, rawProviderRef]) {
    expect(finalDocument).not.toContain(secret);
    expect(finalStorage).not.toContain(secret);
  }

  const accessibility = await new AxeBuilder({ page })
    .disableRules(["color-contrast"])
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("server read denial scrubs protected rows and navigates away after authority refresh", async ({
  page,
}) => {
  const fixture = await installFixtures(page, {
    revokeReadAfterFirstContext: true,
  });

  await page.goto("/platform/notification-operations");
  await expect(page).toHaveURL(/\/settings\/security$/);
  await expect(
    page.getByRole("heading", { name: "Доставка и восстановление" }),
  ).toHaveCount(0);

  const document = await page.content();
  for (const protectedValue of [
    deliveryId,
    integrationId,
    maskedIdentity,
    rawWebhookUrl,
    rawRecipientEmail,
    rawProviderRef,
  ])
    expect(document).not.toContain(protectedValue);
  expect(fixture.protectedReads).toContain(
    "/api/v1/admin/platform/notification-operations/health",
  );
  expect(fixture.commands).toEqual([]);
});

test("read-only operator sees diagnostics but no mutation surface or mutation request", async ({
  page,
}) => {
  const fixture = await installFixtures(page, {
    permissions: ["platform.notifications.operations.read"],
  });

  await page.goto("/platform/notification-operations");
  await expect(page.getByText(deliveryId)).toBeVisible();
  await expect(page.getByText(maskedIdentity)).toBeVisible();
  await expect(
    page.getByRole("button", { name: `Повторить доставку ${deliveryId}` }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", {
      name: `Поместить в карантин ${maskedIdentity}`,
    }),
  ).toHaveCount(0);
  expect(fixture.commands).toEqual([]);
});

test("fresh-auth denial is never replayed and logout failure cannot retain the protected route", async ({
  page,
}) => {
  const fixture = await installFixtures(page, {
    replayStatus: 428,
    logoutStatus: 503,
  });
  await page.goto("/platform/notification-operations");

  await page
    .getByRole("button", { name: `Повторить доставку ${deliveryId}` })
    .click();
  const replayDialog = page.getByRole("dialog", {
    name: "Вернуть delivery в очередь?",
  });
  await replayDialog.getByRole("checkbox").check();
  await replayDialog.getByRole("button", { name: "Вернуть в очередь" }).click();
  await expect(page.getByText("Требуется свежий вход с MFA")).toBeVisible();
  expect(fixture.commands).toHaveLength(1);

  await page.getByRole("button", { name: "Войти заново" }).click();
  await expect(page).toHaveURL(
    /\/login\?redirect=\/platform\/notification-operations$/,
  );
  expect(fixture.logoutCalls()).toBe(1);
  expect(fixture.commands).toHaveLength(1);
  expect(await page.content()).not.toContain(deliveryId);
});
