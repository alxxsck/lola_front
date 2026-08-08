import { expect, test } from "@playwright/test";

test("AI Review keeps selected events in a contained catalog dialog", async ({
  page,
}) => {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.goto("/users");
  await page
    .getByRole("button", { name: "Открыть профиль user_89421" })
    .click();
  const profileTab = page.getByRole("button", { name: /Профиль/ });
  if (await profileTab.isVisible()) {
    await profileTab.click();
  }
  await page.getByRole("button", { name: "Запросить анализ" }).click();

  const dialog = page.getByRole("dialog", { name: "AI Review событий" });
  await expect(dialog).toBeVisible();
  const events = dialog.getByTestId("event-picker-trigger");
  await events.click();

  const catalog = page.getByRole("listbox");
  await expect(catalog).toBeVisible();
  for (const eventName of [
    "Подтверждает завершение регистрации",
    "Показывает неуспешную попытку пополнения",
    "Показывает необходимость подтвердить почту",
  ]) {
    await catalog
      .getByRole("option", { name: eventName })
      .click();
  }
  await page.getByTestId("event-picker-apply").click();
  await expect(events).toContainText("3 выбрано");

  const [dialogBox, eventsBox] = await Promise.all([
    dialog.boundingBox(),
    events.boundingBox(),
  ]);
  expect(dialogBox).not.toBeNull();
  expect(eventsBox).not.toBeNull();

  expect(eventsBox!.width).toBeLessThanOrEqual(dialogBox!.width);
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
