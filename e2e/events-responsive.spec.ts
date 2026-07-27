import { expect, test, type Page } from "@playwright/test";

async function login(page: Page) {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
});

test("event cards use a readable one-column mobile composition", async ({
  page,
}) => {
  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 720 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/events");
    await expect(
      page.getByRole("heading", { name: "События", level: 1 }),
    ).toBeVisible();

    const card = page.locator(".event-card").first();
    await expect(card).toBeVisible();

    const layout = await card.evaluate((element) => {
      const cardStyle = getComputedStyle(element);
      const main = element.querySelector<HTMLElement>(".event-main");
      const signals = element.querySelector<HTMLElement>(".event-signals");
      const summary = document.querySelector<HTMLElement>(".summary-grid");
      const signalRows = [
        ...element.querySelectorAll<HTMLElement>(".event-signals > div"),
      ];
      const actions = element.querySelector<HTMLElement>(
        ".event-action-buttons",
      );
      const switchTarget = element.querySelector<HTMLElement>(
        ".event-policy-switch-target",
      );
      const policySwitch =
        element.querySelector<HTMLElement>(".p-toggleswitch");
      const actionTargets = [
        ...element.querySelectorAll<HTMLElement>(
          ".event-action-buttons button, .event-action-buttons summary",
        ),
      ];
      const actionLabels = [
        ...element.querySelectorAll<HTMLElement>(
          ".event-action-buttons .p-button-label",
        ),
      ];

      return {
        pageOverflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
        cardColumns: cardStyle.gridTemplateColumns.split(" ").length,
        cardPadding: Number.parseFloat(cardStyle.paddingInlineStart),
        mainWidth: Math.round(main?.getBoundingClientRect().width ?? 0),
        summaryColumns: getComputedStyle(summary!).gridTemplateColumns.split(
          " ",
        ).length,
        signalColumns: getComputedStyle(signals!).gridTemplateColumns.split(" ")
          .length,
        signalRowsReadable: signalRows.every((row) => {
          const label = row.querySelector<HTMLElement>("dt");
          const value = row.querySelector<HTMLElement>("dd");
          return (
            getComputedStyle(row).gridTemplateColumns.split(" ").length === 2 &&
            (label?.getBoundingClientRect().width ?? 0) >= 76 &&
            (value?.getBoundingClientRect().width ?? 0) >= 110
          );
        }),
        actionColumns: getComputedStyle(actions!).gridTemplateColumns.split(" ")
          .length,
        actionsContained: actionTargets.every((target) => {
          const bounds = target.getBoundingClientRect();
          const parentBounds = actions!.getBoundingClientRect();
          return (
            bounds.left >= parentBounds.left &&
            bounds.right <= parentBounds.right + 1 &&
            bounds.height >= 44
          );
        }),
        actionLabelsReadable: actionLabels.every(
          (label) => label.scrollWidth <= label.clientWidth + 1,
        ),
        primaryActionWidth: Math.round(
          actionTargets[0]?.getBoundingClientRect().width ?? 0,
        ),
        actionsWidth: Math.round(actions?.getBoundingClientRect().width ?? 0),
        switchTargetSize: switchTarget
          ? {
              width: Math.round(switchTarget.getBoundingClientRect().width),
              height: Math.round(switchTarget.getBoundingClientRect().height),
            }
          : null,
        switchAspectRatio: policySwitch
          ? policySwitch.getBoundingClientRect().width /
            policySwitch.getBoundingClientRect().height
          : 0,
      };
    });

    expect(layout.pageOverflow).toBe(0);
    expect(layout.cardColumns).toBe(1);
    expect(layout.cardPadding).toBeLessThanOrEqual(16);
    expect(layout.mainWidth).toBeGreaterThanOrEqual(viewport.width - 80);
    expect(layout.summaryColumns).toBe(viewport.width <= 320 ? 1 : 2);
    expect(layout.signalColumns).toBe(1);
    expect(layout.signalRowsReadable).toBe(true);
    expect(layout.actionColumns).toBe(viewport.width <= 320 ? 2 : 3);
    expect(layout.actionsContained).toBe(true);
    expect(layout.actionLabelsReadable).toBe(true);
    if (viewport.width <= 320) {
      expect(layout.primaryActionWidth).toBe(layout.actionsWidth);
    }
    expect(layout.switchTargetSize).toEqual({ width: 44, height: 44 });
    expect(layout.switchAspectRatio).toBeGreaterThanOrEqual(1.5);
  }
});
