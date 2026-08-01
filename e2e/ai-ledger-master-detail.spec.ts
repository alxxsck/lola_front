import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.describe("AI ledger master-detail", () => {
  test.use({ viewport: { width: 1440, height: 1000 } });

  test.beforeEach(async ({ page }) => {
    await login(page);
  });

  test("opens analysis details in a drawer without moving the page", async ({
    page,
  }) => {
    await page.goto("/ai-analyses");
    await expect(page.locator(".analysis-card")).toHaveCount(2);
    await page.evaluate(() => window.scrollTo(0, 140));
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await page
      .locator(
        '.analysis-card[data-analysis-id="mock-analysis-succeeded"] .open-label',
      )
      .click();

    await expect(page).toHaveURL(/\/ai-analyses\/mock-analysis-succeeded/);
    await expect(page.locator(".ai-ledger-drawer")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(scrollBefore, 0);
    await expect(page.locator(".p-drawer-mask")).toHaveCSS("position", "fixed");

    const layers = await page.evaluate(() => {
      const card = document.querySelector<HTMLElement>(".analysis-card");
      const detail = document.querySelector<HTMLElement>(".p-drawer-mask");
      return {
        card: Number(getComputedStyle(card!).zIndex) || 0,
        detail: Number(getComputedStyle(detail!).zIndex) || 0,
      };
    });
    expect(layers.detail).toBeGreaterThan(layers.card);

    await page.getByRole("button", { name: "Назад" }).click();
    await expect(
      page.locator(
        '.analysis-card[data-analysis-id="mock-analysis-succeeded"] .open-label',
      ),
    ).toBeFocused();
  });

  test("opens operation details in the same stable drawer pattern", async ({
    page,
  }) => {
    await page.goto("/ai-operations");
    await expect(page.locator(".operation-card")).toHaveCount(2);
    await page.evaluate(() => window.scrollTo(0, 180));
    const scrollBefore = await page.evaluate(() => window.scrollY);

    await page
      .getByRole("link", {
        name: "Открыть детали AI-операции 2241: Депозиты по GEO за вчера",
      })
      .click();

    await expect(page).toHaveURL(/\/ai-operations\/mock-operation-analysis/);
    await expect(page.locator(".ai-ledger-drawer")).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => window.scrollY))
      .toBeCloseTo(scrollBefore, 0);
    await expect(page.locator(".technical-section[open]")).toHaveCount(0);
  });

  test("uses one control type style and keeps technical fields secondary", async ({
    page,
  }) => {
    await page.goto("/ai-analyses");
    await expect(page.locator(".analysis-card")).toHaveCount(2);

    const typography = await page.evaluate(() =>
      [
        ...document.querySelectorAll<HTMLElement>(
          ".ai-ledger-filters .p-select-label, .ai-ledger-filters .p-inputtext",
        ),
      ].map((element) => {
        const style = getComputedStyle(element);
        return [
          style.fontFamily,
          style.fontSize,
          style.fontWeight,
          style.lineHeight,
        ].join("|");
      }),
    );

    expect(new Set(typography).size).toBe(1);
    await expect(page.locator(".technical-disclosure[open]")).toHaveCount(0);
  });

  test("reveals and copies a full identifier on demand", async ({
    context,
    page,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(
      "/ai-analyses/mock-analysis-succeeded?projectId=prj_lola_demo",
    );
    await expect(page.locator(".ai-ledger-drawer")).toBeVisible();

    await page.locator(".detail-panel > .technical-section summary").click();
    const copy = page.getByRole("button", {
      name: "Скопировать Analysis ID",
    });
    await copy.click();

    await expect(
      page.getByRole("button", { name: "Analysis ID скопирован" }),
    ).toBeVisible();
    await expect
      .poll(() => page.evaluate(() => navigator.clipboard.readText()))
      .toBe("mock-analysis-succeeded");
  });

  test("uses a full-width drawer without horizontal overflow on mobile", async ({
    page,
  }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/ai-analyses");
    await page
      .locator(
        '.analysis-card[data-analysis-id="mock-analysis-succeeded"] .open-label',
      )
      .click();

    const drawer = page.locator(".ai-ledger-drawer");
    await expect(drawer).toBeVisible();
    await expect
      .poll(async () => Math.abs((await drawer.boundingBox())?.x ?? 390) < 0.01)
      .toBe(true);
    const drawerBox = await drawer.boundingBox();
    expect(drawerBox?.x).toBeCloseTo(0, 0);
    expect(drawerBox?.width).toBeCloseTo(390, 0);
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth,
      ),
    ).toBe(true);

    const backBox = await page
      .getByRole("button", { name: "Назад" })
      .boundingBox();
    expect(backBox?.height).toBeGreaterThanOrEqual(44);
  });
});
