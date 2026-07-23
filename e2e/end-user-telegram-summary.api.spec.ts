import { expect, test, type Page, type Route } from "@playwright/test";

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "End-user Telegram summary fixtures require API mode",
);

const projectId = "00000000-0000-4000-8000-000000000510";
const firstUserId = "00000000-0000-4000-8000-000000000511";
const secondUserId = "00000000-0000-4000-8000-000000000512";
const rawTelegramId = "998877665544332211";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function profileSummary(
  endUserId: string,
  externalUserId: string,
) {
  return {
    endUserId,
    externalUserId,
    profileVersion: "8",
    syncStatus: "VALID",
    lastSeenAt: "2026-07-23T12:00:00.000Z",
    observedAt: "2026-07-23T11:59:00.000Z",
    fields: [],
    conversationAiSuspensionSummary: {
      activeConversationCount: 0,
      nearestSuspendedUntil: null,
      mostRecentlyStartedConversationId: null,
      serverTime: "2026-07-23T12:00:00.000Z",
    },
  };
}

function profileDetail(endUserId: string, externalUserId: string) {
  return {
    endUserId,
    externalUserId,
    profileVersion: "8",
    syncStatus: "VALID",
    observedAt: "2026-07-23T11:59:00.000Z",
    receivedAt: "2026-07-23T11:59:00.000Z",
    ageSeconds: 60,
    contractRevision: 1,
    provenance: "PRODUCT_PROFILE",
    fields: [],
  };
}

function linkedSummary(
  effectiveStatus: "ACTIVE" | "BLOCKED",
  displayName: string,
) {
  return {
    linked: effectiveStatus === "ACTIVE",
    status: effectiveStatus,
    effectiveStatus,
    displayName,
    username: displayName.toLowerCase().replaceAll(" ", "_"),
    linkedAt: "2026-07-23T10:00:00.000Z",
    revokedAt: null,
    activeLink: {
      status: effectiveStatus,
      linkedAt: "2026-07-23T10:00:00.000Z",
      displayName,
      username: displayName.toLowerCase().replaceAll(" ", "_"),
      telegramUserId: rawTelegramId,
    },
    pendingCandidate: null,
    telegramUserId: rawTelegramId,
  };
}

function revokedSummary() {
  return {
    linked: false,
    status: "REVOKED",
    effectiveStatus: "REVOKED",
    displayName: "Revoked Snapshot",
    username: "revoked_snapshot",
    linkedAt: "2026-07-23T10:00:00.000Z",
    revokedAt: "2026-07-23T11:00:00.000Z",
    activeLink: {
      status: "REVOKED",
      linkedAt: "2026-07-23T10:00:00.000Z",
      displayName: "Revoked Snapshot",
      username: "revoked_snapshot",
      telegramUserId: rawTelegramId,
    },
    pendingCandidate: null,
    telegramUserId: rawTelegramId,
  };
}

type SummaryResult =
  | { body: Record<string, unknown>; status?: number }
  | {
      wait: Promise<void>;
      body: Record<string, unknown>;
      status?: number;
    };

async function installFixtures(
  page: Page,
  options: {
    canReadTelegram: boolean;
    summary: (endUserId: string, attempt: number) => SummaryResult;
  },
) {
  const summaryRequests: string[] = [];
  const attempts = new Map<string, number>();
  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/api/v1/auth/refresh") {
      return json(route, {
        kind: "AUTHENTICATED",
        tokenType: "Bearer",
        accessToken: "telegram_summary_e2e_token",
        expiresIn: 900,
        refreshExpiresIn: 86_400,
        user: {
          id: "operator-1",
          email: "operator@example.com",
          displayName: "Оператор",
        },
      });
    }
    if (request.method() === "GET" && path === "/api/v1/auth/me") {
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
            name: "Telegram Summary Project",
            slug: "telegram-summary-project",
            status: "ACTIVE",
            publicKey: "public-key",
            defaultLocale: "ru",
            supportedLocales: ["ru"],
            assistantName: "Lola",
            systemPrompt: "",
            voiceInstructions: "",
            settings: {},
            membershipId: "00000000-0000-4000-8000-000000000513",
            membershipStatus: "ACTIVE",
            membershipVersion: 1,
            roleKeys: ["SUPPORT_READER"],
            effectivePermissionCodes: [
              "project.profiles.read",
              ...(options.canReadTelegram
                ? ["project.telegram.links.read"]
                : []),
            ],
          },
        ],
      });
    }
    if (
      request.method() === "GET" &&
      path === `/api/v1/admin/projects/${projectId}/end-users`
    ) {
      return json(route, {
        items: [
          profileSummary(firstUserId, "customer-one"),
          profileSummary(secondUserId, "customer-two"),
        ],
        nextCursor: null,
      });
    }
    for (const [endUserId, externalUserId] of [
      [firstUserId, "customer-one"],
      [secondUserId, "customer-two"],
    ] as const) {
      if (
        request.method() === "GET" &&
        path ===
          `/api/v1/admin/projects/${projectId}/end-users/${endUserId}/profile`
      ) {
        return json(route, profileDetail(endUserId, externalUserId));
      }
      if (
        request.method() === "GET" &&
        path ===
          `/api/v1/admin/projects/${projectId}/end-users/${endUserId}/telegram-link`
      ) {
        summaryRequests.push(endUserId);
        const attempt = (attempts.get(endUserId) ?? 0) + 1;
        attempts.set(endUserId, attempt);
        const result = options.summary(endUserId, attempt);
        if ("wait" in result) await result.wait;
        return json(route, result.body, result.status);
      }
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
  return { summaryRequests };
}

async function openUser(page: Page, externalUserId: string) {
  await page
    .getByRole("button", { name: `Открыть профиль ${externalUserId}` })
    .click();
  return page.getByRole("dialog", {
    name: `Рабочее пространство пользователя ${externalUserId}`,
  });
}

async function closeWorkspace(page: Page) {
  const dialog = page.getByRole("dialog");
  await dialog.locator("button.p-dialog-close-button").click();
  await expect(dialog).toBeHidden();
}

test("Telegram summary is absent without its independent read permission", async ({
  page,
}) => {
  const fixture = await installFixtures(page, {
    canReadTelegram: false,
    summary: () => ({ body: linkedSummary("ACTIVE", "Should Not Load") }),
  });
  await page.goto("/users");
  const dialog = await openUser(page, "customer-one");

  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("heading", { name: "Telegram" })).toHaveCount(
    0,
  );
  expect(fixture.summaryRequests).toEqual([]);
});

test("pending identity survives a stale target response and never exposes raw Telegram IDs", async ({
  page,
}) => {
  let releaseStale!: () => void;
  const staleWait = new Promise<void>((resolve) => {
    releaseStale = resolve;
  });
  await installFixtures(page, {
    canReadTelegram: true,
    summary: (endUserId) =>
      endUserId === firstUserId
        ? {
            wait: staleWait,
            body: linkedSummary("ACTIVE", "Stale Identity"),
          }
        : {
            body: {
              linked: false,
              status: null,
              effectiveStatus: "PENDING_CONFIRMATION",
              displayName: null,
              username: null,
              linkedAt: null,
              revokedAt: null,
              activeLink: null,
              pendingCandidate: {
                status: "PENDING_CONFIRMATION",
                displayName: "Pending Candidate",
                username: "pending_candidate",
                expiresAt: "2026-07-23T12:05:00.000Z",
                telegramUserId: rawTelegramId,
              },
              telegramUserId: rawTelegramId,
            },
          },
  });
  await page.goto("/users");
  const firstDialog = await openUser(page, "customer-one");
  await expect(
    firstDialog.locator("header strong[data-status='LOADING']"),
  ).toHaveText("Загрузка");
  await closeWorkspace(page);

  const secondDialog = await openUser(page, "customer-two");
  await expect(
    secondDialog.locator(
      "header strong[data-status='PENDING_CONFIRMATION']",
    ),
  ).toHaveText("Ожидает подтверждения");
  await expect(secondDialog.getByText("Pending Candidate")).toBeVisible();
  await expect(secondDialog.getByText("@pending_candidate")).toBeVisible();

  releaseStale();
  await expect(secondDialog.getByText("Stale Identity")).toHaveCount(0);
  await expect(page.locator("body")).not.toContainText(rawTelegramId);
});

test("workspace renders ACTIVE, BLOCKED, REVOKED and recovers from UNAVAILABLE", async ({
  page,
}) => {
  const planned = [
    { body: linkedSummary("ACTIVE", "Active Snapshot") },
    { body: linkedSummary("BLOCKED", "Blocked Snapshot") },
    { body: revokedSummary() },
    {
      status: 503,
      body: {
        error: {
          code: "TELEGRAM_SUMMARY_UNAVAILABLE",
          message: `provider failure ${rawTelegramId}`,
        },
      },
    },
    { body: linkedSummary("ACTIVE", "Recovered Snapshot") },
  ];
  await installFixtures(page, {
    canReadTelegram: true,
    summary: () => planned.shift() ?? planned.at(-1)!,
  });
  await page.goto("/users");

  let dialog = await openUser(page, "customer-one");
  await expect(dialog.locator("header strong[data-status='ACTIVE']")).toHaveText(
    "Подключён",
  );
  await expect(dialog.getByText("Active Snapshot")).toBeVisible();
  await closeWorkspace(page);

  dialog = await openUser(page, "customer-one");
  await expect(
    dialog.locator("header strong[data-status='BLOCKED']"),
  ).toHaveText("Бот заблокирован");
  await expect(dialog.getByText("Blocked Snapshot")).toBeVisible();
  await closeWorkspace(page);

  dialog = await openUser(page, "customer-one");
  await expect(
    dialog.locator("header strong[data-status='REVOKED']"),
  ).toHaveText("Отключён");
  await expect(dialog.getByText("Revoked Snapshot")).toBeVisible();
  await expect(dialog.getByText("Отключён", { exact: true })).toHaveCount(2);
  await closeWorkspace(page);

  dialog = await openUser(page, "customer-one");
  await expect(
    dialog.locator("header strong[data-status='UNAVAILABLE']"),
  ).toHaveText("Недоступно");
  await expect(dialog.getByText("Не удалось загрузить статус Telegram.")).toBeVisible();
  await expect(dialog.getByText("Не подключён")).toHaveCount(0);
  await dialog
    .getByRole("button", { name: "Повторить", exact: true })
    .click();
  await expect(
    dialog.locator("header strong[data-status='ACTIVE']"),
  ).toHaveText("Подключён");
  await expect(dialog.getByText("Recovered Snapshot")).toBeVisible();
  await expect(page.locator("body")).not.toContainText(rawTelegramId);
});
