import { expect, test, type Page, type Route } from "@playwright/test";

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "Notification API fixtures require API mode",
);

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function installFixtures(page: Page) {
  let subscribed = false;
  const mutations: boolean[] = [];
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
          emailVerifiedAt: "2026-07-23T10:00:00.000Z",
          pendingEmail: null,
          emailVerificationRetryAfterSeconds: 0,
        },
        platformPermissionCodes: [],
        projects: [],
      });
    }
    if (request.method() === "GET" && path === "/api/v1/auth/me/sessions") {
      return json(route, { sessions: [] });
    }
    if (request.method() === "GET" && path === "/api/v1/auth/me/mfa") {
      return json(route, { passkeys: [], recoveryCodesRemaining: 0 });
    }
    if (
      path === "/api/v1/auth/me/notification-preferences/ai-proposals/email"
    ) {
      if (request.method() === "PATCH") {
        subscribed = Boolean(
          (request.postDataJSON() as { subscribed?: boolean }).subscribed,
        );
        mutations.push(subscribed);
      }
      return json(route, {
        topic: "AI_PROPOSALS",
        channel: "EMAIL",
        subscribed,
        effectiveStatus: subscribed ? "SUBSCRIBED" : "UNSUBSCRIBED",
        ineligibilityReason: null,
        emailVersion: 1,
      });
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
  return { mutations };
}

test("verified CMS User explicitly subscribes and the choice survives reload", async ({
  page,
}) => {
  const fixture = await installFixtures(page);

  await page.goto("/settings/security");
  await expect(
    page.getByRole("heading", { name: "Пароль и активные сессии" }),
  ).toBeVisible();
  await expect(page.getByText("Подписка выключена")).toBeVisible();
  await page.getByRole("button", { name: "Подписаться" }).click();

  await expect(page.getByText("Подписка включена")).toBeVisible();
  await expect(page.getByRole("button", { name: "Отключить" })).toBeVisible();
  expect(fixture.mutations).toEqual([true]);

  await page.reload();
  await expect(page.getByText("Подписка включена")).toBeVisible();
});
