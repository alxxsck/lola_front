import AxeBuilder from "@axe-core/playwright";
import { expect, test, type Page } from "@playwright/test";

const projectId = "prj_retenive_demo";
const secondProjectId = "prj_retenive_secondary";
const rolloutStorageKey = "support-workspace-shell-mock:v1";
const demoAuthStorageKey = "retenive-cms-demo-auth-v1";

async function login(page: Page): Promise<void> {
  await page.goto("/login");
  await page.getByRole("button", { name: "Продолжить" }).click();
  await expect(page).toHaveURL(/\/overview$/);
}

async function setLauncherRollout(page: Page): Promise<void> {
  await page.evaluate(
    ([key, root]) => sessionStorage.setItem(key, JSON.stringify(root)),
    [
      rolloutStorageKey,
      { enabled: true, shellEnabled: false, hardOff: false, version: 1 },
    ] as const,
  );
}

async function installSecondProject(page: Page): Promise<void> {
  await page.evaluate(
    ([authKey, secondaryProjectId]) => {
      const raw = sessionStorage.getItem(authKey);
      if (!raw) throw new Error("Demo auth context is missing");
      const context = JSON.parse(raw) as {
        projects: Array<Record<string, unknown>>;
        selectedProjectId?: string;
      };
      const current = context.projects[0];
      if (!current) throw new Error("Demo Project is missing");
      context.projects.push({
        ...current,
        id: secondaryProjectId,
        name: "Lucky Stars Secondary",
        slug: "lucky_stars_secondary",
      });
      context.selectedProjectId = String(current.id);
      sessionStorage.setItem(authKey, JSON.stringify(context));
    },
    [demoAuthStorageKey, secondProjectId] as const,
  );
  await page.reload();
}

async function runPreset(
  page: Page,
  label: string,
  reason: string,
): Promise<void> {
  await page.getByRole("textbox", { name: "Причина изменения" }).fill(reason);
  await page.getByRole("button", { name: label, exact: true }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", {
      name:
        label === "Аварийно выключить"
          ? "Подтвердить аварийное отключение"
          : "Подтвердить команду",
    })
    .click();
  await expect(
    page.getByText(/Изменение подтверждено и перечитано с сервера/i),
  ).toBeVisible();
}

test("runs one-Project enable and rollback through authoritative admission", async ({
  page,
}) => {
  await login(page);
  await setLauncherRollout(page);
  await page.goto(`/support/settings/audit-rollout?projectId=${projectId}`);

  await expect(
    page.getByRole("heading", { name: "Запуск и возврат" }),
  ).toBeVisible();
  await expect(
    page.getByText("Прежний интерфейс", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Прежний интерфейс · доступ закрыт"),
  ).toBeVisible();
  await expect(page.locator("body")).not.toContainText("swr1.");
  await expect(page.locator("body")).not.toContainText("Idempotency-Key");

  await runPreset(page, "Включить пробный запуск", "Окно запуска согласовано");
  await expect(
    page.getByText("Пробный запуск включён", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByText("Новое рабочее место · доступ разрешён"),
  ).toBeVisible();

  await page.goto(`/support/inbox?projectId=${projectId}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Поддержка" }),
  ).toBeVisible();

  await page.goto(`/support/settings/audit-rollout?projectId=${projectId}`);
  await runPreset(
    page,
    "Вернуть прежний интерфейс",
    "Проверка возврата завершена",
  );
  await expect(
    page.getByText("Прежний интерфейс", { exact: true }),
  ).toBeVisible();

  await page.goto(`/support/inbox?projectId=${projectId}`);
  await expect(page).toHaveURL(/\/users\?/);
  await expect(
    page.getByRole("heading", {
      name: "Рабочее место поддержки временно выключено",
    }),
  ).toBeVisible();
});

test("fences Project switch, browser Back and live permission revoke", async ({
  page,
}) => {
  await login(page);
  await installSecondProject(page);
  await setLauncherRollout(page);
  await page.goto(`/support/settings/audit-rollout?projectId=${projectId}`);
  await expect(
    page.getByText("Прежний интерфейс", { exact: true }),
  ).toBeVisible();

  await page.evaluate((nextProjectId) => {
    const url = new URL(location.href);
    url.searchParams.set("projectId", nextProjectId);
    history.pushState({}, "", url);
    window.dispatchEvent(new PopStateEvent("popstate"));
  }, secondProjectId);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("projectId"))
    .toBe(secondProjectId);
  await expect(
    page.getByText("Пробный запуск включён", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Версия 1", { exact: true })).toBeVisible();

  await page.goBack();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("projectId"))
    .toBe(projectId);
  await expect(
    page.getByText("Прежний интерфейс", { exact: true }),
  ).toBeVisible();

  await page.evaluate((authKey) => {
    const raw = sessionStorage.getItem(authKey);
    if (!raw) throw new Error("Demo auth context is missing");
    const context = JSON.parse(raw) as {
      projects: Array<{ id: string; effectivePermissionCodes?: string[] }>;
    };
    for (const project of context.projects)
      project.effectivePermissionCodes = (
        project.effectivePermissionCodes ?? []
      ).filter(
        (permission) =>
          permission !== "project.support.workspace.rollout.manage",
      );
    sessionStorage.setItem(authKey, JSON.stringify(context));
  }, demoAuthStorageKey);
  await page.reload();
  await expect(page).toHaveURL(/\/overview$/);
  await expect(
    page.getByRole("heading", { name: "Запуск и возврат" }),
  ).toHaveCount(0);
});

test("keeps the selected conversation and draft through an offline reconnect", async ({
  page,
  context,
}) => {
  await page.addInitScript(() => {
    const events: Array<{ name?: string; payload?: Record<string, unknown> }> =
      [];
    Object.assign(window, { __supportWorkspacePilotEvents: events });
    window.addEventListener("retenive:analytics", (event) => {
      const detail = (event as CustomEvent).detail as {
        name?: string;
        payload?: Record<string, unknown>;
      };
      events.push(detail);
    });
  });
  await login(page);
  await page.goto(`/support/inbox/conversations/conv_3?projectId=${projectId}`);
  const composer = page.getByRole("textbox", { name: "Ответ пользователю" });
  await composer.fill("Draft survives reconnect");

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event("offline")));
  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event("online")));

  await expect(page).toHaveURL(/\/support\/inbox\/conversations\/conv_3/);
  await expect(composer).toHaveValue("Draft survives reconnect");
  await expect(
    page
      .getByRole("heading", {
        level: 2,
        name: "Бонусы и программа лояльности",
      })
      .first(),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const events =
          (
            window as typeof window & {
              __supportWorkspacePilotEvents?: Array<{
                name?: string;
                payload?: Record<string, unknown>;
              }>;
            }
          ).__supportWorkspacePilotEvents ?? [];
        return events.some(
          (event) =>
            event.name === "support_workspace_core_feedback" &&
            event.payload?.operation === "draft_state" &&
            event.payload?.outcome === "active",
        );
      }),
    )
    .toBe(true);
});

test("has no critical or serious axe violations on rollout and core workspace", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/support/settings/audit-rollout?projectId=${projectId}`);
  const rolloutResults = await new AxeBuilder({ page }).analyze();
  expect(
    rolloutResults.violations.filter(
      (item) => item.impact === "critical" || item.impact === "serious",
    ),
  ).toEqual([]);

  await page.goto(`/support/inbox/conversations/conv_3?projectId=${projectId}`);
  const workspaceResults = await new AxeBuilder({ page }).analyze();
  expect(
    workspaceResults.violations.filter(
      (item) => item.impact === "critical" || item.impact === "serious",
    ),
  ).toEqual([]);
});

test("completes rollout confirmation with keyboard-only focus recovery", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/support/settings/audit-rollout?projectId=${projectId}`);
  const reason = page.getByRole("textbox", { name: "Причина изменения" });
  const rollback = page.getByRole("button", {
    name: "Вернуть прежний интерфейс",
    exact: true,
  });
  await reason.fill("Проверка возврата с клавиатуры");
  await reason.focus();
  await page.keyboard.press("Tab");
  await expect(rollback).toBeFocused();
  await page.keyboard.press("Enter");
  await expect(page.getByRole("dialog")).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toHaveCount(0);
  await expect(rollback).toBeFocused();
});

test("captures the rollout visual matrix and mobile keyboard composition", async ({
  page,
}, testInfo) => {
  test.skip(
    testInfo.project.name !== "chromium",
    "One canonical evidence set is captured from desktop Chromium",
  );
  await login(page);
  await setLauncherRollout(page);

  const viewports = [
    { width: 1440, height: 1000 },
    { width: 1280, height: 800 },
    { width: 1024, height: 768 },
    { width: 768, height: 1024 },
    { width: 390, height: 844 },
    { width: 320, height: 568 },
  ];
  for (const theme of ["light", "dark"] as const) {
    await page.evaluate(
      (value) => localStorage.setItem("retenive-theme", value),
      theme,
    );
    for (const viewport of viewports) {
      await page.setViewportSize(viewport);
      await page.goto(`/support/settings/audit-rollout?projectId=${projectId}`);
      await expect(
        page.getByRole("heading", { name: "Запуск и возврат" }),
      ).toBeVisible();
      const geometry = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        innerWidth: window.innerWidth,
      }));
      expect(geometry.scrollWidth).toBeLessThanOrEqual(geometry.innerWidth + 1);
      await page.screenshot({
        path: `docs/evidence/support-workspace/ticket-29-rollout-${viewport.width}x${viewport.height}-${theme}.png`,
        fullPage: true,
      });
    }
  }

  await page.setViewportSize({ width: 640, height: 900 });
  await page.goto(`/support/settings/audit-rollout?projectId=${projectId}`);
  await page.evaluate(() => {
    document.documentElement.style.zoom = "2";
  });
  await page.screenshot({
    path: "docs/evidence/support-workspace/ticket-29-rollout-200-percent.png",
    fullPage: true,
  });
  await page.evaluate(() => {
    document.documentElement.style.zoom = "";
  });

  await page.setViewportSize({ width: 390, height: 520 });
  await page
    .getByRole("textbox", { name: "Причина изменения" })
    .fill("Long_unbroken_RTL-ready_reason_1234567890_مرحبا");
  await page.getByRole("textbox", { name: "Причина изменения" }).focus();
  const focused = page.getByRole("textbox", { name: "Причина изменения" });
  await expect(focused).toBeInViewport();
  await page.screenshot({
    path: "docs/evidence/support-workspace/ticket-29-rollout-mobile-keyboard.png",
    fullPage: true,
  });
});
