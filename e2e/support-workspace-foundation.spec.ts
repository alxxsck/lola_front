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

test("recovers an accepted reply after reload without creating a duplicate", async ({
  page,
}) => {
  await page.evaluate(() => {
    const dataKey = "retenive-cms-demo-data-v2";
    localStorage.setItem(
      dataKey,
      JSON.stringify({
        conversations: [
          {
            id: "conv_3",
            userId: "usr_2",
            title: "Бонусы и программа лояльности",
            status: "ACTIVE",
            lastMessageAt: "2026-08-07T10:00:00.000Z",
            messageCount: 3,
            isCurrent: true,
            currentInteractionSessionCount: 0,
            aiSuspension: {
              mode: "AUTOMATIC",
              lifecycle: "NONE",
              version: "0",
              suspendedUntil: null,
              serverTime: "2026-08-07T10:00:00.000Z",
            },
          },
        ],
      }),
    );
  });
  await page.reload();
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();
  await expect(page.getByText("Пользователь офлайн", { exact: true })).toBeVisible();
  const composer = page.getByRole("textbox", { name: "Ответ пользователю" });
  const text = "Проверка durable recovery после перезагрузки";
  await composer.fill(text);
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(page.getByText(text, { exact: true })).toHaveCount(1);

  await page.evaluate((replyText) => {
    const dataKey = "retenive-cms-demo-data-v2";
    const data = JSON.parse(localStorage.getItem(dataKey) ?? "null") as {
      adminMessageIdempotency: Record<
        string,
        { payload: string; result: { messageId: string } }
      >;
    } | null;
    if (!data) throw new Error("Demo repository was not persisted");
    const accepted = Object.entries(data.adminMessageIdempotency).find(
      ([, receipt]) => receipt.payload.includes(replyText),
    );
    if (!accepted) throw new Error("Accepted reply receipt was not found");
    const [key] = accepted;
    const scope = "prj_retenive_demo\u001fcms_1\u001fconv_3\u001fPUBLIC_REPLY";
    sessionStorage.setItem(
      `retenive:support-reply-attempt:${encodeURIComponent(scope)}`,
      JSON.stringify({
        version: 1,
        projectId: "prj_retenive_demo",
        actorId: "cms_1",
        conversationId: "conv_3",
        endUserId: "usr_2",
        text: replyText,
        key,
        state: "CHECKING_OUTCOME",
      }),
    );
  }, text);

  await page.reload();

  await expect(page.getByText(text, { exact: true })).toHaveCount(1);
  await expect(page.getByText("Пользователь офлайн", { exact: true })).toBeVisible();
  await expect(composer).toHaveValue("");
  await expect(
    page.getByRole("button", { name: "Проверить результат" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() =>
      Object.keys(sessionStorage).some((key) =>
        key.startsWith("retenive:support-reply-attempt:"),
      ),
    ),
  ).toBe(false);
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
  const firstId = (await rows.nth(0).getAttribute("data-selection-key"))?.split(
    ":",
  )[1];
  const secondId = (
    await rows.nth(1).getAttribute("data-selection-key")
  )?.split(":")[1];
  expect(firstId).toBeTruthy();
  expect(secondId).toBeTruthy();

  await page.keyboard.press("ArrowDown");
  await expect(page).toHaveURL(
    new RegExp(`/support/inbox/conversations/${firstId}$`),
  );
  await expect(page.locator(".conversation-row.selected")).toHaveCount(1);

  await page.keyboard.press("j");
  await expect(page).toHaveURL(
    new RegExp(`/support/inbox/conversations/${secondId}$`),
  );
  await expect(page.locator(".conversation-row.selected")).toHaveCount(1);

  await page.getByRole("textbox", { name: "Ответ пользователю" }).focus();
  await page.keyboard.press("k");
  await expect(page).toHaveURL(
    new RegExp(`/support/inbox/conversations/${secondId}$`),
  );
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

test("switches one inbox between Conversations and Cases and exposes exact context", async ({
  page,
}) => {
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  await expect(queue.getByRole("heading", { name: "Входящие" })).toBeVisible();
  await expect(queue.locator(".conversation-row")).toHaveCount(3);
  await expect(
    queue.getByRole("button", { name: "Все чаты", pressed: true }),
  ).toBeVisible();
  await queue.getByRole("button", { name: "Обращения" }).click();
  await expect(page).toHaveURL(/\/support\/inbox\?mode=cases$/);
  await expect(queue.locator(".case-row")).toHaveCount(3);

  await queue.getByRole("button", { name: /Не поступил депозит/ }).click();
  await expect(page).toHaveURL(
    /\/support\/inbox\/cases\/case-demo-deposit\?mode=cases$/,
  );
  const desktopContext = page.locator(".context-pane");
  const viewportWidth = page.viewportSize()?.width ?? 1280;
  const usesMobileContextRoute = viewportWidth <= 767;
  const usesContextDrawer = viewportWidth > 767 && viewportWidth <= 1279;
  const context = usesMobileContextRoute
    ? page.locator(".mobile-inspector-pane")
    : usesContextDrawer
      ? page.getByRole("dialog", { name: "Контекст диалога" })
      : desktopContext;
  if (usesMobileContextRoute || usesContextDrawer) {
    await page.getByRole("button", { name: "Контекст" }).click();
  }
  await expect(context.getByRole("tab")).toHaveCount(4);
  await expect(
    context.getByRole("tab", { name: "Пользователь" }),
  ).toBeVisible();
  await expect(context.getByRole("tab", { name: "Кейс" })).toBeVisible();
  await expect(context.getByRole("tab", { name: "История" })).toBeVisible();
  await expect(context.getByRole("tab", { name: "Действия" })).toBeVisible();
});

test("changes Case classification through exact server authority and records the reason", async ({
  page,
}) => {
  await page.goto("/support/inbox/cases/case-demo-deposit?mode=cases");

  const viewportWidth = page.viewportSize()?.width ?? 1440;
  if (viewportWidth <= 1279)
    await page.getByRole("button", { name: "Контекст" }).click();

  const context =
    viewportWidth <= 767
      ? page.getByRole("region", { name: "Контекст диалога" })
      : viewportWidth <= 1279
        ? page.getByRole("dialog", { name: "Контекст диалога" })
        : page.locator(".context-pane");
  await context.getByRole("tab", { name: "Кейс" }).click();
  await expect(context).toContainText("Кейс #48");
  await expect(context).toContainText("AI-классификация");
  await expect(context).toContainText("policy v7");

  await context.getByRole("button", { name: "Изменить классификацию" }).click();
  const dialog = page.getByRole("dialog", {
    name: "Классификация и приоритет",
  });
  await dialog.locator(".p-select").first().click();
  await page.getByRole("option", { name: "Общие вопросы" }).click();
  await dialog
    .getByRole("textbox", { name: "Причина изменения" })
    .fill("Проверено по данным провайдера");
  await dialog.getByRole("button", { name: "Сохранить изменение" }).click();
  await expect(dialog).toBeHidden();
  await expect(context).toContainText("Общие вопросы");

  await context.getByRole("tab", { name: "История" }).click();
  await expect(context).toContainText("Классификация уточнена");
  await expect(context).toContainText("Проверено по данным провайдера");

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
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

test("restores typed inbox routes with Back and Forward and keeps a Case without a fake chat", async ({
  page,
}) => {
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  await queue.getByRole("button", { name: "Обращения" }).click();
  await expect(page).toHaveURL(/\/support\/inbox\?mode=cases$/);
  await queue.getByRole("button", { name: /Не поступил депозит/ }).click();
  await expect(page).toHaveURL(
    /\/support\/inbox\/cases\/case-demo-deposit\?mode=cases$/,
  );

  await page.goBack();
  await expect(page).toHaveURL(/\/support\/inbox\?mode=cases$/);
  await expect(
    queue.getByRole("button", { name: "Обращения", pressed: true }),
  ).toBeVisible();

  await page.goForward();
  await expect(page).toHaveURL(
    /\/support\/inbox\/cases\/case-demo-deposit\?mode=cases$/,
  );
  await page.goto("/support/inbox/cases/case-demo-resolved");
  await expect(
    page.getByRole("heading", { name: "У обращения нет связанного чата" }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Ответ пользователю" }),
  ).toHaveCount(0);
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

test("keeps assignment actions in the Case inspector without exposing capabilities", async ({
  page,
}) => {
  await page.goto("/support/inbox/cases/case-demo-game?mode=cases");
  await expect(
    page.getByRole("textbox", { name: "Ответ пользователю" }),
  ).toBeVisible();
  await page.getByRole("tab", { name: "Действия" }).click();
  const desk = page.getByRole("region", { name: "Кто ведёт обращение" });

  await expect(desk).toBeVisible();
  await expect(desk).toContainText("Назначение");
  await expect(desk).toContainText("Claimant");
  await expect(desk).toContainText("Наблюдатели");
  await expect(desk).toContainText("Доступность");
  await expect(desk.getByText(/assignmentId|offerToken|actionEtag/)).toHaveCount(0);

  await page.getByRole("button", { name: "Взять в работу" }).click();
  await page.evaluate(() =>
    sessionStorage.setItem("retenive:e2e:assignment-conflict-once", "1"),
  );
  const confirmClaim = page.getByRole("button", {
    name: "Подтвердить назначение на себя",
  });
  await confirmClaim.click();
  const claimDialog = page.getByRole("dialog", { name: "Взять Case в работу" });
  await expect(claimDialog).toBeVisible();
  await expect(claimDialog.getByText(/Назначение уже изменилось/)).toBeVisible();
  await confirmClaim.click();
  await expect(page.getByRole("dialog", { name: "Взять Case в работу" })).toBeHidden();
  await expect(desk).toContainText("Алексей · Игры");
  await expect(page.getByRole("button", { name: "Снять назначение" })).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    if (viewport.width < 600) {
      await page.getByRole("button", { name: "Контекст" }).click();
      await page.getByRole("tab", { name: "Действия" }).click();
    }
    const geometry = await desk.evaluate((element) => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      viewport: document.documentElement.clientWidth,
      overflow:
        document.documentElement.scrollWidth - document.documentElement.clientWidth,
    }));
    expect(geometry.left).toBeGreaterThanOrEqual(0);
    expect(geometry.right).toBeLessThanOrEqual(geometry.viewport + 0.5);
    expect(geometry.overflow).toBe(0);
  }
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

test("uses the real mobile history stack and preserves safe inbox query", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/control");
  await page.goto("/support/inbox?view=mine&status=open");

  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();
  await expect(page).toHaveURL(
    /\/support\/inbox\/conversations\/conv_3\?view=mine&status=open$/,
  );

  await page.getByRole("button", { name: "Назад к списку диалогов" }).click();
  await expect(page).toHaveURL(
    /\/support\/inbox\?view=mine&status=open$/,
  );
  await page.goBack();
  await expect(page).toHaveURL(/\/support\/control$/);
});

test("preserves mobile inbox position, selection, draft and message anchor across browser Back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/inbox");
  await page.addStyleTag({
    content: `
      .support-inbox-pane .inbox-list {
        height: 112px !important;
        max-height: 112px !important;
        flex: 0 0 112px !important;
      }
      .conversation-surface__log { max-height: 148px !important; }
    `,
  });

  const inboxList = page.locator(".support-inbox-pane .inbox-list");
  const selectedRow = inboxList.locator(".conversation-row").last();
  const selectionKey = await selectedRow.getAttribute("data-selection-key");
  expect(selectionKey).toBeTruthy();
  await inboxList.evaluate((element) => {
    element.scrollTop = element.scrollHeight;
  });
  const inboxScrollTop = await inboxList.evaluate(
    (element) => element.scrollTop,
  );
  expect(inboxScrollTop).toBeGreaterThan(0);
  await selectedRow.click();

  const draft = page.getByRole("textbox", { name: "Ответ пользователю" });
  await draft.fill("Черновик мобильного оператора");
  const messageLog = page.locator(".conversation-surface__log");
  await messageLog.evaluate((element) => {
    element.scrollTop = 0;
  });
  const anchorId = await messageLog.evaluate((element) => {
    const logRect = element.getBoundingClientRect();
    return [...element.querySelectorAll<HTMLElement>("[data-message-id]")].find(
      (message) => message.getBoundingClientRect().bottom > logRect.top,
    )?.dataset.messageId;
  });
  expect(anchorId).toBeTruthy();

  await page.goBack();
  await expect(page).toHaveURL(/\/support\/inbox$/);
  await expect(
    inboxList.locator(`[data-selection-key="${selectionKey}"]`),
  ).toHaveAttribute("aria-current", "true");
  await expect(
    inboxList.locator(`[data-selection-key="${selectionKey}"]`),
  ).toBeFocused();
  expect(await inboxList.evaluate((element) => element.scrollTop)).toBe(
    inboxScrollTop,
  );

  await page.goForward();
  await expect(draft).toHaveValue("Черновик мобильного оператора");
  await expect
    .poll(() =>
      messageLog.evaluate((element) => {
        const logRect = element.getBoundingClientRect();
        return [
          ...element.querySelectorAll<HTMLElement>("[data-message-id]"),
        ].find(
          (message) => message.getBoundingClientRect().bottom > logRect.top,
        )?.dataset.messageId;
      }),
    )
    .toBe(anchorId);
});

test("restores each conversation message anchor when route selection changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/support/inbox/conversations/conv_3");
  await page.addStyleTag({
    content: ".conversation-surface__log { max-height: 150px !important; }",
  });

  const messageLog = page.locator(".conversation-surface__log");
  await messageLog.evaluate((element) => {
    element.scrollTop = 0;
  });
  const anchorId = await messageLog.evaluate((element) => {
    const logRect = element.getBoundingClientRect();
    return [...element.querySelectorAll<HTMLElement>("[data-message-id]")].find(
      (message) => message.getBoundingClientRect().bottom > logRect.top,
    )?.dataset.messageId;
  });
  expect(anchorId).toBeTruthy();

  await page.getByRole("button", { name: /Первый депозит/ }).click();
  await expect(page).not.toHaveURL(/\/conversations\/conv_3$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_3$/);
  await expect
    .poll(() =>
      messageLog.evaluate((element) => {
        const logRect = element.getBoundingClientRect();
        return [
          ...element.querySelectorAll<HTMLElement>("[data-message-id]"),
        ].find(
          (message) => message.getBoundingClientRect().bottom > logRect.top,
        )?.dataset.messageId;
      }),
    )
    .toBe(anchorId);
});

test("uses a routed inspector on mobile and an accessible drawer on tablet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/inbox");
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();
  const contextTrigger = page.getByRole("button", { name: "Контекст" });
  await contextTrigger.click();

  await expect(page).toHaveURL(
    /\/support\/inbox\/conversations\/conv_3\?panel=inspector$/,
  );
  await expect(
    page.getByRole("region", { name: "Контекст диалога" }),
  ).toBeVisible();
  await expect(
    page.getByRole("dialog", { name: "Контекст диалога" }),
  ).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Назад к диалогу" }),
  ).toBeFocused();
  const mobileInspectorAccessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .analyze();
  expect(
    mobileInspectorAccessibility.violations.filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);

  await page.goBack();
  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_3$/);
  await expect(contextTrigger).toBeFocused();

  await contextTrigger.click();
  await page.getByRole("button", { name: "Назад к диалогу" }).click();
  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_3$/);
  await page.goBack();
  await expect(page).toHaveURL(/\/support\/inbox$/);
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  await page.setViewportSize({ width: 1024, height: 768 });
  await contextTrigger.click();
  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_3$/);
  const drawer = page.getByRole("dialog", { name: "Контекст диалога" });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(contextTrigger).toBeFocused();

  await contextTrigger.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect(page).toHaveURL(/\?panel=inspector$/);
  await expect(
    page.getByRole("button", { name: "Назад к диалогу" }),
  ).toBeFocused();
  await page.setViewportSize({ width: 1024, height: 768 });
  await expect(page).not.toHaveURL(/panel=inspector/);
  await expect(drawer).toBeVisible();
  await expect
    .poll(() =>
      drawer.evaluate((element) => element.contains(document.activeElement)),
    )
    .toBe(true);
  await page.keyboard.press("Escape");
  await expect(contextTrigger).toBeFocused();
});

test("keeps the exact tablet and mobile route matrix usable without overflow", async ({
  page,
}) => {
  for (const viewport of [
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 1181, height: 820 },
    { width: 1279, height: 820 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/support/inbox");
    const inbox = page.getByRole("complementary", {
      name: "Диалоги проекта",
    });
    await inbox
      .getByRole("button", { name: /Бонусы и программа лояльности/ })
      .click();
    await expect(inbox).toBeVisible();
    await expect(
      page.getByRole("textbox", { name: "Ответ пользователю" }),
    ).toBeVisible();
    const conversationGeometry = await page.evaluate(() => {
      const surface = document.querySelector<HTMLElement>(
        ".conversation-surface",
      );
      const toolbar = document.querySelector<HTMLElement>(
        ".conversation-surface__toolbar",
      );
      const messages = [
        ...document.querySelectorAll<HTMLElement>("[data-message-id]"),
      ];
      const surfaceRect = surface?.getBoundingClientRect();
      return {
        toolbarOverflow:
          (toolbar?.scrollWidth ?? 0) - (toolbar?.clientWidth ?? 0),
        messageOverflow: messages.some((message) => {
          const rect = message.getBoundingClientRect();
          return (
            rect.left < (surfaceRect?.left ?? 0) - 0.5 ||
            rect.right > (surfaceRect?.right ?? 0) + 0.5
          );
        }),
      };
    });
    expect(conversationGeometry.toolbarOverflow).toBeLessThanOrEqual(0);
    expect(conversationGeometry.messageOverflow).toBe(false);
    await page.getByRole("button", { name: "Контекст" }).click();
    const drawer = page.getByRole("dialog", { name: "Контекст диалога" });
    await expect(drawer).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(drawer).toBeHidden();
  }

  for (const viewport of [
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ]) {
    await page.setViewportSize(viewport);
    await page.goto("/support/inbox");
    const inbox = page.getByRole("complementary", {
      name: "Диалоги проекта",
    });
    await expect(inbox).toBeVisible();
    await inbox
      .getByRole("button", { name: /Бонусы и программа лояльности/ })
      .click();
    await expect(inbox).toBeHidden();
    const composer = page.getByRole("textbox", { name: "Ответ пользователю" });
    await expect(composer).toBeVisible();
    const geometry = await page.evaluate(() => {
      const composer = document.querySelector<HTMLElement>(
        'textarea[aria-label="Ответ пользователю"]',
      );
      return {
        composerBottom: composer?.getBoundingClientRect().bottom ?? 0,
        viewportHeight: window.visualViewport?.height ?? window.innerHeight,
        overflow:
          document.documentElement.scrollWidth -
          document.documentElement.clientWidth,
      };
    });
    expect(geometry.composerBottom).toBeLessThanOrEqual(
      geometry.viewportHeight + 0.5,
    );
    expect(geometry.overflow).toBe(0);
    await page.getByRole("button", { name: "Назад к списку диалогов" }).click();
    await expect(inbox).toBeVisible();
  }
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
  const keyboardGeometry = await page.evaluate(() => {
    const log = document.querySelector<HTMLElement>(
      ".conversation-surface__log",
    );
    const lastMessage = [
      ...document.querySelectorAll<HTMLElement>("[data-message-id]"),
    ].at(-1);
    const logRect = log?.getBoundingClientRect();
    const messageRect = lastMessage?.getBoundingClientRect();
    const composer = document.querySelector<HTMLElement>(
      ".conversation-composer",
    );
    return {
      lastMessageVisible:
        Boolean(messageRect && logRect) &&
        messageRect!.bottom <= logRect!.bottom + 0.5 &&
        messageRect!.bottom > logRect!.top,
      composerSafeArea:
        Number.parseFloat(getComputedStyle(composer!).paddingBottom) >= 12,
    };
  });
  expect(keyboardGeometry.lastMessageVisible).toBe(true);
  expect(keyboardGeometry.composerSafeArea).toBe(true);
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

test("opens the selected conversation context as a mobile route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  await page.getByRole("button", { name: "Контекст" }).click();

  const inspector = page.getByRole("region", { name: "Контекст диалога" });
  await expect(inspector).toBeVisible();
  await expect(inspector.locator(".user-card h3")).toHaveText("Пользователь");
  await expect(inspector.getByText("user_11603", { exact: true })).toHaveCount(
    0,
  );
});

test("loads the profile only from the permission-gated inspector", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();
  await page.getByRole("button", { name: "Контекст" }).click();

  const inspector = page.getByRole("region", { name: "Контекст диалога" });
  await expect(inspector.getByText("Marco Silva", { exact: true })).toHaveCount(
    0,
  );
  await inspector.getByRole("button", { name: "Обновить" }).click();
  await expect(
    inspector.getByText("Marco Silva", { exact: true }),
  ).toBeVisible();
  await expect(inspector.getByText("user_11603", { exact: true })).toHaveCount(
    0,
  );
});
