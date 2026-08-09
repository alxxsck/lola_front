import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test("shows an authoritative support lead snapshot without deriving chat metrics", async ({
  page,
}, testInfo) => {
  await login(page);
  await page.goto("/support/control");

  await expect(
    page.getByRole("heading", { level: 1, name: "Операционный обзор" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("lead-control-overview-desktop.png"),
  });
  await expect(page.locator(".computed-at")).toContainText("Серверный снимок:");
  await expect(
    page.getByRole("heading", { level: 2, name: "Без назначения" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Доступность операторов" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Где не хватает свободной ёмкости",
    }),
  ).toBeVisible();
  await expect(page.locator(".computed-at")).toContainText(
    "SLA рассчитывается в фоновом режиме",
  );
  await expect(
    page.getByRole("heading", { level: 2, name: "Очередь рисков" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Активные сигналы" }),
  ).toBeVisible();
  const sectionOrder = await page.evaluate(() => {
    const alerts = document.querySelector(".alerts-section");
    const risks = document.querySelector(".risk-section");
    return {
      alertsTop: alerts?.getBoundingClientRect().top,
      risksTop: risks?.getBoundingClientRect().top,
    };
  });
  expect(sectionOrder.alertsTop).toBeDefined();
  expect(sectionOrder.risksTop).toBeDefined();
  expect(sectionOrder.alertsTop!).toBeLessThan(sectionOrder.risksTop!);

  await page.getByRole("button", { name: "История" }).click();
  const dialog = page.getByRole("dialog", {
    name: "История причин по сигналу",
  });
  await expect(dialog.getByText("Риск зафиксирован")).toBeVisible();
  await expect(dialog.getByText("Ответственный")).toBeVisible();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
});

test("opens causal Case evidence and stays composed on desktop and mobile", async ({
  page,
}, testInfo) => {
  await login(page);
  await page.goto("/support/control");

  await page.getByRole("button", { name: "Почему" }).first().click();
  const dialog = page.getByRole("dialog", {
    name: "История причин по обращению",
  });
  await expect(dialog.getByText("Назначение · Система")).toBeVisible();
  await expect(
    dialog.getByRole("heading", { name: "Что привело к текущему состоянию" }),
  ).toBeVisible();
  await expect(
    dialog.getByText("Работа предложена оператору").first(),
  ).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({
    path: testInfo.outputPath("lead-control-case-desktop.png"),
  });
  await page.keyboard.press("Escape");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/control");
  await expect(
    page.getByRole("heading", { level: 1, name: "Операционный обзор" }),
  ).toBeVisible();
  await page.screenshot({
    path: testInfo.outputPath("lead-control-overview-mobile.png"),
  });
  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  await page.getByRole("button", { name: "Почему" }).first().click();
  await expect(
    page.getByRole("dialog", { name: "История причин по обращению" }),
  ).toBeVisible();
  await page.waitForTimeout(350);
  await page.screenshot({
    path: testInfo.outputPath("lead-control-case-mobile.png"),
  });
});

test("keeps partial-safe bulk assignment actionable from Lead Control", async ({
  page,
}) => {
  await login(page);
  await page.goto("/support/control");

  await page
    .getByRole("checkbox", { name: /для пакетного назначения/ })
    .first()
    .check();
  await page
    .getByRole("button", { name: "Пакетное назначение выбранных обращений" })
    .click();

  const dialog = page.getByRole("dialog", { name: "Пакетное назначение" });
  await expect(dialog.getByText("1 обращение в пакете")).toBeVisible();
  await dialog
    .getByRole("textbox", { name: "Обоснование пакетного назначения" })
    .fill("Распределение очереди дежурной смене");
  await dialog.getByRole("button", { name: "Назначить пакет" }).click();

  await expect(
    dialog.getByRole("heading", { name: "Пакет выполнен" }),
  ).toBeVisible();
  await expect(dialog.getByText("1 успешно · 0 ошибок")).toBeVisible();
  await expect(dialog.getByText("Назначен", { exact: true })).toBeVisible();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
});
