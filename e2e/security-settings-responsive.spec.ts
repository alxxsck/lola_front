import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => login(page));

test("security settings keep one control and reflow contract across themes", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 1024, height: 900 },
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/settings/security");
    await expect(
      page.getByRole("heading", { name: "Безопасность аккаунта", level: 1 }),
    ).toBeVisible();

    const layout = await page.locator(".security-page").evaluate((element) => {
      const controls = [
        ...element.querySelectorAll<HTMLElement>("input, button"),
      ];
      const clipped = [...element.querySelectorAll<HTMLElement>("*")].filter(
        (item) => item.scrollWidth > item.clientWidth + 1,
      );

      return {
        pageOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        clipped: clipped.map((item) => item.className).slice(0, 10),
        controlHeights: controls.map((item) =>
          Math.round(item.getBoundingClientRect().height),
        ),
      };
    });

    expect(layout.pageOverflow).toBe(0);
    expect(layout.clipped).toEqual([]);
    expect(layout.controlHeights.every((height) => height >= 44)).toBe(true);

    const passkeyItem = page.locator(".passkey-item");
    await expect(passkeyItem).toHaveCount(1);
    if (viewport.width <= 390) {
      const passkeyActionLayout = await passkeyItem.evaluate((element) => {
        const actions = element.querySelector<HTMLElement>(".item-actions");
        const button = actions?.querySelector<HTMLElement>("button");
        return {
          direction: actions ? getComputedStyle(actions).flexDirection : "",
          actionsWidth: Math.round(actions?.getBoundingClientRect().width ?? 0),
          buttonWidth: Math.round(button?.getBoundingClientRect().width ?? 0),
        };
      });
      expect(passkeyActionLayout.direction).toBe("column");
      expect(passkeyActionLayout.buttonWidth).toBe(
        passkeyActionLayout.actionsWidth,
      );
    }
  }

  await page.setViewportSize({ width: 320, height: 720 });
  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "200%";
  });
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      ),
    )
    .toBe(0);

  await page.locator("html").evaluate((element) => {
    element.style.fontSize = "";
  });
  await page.setViewportSize({ width: 1440, height: 900 });
  const themeSwitch = page.locator(".theme-switch input");
  await themeSwitch.check();
  await expect(page.locator("html")).toHaveClass(/lola-dark/);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page.locator(".security-card").first()).toBeVisible();

  const darkLayout = await page.evaluate(() => ({
    dark: document.documentElement.classList.contains("lola-dark"),
    overflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  expect(darkLayout).toEqual({ dark: true, overflow: 0 });
});
