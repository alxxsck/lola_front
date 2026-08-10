import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("legacy Case settings opens the canonical responsive rules editor", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 1000 },
    { width: 1024, height: 768 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/cases/settings");
    await expect(page).toHaveURL(
      /\/support\/settings\/case-intelligence\/detection$/,
    );
    await expect(
      page.getByRole("heading", {
        level: 1,
        name: "Категории и правила обращений",
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
});
