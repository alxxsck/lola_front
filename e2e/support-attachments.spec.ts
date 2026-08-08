import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

const proof = {
  name: "payment-proof.txt",
  mimeType: "text/plain",
  buffer: Buffer.from("Ticket 23 safe attachment proof"),
};

test("keeps public and internal attachments compact, accessible and attachment-only", async ({
  page,
}) => {
  await login(page);
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.goto("/support/inbox/conversations/conv_1");
  const publicSurface = page.locator(".conversation-surface");
  await publicSurface.locator('input[type="file"]').setInputFiles(proof);
  await expect(publicSurface.getByText("payment-proof.txt", { exact: true })).toBeVisible();
  await expect(publicSurface.getByText(/Готово/)).toBeVisible();
  await expect(publicSurface.getByRole("button", { name: "Отправить" })).toBeEnabled();
  await expect(publicSurface.getByRole("button", { name: "Скачать payment-proof.txt" })).toBeVisible();
  expect(
    await publicSurface.evaluate((element) => ({
      overflow: element.scrollWidth > element.clientWidth + 1,
      logHeight:
        element.querySelector<HTMLElement>(".conversation-surface__log")
          ?.clientHeight ?? 0,
      fileInputVisible: Boolean(
        element.querySelector<HTMLInputElement>('input[type="file"]')
          ?.offsetParent,
      ),
    })),
  ).toMatchObject({ overflow: false, fileInputVisible: false });
  expect(
    await publicSurface
      .locator(".conversation-surface__log")
      .evaluate((element) => element.clientHeight),
  ).toBeGreaterThan(300);

  let violations = await new AxeBuilder({ page })
    .include(".conversation-surface")
    .analyze();
  expect(violations.violations).toEqual([]);
  await publicSurface.getByRole("button", { name: "Отправить" }).click();
  await expect(
    publicSurface.locator(".conversation-surface__message-attachments button").last(),
  ).toBeVisible();

  await page.goto("/support/inbox/cases/case-demo-deposit");
  const noteSurface = page.locator(".conversation-surface");
  await noteSurface.getByRole("button", { name: "Внутренняя заметка" }).click();
  await noteSurface.locator('input[type="file"]').setInputFiles(proof);
  await expect(noteSurface.getByText("payment-proof.txt", { exact: true })).toBeVisible();
  await expect(noteSurface.getByRole("button", { name: "Добавить заметку" })).toBeEnabled();
  await expect(noteSurface).toContainText("Видно только команде");

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/support/inbox/conversations/conv_3");
  const mobileSurface = page.locator(".conversation-surface");
  await mobileSurface.locator('input[type="file"]').setInputFiles(proof);
  await expect(mobileSurface.getByText("payment-proof.txt", { exact: true })).toBeVisible();
  const mobileGeometry = await mobileSurface.evaluate((element) => {
    const tray = element.querySelector<HTMLElement>(
      ".conversation-composer__attachments",
    );
    return {
      surfaceOverflow: element.scrollWidth > element.clientWidth + 1,
      trayOverflow: Boolean(tray && tray.scrollWidth > tray.clientWidth + 1),
    };
  });
  expect(mobileGeometry).toEqual({ surfaceOverflow: false, trayOverflow: false });
  violations = await new AxeBuilder({ page })
    .include(".conversation-surface")
    .analyze();
  expect(violations.violations).toEqual([]);
});
