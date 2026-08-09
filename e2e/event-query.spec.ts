import { mkdir } from "node:fs/promises";
import AxeBuilder from "@axe-core/playwright";
import {
  expect,
  test,
  type Page,
  type TestInfo,
} from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function saveScreenshot(page: Page, testInfo: TestInfo, name: string) {
  const directory = process.env.E2E_SCREENSHOT_DIR;
  if (!directory) return;
  await mkdir(directory, { recursive: true });
  await page.screenshot({
    path: `${directory}/${name}-${testInfo.project.name}.png`,
    fullPage: true,
  });
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("policy lifecycle and preview expose only typed safe event data", async ({
  page,
}, testInfo) => {
  await page.goto("/project");
  await page
    .getByRole("button", { name: "Развернуть раздел «Доступ AI к событиям»" })
    .click();

  const policy = page.locator(".event-query-policy");
  const masterAccess = policy.getByRole("switch", {
    name: "Разрешить AI получать данные событий",
  });
  await expect(masterAccess).toBeChecked();
  await expect(
    policy.getByText("Исходный payload событий не показывается."),
  ).toBeVisible();

  await masterAccess.click();
  await policy.getByRole("button", { name: "Применить" }).click();
  await expect(
    policy.getByText("Доступ AI к событиям выключен."),
  ).toBeVisible();
  await masterAccess.click();
  await policy.getByRole("button", { name: "Применить" }).click();
  await expect(policy.getByText("Доступ AI к событиям включён.")).toBeVisible();

  await page.getByLabel("Пользователь", { exact: true }).fill("user_89421");
  await page.getByTestId("event-picker-trigger").click();
  await page
    .getByRole("option", { name: "Подтверждает завершение регистрации" })
    .click();
  await page.getByTestId("event-picker-apply").click();
  await page.getByRole("button", { name: "Выполнить preview" }).click();

  await expect(
    page.getByText("Отправленный типизированный запрос"),
  ).toBeVisible();
  await expect(page.getByText("COMPLETED", { exact: true })).toBeVisible();
  await expect(page.getByText("96 Б")).toBeVisible();
  await expect(page.getByText("24 токенов")).toBeVisible();
  await expect(page.locator(".preview-result")).not.toContainText("payload");
  await expect(page.locator(".preview-result")).not.toContainText("projectId");

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    clippedControls: Array.from(
      document.querySelectorAll(
        ".event-query-policy button, .event-query-policy input, .event-query-policy select",
      ),
    ).filter((element) => {
      const bounds = element.getBoundingClientRect();
      return bounds.left < 0 || bounds.right > window.innerWidth;
    }).length,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  expect(geometry.clippedControls).toBe(0);

  const accessibility = await new AxeBuilder({ page })
    .include(".event-query-policy")
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(
    accessibility.violations.filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);

  await saveScreenshot(page, testInfo, "event-query-policy");
});
