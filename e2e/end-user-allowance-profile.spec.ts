import { expect, test, type Page, type Route } from "@playwright/test";

function json(route: Route, body: unknown) {
  return route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

async function stubAllowance(page: Page) {
  await page.route(
    "http://localhost:3000/api/v1/admin/projects/**/ai-allowance**",
    async (route) => {
      const url = new URL(route.request().url());
      const balanceMatch = url.pathname.match(
        /^\/api\/v1\/admin\/projects\/([^/]+)\/end-users\/([^/]+)\/ai-allowance$/,
      );
      if (balanceMatch) {
        const [, projectId, endUserId] = balanceMatch;
        return json(route, {
          projectPolicyVersion: "7",
          account: {
            projectId,
            endUserId,
            currency: "USD",
            availableUsd: "3.25",
            reservedUsd: "0.15",
            settledUsd: "4.5",
            unknownHeldUsd: "0",
            overageUsd: "0",
            version: "2",
          },
          currentPeriod: null,
          currentPeriodSpend: {
            reservedUsd: "0.15",
            settledUsd: "1.6",
            unknownHeldUsd: "0",
            overageUsd: "0",
          },
          pendingBaseAllocationUsd: "5",
          activeGrants: [],
          grantsPageInfo: { hasMore: false, nextCursor: null },
          endUserAssignment: null,
        });
      }

      const policyMatch = url.pathname.match(
        /^\/api\/v1\/admin\/projects\/([^/]+)\/ai-allowance$/,
      );
      if (policyMatch) {
        const [, projectId] = policyMatch;
        return json(route, {
          projectPolicyVersion: "7",
          localization: {
            defaultLocale: "ru",
            supportedLocales: ["ru"],
            translationSupportedLocales: ["ru"],
          },
          policy: {
            projectId,
            enforcementMode: "SOFT",
            timezone: "Europe/Madrid",
            warningContent: { mode: "SYSTEM" },
            lowThresholdMode: "PERCENT",
            lowThresholdValue: "10",
            exhaustedContent: { mode: "SYSTEM" },
            showEndUserExactUsd: true,
            version: "7",
            createdAt: "2026-08-01T00:00:00.000Z",
            updatedAt: "2026-08-02T00:00:00.000Z",
          },
          plans: [],
          plansPageInfo: { hasMore: false, nextCursor: null },
          defaultAssignment: null,
          runtimeGates: {
            hardEnforcementApproved: false,
            emergencyDisabled: false,
          },
        });
      }

      return route.fallback();
    },
  );
}

test("operator sees an explanatory AI allowance card in the End User profile", async ({
  page,
}) => {
  await stubAllowance(page);
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.goto("/users");
  await page
    .getByRole("button", { name: "Открыть профиль user_89421" })
    .click();

  const card = page.getByTestId("end-user-ai-allowance");
  await expect(card).toBeVisible();
  await expect(card).toContainText("Мягкий контроль");
  await expect(card).toContainText("AI не блокируется");
  await expect(card).toContainText("3,25");
  await expect(card).toContainText("1,60");
  await expect(card).toContainText("применяются правила проекта");
  expect(
    await card.evaluate(
      (element) => element.scrollWidth <= element.clientWidth,
    ),
  ).toBe(true);

  await card.getByRole("button", { name: "Подробнее" }).click();
  await expect(page.getByRole("dialog", { name: /AI-квота/ })).toBeVisible();
});
