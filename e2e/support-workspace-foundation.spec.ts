import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/support/inbox");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Поддержка",
    }),
  ).toBeVisible();
});

test("opens a project conversation as a deep link without horizontal overflow", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_3$/);
  await expect(
    page
      .getByRole("region", { name: "Диалог: Бонусы и программа лояльности" })
      .getByRole("heading", {
        level: 2,
        name: "Бонусы и программа лояльности",
      }),
  ).toBeVisible();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    workspaceRight:
      document.querySelector(".support-workspace")?.getBoundingClientRect()
        .right ?? 0,
  }));

  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  expect(geometry.workspaceRight).toBeLessThanOrEqual(
    geometry.clientWidth + 0.5,
  );
});

test("sends a public reply only through the selected conversation", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  const composer = page.getByRole("textbox", {
    name: "Ответ пользователю",
  });
  await expect(composer).toBeVisible();
  await composer.fill("Проверил обращение и вернусь с ответом сегодня.");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();

  await expect(composer).toHaveValue("");
  await expect(
    page.getByText("Проверил обращение и вернусь с ответом сегодня.", {
      exact: true,
    }),
  ).toBeVisible();
});

test("keeps the selected operator workspace free of serious structural accessibility violations", async ({
  page,
}) => {
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

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

test("moves through visible inbox rows with j/k and arrows without hijacking inputs", async ({
  page,
}) => {
  const rows = page.locator(".conversation-row");
  await expect(rows).toHaveCount(3);

  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_3$/);
  await expect(page.locator(".conversation-row.selected")).toHaveCount(1);

  await page.keyboard.press("j");
  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_2$/);
  await expect(page.locator(".conversation-row.selected")).toHaveCount(1);

  await page.getByRole("textbox", { name: "Ответ пользователю" }).focus();
  await page.keyboard.press("k");
  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_2$/);
});

test("shows and changes only the operator's authoritative availability intent", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Моя доступность" }).click();
  const status = page.getByRole("region", {
    name: "Статус для новых обращений",
  });
  await expect(status).toBeVisible();
  await expect(
    status.getByText("Доступен", { exact: true }).first(),
  ).toBeVisible();
  await expect(status).toContainText("Получаете новые обращения");

  const selects = status.locator("select");
  await selects.nth(0).selectOption("AWAY");
  await expect(selects.nth(1)).toHaveValue("BREAK");
  await expect(status.locator('input[type="number"]')).toHaveValue("15");
  await status.getByRole("button", { name: "Сохранить статус" }).click();

  await expect(
    status.getByText("Отошёл", { exact: true }).first(),
  ).toBeVisible();
  await expect(status).toContainText("Новые обращения не назначаются");
});

test("keeps one support chat queue and exposes user, Case, and action context", async ({
  page,
}) => {
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  await expect(queue.getByRole("heading", { name: "Входящие" })).toBeVisible();
  await expect(queue.locator(".conversation-row")).toHaveCount(3);
  await expect(queue.getByText("Обращения", { exact: true })).toHaveCount(0);

  await queue.locator(".conversation-row").first().click();
  const desktopContext = page.locator(".context-pane");
  const usesContextDrawer = (page.viewportSize()?.width ?? 1280) <= 1180;
  const context = usesContextDrawer
    ? page.getByRole("dialog", { name: "Контекст диалога" })
    : desktopContext;
  if (usesContextDrawer) {
    await page.getByRole("button", { name: "Контекст" }).click();
  }
  await expect(context.getByRole("tab")).toHaveCount(3);
  await expect(
    context.getByRole("tab", { name: "Пользователь" }),
  ).toBeVisible();
  await expect(context.getByRole("tab", { name: "Кейс" })).toBeVisible();
  await expect(context.getByRole("tab", { name: "Действия" })).toBeVisible();
});

test("expands the workspace without leaving the operator workflow", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 800 });
  await page.goto("/support/inbox");
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  const shell = page.getByTestId("workspace-presentation-shell");
  await expect(shell).toHaveAttribute("data-presentation-mode", "full-tab");
  const draft = page.getByRole("textbox", { name: "Ответ пользователю" });
  await draft.fill("Черновик переживает смену режима");
  const translatedMode = page.getByRole("button", { name: "Перевод · RU" });
  await translatedMode.click();
  const caseTab = page.getByRole("tab", { name: "Кейс" });
  await caseTab.click();
  const messageAnchor = page.locator("[data-message-id]").first();
  const messageAnchorId = await messageAnchor.getAttribute("data-message-id");
  expect(messageAnchorId).toBeTruthy();
  const persistedMessageAnchor = page.locator(
    `[data-message-id="${messageAnchorId}"]`,
  );
  await expect(persistedMessageAnchor).toBeVisible();
  const fullTabLayoutHeight = await page
    .locator(".support-workspace-page")
    .evaluate((element) => (element as HTMLElement).offsetHeight);

  const leavingState = await page
    .getByRole("button", { name: "Свернуть" })
    .evaluate(async (button: HTMLButtonElement) => {
      button.click();
      await new Promise<void>((resolve) =>
        requestAnimationFrame(() => resolve()),
      );
      const shell = document.querySelector(
        '[data-testid="workspace-presentation-shell"]',
      );
      const workspace = document.querySelector<HTMLElement>(
        ".support-workspace-page",
      );
      return {
        phase: shell?.getAttribute("data-transition-phase"),
        keepsFullTabLayout: workspace?.classList.contains(
          "support-workspace-page--full-tab",
        ),
        layoutHeight: workspace?.offsetHeight,
      };
    });
  expect(leavingState).toEqual({
    phase: "leaving",
    keepsFullTabLayout: true,
    layoutHeight: fullTabLayoutHeight,
  });
  const launcher = page.getByRole("button", { name: "На весь экран" });
  await expect(launcher).toBeEnabled();
  await expect(draft).toHaveValue("Черновик переживает смену режима");
  await expect(translatedMode).toHaveAttribute("aria-pressed", "true");
  await expect(caseTab).toHaveAttribute("aria-selected", "true");
  await expect(persistedMessageAnchor).toBeVisible();

  const scrollBeforePresentation = await page.evaluate(() => {
    const target = Math.min(
      240,
      document.documentElement.scrollHeight - window.innerHeight,
    );
    window.scrollTo(0, Math.max(0, target));
    return window.scrollY;
  });
  await launcher.evaluate((button: HTMLButtonElement) => button.click());

  await expect(shell).toHaveAttribute("data-presentation-mode", "full-tab");
  await expect(page.getByRole("button", { name: "Свернуть" })).toBeEnabled();
  await expect(page.getByRole("button", { name: "Свернуть" })).toBeFocused();
  await expect(draft).toHaveValue("Черновик переживает смену режима");
  await shell.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });

  const geometry = await shell.evaluate((element) => {
    const rect = element.getBoundingClientRect();
    return {
      left: rect.left,
      top: rect.top,
      right: rect.right,
      bottom: rect.bottom,
      viewportWidth: window.innerWidth,
      viewportHeight: window.innerHeight,
      bodyOverflow: getComputedStyle(document.body).overflow,
      bodyPosition: getComputedStyle(document.body).position,
      appInert: document.querySelector("#app")?.hasAttribute("inert") ?? false,
      horizontalOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });
  expect(geometry).toEqual({
    left: 0,
    top: 0,
    right: geometry.viewportWidth,
    bottom: geometry.viewportHeight,
    viewportWidth: geometry.viewportWidth,
    viewportHeight: geometry.viewportHeight,
    bodyOverflow: "hidden",
    bodyPosition: "fixed",
    appInert: true,
    horizontalOverflow: 0,
  });

  await draft.focus();
  await draft.press("Escape");
  await expect(shell).toHaveAttribute("data-presentation-mode", "windowed");
  await expect(launcher).toBeEnabled();
  await expect(draft).toHaveValue("Черновик переживает смену режима");
  await expect(launcher).toBeFocused();
  await expect(translatedMode).toHaveAttribute("aria-pressed", "true");
  await expect(caseTab).toHaveAttribute("aria-selected", "true");
  await expect(persistedMessageAnchor).toBeVisible();
  expect(await page.evaluate(() => window.scrollY)).toBe(
    scrollBeforePresentation,
  );
});

test("keeps the full-tab route open while Escape closes a nested dialog", async ({
  page,
}) => {
  const shell = page.getByTestId("workspace-presentation-shell");
  await expect(shell).toHaveAttribute("data-presentation-mode", "full-tab");
  await page.getByRole("button", { name: "Моя доступность" }).click();
  const dialog = page.getByRole("dialog", { name: "Моя доступность" });
  await expect(dialog).toBeVisible();

  await page.keyboard.press("Escape");

  await expect(dialog).toBeHidden();
  await expect(shell).toHaveAttribute("data-presentation-mode", "full-tab");
});

test("matches the browser viewport at every desktop and tablet breakpoint", async ({
  page,
}) => {
  const shell = page.getByTestId("workspace-presentation-shell");
  await shell.evaluate(async (element) => {
    await Promise.all(
      element.getAnimations().map((animation) => animation.finished),
    );
  });
  for (const viewport of [
    { width: 1920, height: 1080 },
    { width: 1440, height: 1000 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
  ]) {
    await page.setViewportSize(viewport);
    const geometry = await shell.evaluate((element) => {
      const rect = element.getBoundingClientRect();
      return {
        left: rect.left,
        top: rect.top,
        right: rect.right,
        bottom: rect.bottom,
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    });
    expect(geometry.left).toBeCloseTo(0, 2);
    expect(geometry.top).toBeCloseTo(0, 2);
    expect(geometry.right).toBeCloseTo(viewport.width, 2);
    expect(geometry.bottom).toBeCloseTo(viewport.height, 2);
    expect(geometry.overflow).toBe(0);
  }
});

test("shows only the operator's server-authoritative routing offers", async ({
  page,
}) => {
  await page.getByRole("button", { name: "Свернуть" }).click();
  const offers = page.getByRole("region", { name: "Предложения из очереди" });

  await expect(offers).toBeVisible();
  await expect(offers).toContainText("Активных предложений сейчас нет.");
  await expect(offers.getByText(/assignmentId|offerToken|queueId/)).toHaveCount(
    0,
  );
});

test("does not substitute another conversation for an unavailable deep link", async ({
  page,
}) => {
  await page.goto("/support/inbox/conversations/conv_not_available");

  await expect(
    page.getByRole("heading", { level: 2, name: "Диалог недоступен" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", {
      level: 2,
      name: "Бонусы и программа лояльности",
    }),
  ).not.toBeVisible();
});

test("uses route-aware inbox and chat panes on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/inbox");

  await expect(
    page.getByRole("heading", { level: 2, name: "Активный диалог" }),
  ).not.toBeVisible();
  const inboxList = page.locator(".conversation-list");
  expect(
    await inboxList.evaluate(
      (element) => element.scrollWidth - element.clientWidth,
    ),
  ).toBe(0);

  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();
  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_3$/);
  await expect(
    page.getByRole("button", { name: "Назад к списку диалогов" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Назад к списку диалогов" }).click();
  await expect(page).toHaveURL(/\/support\/inbox$/);
});

test("keeps the full-tab shell stable for reduced motion and mobile focus", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.goto("/support/inbox");
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  const shell = page.getByTestId("workspace-presentation-shell");
  await expect(shell).toHaveCSS("animation-name", "none");
  const draft = page.getByRole("textbox", { name: "Ответ пользователю" });
  await draft.focus();

  const geometry = await page.evaluate(() => {
    const shell = document.querySelector<HTMLElement>(
      '[data-testid="workspace-presentation-shell"]',
    );
    const composer = document.querySelector<HTMLElement>(
      'textarea[aria-label="Ответ пользователю"]',
    );
    const shellRect = shell?.getBoundingClientRect();
    const composerRect = composer?.getBoundingClientRect();
    return {
      shellTop: shellRect?.top,
      shellBottom: shellRect?.bottom,
      composerTop: composerRect?.top,
      composerBottom: composerRect?.bottom,
      viewportHeight: window.visualViewport?.height ?? window.innerHeight,
      horizontalOverflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
      pageScrollY: window.scrollY,
    };
  });

  expect(geometry.shellTop).toBe(0);
  expect(geometry.shellBottom).toBe(844);
  expect(geometry.composerTop).toBeGreaterThanOrEqual(0);
  expect(geometry.composerBottom).toBeLessThanOrEqual(
    geometry.viewportHeight + 0.5,
  );
  expect(geometry.horizontalOverflow).toBe(0);
  expect(geometry.pageScrollY).toBe(0);

  await page.setViewportSize({ width: 390, height: 500 });
  await expect
    .poll(() =>
      shell.evaluate((element) => element.getBoundingClientRect().bottom),
    )
    .toBe(500);
  expect(
    await draft.evaluate((element) => element.getBoundingClientRect().bottom),
  ).toBeLessThanOrEqual(500.5);
});

test("restores readable CMS navigation when the mobile workspace is collapsed", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/inbox");
  await page.getByRole("button", { name: "Свернуть" }).click();
  await page.getByRole("button", { name: "Открыть меню", exact: true }).click();

  const navigation = page.getByRole("complementary", {
    name: "Основная навигация CMS",
  });
  await expect(
    navigation.getByRole("link", { name: "Поддержка" }),
  ).toBeVisible();
  await expect(
    navigation.getByText("Пользователи", { exact: true }),
  ).toBeVisible();
});

test("opens the selected conversation context in a mobile drawer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  await page.getByRole("button", { name: "Контекст" }).click();

  const drawer = page.getByRole("dialog", { name: "Контекст диалога" });
  await expect(drawer).toBeVisible();
  await expect(drawer.locator(".user-card h3")).toHaveText("Пользователь");
  await expect(drawer.getByText("user_11603", { exact: true })).toHaveCount(0);
});

test("loads the profile only from the permission-gated inspector", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();
  await page.getByRole("button", { name: "Контекст" }).click();

  const drawer = page.getByRole("dialog", { name: "Контекст диалога" });
  await expect(drawer.getByText("Marco Silva", { exact: true })).toHaveCount(0);
  await drawer.getByRole("button", { name: "Обновить" }).click();
  await expect(drawer.getByText("Marco Silva", { exact: true })).toBeVisible();
  await expect(drawer.getByText("user_11603", { exact: true })).toHaveCount(0);
});
