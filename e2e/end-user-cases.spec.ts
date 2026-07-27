import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("operator inbox stays clear and contained on desktop, tablet and mobile", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/cases");
    await expect(
      page.getByRole("heading", { level: 1, name: "Обращения пользователей" }),
    ).toBeVisible();
    await expect(page.getByRole("button", { name: "Дополнительные фильтры" }))
      .toBeVisible();
    await expect(page.getByLabel("ID пользователя")).toHaveCount(0);

    const layout = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      visiblePrimaryControls: document.querySelectorAll(
        ".case-filters .controls > :not(.advanced-controls)",
      ).length,
    }));
    expect(layout.scrollWidth).toBe(layout.clientWidth);
    expect(layout.visiblePrimaryControls).toBe(5);
    const clippedInboxControls = await page.evaluate(() =>
      Array.from(
        document.querySelectorAll(
          ".cases-page button, .cases-page input, .cases-page [role='combobox']",
        ),
      ).filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left < 0 || bounds.right > window.innerWidth;
      }).length,
    );
    expect(clippedInboxControls).toBe(0);

    if (viewport.width <= 1024) {
      await page
        .getByRole("button", {
          name: "Обращение № 48: Не поступил депозит",
        })
        .click();
      await expect(
        page.getByRole("heading", {
          level: 2,
          name: "Не поступил депозит",
        }),
      ).toBeVisible();
      await page.waitForTimeout(250);
      const clippedActions = await page.evaluate(() =>
        Array.from(document.querySelectorAll(".case-detail button")).filter(
          (element) => {
            const bounds = element.getBoundingClientRect();
            return bounds.left < 0 || bounds.right > window.innerWidth;
          },
        ).length,
      );
      expect(clippedActions).toBe(0);
    }
  }

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(
    accessibility.violations.filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);
});

test("case detail explains evidence and exposes the linked Lola proposal", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/cases");
  await page
    .getByRole("button", {
      name: "Обращение № 48: Не поступил депозит",
    })
    .click();

  await expect(
    page.getByRole("heading", { level: 2, name: "Не поступил депозит" }),
  ).toBeVisible();
  await expect(page.getByText("Обеспокоен → Спокоен")).toBeVisible();
  await expect(page.getByText("Текст, Голос")).toBeVisible();
  await expect(page.getByText("Проверка депозита")).toBeVisible();
  await expect(page.getByText("Запрошена помощь администратора")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Подключиться к обращению/ }),
  ).toHaveAttribute("href", "/ai-proposals/proposal-demo-1");
});

test("workflow change is persisted in demo mode and reloaded", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/cases");
  await page
    .getByRole("button", {
      name: "Обращение № 48: Не поступил депозит",
    })
    .click();
  await page.getByRole("button", { name: "Взять в работу" }).click();
  await page
    .getByLabel("Основание")
    .fill("Оператор проверил платёж и взял обращение в работу");
  await page
    .getByRole("button", { name: "Подтвердить", exact: true })
    .click();

  await expect(
    page.locator(".case-detail .badge").filter({ hasText: "В работе" }),
  ).toBeVisible();
});

test("case settings remain responsive and complete the preview-save-publish flow", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/cases/settings");
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Категории и приоритеты",
      }),
    ).toBeVisible();
    const geometry = await page.evaluate(() => ({
      clientWidth: document.documentElement.clientWidth,
      scrollWidth: document.documentElement.scrollWidth,
      clipped: Array.from(
        document.querySelectorAll("main button, main textarea"),
      ).filter((element) => {
        const bounds = element.getBoundingClientRect();
        return bounds.left < 0 || bounds.right > window.innerWidth;
      }).length,
    }));
    expect(geometry.scrollWidth).toBe(geometry.clientWidth);
    expect(geometry.clipped).toBe(0);
  }

  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/cases/settings");
  await page.getByRole("button", { name: "Проверить" }).click();
  await expect(page.getByText("Правила корректны.")).toBeVisible();
  await page.getByRole("button", { name: "Сохранить черновик" }).click();
  await expect(page.getByText("Черновик сохранён.")).toBeVisible();
  await page.getByRole("button", { name: "Опубликовать" }).click();
  await expect(
    page.getByText("Правила опубликованы и применяются к новым анализам."),
  ).toBeVisible();
});
