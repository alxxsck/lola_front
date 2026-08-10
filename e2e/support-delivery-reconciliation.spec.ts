import AxeBuilder from "@axe-core/playwright";
import { expect, test } from "@playwright/test";

test("retries one proven failed delivery and restores the authoritative receipt after reload", async ({
  page,
}) => {
  await page.goto("/login");
  await page.evaluate(() =>
    localStorage.removeItem("retenive-cms-demo-data-v2"),
  );
  await page.reload();
  await page.getByRole("button", { name: "Продолжить" }).click();
  await page.goto("/support/inbox/conversations/conv_3");

  const surface = page.getByRole("region", {
    name: "Диалог: Бонусы и программа лояльности",
  });
  const failedMessage = surface.locator('[data-message-id="msg_7"]');
  await expect(failedMessage.getByRole("status")).toHaveText(/Ошибка доставки/);
  await expect(
    failedMessage.getByText("Сообщение точно не доставлено."),
  ).toBeVisible();

  await failedMessage.getByRole("button", { name: "Повторить" }).click();

  await expect(failedMessage.getByRole("status")).toHaveText(/Принято/);
  await expect(
    failedMessage.getByRole("button", { name: "Повторить" }),
  ).toHaveCount(0);
  expect(
    await page.evaluate(() => {
      const raw = localStorage.getItem("retenive-cms-demo-data-v2");
      const data = raw
        ? (JSON.parse(raw) as {
            messages: Array<{
              id: string;
              delivery?: { generation: number; status: string };
            }>;
          })
        : null;
      return data?.messages.find((message) => message.id === "msg_7")?.delivery;
    }),
  ).toMatchObject({ generation: 2, status: "PENDING" });

  await page.reload();
  await expect(
    surface.locator('[data-message-id="msg_7"]').getByRole("status"),
  ).toHaveText(/Принято/);

  const geometry = await page.evaluate(() => ({
    clientWidth: document.documentElement.clientWidth,
    scrollWidth: document.documentElement.scrollWidth,
    bodyOverflow: getComputedStyle(document.body).overflow,
  }));
  expect(geometry.scrollWidth).toBe(geometry.clientWidth);
  expect(geometry.bodyOverflow).toBe("visible");

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
