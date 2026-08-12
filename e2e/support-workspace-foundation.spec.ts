import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function expectPath(page: Page, pathname: string): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname).toBe(pathname);
}

function colorContrast(foreground: string, background: string): number {
  const channels = (value: string) => {
    const match = value.match(/\d+(?:\.\d+)?/g);
    if (!match || match.length < 3)
      throw new Error(`Unsupported color ${value}`);
    return match.slice(0, 3).map(Number);
  };
  const luminance = (value: string) => {
    const [red = 0, green = 0, blue = 0] = channels(value).map((channel) => {
      const normalized = channel / 255;
      return normalized <= 0.04045
        ? normalized / 12.92
        : ((normalized + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * red + 0.7152 * green + 0.0722 * blue;
  };
  const foregroundLuminance = luminance(foreground);
  const backgroundLuminance = luminance(background);
  return (
    (Math.max(foregroundLuminance, backgroundLuminance) + 0.05) /
    (Math.min(foregroundLuminance, backgroundLuminance) + 0.05)
  );
}

async function showBaseInbox(page: Page): Promise<void> {
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  const trigger = queue.locator(".inbox-tools__trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  await queue.getByRole("button", { name: "Новый поиск" }).click();
  await queue
    .getByRole("searchbox", { name: "Поиск по поддержке" })
    .press("Escape");
  await expect(queue.locator(".inbox-list")).toBeVisible();
}

async function showCasesInbox(page: Page): Promise<void> {
  await page.goto("/support/inbox?mode=cases");
  await showBaseInbox(page);
}

async function selectSystemView(page: Page, name: string): Promise<void> {
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  const trigger = queue.locator(".inbox-tools__trigger");
  if ((await trigger.getAttribute("aria-expanded")) !== "true")
    await trigger.click();
  await queue
    .getByRole("navigation", { name: "Системные представления" })
    .getByRole("button", { name: new RegExp(`^${name}`) })
    .click();
  await expect(trigger).toContainText(name);
}

test.beforeEach(async ({ page }) => {
  await login(page);
  await page.goto("/support/inbox?view=system:ALL_CONVERSATIONS");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Поддержка",
    }),
  ).toBeVisible();
});

test("keeps the support search toolbar readable in the inbox rail", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  const toolsTrigger = queue.locator(".inbox-tools__trigger");
  if ((await toolsTrigger.getAttribute("aria-expanded")) !== "true")
    await toolsTrigger.click();

  const searchInput = queue.getByRole("searchbox", {
    name: "Поиск по поддержке",
  });
  await searchInput.focus();
  const compactFocus = await searchInput.evaluate((element) => {
    const style = getComputedStyle(element);
    return {
      delegatedTo: element.getAttribute("data-focus-ring"),
      boxShadow: style.boxShadow,
      outlineStyle: style.outlineStyle,
    };
  });
  expect(compactFocus).toEqual({
    delegatedTo: "container",
    boxShadow: "none",
    outlineStyle: "none",
  });

  await queue.getByRole("button", { name: "Новый поиск" }).click();
  await searchInput.fill("второй депозит");
  await searchInput.focus();

  const geometry = await queue.locator(".search-rail").evaluate((element) => {
    const rect = (selector: string) => {
      const target = element.querySelector<HTMLElement>(selector);
      const bounds = target?.getBoundingClientRect();
      return bounds
        ? {
            left: bounds.left,
            top: bounds.top,
            right: bounds.right,
            bottom: bounds.bottom,
            width: bounds.width,
            height: bounds.height,
          }
        : null;
    };
    const input = element.querySelector<HTMLInputElement>(
      "[data-support-search-input]",
    );
    return {
      rail: rect(".search-rail"),
      form: rect(".search-form"),
      scope: rect('[aria-label="Область поиска"]'),
      filter: rect(".filter-popover summary"),
      exact: rect(".exact-filter-popover summary"),
      sort: rect(".sort-control select"),
      direction: rect(".direction-button"),
      inputShadow: input ? getComputedStyle(input).boxShadow : null,
      overflow: element.scrollWidth - element.clientWidth,
    };
  });

  expect(geometry.inputShadow).toBe("none");
  expect(geometry.form?.height).toBeGreaterThanOrEqual(44);
  expect(geometry.scope?.width).toBeGreaterThanOrEqual(240);
  expect(geometry.filter?.height).toBeGreaterThanOrEqual(40);
  expect(geometry.exact?.height).toBeGreaterThanOrEqual(40);
  expect(geometry.filter?.top).toBe(geometry.exact?.top);
  expect(geometry.sort?.height).toBeGreaterThanOrEqual(40);
  expect(geometry.sort?.width).toBeGreaterThanOrEqual(200);
  expect(geometry.sort?.top).toBe(geometry.direction?.top);
  expect(geometry.direction?.height).toBeGreaterThanOrEqual(40);
  expect(geometry.overflow).toBeLessThanOrEqual(1);

  const accessibility = await new AxeBuilder({ page })
    .include(".search-rail")
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("keeps support status controls legible and immediately understandable", async ({
  page,
}) => {
  await showBaseInbox(page);
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });

  for (const dark of [false, true]) {
    await page.evaluate((enabled) => {
      document.documentElement.classList.toggle("retenive-dark", enabled);
    }, dark);
    const badgeColors = await queue
      .locator(".unread-count")
      .first()
      .evaluate((element) => {
        const style = getComputedStyle(element);
        return { color: style.color, background: style.backgroundColor };
      });
    expect(
      colorContrast(badgeColors.color, badgeColors.background),
    ).toBeGreaterThanOrEqual(4.5);

    const headerIconColors = await page
      .locator(".support-workspace-title__icon")
      .evaluate((element) => {
        const style = getComputedStyle(element);
        const icon = element.querySelector("i");
        return {
          color: icon ? getComputedStyle(icon).color : style.color,
          background: style.backgroundColor,
        };
      });
    expect(
      colorContrast(headerIconColors.color, headerIconColors.background),
    ).toBeGreaterThanOrEqual(3);
  }

  await expect(
    queue.getByRole("group", { name: "Режим входящих" }),
  ).toHaveCount(0);
  await expect(queue.locator(".inbox-tools__trigger")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: /^Моя доступность: / }),
  ).toBeVisible();
});

test("shows clear hover and pagination contrast in the inbox", async ({
  page,
}) => {
  await showBaseInbox(page);
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  const row = queue.locator(".inbox-row").first();
  const idleBackground = await row.evaluate(
    (element) => getComputedStyle(element).backgroundColor,
  );

  await row.hover();
  await expect
    .poll(() =>
      row.evaluate((element) => getComputedStyle(element).backgroundColor),
    )
    .not.toBe(idleBackground);

  const loadMorePresentation = await queue.evaluate((element) => {
    const row = element.querySelector<HTMLElement>(".inbox-row");
    const scopeAttribute = row
      ?.getAttributeNames()
      .find((name) => name.startsWith("data-v-"));
    const button = document.createElement("button");
    button.className = "load-more";
    button.textContent = "Показать ещё";
    if (scopeAttribute) button.setAttribute(scopeAttribute, "");
    element.append(button);
    const style = getComputedStyle(button);
    const presentation = {
      color: style.color,
      background: style.backgroundColor,
      borderStyle: style.borderStyle,
    };
    button.remove();
    return presentation;
  });
  expect(loadMorePresentation.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(loadMorePresentation.borderStyle).toBe("solid");
  expect(
    colorContrast(loadMorePresentation.color, loadMorePresentation.background),
  ).toBeGreaterThanOrEqual(4.5);
});

test("keeps the inbox rail stable while selecting a source", async ({
  page,
}) => {
  await showBaseInbox(page);
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  const heading = queue.locator(".support-inbox-heading");
  const tools = queue.locator(".inbox-tools");
  const before = await Promise.all([
    heading.boundingBox(),
    tools.boundingBox(),
  ]);

  await selectSystemView(page, "Все обращения");

  await expect(heading.getByText(/^Загружено:/)).toBeVisible();
  await expect(queue.locator(".search-result-row").first()).toBeVisible();
  const during = await Promise.all([
    heading.boundingBox(),
    tools.boundingBox(),
  ]);
  expect(
    Math.abs((during[0]?.height ?? 0) - (before[0]?.height ?? 0)),
  ).toBeLessThanOrEqual(1);
  expect(
    Math.abs((during[1]?.y ?? 0) - (before[1]?.y ?? 0)),
  ).toBeLessThanOrEqual(1);
});

test("aligns the Case sequence with the row headline", async ({ page }) => {
  await showCasesInbox(page);
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });

  const row = queue.locator(".case-row").first();
  await expect(row).toBeVisible();
  const geometry = await row.evaluate((element) => {
    const sequence = element
      .querySelector<HTMLElement>(".case-row__sequence > span")!
      .getBoundingClientRect();
    const headline = element
      .querySelector<HTMLElement>(".case-row__headline > strong")!
      .getBoundingClientRect();
    return { sequenceTop: sequence.top, headlineTop: headline.top };
  });
  expect(
    Math.abs(geometry.sequenceTop - geometry.headlineTop),
  ).toBeLessThanOrEqual(4);
});

test("selects a conversation immediately and swaps it through message skeletons", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await showBaseInbox(page);
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  const rows = queue.locator(".inbox-row");

  await rows.nth(0).click();
  await expect(page.locator(".conversation-loading-overlay")).toBeHidden();

  const nextRow = rows.nth(1);
  await nextRow.click({ noWaitAfter: true });

  await expect(nextRow).toHaveAttribute("aria-current", "true");
  const loading = page.locator(".conversation-loading-overlay");
  await expect(loading).toBeVisible();
  await expect(loading.locator(".conversation-loading-message")).toHaveCount(
    16,
  );
  const loadingPresentation = await loading.evaluate((element) => {
    const style = getComputedStyle(element);
    const messages = Array.from(
      element.querySelectorAll<HTMLElement>(".conversation-loading-message"),
    ).map((message) => {
      const bounds = message.getBoundingClientRect();
      return { width: bounds.width, height: bounds.height };
    });
    const messageList = element.querySelector<HTMLElement>(
      ".conversation-loading-messages",
    );
    return {
      background: style.backgroundColor,
      messages,
      fillsViewportWithReserve: messageList
        ? messageList.scrollHeight > messageList.clientHeight
        : false,
    };
  });
  expect(loadingPresentation.background).not.toBe("rgba(0, 0, 0, 0)");
  expect(
    loadingPresentation.messages.every((message) => message.height >= 44),
  ).toBe(true);
  expect(
    loadingPresentation.messages.every((message) => message.width <= 520),
  ).toBe(true);
  expect(loadingPresentation.fillsViewportWithReserve).toBe(true);
  await expect(loading).toBeHidden();
});

test("keeps the last chat selection after rapid clicks and clears loading", async ({
  page,
}) => {
  test.skip(
    (page.viewportSize()?.width ?? 1_280) <= 760,
    "Mobile route stack hides the inbox after the first selection",
  );
  await showBaseInbox(page);
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  const rows = queue.locator(".conversation-row");
  const finalConversationId = await rows
    .nth(0)
    .getAttribute("data-inbox-item-id");
  expect(finalConversationId).toBeTruthy();

  await rows.nth(0).click();
  await expect(page.locator(".conversation-loading-overlay")).toBeHidden();
  await rows.evaluateAll((items) => {
    items[2]?.click();
    items[0]?.click();
  });

  await expect(rows.nth(0)).toHaveAttribute("aria-current", "true");
  await expect(page.locator(".conversation-loading-overlay")).toBeHidden();
  await expect
    .poll(() => new URL(page.url()).pathname)
    .toBe(`/support/inbox/conversations/${finalConversationId}`);
  await expect(page.locator(".conversation-surface")).toBeVisible();
});

test("keeps availability and message loading visible on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await showBaseInbox(page);
  await expect(page.locator(".header-actions .p-tag")).toBeVisible();
  await expect(
    page.locator(".availability-button .p-button-label"),
  ).toContainText(/^Я |^Завершаю |^Загрузка |^Статус /);

  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  await queue.locator(".inbox-row").first().click({ noWaitAfter: true });
  const loading = page.locator(".conversation-loading-overlay");
  await expect(loading).toBeVisible();
  await expect(loading.locator(".conversation-loading-message")).toHaveCount(
    16,
  );
  const geometry = await loading.evaluate((element) => {
    const bounds = element.getBoundingClientRect();
    const messageList = element.querySelector<HTMLElement>(
      ".conversation-loading-messages",
    );
    return {
      left: bounds.left,
      right: bounds.right,
      viewportWidth: window.innerWidth,
      fillsViewportWithReserve: messageList
        ? messageList.scrollHeight > messageList.clientHeight
        : false,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
    };
  });
  expect(geometry.left).toBeGreaterThanOrEqual(-0.5);
  expect(geometry.right).toBeLessThanOrEqual(geometry.viewportWidth + 0.5);
  expect(geometry.fillsViewportWithReserve).toBe(true);
  expect(geometry.overflow).toBe(0);
  await expect(loading).toBeHidden();
});

test("opens a project conversation as a deep link without horizontal overflow", async ({
  page,
}) => {
  await showBaseInbox(page);
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  await expectPath(page, "/support/inbox/conversations/conv_3");
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

test("shows collaboration as a compact warning without blocking the shared composer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/support/inbox/cases/case-demo-deposit?mode=cases");
  const conversation = page.locator(".conversation-surface");
  const presence = conversation.getByRole("button", {
    name: /1 наблюдатель.*Показать, кто сейчас смотрит диалог/,
  });
  await expect(presence).toBeVisible();
  await presence.click();
  const viewers = page.getByRole("region", {
    name: "Кто сейчас смотрит диалог",
  });
  await expect(viewers).toBeVisible();
  await expect(viewers).toContainText("Анна");
  await expect(viewers).toContainText(
    "Просмотр не означает назначение обращения",
  );
  expect(
    await viewers.evaluate((element) => {
      const bounds = element.getBoundingClientRect();
      const topmost = document.elementFromPoint(
        bounds.left + bounds.width / 2,
        bounds.top + 12,
      );
      return Boolean(topmost && element.contains(topmost));
    }),
  ).toBe(true);
  await page.keyboard.press("Escape");
  await expect(
    conversation.getByText(/Илья Соколов печатает ответ/),
  ).toBeVisible();
  const draft = conversation.getByRole("textbox", {
    name: "Ответ пользователю",
  });
  await draft.fill("Проверяю обращение перед ответом");
  await expect(
    conversation.getByRole("button", { name: "Отправить" }),
  ).toBeEnabled();

  const desktopGeometry = await conversation.evaluate((element) => ({
    clientWidth: element.clientWidth,
    scrollWidth: element.scrollWidth,
  }));
  expect(desktopGeometry.scrollWidth).toBeLessThanOrEqual(
    desktopGeometry.clientWidth + 1,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/inbox/cases/case-demo-deposit?mode=cases");
  const mobileConversation = page.locator(".conversation-surface");
  await expect(
    mobileConversation.getByRole("button", {
      name: /1 наблюдатель.*Показать, кто сейчас смотрит диалог/,
    }),
  ).toBeVisible();
  const mobileGeometry = await mobileConversation.evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(mobileGeometry.left).toBeGreaterThanOrEqual(-0.5);
  expect(mobileGeometry.right).toBeLessThanOrEqual(
    mobileGeometry.viewportWidth + 0.5,
  );
  expect(mobileGeometry.scrollWidth).toBe(mobileGeometry.viewportWidth);

  const accessibility = await new AxeBuilder({ page })
    .include(".conversation-surface")
    .analyze();
  expect(accessibility.violations).toEqual([]);
});

test("keeps public replies and internal notes isolated in the shared composer", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/support/inbox/cases/case-demo-deposit?mode=cases");
  const conversation = page.locator(".conversation-surface");
  const publicDraft = conversation.getByRole("textbox", {
    name: "Ответ пользователю",
  });
  await publicDraft.fill("Публичный ответ остаётся отдельным");

  await conversation
    .getByRole("button", { name: "Внутренняя заметка" })
    .click();
  const noteDraft = conversation.getByRole("textbox", {
    name: "Внутренняя заметка",
  });
  await expect(noteDraft).toHaveValue("");
  await expect(conversation.getByText("Видно только команде")).toBeVisible();
  const privateNote = "Внутренняя проверка 2201 — не показывать пользователю";
  await noteDraft.fill(privateNote);
  await page.getByRole("button", { name: "Обновить", exact: true }).click();
  await expect(noteDraft).toHaveValue(privateNote);
  await conversation.getByRole("button", { name: "Добавить заметку" }).click();
  await expect(noteDraft).toHaveValue("");
  await expect(
    conversation.getByRole("region", {
      name: "Последние внутренние заметки",
    }),
  ).toContainText(privateNote);

  await conversation
    .getByRole("button", { name: "Ответ пользователю" })
    .click();
  await expect(
    conversation.getByRole("textbox", { name: "Ответ пользователю" }),
  ).toHaveValue("Публичный ответ остаётся отдельным");

  await page.setViewportSize({ width: 1280, height: 720 });
  await conversation
    .getByRole("button", { name: "Внутренняя заметка" })
    .click();
  await expect
    .poll(() =>
      conversation
        .getByRole("region", { name: "Последние внутренние заметки" })
        .evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeGreaterThanOrEqual(40);
  const shortDesktopGeometry = await conversation.evaluate((element) => {
    const log = element.querySelector<HTMLElement>(
      ".conversation-surface__log",
    );
    const toolbar = element.querySelector<HTMLElement>(
      ".conversation-surface__toolbar",
    );
    const footer = element.querySelector<HTMLElement>(
      ".conversation-surface__footer",
    );
    return {
      logHeight: log?.getBoundingClientRect().height ?? 0,
      toolbarHeight: toolbar?.getBoundingClientRect().height ?? 0,
      footerHeight: footer?.getBoundingClientRect().height ?? 0,
      surfaceHeight: element.getBoundingClientRect().height,
      scrollWidth: element.scrollWidth,
      clientWidth: element.clientWidth,
    };
  });
  expect(shortDesktopGeometry.logHeight).toBeGreaterThanOrEqual(160);
  expect(shortDesktopGeometry.toolbarHeight).toBeLessThanOrEqual(72);
  expect(shortDesktopGeometry.footerHeight).toBeLessThanOrEqual(290);
  expect(shortDesktopGeometry.logHeight).toBeGreaterThanOrEqual(
    shortDesktopGeometry.surfaceHeight * 0.3,
  );
  expect(shortDesktopGeometry.scrollWidth).toBeLessThanOrEqual(
    shortDesktopGeometry.clientWidth + 1,
  );

  await page.setViewportSize({ width: 390, height: 844 });
  await page.reload();
  await conversation
    .getByRole("button", { name: "Внутренняя заметка" })
    .click();
  const mobileGeometry = await conversation.evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    viewportWidth: window.innerWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(mobileGeometry.left).toBeGreaterThanOrEqual(-0.5);
  expect(mobileGeometry.right).toBeLessThanOrEqual(
    mobileGeometry.viewportWidth + 0.5,
  );
  expect(mobileGeometry.scrollWidth).toBe(mobileGeometry.viewportWidth);

  const accessibility = await new AxeBuilder({ page })
    .include(".conversation-surface")
    .analyze();
  expect(accessibility.violations).toEqual([]);

  await page.goto("/users");
  await expectPath(page, "/users");
  await expect(page.getByText(privateNote)).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Внутренняя заметка" }),
  ).toHaveCount(0);
});

test("lets a lead assign a Case through the shared responsive assignment desk", async ({
  page,
}) => {
  await page.goto("/support/inbox/cases/case-demo-deposit");
  if ((page.viewportSize()?.width ?? 1_280) <= 760) {
    const context = page.getByRole("button", { name: "Контекст" });
    await expect(context).toBeVisible();
    await context.click();
  } else {
    await expect(
      page.getByRole("heading", { level: 2, name: "Не поступил депозит" }),
    ).toBeVisible();
  }
  await page.getByRole("tab", { name: "Обращение" }).click();
  await page
    .getByRole("button", { name: "Управлять назначением лида" })
    .click();

  const dialog = page.getByRole("dialog", { name: "Управление назначением" });
  await expect(dialog).toBeVisible();
  await dialog.getByRole("combobox", { name: "Оператор назначения" }).click();
  await page.getByRole("option", { name: /Максим Орлов/ }).click();
  await expect(
    dialog.getByText(/Назначение с исключением обойдёт/),
  ).toBeVisible();
  const submit = dialog.getByRole("button", {
    name: "Подтвердить назначение лидом",
  });
  await expect(submit).toBeDisabled();
  await dialog
    .getByRole("textbox", { name: "Обоснование исключения" })
    .fill("Экстренное покрытие критичного обращения");
  await submit.click();
  await expect(dialog).toBeHidden();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
});

test("sends a public reply only through the selected conversation", async ({
  page,
}) => {
  await showBaseInbox(page);
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

test("renders chat transport emoji shortcodes as native emoji", async ({
  page,
}) => {
  await showBaseInbox(page);
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  const composer = page.getByRole("textbox", { name: "Ответ пользователю" });
  await composer.fill(":+1::skin-tone-3:");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();

  await expect(page.getByText("👍🏼", { exact: true })).toBeVisible();
  await expect(
    page.getByText(":+1::skin-tone-3:", { exact: true }),
  ).toHaveCount(0);
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
  await showBaseInbox(page);
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();
  await expect(
    page.getByText("Пользователь офлайн", { exact: true }),
  ).toBeVisible();
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
  await expect(
    page.getByText("Пользователь офлайн", { exact: true }),
  ).toBeVisible();
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
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  if ((page.viewportSize()?.width ?? 1_280) > 760)
    await queue
      .locator(".search-result-row, .conversation-row")
      .first()
      .click();
  await queue.locator(".inbox-tools__trigger").click();
  await expect(queue.locator(".inbox-tools__panel")).toBeVisible();

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
  await showBaseInbox(page);
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

  await page.getByRole("heading", { name: "Входящие" }).click();
  await page.keyboard.press("ArrowDown");
  await expectPath(page, `/support/inbox/conversations/${firstId}`);
  await expect(page.locator(".conversation-row.selected")).toHaveCount(1);

  await page.keyboard.press("j");
  await expectPath(page, `/support/inbox/conversations/${secondId}`);
  await expect(page.locator(".conversation-row.selected")).toHaveCount(1);

  await page.getByRole("textbox", { name: "Ответ пользователю" }).focus();
  await page.keyboard.press("k");
  await expectPath(page, `/support/inbox/conversations/${secondId}`);
});

test("shows and changes only the operator's authoritative availability intent", async ({
  page,
}) => {
  await page.evaluate(() => {
    Object.assign(window, { __supportAvailabilityCommandCount: 0 });
    window.addEventListener("retenive:support-availability-command", () => {
      const state = window as typeof window & {
        __supportAvailabilityCommandCount?: number;
      };
      state.__supportAvailabilityCommandCount =
        (state.__supportAvailabilityCommandCount ?? 0) + 1;
    });
  });
  await page.getByRole("button", { name: "Моя доступность" }).click();
  const status = page.getByRole("region", {
    name: "Статус для новых обращений",
  });
  await expect(status).toBeVisible();
  await expect(
    status.getByText("Доступен", { exact: true }).first(),
  ).toBeVisible();
  await expect(status).toContainText("Получаете новые обращения");

  const commandCountBeforeReconnect = await page.evaluate(
    () =>
      (
        window as typeof window & {
          __supportAvailabilityCommandCount?: number;
        }
      ).__supportAvailabilityCommandCount ?? 0,
  );
  await page.context().setOffline(true);
  await expect(
    status.getByText("Доступен", { exact: true }).first(),
  ).toBeVisible();
  await page.context().setOffline(false);
  await status.getByRole("button", { name: "Обновить" }).click();
  await expect(
    status.getByText("Доступен", { exact: true }).first(),
  ).toBeVisible();
  expect(
    await page.evaluate(
      () =>
        (
          window as typeof window & {
            __supportAvailabilityCommandCount?: number;
          }
        ).__supportAvailabilityCommandCount ?? 0,
    ),
  ).toBe(commandCountBeforeReconnect);

  const selects = status.locator("select");
  await selects.nth(0).selectOption("AWAY");
  await expect(selects.nth(1)).toHaveValue("BREAK");
  await expect(status.locator('input[type="number"]')).toHaveValue("15");
  await status.getByRole("button", { name: "Сохранить статус" }).click();

  await expect(
    status.getByText("Отошёл", { exact: true }).first(),
  ).toBeVisible();
  await expect(status).toContainText("Новые обращения не назначаются");

  await selects.nth(0).selectOption("AVAILABLE");
  await status.getByRole("button", { name: "Сохранить статус" }).click();
  await expect(
    status.getByText("Доступен", { exact: true }).first(),
  ).toBeVisible();
  await page.keyboard.press("Escape");
  await page.goto("/overview");
  await page.goto("/support/inbox?view=system:ALL_CONVERSATIONS");
  await page.getByRole("button", { name: "Моя доступность" }).click();
  await expect(
    page
      .getByRole("region", { name: "Статус для новых обращений" })
      .getByText("Доступен", { exact: true })
      .first(),
  ).toBeVisible();
});

test("opens the Cases inbox and exposes exact context", async ({ page }) => {
  await showCasesInbox(page);
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  await expect(queue.getByRole("heading", { name: "Входящие" })).toBeVisible();
  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/support/inbox" &&
      url.searchParams.get("mode") === "cases"
    );
  });
  await expect(queue.locator(".case-row")).toHaveCount(3);

  await queue.getByRole("button", { name: /Не поступил депозит/ }).click();
  await expect(page).toHaveURL((url) => {
    return (
      url.pathname === "/support/inbox/cases/case-demo-deposit" &&
      url.searchParams.get("mode") === "cases"
    );
  });
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
  await expect(context.getByRole("tab")).toHaveCount(7);
  await expect(
    context.getByRole("tab", { name: "Пользователь" }),
  ).toBeVisible();
  await expect(context.getByRole("tab", { name: "Обращение" })).toBeVisible();
  await expect(context.getByRole("tab", { name: "Материалы" })).toBeVisible();
  await expect(context.getByRole("tab", { name: "Профиль" })).toBeVisible();
  await expect(context.getByRole("tab", { name: "События" })).toBeVisible();
  await expect(context.getByRole("tab", { name: "Активность" })).toBeVisible();
});

test("shows server-owned SLA and routing context on desktop and mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await showCasesInbox(page);
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  const searchToolsTrigger = queue.locator(".inbox-tools__trigger");
  await expect(searchToolsTrigger).toHaveAttribute("aria-expanded", "false");
  const slaSignal = queue.locator(
    '[data-selection-key="CASE:case-demo-game"] [data-sla-signal]',
  );
  await expect(slaSignal).toContainText("Риск первого ответа");
  await expect(slaSignal).toContainText("15 мин");
  await expect(slaSignal).toHaveAttribute(
    "title",
    /Прогноз не является договорным сроком/,
  );
  const slaSignalLayout = await slaSignal.evaluate((element) => {
    const copy = element.querySelector("span")!;
    return {
      horizontalOverflow: copy.scrollWidth - copy.clientWidth,
    };
  });
  expect(slaSignalLayout.horizontalOverflow).toBeLessThanOrEqual(1);

  for (const width of [285, 300, 320]) {
    await queue.evaluate((element, value) => {
      (element as HTMLElement).style.width = `${value}px`;
    }, width);
    const inboxRowsLayout = await queue
      .locator(".case-row")
      .evaluateAll((rows) =>
        rows.map((row, index) => {
          const rect = row.getBoundingClientRect();
          const nextRect = rows[index + 1]?.getBoundingClientRect();
          const hasSla = row.classList.contains("case-row--with-sla");
          return {
            width: Math.round(rect.width),
            height: Math.round(rect.height),
            hasSla,
            contentOverflow: row.scrollWidth - row.clientWidth,
            overlap: nextRect ? rect.bottom - nextRect.top : 0,
          };
        }),
      );
    for (const row of inboxRowsLayout) {
      expect(row.width).toBeGreaterThanOrEqual(width - 1);
      expect(row.width).toBeLessThanOrEqual(width);
      expect(row.height).toBe(row.hasSla ? 84 : 68);
      expect(row.contentOverflow).toBeLessThanOrEqual(1);
      expect(row.overlap).toBeLessThanOrEqual(1);
    }
  }
  await queue.evaluate((element) => {
    (element as HTMLElement).style.width = "";
  });

  await expect(searchToolsTrigger).toHaveAttribute("aria-expanded", "false");
  await searchToolsTrigger.click();
  const saveView = queue.getByRole("button", { name: "Сохранить поиск" });
  await expect(saveView).toBeVisible();
  const saveViewAlignment = await saveView.evaluate((button) => {
    const icon = button.querySelector("i")!.getBoundingClientRect();
    const label = button.querySelector("span")!.getBoundingClientRect();
    return {
      iconWidth: icon.width,
      iconHeight: icon.height,
      centerDelta: Math.abs(
        icon.top + icon.height / 2 - (label.top + label.height / 2),
      ),
    };
  });
  expect(saveViewAlignment.iconWidth).toBeLessThanOrEqual(16.5);
  expect(saveViewAlignment.iconHeight).toBeLessThanOrEqual(16.5);
  expect(saveViewAlignment.centerDelta).toBeLessThanOrEqual(1);

  await queue.getByRole("button", { name: /Не запускается игра/ }).click();
  const desktopContext = page.locator(".context-pane");
  await desktopContext.getByRole("tab", { name: "Обращение" }).click();
  const operations = desktopContext.getByRole("region", {
    name: "SLA и маршрутизация",
  });
  await expect(operations).toContainText("Снимок серверного рабочего времени");
  await expect(operations).toContainText("Игры");
  await expect(operations).toContainText("Не хватает свободной ёмкости");
  await expect(operations).toContainText("Не хватает навыка");

  const desktopGeometry = await operations.evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    viewport: document.documentElement.clientWidth,
    overflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  expect(desktopGeometry.left).toBeGreaterThanOrEqual(0);
  expect(desktopGeometry.right).toBeLessThanOrEqual(
    desktopGeometry.viewport + 0.5,
  );
  expect(desktopGeometry.overflow).toBe(0);

  await page.setViewportSize({ width: 390, height: 844 });
  await showCasesInbox(page);
  const mobileQueue = page.getByRole("complementary", {
    name: "Диалоги проекта",
  });
  const mobileCaseRows = mobileQueue.locator(".case-row");
  await expect(mobileCaseRows).toHaveCount(3);
  const mobileRowLayout = await mobileCaseRows.evaluateAll((rows) =>
    rows.map((row) => {
      const title = row.querySelector<HTMLElement>(
        ".case-row__headline strong",
      );
      return {
        horizontalOverflow: row.scrollWidth - row.clientWidth,
        titleLineClamp: title ? getComputedStyle(title).webkitLineClamp : "",
      };
    }),
  );
  for (const row of mobileRowLayout) {
    expect(row.horizontalOverflow).toBeLessThanOrEqual(1);
    expect(row.titleLineClamp).toBe("2");
  }
  await expect(
    mobileQueue
      .getByRole("button", { name: /Не запускается игра/ })
      .locator(".case-row__attention-icon"),
  ).toBeVisible();

  await page.goto("/support/inbox/cases/case-demo-game?mode=cases");
  await page.getByRole("button", { name: "Контекст" }).click();
  const mobileContext = page.getByRole("region", { name: "Контекст диалога" });
  await mobileContext.getByRole("tab", { name: "Обращение" }).click();
  const mobileOperations = mobileContext.getByRole("region", {
    name: "SLA и маршрутизация",
  });
  await expect(mobileOperations).toContainText("0 из 4 подходят");
  const mobileGeometry = await mobileOperations.evaluate((element) => ({
    left: element.getBoundingClientRect().left,
    right: element.getBoundingClientRect().right,
    viewport: document.documentElement.clientWidth,
    overflow:
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  }));
  expect(mobileGeometry.left).toBeGreaterThanOrEqual(0);
  expect(mobileGeometry.right).toBeLessThanOrEqual(
    mobileGeometry.viewport + 0.5,
  );
  expect(mobileGeometry.overflow).toBe(0);

  const accessibility = await new AxeBuilder({ page })
    .withTags(["wcag2a", "wcag2aa"])
    .disableRules(["color-contrast"])
    .include(".operations-context")
    .analyze();
  expect(
    accessibility.violations.filter(
      (violation) =>
        violation.impact === "critical" || violation.impact === "serious",
    ),
  ).toEqual([]);
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
  await context.getByRole("tab", { name: "Обращение" }).click();
  await expect(context).toContainText("Обращение #48");
  const brief = context.locator(".case-brief");
  await expect(brief).toContainText("Платёж найден");
  await expect(brief).toContainText("Понять статус депозита");
  await expect(brief).toContainText("Блокеры · 1");
  await brief
    .getByRole("button", { name: "Открыть полный контекст обращения" })
    .click();
  const briefDialog = page.getByRole("dialog", {
    name: "Контекст обращения #48",
  });
  await expect(briefDialog).toContainText(
    "Ожидается ответ платёжного провайдера",
  );
  await expect(briefDialog).toContainText(
    "Точный срок зачисления пока неизвестен",
  );
  await briefDialog
    .locator(".p-dialog-footer")
    .getByRole("button", { name: "Закрыть" })
    .click();
  await expect(context).toContainText("AI-классификация");
  await expect(context).toContainText("правила · версия 7");

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
  await showCasesInbox(page);
  const queue = page.getByRole("complementary", { name: "Диалоги проекта" });
  await expectPath(page, "/support/inbox");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("mode"))
    .toBe("cases");
  await queue.getByRole("button", { name: /Не поступил депозит/ }).click();
  await expectPath(page, "/support/inbox/cases/case-demo-deposit");

  await page.goBack();
  await expectPath(page, "/support/inbox");
  await expect(queue.locator(".case-row").first()).toBeVisible();

  await page.goForward();
  await expectPath(page, "/support/inbox/cases/case-demo-deposit");
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
  await page.goto("/support/inbox/cases/case-demo-deposit?mode=cases");

  const shell = page.getByTestId("workspace-presentation-shell");
  await expect(shell).toHaveAttribute("data-presentation-mode", "windowed");
  await expect(
    page.getByRole("complementary", { name: "Основная навигация CMS" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "На весь экран" }).click();
  await expect(shell).toHaveAttribute("data-presentation-mode", "full-tab");
  const draft = page.getByRole("textbox", { name: "Ответ пользователю" });
  await draft.fill("Черновик переживает смену режима");
  const translatedMode = page.getByRole("button", { name: "Перевод · RU" });
  await translatedMode.click();
  const caseTab = page.getByRole("tab", { name: "Обращение" });
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
    .getByRole("button", { name: "Свернуть", exact: true })
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
  await expect(
    page.getByRole("button", { name: "Свернуть", exact: true }),
  ).toBeEnabled();
  await expect(
    page.getByRole("button", { name: "Свернуть", exact: true }),
  ).toBeFocused();
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
  await page.getByRole("button", { name: "На весь экран" }).click();
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
  await page.getByRole("button", { name: "На весь экран" }).click();
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
  if ((page.viewportSize()?.width ?? 1_280) <= 767)
    await page.getByRole("button", { name: "Контекст" }).click();
  await page.getByRole("tab", { name: "Обращение" }).click();
  const desk = page.getByRole("region", { name: "Кто ведёт обращение" });

  await expect(desk).toBeVisible();
  const operationsContext = page.getByRole("region", {
    name: "SLA и маршрутизация",
  });
  await expect(operationsContext).toBeVisible();
  const [deskBox, operationsBox] = await Promise.all([
    desk.boundingBox(),
    operationsContext.boundingBox(),
  ]);
  expect(deskBox?.y).toBeLessThan(operationsBox?.y ?? 0);
  await expect(desk).toContainText("Назначение");
  await expect(desk).toContainText("Взял в работу");
  await expect(desk).toContainText("Наблюдатели");
  await expect(desk).toContainText("Доступность");
  await expect(
    desk.getByText(/assignmentId|offerToken|actionEtag/),
  ).toHaveCount(0);

  await page.getByRole("button", { name: "Взять в работу" }).click();
  await page.evaluate(() =>
    sessionStorage.setItem("retenive:e2e:assignment-conflict-once", "1"),
  );
  const confirmClaim = page.getByRole("button", {
    name: "Подтвердить назначение на себя",
  });
  await confirmClaim.click();
  const claimDialog = page.getByRole("dialog", {
    name: "Взять обращение в работу",
  });
  await expect(claimDialog).toBeVisible();
  await expect(
    claimDialog.getByText(/Назначение уже изменилось/),
  ).toBeVisible();
  await confirmClaim.click();
  await expect(
    page.getByRole("dialog", { name: "Взять обращение в работу" }),
  ).toBeHidden();
  await expect(desk).toContainText("Алексей · Игры");
  await expect(
    page.getByRole("button", { name: "Снять назначение" }),
  ).toBeVisible();

  for (const viewport of [
    { width: 1440, height: 900 },
    { width: 390, height: 844 },
  ]) {
    await page.setViewportSize(viewport);
    if (viewport.width < 600) {
      await page.getByRole("button", { name: "Контекст" }).click();
      await page.getByRole("tab", { name: "Обращение" }).click();
    }
    const geometry = await desk.evaluate((element) => ({
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      viewport: document.documentElement.clientWidth,
      overflow:
        document.documentElement.scrollWidth -
        document.documentElement.clientWidth,
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
  await page.goto("/support/inbox?view=system:ALL_CONVERSATIONS");
  await showBaseInbox(page);

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
  await expectPath(page, "/support/inbox/conversations/conv_3");
  await expect(
    page.getByRole("button", { name: "Назад к списку диалогов" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Назад к списку диалогов" }).click();
  await expectPath(page, "/support/inbox");
});

test("uses the real mobile history stack and preserves safe inbox query", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/control");
  await page.goto(
    "/support/inbox?view=system:ALL_CONVERSATIONS&return=control",
  );
  await showBaseInbox(page);

  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();
  await expectPath(page, "/support/inbox/conversations/conv_3");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("return"))
    .toBe("control");

  await page.getByRole("button", { name: "Назад к списку диалогов" }).click();
  await expectPath(page, "/support/inbox");
  await page.goBack();
  await expect(page).toHaveURL(/\/support\/control$/);
});

test("preserves mobile inbox position, selection, draft and message anchor across browser Back", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/inbox?view=system:ALL_CONVERSATIONS");
  await showBaseInbox(page);
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
  await expectPath(page, "/support/inbox");
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
  await expect(
    page.locator(`[data-message-id="${anchorId}"]`),
  ).toBeInViewport();
});

test("restores the authoritative unread position when route selection changes", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1440, height: 900 });
  await page.goto("/support/inbox/conversations/conv_3");
  await showBaseInbox(page);
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
  await expect
    .poll(() => new URL(page.url()).pathname)
    .not.toBe("/support/inbox/conversations/conv_3");
  await page.goBack();
  await expectPath(page, "/support/inbox/conversations/conv_3");
  await expect
    .poll(() =>
      messageLog.evaluate((element) => {
        const boundary = element.querySelector<HTMLElement>(
          ".conversation-surface__first-unread",
        );
        if (boundary) {
          const nextOrdinal = (
            boundary.nextElementSibling as HTMLElement | null
          )?.dataset.messageOrdinal;
          return `UNREAD:${boundary.dataset.firstUnreadOrdinal}:${nextOrdinal}`;
        }
        return `ACKED:${element.querySelector<HTMLElement>("[data-message-id]")?.dataset.messageOrdinal}`;
      }),
    )
    .toMatch(/^(?:UNREAD:2:2|ACKED:1)$/u);
});

test("uses a routed inspector on mobile and an accessible drawer on tablet", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/inbox/conversations/conv_3");
  const contextTrigger = page.getByRole("button", { name: "Контекст" });
  await contextTrigger.click();

  await expectPath(page, "/support/inbox/conversations/conv_3");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("panel"))
    .toBe("inspector");
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
  await expectPath(page, "/support/inbox/conversations/conv_3");
  await expect(contextTrigger).toBeFocused();

  await contextTrigger.click();
  await page.getByRole("button", { name: "Назад к диалогу" }).click();
  await expectPath(page, "/support/inbox/conversations/conv_3");
  await page.goBack();
  await expectPath(page, "/support/inbox");
  await showBaseInbox(page);
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  await page.setViewportSize({ width: 1024, height: 768 });
  await contextTrigger.click();
  await expectPath(page, "/support/inbox/conversations/conv_3");
  const drawer = page.getByRole("dialog", { name: "Контекст диалога" });
  await expect(drawer).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(drawer).toBeHidden();
  await expect(contextTrigger).toBeFocused();

  await contextTrigger.click();
  await page.setViewportSize({ width: 390, height: 844 });
  await expect
    .poll(() => new URL(page.url()).searchParams.get("panel"))
    .toBe("inspector");
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
    await page.goto("/support/inbox?view=system:ALL_CONVERSATIONS");
    await showBaseInbox(page);
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
      const log = document.querySelector<HTMLElement>(
        ".conversation-surface__log",
      );
      const toolbar = document.querySelector<HTMLElement>(
        ".conversation-surface__toolbar",
      );
      const messages = [
        ...document.querySelectorAll<HTMLElement>("[data-message-id]"),
      ];
      const surfaceRect = surface?.getBoundingClientRect();
      const overflowMessages = messages.flatMap((message) => {
        const rect = message.getBoundingClientRect();
        return rect.left < (surfaceRect?.left ?? 0) - 0.5 ||
          rect.right > (surfaceRect?.right ?? 0) + 0.5
          ? [
              {
                id: message.dataset.messageId,
                left: rect.left,
                right: rect.right,
              },
            ]
          : [];
      });
      return {
        viewport: { width: window.innerWidth, height: window.innerHeight },
        surface: surfaceRect
          ? {
              left: surfaceRect.left,
              right: surfaceRect.right,
              width: getComputedStyle(surface!).width,
              containsLog: Boolean(log && surface!.contains(log)),
              surfaceCount: document.querySelectorAll(".conversation-surface")
                .length,
              logCount: document.querySelectorAll(".conversation-surface__log")
                .length,
            }
          : null,
        log: log
          ? {
              clientWidth: log.clientWidth,
              scrollWidth: log.scrollWidth,
              left: log.getBoundingClientRect().left,
              right: log.getBoundingClientRect().right,
              width: getComputedStyle(log).width,
              minWidth: getComputedStyle(log).minWidth,
              boxSizing: getComputedStyle(log).boxSizing,
            }
          : null,
        toolbarOverflow:
          (toolbar?.scrollWidth ?? 0) - (toolbar?.clientWidth ?? 0),
        overflowMessages,
      };
    });
    expect(conversationGeometry.toolbarOverflow).toBeLessThanOrEqual(0);
    expect(
      conversationGeometry.overflowMessages,
      JSON.stringify(conversationGeometry),
    ).toEqual([]);
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
    await showBaseInbox(page);
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
    await composer.scrollIntoViewIfNeeded();
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
  await page.goto("/support/inbox?view=system:ALL_CONVERSATIONS");
  await showBaseInbox(page);
  await page
    .getByRole("button", { name: /Бонусы и программа лояльности/ })
    .click();

  const shell = page.getByTestId("workspace-presentation-shell");
  const draft = page.getByRole("textbox", { name: "Ответ пользователю" });
  await expect(draft).toBeVisible();
  await expect(shell).toHaveAttribute("data-presentation-mode", "windowed");
  await page
    .getByRole("button", { name: "На весь экран", exact: true })
    .click();
  await expect(shell).toHaveAttribute("data-presentation-mode", "full-tab");
  await expect(shell).toHaveCSS("animation-name", "none");
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
  await page.getByRole("button", { name: "Открыть меню", exact: true }).click();

  const navigation = page.getByRole("complementary", {
    name: "Основная навигация CMS",
  });
  await expect(
    navigation.getByRole("link", { name: "Рабочее место" }),
  ).toBeVisible();
  await expect(
    navigation.getByText("Пользователи", { exact: true }),
  ).toBeVisible();
});

test("opens the selected conversation context as a mobile route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/inbox/conversations/conv_3");

  await page.getByRole("button", { name: "Контекст" }).click();

  const inspector = page.getByRole("region", { name: "Контекст диалога" });
  await expect(inspector).toBeVisible();
  await expect(inspector.locator(".user-card h3")).toHaveText("Пользователь");
  await expect(inspector.getByRole("tab")).toHaveText([
    "Пользователь",
    "Профиль",
  ]);
  await expect(inspector.getByText("user_11603", { exact: true })).toHaveCount(
    0,
  );
});

test("loads the profile only from the permission-gated inspector", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/inbox/conversations/conv_3");
  await page.getByRole("button", { name: "Контекст" }).click();

  const inspector = page.getByRole("region", { name: "Контекст диалога" });
  await expect(inspector.getByText("Marco Silva", { exact: true })).toHaveCount(
    0,
  );
  await inspector.getByRole("tab", { name: "Профиль" }).click();
  await expect(
    inspector.getByText("Marco Silva", { exact: true }),
  ).toBeVisible();
  await expect(inspector.getByText("Скрыто", { exact: true })).toBeVisible();
  await expect(inspector.getByText("user_11603", { exact: true })).toHaveCount(
    0,
  );
});

test("keeps all Case Inspector tabs usable on the mobile route", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(
    "/support/inbox/cases/case-demo-game?mode=cases&panel=inspector",
  );

  const inspector = page.getByRole("region", { name: "Контекст диалога" });
  await expect(inspector.getByRole("tab")).toHaveText([
    "Обращение",
    "Пользователь",
    "Материалы",
    "Интеграции",
    "Профиль",
    "События",
    "Активность",
  ]);
  const tabListGeometry = await inspector
    .getByRole("tablist", { name: "Разделы контекста" })
    .evaluate((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    }));
  expect(tabListGeometry.scrollWidth).toBeLessThanOrEqual(
    tabListGeometry.clientWidth,
  );
  const tabs = inspector.getByRole("tab");
  const tabGeometry = await tabs.evaluateAll((elements) =>
    elements.map((element) => ({
      clientWidth: element.clientWidth,
      scrollWidth: element.scrollWidth,
    })),
  );
  for (const geometry of tabGeometry)
    expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.clientWidth);

  const eventsTab = inspector.getByRole("tab", { name: "События" });
  await eventsTab.click();
  await expect(
    inspector.getByText("Пользователь появился онлайн", { exact: true }),
  ).toBeVisible();
  await eventsTab.focus();
  await eventsTab.press("ArrowRight");
  const activityTab = inspector.getByRole("tab", { name: "Активность" });
  await expect(activityTab).toBeFocused();
  await expect(activityTab).toHaveAttribute("aria-selected", "true");
  await expect(
    inspector.getByText("Обращение принято оператором", { exact: true }),
  ).toBeVisible();
});
