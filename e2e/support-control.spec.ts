import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test("shows an authoritative support lead snapshot without deriving chat metrics", async ({
  page,
}) => {
  await login(page);
  await page.goto("/support/control");

  await expect(
    page.getByRole("heading", { level: 1, name: "Операционный обзор" }),
  ).toBeVisible();
  await expect(page.locator(".computed-at")).toContainText("Серверный снимок:");
  await expect(page.getByRole("heading", { level: 2, name: "Без назначения" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Доступность операторов" }),
  ).toBeVisible();
  await expect(page.locator(".computed-at")).toContainText("SLA в shadow-режиме");
  await expect(
    page.getByRole("heading", { level: 2, name: "Очередь рисков" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Активные alerts" }),
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
  const dialog = page.getByRole("dialog", { name: "Причинная история alert" });
  await expect(dialog.getByText("Риск зафиксирован")).toBeVisible();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
});
