import { randomUUID } from "node:crypto";
import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type TestInfo,
} from "@playwright/test";
import { io, type Socket } from "socket.io-client";

const apiOrigin = process.env.E2E_API_ORIGIN ?? "http://127.0.0.1:3000";
const projectPublicKey = process.env.E2E_PROJECT_PUBLIC_KEY ?? "lola_pub_demo";

type SmokeUser = {
  accessToken: string;
  cmsUserId: string;
  email: string;
};

type GuestSession = {
  accessToken: string;
  sessionId: string;
  user: { id: string; externalId: string };
  realtime: { socketIoPath: string; socketIoNamespace: string };
};

type TranslationState = {
  availability: {
    available: boolean;
    reason: "DEPLOYMENT_DISABLED" | "PROJECT_DISABLED" | null;
  };
  supportedLocales: string[];
  preference: {
    enabled: boolean;
    workingLocale: string;
    endUserLocaleOverride: string | null;
    updatedAt: string | null;
  };
};

const forbiddenPublicKeys = [
  "sourceText",
  "originalText",
  "translatedText",
  "translation",
  "providerRequestId",
  "provider",
  "model",
  "inputTokens",
  "outputTokens",
  "idempotencyKey",
  "adminRequestHash",
  "metadata",
  "configRevision",
  "workingLocale",
] as const;

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "Support chat translation API E2E requires the real backend",
);

function usersFor(testInfo: TestInfo): [SmokeUser, SmokeUser] {
  const users = JSON.parse(process.env.E2E_USERS ?? "[]") as SmokeUser[];
  const offset = testInfo.project.name.includes("mobile") ? 3 : 0;
  const selected = [users[offset], users[offset + 1]];
  if (
    selected.some(
      (user) => !user?.accessToken || !user.cmsUserId || !user.email,
    )
  ) {
    throw new Error(
      "The HTTP smoke must supply two phishing-resistant CMS sessions",
    );
  }
  return selected as [SmokeUser, SmokeUser];
}

function cmsHeaders(user: SmokeUser) {
  return { Authorization: `Bearer ${user.accessToken}` };
}

async function json<T>(response: APIResponse, label: string): Promise<T> {
  const text = await response.text();
  expect(response.ok(), `${label}: HTTP ${response.status()} ${text}`).toBe(
    true,
  );
  return JSON.parse(text) as T;
}

async function resolveProjectId(
  request: APIRequestContext,
  user: SmokeUser,
): Promise<string> {
  const response = await request.get(`${apiOrigin}/api/v1/auth/me`, {
    headers: cmsHeaders(user),
  });
  const session = await json<{
    projects: Array<{ id: string; publicKey: string }>;
  }>(response, "resolve CMS project");
  const project = session.projects.find(
    (item) => item.publicKey === projectPublicKey,
  );
  expect(project, `Project ${projectPublicKey} must exist`).toBeTruthy();
  return project!.id;
}

async function createGuest(
  request: APIRequestContext,
  locale: string,
): Promise<GuestSession> {
  const response = await request.post(`${apiOrigin}/api/v1/public/sessions`, {
    headers: { "x-project-key": projectPublicKey },
    data: { locale },
  });
  return json<GuestSession>(response, `create ${locale} guest`);
}

async function createConversation(
  request: APIRequestContext,
  guest: GuestSession,
  title: string,
): Promise<string> {
  const response = await request.post(
    `${apiOrigin}/api/v1/chat/conversations`,
    {
      headers: { Authorization: `Bearer ${guest.accessToken}` },
      data: { title },
    },
  );
  const conversation = await json<{ id: string }>(
    response,
    "create conversation",
  );
  return conversation.id;
}

function translationUrl(
  projectId: string,
  endUserId: string,
  conversationId: string,
) {
  return `${apiOrigin}/api/v1/admin/projects/${projectId}/users/${endUserId}/conversations/${conversationId}/translation`;
}

async function suspendAI(
  request: APIRequestContext,
  user: SmokeUser,
  projectId: string,
  endUserId: string,
  conversationId: string,
) {
  const response = await request.post(
    `${apiOrigin}/api/v1/admin/projects/${projectId}/users/${endUserId}/conversations/${conversationId}/ai-suspension/start`,
    {
      headers: {
        ...cmsHeaders(user),
        "Idempotency-Key": `translation-e2e-suspend-${randomUUID()}`,
      },
      data: {
        durationSeconds: 3600,
        reason: "OPERATOR_TAKEOVER",
        note: "Support chat translation API E2E",
      },
    },
  );
  await json(response, "suspend conversation AI");
}

async function restoreUiSession(page: Page, user: SmokeUser) {
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
          displayName: "Translation API E2E",
        },
      }),
    });
  });
}

async function connectGuest(guest: GuestSession): Promise<Socket> {
  const socket = io(`${apiOrigin}${guest.realtime.socketIoNamespace}`, {
    path: guest.realtime.socketIoPath,
    transports: ["websocket"],
    auth: { token: guest.accessToken },
    reconnection: false,
  });
  await new Promise<void>((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.close();
      reject(new Error("Guest socket connection timed out"));
    }, 10_000);
    socket.once("connect", () => {
      clearTimeout(timeout);
      resolve();
    });
    socket.once("connect_error", (error) => {
      clearTimeout(timeout);
      socket.close();
      reject(error);
    });
  });
  return socket;
}

function waitForDeliveredMessage(
  socket: Socket,
  conversationId: string,
  deliveredText: string,
): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      socket.off("chat.message", listener);
      reject(new Error("Delivered admin chat.message timed out"));
    }, 10_000);
    const listener = (payload: unknown) => {
      const event = payload as {
        role?: string;
        message?: { threadId?: string; text?: string };
      };
      if (
        event.role === "admin" &&
        event.message?.threadId === conversationId &&
        event.message.text === deliveredText
      ) {
        clearTimeout(timeout);
        socket.off("chat.message", listener);
        resolve(payload);
      }
    };
    socket.on("chat.message", listener);
  });
}

function expectSafePublicPayload(payload: unknown, deliveredText: string) {
  const serialized = JSON.stringify(payload);
  expect(serialized).toContain(deliveredText);
  for (const key of forbiddenPublicKeys) {
    expect(serialized, `Public payload exposes ${key}`).not.toContain(
      JSON.stringify(key),
    );
  }
}

test("real support chat translation fails closed, stays scoped and keeps public payloads minimal", async ({
  page,
  request,
}, testInfo) => {
  const [primaryCms, otherCms] = usersFor(testInfo);
  const projectId = await resolveProjectId(request, primaryCms);
  expect(await resolveProjectId(request, otherCms)).toBe(projectId);

  const primaryGuest = await createGuest(request, "de");
  const otherGuest = await createGuest(request, "fr");
  const primaryConversationId = await createConversation(
    request,
    primaryGuest,
    "Deutscher Supportfall",
  );
  const otherConversationId = await createConversation(
    request,
    otherGuest,
    "Deuxième conversation",
  );

  await suspendAI(
    request,
    primaryCms,
    projectId,
    primaryGuest.user.id,
    primaryConversationId,
  );

  const socket = await connectGuest(primaryGuest);
  try {
    const inboundText =
      "Guten Tag, ich wurde zweimal belastet. Können Sie das prüfen?";
    const inbound = await request.post(`${apiOrigin}/api/v1/chat/messages`, {
      headers: { Authorization: `Bearer ${primaryGuest.accessToken}` },
      data: {
        message: inboundText,
        conversationId: primaryConversationId,
        clientMessageId: randomUUID(),
      },
    });
    expect(
      await json<{ responseDisposition: string }>(
        inbound,
        "send foreign user message",
      ),
    ).toEqual(expect.objectContaining({ responseDisposition: "AI_SUSPENDED" }));

    const initialState = await json<TranslationState>(
      await request.get(
        translationUrl(projectId, primaryGuest.user.id, primaryConversationId),
        { headers: cmsHeaders(primaryCms) },
      ),
      "read primary translation preference",
    );
    expect(initialState.availability).toEqual({
      available: false,
      reason: "DEPLOYMENT_DISABLED",
    });
    expect(initialState.preference.enabled).toBe(false);
    const targetLocale =
      initialState.supportedLocales.find(
        (locale) =>
          locale.toLowerCase().split("-")[0] === "de" &&
          locale.toLowerCase().split("-")[0] !==
            initialState.preference.workingLocale.toLowerCase().split("-")[0],
      ) ??
      initialState.supportedLocales.find(
        (locale) =>
          locale.toLowerCase().split("-")[0] !==
          initialState.preference.workingLocale.toLowerCase().split("-")[0],
      );
    expect(targetLocale, "A foreign supported locale must exist").toBeTruthy();

    const enabledState = await json<TranslationState>(
      await request.put(
        translationUrl(projectId, primaryGuest.user.id, primaryConversationId),
        {
          headers: cmsHeaders(primaryCms),
          data: {
            enabled: true,
            workingLocale: initialState.preference.workingLocale,
            endUserLocaleOverride: targetLocale,
            expectedUpdatedAt: initialState.preference.updatedAt,
          },
        },
      ),
      "enable primary CMS translation preference",
    );
    expect(enabledState.preference).toEqual(
      expect.objectContaining({
        enabled: true,
        endUserLocaleOverride: targetLocale,
      }),
    );

    const otherCmsState = await json<TranslationState>(
      await request.get(
        translationUrl(projectId, primaryGuest.user.id, primaryConversationId),
        { headers: cmsHeaders(otherCms) },
      ),
      "read other CMS preference",
    );
    expect(otherCmsState.preference.enabled).toBe(false);
    expect(otherCmsState.preference.endUserLocaleOverride).toBeNull();

    const otherConversationState = await json<TranslationState>(
      await request.get(
        translationUrl(projectId, otherGuest.user.id, otherConversationId),
        { headers: cmsHeaders(primaryCms) },
      ),
      "read other conversation preference",
    );
    expect(otherConversationState.preference.enabled).toBe(false);
    expect(otherConversationState.preference.endUserLocaleOverride).toBeNull();

    const internalSource =
      "Проверил списание. Возвращаем пользователю вторую оплату.";
    const draftResponse = await request.post(
      `${apiOrigin}/api/v1/admin/projects/${projectId}/users/${primaryGuest.user.id}/conversations/${primaryConversationId}/reply-translation-drafts`,
      {
        headers: {
          ...cmsHeaders(primaryCms),
          "Idempotency-Key": `translation-e2e-draft-${randomUUID()}`,
        },
        data: {
          sourceText: internalSource,
          sourceLocale: initialState.preference.workingLocale,
          targetLocale,
        },
      },
    );
    expect(draftResponse.status()).toBe(422);
    const draftError = (await draftResponse.json()) as {
      error?: { code?: string };
    };
    expect(["TRANSLATION_DISABLED", "TRANSLATION_MODEL_UNAVAILABLE"]).toContain(
      draftError.error?.code,
    );

    await restoreUiSession(page, primaryCms);
    await page.goto("/users");
    await page.getByPlaceholder("user-123").fill(primaryGuest.user.externalId);
    await page.getByRole("button", { name: "Найти", exact: true }).click();
    await page
      .getByRole("button", {
        name: `Открыть профиль ${primaryGuest.user.externalId}`,
      })
      .click();
    await page.getByRole("button", { name: "Открыть чат" }).click();

    const banner = page.getByRole("region", { name: "Перевод диалога" });
    await expect(banner).toContainText("Перевод временно недоступен");
    const toggle = page.getByRole("switch", {
      name: "Переводить этот диалог",
    });
    await expect(toggle).toBeChecked();
    await expect(toggle).toBeDisabled();
    await expect(page.getByText(inboundText)).toBeVisible();

    const composer = page.getByRole("textbox", {
      name: "Ответ пользователю",
    });
    await expect(composer).toBeEnabled();
    await composer.fill(internalSource);
    await expect(
      page.getByRole("button", { name: "Перевести и проверить" }),
    ).toBeDisabled();
    await expect(
      page.getByRole("button", { name: "Отправить", exact: true }),
    ).toHaveCount(0);
    if (process.env.E2E_SCREENSHOT_DIR) {
      await page.screenshot({
        path: `${process.env.E2E_SCREENSHOT_DIR}/support-chat-translation-${testInfo.project.name}.png`,
        fullPage: true,
      });
    }

    const deliveredText =
      "Ich habe die Abbuchung geprüft. Wir erstatten die zweite Zahlung.";
    const realtimeDelivery = waitForDeliveredMessage(
      socket,
      primaryConversationId,
      deliveredText,
    );
    const adminResponse = await request.post(
      `${apiOrigin}/api/v1/admin/projects/${projectId}/users/${primaryGuest.user.id}/messages`,
      {
        headers: {
          ...cmsHeaders(otherCms),
          "Idempotency-Key": `translation-e2e-send-${randomUUID()}`,
        },
        data: {
          conversationId: primaryConversationId,
          text: deliveredText,
        },
      },
    );
    const adminResult = await json<{
      message: { text: string };
      delivery?: { status: string };
    }>(adminResponse, "send delivered admin text");
    expect(adminResult.message.text).toBe(deliveredText);
    expect(adminResult.delivery?.status).toBe("DELIVERED");

    const realtimePayload = await realtimeDelivery;
    const history = await json<unknown>(
      await request.get(
        `${apiOrigin}/api/v1/chat/conversations/${primaryConversationId}/messages`,
        {
          headers: { Authorization: `Bearer ${primaryGuest.accessToken}` },
          params: { limit: 50 },
        },
      ),
      "read public conversation history",
    );
    const widgetMessages = await json<unknown>(
      await request.get(`${apiOrigin}/api/v1/chat/messages`, {
        headers: { Authorization: `Bearer ${primaryGuest.accessToken}` },
      }),
      "read widget-compatible messages",
    );

    expectSafePublicPayload(realtimePayload, deliveredText);
    expectSafePublicPayload(history, deliveredText);
    expectSafePublicPayload(widgetMessages, deliveredText);
  } finally {
    socket.close();
  }
});
