import { expect, test, type Page, type Route } from "@playwright/test";

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "Manual Telegram fixtures require API mode",
);

const projectId = "00000000-0000-4000-8000-000000000610";
const firstUserId = "00000000-0000-4000-8000-000000000611";
const secondUserId = "00000000-0000-4000-8000-000000000612";
const rawTelegramId = "998877665544332211";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function profileSummary(endUserId: string, externalUserId: string) {
  return {
    endUserId,
    externalUserId,
    profileVersion: "8",
    syncStatus: "VALID",
    lastSeenAt: "2026-07-24T09:00:00.000Z",
    observedAt: "2026-07-24T08:59:00.000Z",
    fields: [],
    conversationAiSuspensionSummary: {
      activeConversationCount: 0,
      nearestSuspendedUntil: null,
      mostRecentlyStartedConversationId: null,
      serverTime: "2026-07-24T09:00:00.000Z",
    },
  };
}

function profileDetail(endUserId: string, externalUserId: string) {
  return {
    endUserId,
    externalUserId,
    profileVersion: "8",
    syncStatus: "VALID",
    observedAt: "2026-07-24T08:59:00.000Z",
    receivedAt: "2026-07-24T08:59:00.000Z",
    ageSeconds: 60,
    contractRevision: 1,
    provenance: "PRODUCT_PROFILE",
    fields: [],
  };
}

function linkSummary() {
  return {
    linked: true,
    status: "ACTIVE",
    effectiveStatus: "ACTIVE",
    displayName: "Safe Telegram User",
    username: "safe_telegram_user",
    linkedAt: "2026-07-24T08:00:00.000Z",
    revokedAt: null,
    activeLink: {
      status: "ACTIVE",
      linkedAt: "2026-07-24T08:00:00.000Z",
      displayName: "Safe Telegram User",
      username: "safe_telegram_user",
      telegramUserId: rawTelegramId,
    },
    pendingCandidate: null,
    telegramUserId: rawTelegramId,
  };
}

function outbound(
  endUserId: string,
  status: string,
  overrides: Record<string, unknown> = {},
) {
  return {
    id:
      endUserId === firstUserId
        ? "00000000-0000-4000-8000-000000000613"
        : "00000000-0000-4000-8000-000000000614",
    projectId,
    endUserId,
    kind: "TEXT",
    status,
    attemptCount: status === "QUEUED" ? 0 : 1,
    providerMessageId: status === "SENT" ? "7000000001" : null,
    errorCode: null,
    nextAttemptAt: null,
    sentAt: status === "SENT" ? "2026-07-24T09:01:00.000Z" : null,
    createdAt: "2026-07-24T09:00:00.000Z",
    updatedAt:
      status === "SENT"
        ? "2026-07-24T09:01:00.000Z"
        : "2026-07-24T09:00:00.000Z",
    finishedAt: status === "SENT" ? "2026-07-24T09:01:00.000Z" : null,
    ...overrides,
  };
}

async function installFixtures(
  page: Page,
  options: {
    canReadLink?: boolean;
    delayedFirstDetail?: Promise<void>;
    failFirstCreate?: boolean;
  } = {},
) {
  const posts: Array<{
    endUserId: string;
    idempotencyKey: string;
    contentType: string;
    body: string;
  }> = [];
  const linkReads: string[] = [];
  const messages = new Map<string, Record<string, unknown>>();
  const detailAttempts = new Map<string, number>();
  const canReadLink = options.canReadLink ?? true;

  await page.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/api/v1/auth/refresh") {
      return json(route, {
        kind: "AUTHENTICATED",
        tokenType: "Bearer",
        accessToken: "telegram_personal_e2e_token",
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
            name: "Telegram Personal Project",
            slug: "telegram-personal-project",
            status: "ACTIVE",
            publicKey: "public-key",
            defaultLocale: "ru",
            supportedLocales: ["ru"],
            assistantName: "Lola",
            systemPrompt: "",
            voiceInstructions: "",
            settings: {},
            membershipId: "00000000-0000-4000-8000-000000000615",
            membershipStatus: "ACTIVE",
            membershipVersion: 1,
            roleKeys: ["CUSTOM_SUPPORT"],
            effectivePermissionCodes: [
              "project.profiles.read",
              "project.telegram.personal_messages.send",
              ...(canReadLink ? ["project.telegram.links.read"] : []),
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
      const base = `/api/v1/admin/projects/${projectId}/end-users/${endUserId}`;
      if (request.method() === "GET" && path === `${base}/profile`) {
        return json(route, profileDetail(endUserId, externalUserId));
      }
      if (request.method() === "GET" && path === `${base}/telegram-link`) {
        linkReads.push(endUserId);
        return json(route, linkSummary());
      }
      if (request.method() === "GET" && path === `${base}/telegram-messages`) {
        const current = messages.get(endUserId);
        return json(route, {
          items: current ? [current] : [],
          nextCursor: null,
        });
      }
      if (request.method() === "POST" && path === `${base}/telegram-messages`) {
        const body = request.postDataBuffer()?.toString("utf8") ?? "";
        posts.push({
          endUserId,
          idempotencyKey: request.headers()["idempotency-key"] ?? "",
          contentType: request.headers()["content-type"] ?? "",
          body,
        });
        if (options.failFirstCreate && posts.length === 1)
          return route.abort("failed");
        const isPdf = body.includes("manual.pdf");
        const created = outbound(endUserId, "QUEUED", {
          kind: isPdf ? "DOCUMENT" : "TEXT",
        });
        messages.set(endUserId, created);
        return json(route, created, 202);
      }
      const current = messages.get(endUserId);
      if (
        current &&
        request.method() === "GET" &&
        path === `${base}/telegram-messages/${current.id}`
      ) {
        const attempt = (detailAttempts.get(endUserId) ?? 0) + 1;
        detailAttempts.set(endUserId, attempt);
        if (endUserId === firstUserId && options.delayedFirstDetail)
          await options.delayedFirstDetail;
        const next =
          attempt === 1
            ? outbound(endUserId, "SENDING", {
                id: current.id,
                kind: current.kind,
              })
            : outbound(endUserId, "SENT", {
                id: current.id,
                kind: current.kind,
              });
        messages.set(endUserId, next);
        return json(route, { ...next, attempts: [] });
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
  return { posts, linkReads };
}

async function openUser(page: Page, externalUserId: string) {
  await page
    .getByRole("button", { name: `Открыть профиль ${externalUserId}` })
    .click();
  return page.getByRole("dialog", {
    name: `Рабочее пространство пользователя ${externalUserId}`,
  });
}

async function openTelegramSend(workspace: ReturnType<Page["getByRole"]>) {
  await workspace.getByRole("button", { name: "Отправить в Telegram" }).click();
  return workspace.page().getByRole("dialog", {
    name: "Отправить в Telegram",
  });
}

test("sends one multipart intent and polls only its durable GET status", async ({
  page,
}) => {
  const fixture = await installFixtures(page);
  await page.goto("/users");
  const workspace = await openUser(page, "customer-one");
  const dialog = await openTelegramSend(workspace);

  await dialog.getByLabel("Сообщение в Telegram").fill("Сохраните инструкцию");
  await dialog.getByRole("button", { name: "Отправить в Telegram" }).click();

  await expect(dialog.getByText("Отправлено в Telegram")).toBeVisible();
  expect(fixture.posts).toHaveLength(1);
  expect(fixture.posts[0]?.idempotencyKey.length).toBeGreaterThanOrEqual(8);
  expect(fixture.posts[0]?.contentType).toContain("multipart/form-data");
  expect(fixture.posts[0]?.body).toContain("Сохраните инструкцию");
  await expect(page.locator("body")).not.toContainText(rawTelegramId);
  await expect(page.getByText("Прочитано")).toHaveCount(0);
});

test("uploads one allowlisted file without leaking its caption into history", async ({
  page,
}) => {
  const fixture = await installFixtures(page);
  await page.goto("/users");
  const dialog = await openTelegramSend(await openUser(page, "customer-one"));

  await dialog.getByLabel("Сообщение в Telegram").fill("Безопасная подпись");
  await dialog.getByLabel("Один файл, необязательно").setInputFiles({
    name: "manual.pdf",
    mimeType: "application/pdf",
    buffer: Buffer.from("%PDF-1.7 fixture"),
  });
  await dialog.getByRole("button", { name: "Отправить в Telegram" }).click();

  await expect(dialog.getByText("Отправлено в Telegram")).toBeVisible();
  expect(fixture.posts).toHaveLength(1);
  expect(fixture.posts[0]?.body).toContain("manual.pdf");
  expect(fixture.posts[0]?.body).toContain("%PDF-1.7 fixture");
  expect(fixture.posts[0]?.body).toContain("Безопасная подпись");
  await expect(
    dialog.getByText("Безопасная подпись", { exact: true }),
  ).toHaveCount(0);
  await expect(dialog.getByText("Документ")).toBeVisible();
});

test("send-only custom role skips link reads and delegates active-link validation to the server", async ({
  page,
}) => {
  const fixture = await installFixtures(page, { canReadLink: false });
  await page.goto("/users");
  const workspace = await openUser(page, "customer-one");

  await expect(workspace.getByText("Проверит сервер")).toBeVisible();
  await expect(workspace.getByText("Статус связи скрыт")).toBeVisible();
  const dialog = await openTelegramSend(workspace);
  await expect(
    dialog.getByText("Сервер проверит активную связь"),
  ).toBeVisible();
  await dialog.getByLabel("Сообщение в Telegram").fill("Server fenced");
  await dialog.getByRole("button", { name: "Отправить в Telegram" }).click();
  await expect(dialog.getByText("Отправлено в Telegram")).toBeVisible();

  expect(fixture.linkReads).toEqual([]);
  expect(fixture.posts).toHaveLength(1);
});

test("a delayed old-user result cannot replace the newly selected target", async ({
  page,
}) => {
  let releaseOld!: () => void;
  const delayed = new Promise<void>((resolve) => {
    releaseOld = resolve;
  });
  await installFixtures(page, { delayedFirstDetail: delayed });
  await page.goto("/users");
  let workspace = await openUser(page, "customer-one");
  let dialog = await openTelegramSend(workspace);
  await dialog.getByLabel("Сообщение в Telegram").fill("Первый");
  await dialog.getByRole("button", { name: "Отправить в Telegram" }).click();

  await dialog.locator("button.p-dialog-close-button").click();
  await workspace.locator("button.p-dialog-close-button").click();
  workspace = await openUser(page, "customer-two");
  dialog = await openTelegramSend(workspace);
  releaseOld();

  await expect(dialog.getByText("Отправлено в Telegram")).toHaveCount(0);
  await expect(dialog.getByText("Отправок в Telegram пока нет.")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("7000000001");
});

test("an ambiguous transport retry reuses the same intent key and body", async ({
  page,
}) => {
  const fixture = await installFixtures(page, { failFirstCreate: true });
  await page.goto("/users");
  const dialog = await openTelegramSend(await openUser(page, "customer-one"));
  await dialog.getByLabel("Сообщение в Telegram").fill("Один и тот же intent");
  await dialog.getByRole("button", { name: "Отправить в Telegram" }).click();

  await expect(dialog.getByText("Сервер не подтвердил приём")).toBeVisible();
  await dialog.getByRole("button", { name: "Повторить тот же запрос" }).click();
  await expect(dialog.getByText("Отправлено в Telegram")).toBeVisible();

  expect(fixture.posts).toHaveLength(2);
  expect(fixture.posts[0]?.idempotencyKey).toBe(
    fixture.posts[1]?.idempotencyKey,
  );
  expect(fixture.posts[0]?.body).toContain("Один и тот же intent");
  expect(fixture.posts[1]?.body).toContain("Один и тот же intent");
});
