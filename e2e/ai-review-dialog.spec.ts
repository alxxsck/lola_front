import { expect, test } from "@playwright/test";

test("AI Review keeps selected events and its dropdown inside the dialog", async ({
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
  const events = dialog.locator(".p-multiselect");
  await events.click();

  for (const option of [
    "Регистрация завершена · registration_completed",
    "Ошибка пополнения · deposit_failed",
    "Нужно подтвердить почту · email_confirmation_required",
  ]) {
    await page.getByRole("option", { name: option }).click({ force: true });
  }

  const dropdown = page.locator(".p-multiselect-overlay");
  await expect(dropdown).toBeVisible();

  const [dialogBox, eventsBox, dropdownBox] = await Promise.all([
    dialog.boundingBox(),
    events.boundingBox(),
    dropdown.boundingBox(),
  ]);
  expect(dialogBox).not.toBeNull();
  expect(eventsBox).not.toBeNull();
  expect(dropdownBox).not.toBeNull();

  expect(eventsBox!.width).toBeLessThanOrEqual(dialogBox!.width);
  expect(dropdownBox!.width).toBeLessThanOrEqual(dialogBox!.width);
  expect(dropdownBox!.x).toBeGreaterThanOrEqual(dialogBox!.x);
  expect(dropdownBox!.x + dropdownBox!.width).toBeLessThanOrEqual(
    dialogBox!.x + dialogBox!.width,
  );
  expect(
    await page.evaluate(
      () =>
        document.documentElement.scrollWidth <=
        document.documentElement.clientWidth,
    ),
  ).toBe(true);
});
