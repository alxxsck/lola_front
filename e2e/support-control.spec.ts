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
  await expect(page.getByText("Серверный снимок:")).toBeVisible();
  await expect(page.getByRole("heading", { level: 2, name: "Без назначения" })).toBeVisible();
  await expect(
    page.getByRole("heading", { level: 2, name: "Доступность операторов" }),
  ).toBeVisible();
  await expect(page.getByText("SLA в shadow-режиме")).toBeVisible();
});
