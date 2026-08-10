import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function openConversation(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.goto("/support/inbox/conversations/conv_1");
  await expect(
    page.getByRole("region", { name: "Диалог: Первый депозит" }),
  ).toBeVisible();
}

test("anchors unread history and keeps the shared composer operational", async ({
  page,
}) => {
  await openConversation(page);

  const surface = page.getByRole("region", { name: "Диалог: Первый депозит" });
  const firstUnread = surface.locator(".conversation-surface__first-unread");
  await expect(firstUnread).toHaveText("Новые сообщения");

  const boundary = await surface.evaluate((element) => {
    const divider = element.querySelector<HTMLElement>(
      ".conversation-surface__first-unread",
    );
    const nextMessage = divider?.nextElementSibling as HTMLElement | null;
    return {
      dividerBottom: divider?.getBoundingClientRect().bottom ?? 0,
      nextMessageTop: nextMessage?.getBoundingClientRect().top ?? 0,
    };
  });
  expect(boundary.nextMessageTop).toBeGreaterThanOrEqual(
    boundary.dividerBottom - 0.5,
  );

  const composer = page.getByRole("textbox", { name: "Ответ пользователю" });
  const reply = "Проверка read-state: сообщение отправлено.";
  await composer.fill(reply);
  await page.getByRole("button", { name: "Отправить", exact: true }).click();
  await expect(composer).toHaveValue("");
  await expect(surface.getByText(reply, { exact: true })).toHaveCount(1);

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

test("keeps unread history and composer controls usable on mobile", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await openConversation(page);

  await expect(
    page.getByRole("button", { name: "Назад к списку диалогов" }),
  ).toBeVisible();
  await expect(
    page.locator(".conversation-surface__first-unread"),
  ).toBeVisible();

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyOverflow: getComputedStyle(document.body).overflow,
    controls: [...document.querySelectorAll<HTMLButtonElement>("button")]
      .filter((button) =>
        ["Действие", "Шаблоны", "Улучшить с AI", "Отправить"].includes(
          button.textContent?.trim() ?? "",
        ),
      )
      .map((button) => ({
        label: button.textContent?.trim(),
        height: button.getBoundingClientRect().height,
      })),
  }));

  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  expect(geometry.bodyOverflow).toBe("visible");
  expect(geometry.controls).toHaveLength(4);
  expect(geometry.controls.every((control) => control.height >= 44)).toBe(true);

  await page.getByRole("button", { name: "Назад к списку диалогов" }).click();
  await expect(page.getByRole("heading", { name: "Входящие" })).toBeVisible();
});
