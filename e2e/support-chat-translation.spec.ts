import { expect, test, type Page } from "@playwright/test";

async function openTranslationSettings(page: Page) {
  const banner = page.getByRole("region", { name: "Перевод диалога" });
  if (!(await banner.isVisible())) {
    await page
      .getByRole("button", { name: "Другие действия с диалогом" })
      .click();
  }
  await expect(banner).toBeVisible();
  await expect(banner).not.toContainText("Настройки ещё не загружены");
  return banner;
}

async function closeTranslationSettings(page: Page) {
  const menuButton = page.getByRole("button", {
    name: "Другие действия с диалогом",
  });
  if ((await menuButton.getAttribute("aria-expanded")) === "true") {
    await menuButton.click();
  }
}

test("operator previews a translated reply and can inspect its Russian source", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.goto("/users");
  await page
    .getByRole("button", { name: "Открыть профиль user_89421" })
    .click();
  await page.getByRole("button", { name: "Открыть чат" }).click();

  await openTranslationSettings(page);
  await page.getByRole("switch", { name: "Переводить этот диалог" }).click();
  await closeTranslationSettings(page);

  const composer = page.getByRole("textbox", { name: "Ответ пользователю" });
  await composer.fill("Проверил списание. Возвращаем вторую оплату.");
  await page
    .getByRole("button", { name: /Перевести на DE|Перевести ответ/ })
    .click();

  const preview = page.getByRole("region", {
    name: "Предпросмотр перевода ответа",
  });
  const translated = preview.getByRole("textbox", {
    name: "Переведённый текст для пользователя",
  });
  await expect(translated).toBeVisible();
  await translated.fill(
    "Ich habe die Abbuchung geprüft. Wir erstatten die zweite Zahlung.",
  );
  await preview.getByRole("button", { name: "Отправить перевод" }).click();

  await expect(composer).toHaveValue("");
  await expect(
    page.getByText(
      "Ich habe die Abbuchung geprüft. Wir erstatten die zweite Zahlung.",
    ),
  ).toBeVisible();
  await page.getByRole("button", { name: /Перевод · RU/ }).click();
  await expect(
    page.getByText("Проверил списание. Возвращаем вторую оплату."),
  ).toBeVisible();
});

test("translated message view does not reserve a side column in the bubble", async ({
  page,
}) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.goto("/users");
  await page
    .getByRole("button", { name: "Открыть профиль user_89421" })
    .click();
  await page.getByRole("button", { name: "Открыть чат" }).click();

  await page.getByRole("button", { name: /Перевод · RU/ }).click();
  const bubble = page.locator("article.conversation-surface__message").first();
  const body = bubble.locator(".translated-message > p");
  const [bubbleBox, bodyBox] = await Promise.all([
    bubble.boundingBox(),
    body.boundingBox(),
  ]);
  if (!bubbleBox || !bodyBox) {
    throw new Error("Translated message bubble must be visible");
  }

  expect(bodyBox.width / bubbleBox.width).toBeGreaterThan(0.9);
});

test("maximized user workspace fills the viewport", async ({ page }) => {
  await page.setViewportSize({ width: 1600, height: 1000 });
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.goto("/users");
  await page
    .getByRole("button", { name: "Открыть профиль user_89421" })
    .click();
  await page.getByRole("button", { name: "Открыть чат" }).click();
  await page
    .getByRole("button", {
      name: "Развернуть рабочее место на всю вкладку",
    })
    .click();

  const presentationShell = page.getByTestId("workspace-presentation-shell");
  await expect(presentationShell).toHaveAttribute(
    "data-presentation-mode",
    "full-tab",
  );
  await expect(presentationShell).toHaveAttribute(
    "data-transition-phase",
    "idle",
  );

  const dialog = page.getByRole("dialog", {
    name: /Рабочее пространство пользователя/,
  });
  const workspace = page.getByTestId("chat-workspace");
  const [dialogBox, workspaceBox] = await Promise.all([
    dialog.boundingBox(),
    workspace.boundingBox(),
  ]);
  if (!dialogBox || !workspaceBox) {
    throw new Error("Maximized dialog and chat workspace must be visible");
  }

  expect(dialogBox.width).toBeGreaterThanOrEqual(1590);
  expect(dialogBox.height).toBeGreaterThanOrEqual(990);
  expect(workspaceBox.height).toBeGreaterThan(880);
  await expect(
    page.getByRole("button", { name: "Вернуть рабочее место в окно" }),
  ).toBeEnabled();
  await expect(presentationShell).toHaveAttribute(
    "data-presentation-mode",
    "full-tab",
  );
});

test("translation settings stay usable across responsive layouts", async ({
  page,
}, testInfo) => {
  test.skip(!testInfo.project.name.includes("mobile"), "run once responsively");
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.goto("/project");

  await page.getByRole("button", { name: /Переводы/ }).click();
  await expect(page.getByText("Рабочий язык поддержки")).toBeVisible();
  await expect(
    page.getByText("Глоссарий проекта", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Русский · ru")).toBeVisible();
  await page.getByRole("button", { name: "Добавить термин" }).click();

  const source = page.getByRole("textbox", { name: "Исходный термин 1" });
  const behavior = page.getByRole("combobox", { name: "Правило термина 1" });
  const target = page.getByRole("textbox", { name: "Перевод термина 1" });
  const remove = page.getByRole("button", { name: "Удалить термин 1" });

  async function glossaryBoxes() {
    const [sourceBox, behaviorBox, targetBox, removeBox] = await Promise.all([
      source.boundingBox(),
      behavior.boundingBox(),
      target.boundingBox(),
      remove.boundingBox(),
    ]);
    if (!sourceBox || !behaviorBox || !targetBox || !removeBox) {
      throw new Error("Glossary controls must be visible");
    }
    return { sourceBox, behaviorBox, targetBox, removeBox };
  }

  const hasNoHorizontalOverflow = () =>
    page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    );

  const mobileBoxes = await glossaryBoxes();
  expect(mobileBoxes.sourceBox.width).toBeGreaterThan(200);
  expect(
    Math.abs(mobileBoxes.removeBox.y - mobileBoxes.sourceBox.y),
  ).toBeLessThan(4);
  expect(
    mobileBoxes.sourceBox.x + mobileBoxes.sourceBox.width,
  ).toBeLessThanOrEqual(mobileBoxes.removeBox.x);
  expect(mobileBoxes.behaviorBox.y).toBeGreaterThan(mobileBoxes.sourceBox.y);
  expect(mobileBoxes.targetBox.y).toBeGreaterThan(mobileBoxes.behaviorBox.y);
  expect(await hasNoHorizontalOverflow()).toBe(true);

  await page.setViewportSize({ width: 1024, height: 900 });
  const tabletBoxes = await glossaryBoxes();
  expect(
    Math.abs(tabletBoxes.sourceBox.y - tabletBoxes.behaviorBox.y),
  ).toBeLessThan(4);
  expect(tabletBoxes.targetBox.y).toBeGreaterThan(tabletBoxes.sourceBox.y);
  expect(tabletBoxes.targetBox.width).toBeGreaterThan(
    tabletBoxes.sourceBox.width,
  );
  expect(
    Math.abs(tabletBoxes.removeBox.y - tabletBoxes.targetBox.y),
  ).toBeLessThan(4);
  expect(
    tabletBoxes.targetBox.x + tabletBoxes.targetBox.width,
  ).toBeLessThanOrEqual(tabletBoxes.removeBox.x);
  expect(await hasNoHorizontalOverflow()).toBe(true);

  await page.setViewportSize({ width: 2048, height: 1000 });
  const desktopBoxes = await glossaryBoxes();
  expect(desktopBoxes.sourceBox.width).toBeGreaterThan(250);
  expect(desktopBoxes.targetBox.width).toBeGreaterThan(250);
  expect(
    Math.abs(desktopBoxes.behaviorBox.y - desktopBoxes.sourceBox.y),
  ).toBeLessThan(4);
  expect(
    Math.abs(desktopBoxes.targetBox.y - desktopBoxes.sourceBox.y),
  ).toBeLessThan(4);
  expect(
    Math.abs(desktopBoxes.removeBox.y - desktopBoxes.sourceBox.y),
  ).toBeLessThan(4);
  expect(
    desktopBoxes.targetBox.x + desktopBoxes.targetBox.width,
  ).toBeLessThanOrEqual(desktopBoxes.removeBox.x);
  expect(await hasNoHorizontalOverflow()).toBe(true);
});

test("stale preview recovers and same-language reply uses normal send", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.goto("/users");
  await page
    .getByRole("button", { name: "Открыть профиль user_89421" })
    .click();
  await page.getByRole("button", { name: "Открыть чат" }).click();

  await openTranslationSettings(page);
  const toggle = page.getByRole("switch", {
    name: "Переводить этот диалог",
  });
  if (!(await toggle.isChecked())) await toggle.click();
  await closeTranslationSettings(page);

  const composer = page.getByRole("textbox", { name: "Ответ пользователю" });
  await composer.fill("Первый вариант ответа");
  await page
    .getByRole("button", { name: /Перевести на DE|Перевести ответ/ })
    .click();
  const preview = page.getByRole("region", {
    name: "Предпросмотр перевода ответа",
  });
  await expect(
    preview.getByRole("textbox", {
      name: "Переведённый текст для пользователя",
    }),
  ).toBeVisible();
  await composer.fill("Исправленный вариант ответа");
  await expect(page.getByText(/текущий перевод устарел/)).toBeVisible();
  await page.getByRole("button", { name: "Обновить перевод" }).click();
  await expect(
    preview.getByRole("textbox", {
      name: "Переведённый текст для пользователя",
    }),
  ).toBeVisible();

  await openTranslationSettings(page);
  await page
    .getByRole("combobox", { name: "Мои ответы переводить на" })
    .click();
  await page.getByRole("option", { name: /русский · ru/i }).click();
  await closeTranslationSettings(page);
  await expect(
    page.getByRole("region", { name: "Предпросмотр перевода ответа" }),
  ).toBeHidden();
  await composer.fill("Ответ без перевода");
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(page.getByText("Ответ без перевода")).toBeVisible();
});

test("language source is explicit and conversation preference survives reload without leaking to another conversation", async ({
  page,
}, testInfo) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.goto("/users");
  await page
    .getByRole("button", { name: "Открыть профиль user_89421" })
    .click();
  await page.getByRole("button", { name: "Открыть чат" }).click();

  const banner = await openTranslationSettings(page);
  await expect(banner).toContainText(/Язык ответов: .*de.*из профиля/i);
  const toggle = page.getByRole("switch", {
    name: "Переводить этот диалог",
  });
  if (!(await toggle.isChecked())) await toggle.click();
  await expect(toggle).toBeChecked();
  await closeTranslationSettings(page);

  await page.reload();
  await openTranslationSettings(page);
  await expect(
    page.getByRole("switch", { name: "Переводить этот диалог" }),
  ).toBeChecked();
  await closeTranslationSettings(page);

  if (testInfo.project.name.includes("mobile")) {
    await page.getByRole("button", { name: "К списку диалогов" }).click();
  }
  await page.getByRole("button", { name: /Знакомство с Retenive/ }).click();
  await openTranslationSettings(page);
  await expect(
    page.getByRole("switch", { name: "Переводить этот диалог" }),
  ).not.toBeChecked();

  await page.keyboard.press("Escape");
  await page
    .getByRole("button", { name: "Открыть профиль user_11603" })
    .click();
  await page.getByRole("button", { name: "Открыть чат" }).click();
  await openTranslationSettings(page);
  await expect(
    page.getByRole("switch", { name: "Переводить этот диалог" }),
  ).not.toBeChecked();
});
