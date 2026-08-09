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

async function expectPath(page: Page, pathname: string): Promise<void> {
  await expect.poll(() => new URL(page.url()).pathname).toBe(pathname);
}

async function setRollout(
  page: Page,
  root: {
    enabled: boolean;
    shellEnabled: boolean;
    hardOff: boolean;
    version: number;
  },
): Promise<void> {
  await page.evaluate(
    ([key, value]) => sessionStorage.setItem(key, JSON.stringify(value)),
    [rolloutStorageKey, root] as const,
  );
}

test("cuts legacy Cases, Users and Live links over to the canonical workspace", async ({
  page,
}) => {
  await login(page);
  await page.evaluate(
    ([authKey, secondaryProjectId]) => {
      const raw = sessionStorage.getItem(authKey);
      if (!raw) throw new Error("Demo auth context is missing");
      const context = JSON.parse(raw) as {
        projects: Array<Record<string, unknown>>;
        selectedProjectId?: string;
      };
      const currentProject = context.projects[0];
      if (!currentProject) throw new Error("Demo Project is missing");
      context.projects.push({
        ...currentProject,
        id: secondaryProjectId,
        name: "Lucky Stars Secondary",
        slug: "lucky_stars_secondary",
      });
      context.selectedProjectId = String(currentProject.id);
      sessionStorage.setItem(authKey, JSON.stringify(context));
    },
    [demoAuthStorageKey, secondProjectId] as const,
  );
  await page.reload();

  await page.goto(`/cases/case-demo-deposit?projectId=${projectId}`);
  await expectPath(page, "/support/inbox/cases/case-demo-deposit");
  await expect(
    page.getByRole("heading", { level: 1, name: "Поддержка" }),
  ).toBeVisible();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("projectId"))
    .toBe(projectId);

  await page.goto(`/users/usr_1?projectId=${projectId}&conversationId=conv_3`);
  await expectPath(page, "/support/inbox/conversations/conv_3");

  await page.goto(`/live?projectId=${projectId}&endUserId=usr_1`);
  await expectPath(page, "/support/inbox");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("endUserId"))
    .toBe("usr_1");
  const inbox = page.getByRole("complementary", { name: "Диалоги проекта" });
  await expect(
    inbox.getByText("Первый депозит", { exact: true }),
  ).toBeVisible();
  await expect(
    inbox.getByText("Знакомство с Retenive", { exact: true }),
  ).toBeVisible();
  await expect(
    inbox.getByText("Бонусы и программа лояльности", { exact: true }),
  ).toHaveCount(0);

  await page.evaluate(() => {
    history.pushState(
      {},
      "",
      "/support/inbox?projectId=prj_retenive_demo&endUserId=usr_2&entry=live",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect
    .poll(() => new URL(page.url()).searchParams.get("endUserId"))
    .toBe("usr_2");
  await expect(
    inbox.getByText("Бонусы и программа лояльности", { exact: true }),
  ).toBeVisible();
  await expect(inbox.getByText("Первый депозит", { exact: true })).toHaveCount(
    0,
  );

  await page.goBack();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("endUserId"))
    .toBe("usr_1");
  await expect(
    inbox.getByText("Первый депозит", { exact: true }),
  ).toBeVisible();

  await page.evaluate(() => {
    history.pushState(
      {},
      "",
      "/support/inbox?projectId=prj_retenive_demo&endUserId=usr_1&entry=live&search=game&view=system:MY_CASES",
    );
    window.dispatchEvent(new PopStateEvent("popstate"));
  });
  await expect
    .poll(() => new URL(page.url()).searchParams.get("search"))
    .toBe("game");
  await expect(
    inbox.getByRole("searchbox", { name: "Поиск по поддержке" }),
  ).toHaveCount(0);
  await expect(inbox.getByText("Мои обращения", { exact: true })).toHaveCount(
    0,
  );
  await expect(
    inbox.getByText("Первый депозит", { exact: true }),
  ).toBeVisible();
  await expect(
    inbox.getByText("Бонусы и программа лояльности", { exact: true }),
  ).toHaveCount(0);

  await page.reload();
  await expect(
    inbox.getByText("Первый депозит", { exact: true }),
  ).toBeVisible();
  await expect(
    inbox.getByText("Бонусы и программа лояльности", { exact: true }),
  ).toHaveCount(0);

  await page.goBack();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("search"))
    .toBeNull();
  await expect(
    inbox.getByText("Первый депозит", { exact: true }),
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
  await expect
    .poll(() => new URL(page.url()).searchParams.get("entry"))
    .toBe("live");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("endUserId"))
    .toBe("usr_1");
  await expect(
    inbox.getByText("Первый депозит", { exact: true }),
  ).toBeVisible();
  await expect(
    inbox.getByText("Бонусы и программа лояльности", { exact: true }),
  ).toHaveCount(0);

  await page.goBack();
  await expect
    .poll(() => new URL(page.url()).searchParams.get("projectId"))
    .toBe(projectId);
  await expect
    .poll(() => new URL(page.url()).searchParams.get("entry"))
    .toBe("live");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("endUserId"))
    .toBe("usr_1");
  await expect(
    inbox.getByText("Первый депозит", { exact: true }),
  ).toBeVisible();

  await page.goBack();
  await expectPath(page, "/support/inbox/conversations/conv_3");
  await page.goForward();
  await expectPath(page, "/support/inbox");
});

test("restores a protected legacy deep link after login and cuts it over", async ({
  page,
}) => {
  await page.goto(`/cases/case-demo-deposit?projectId=${projectId}`);
  await expectPath(page, "/login");

  await page.getByRole("button", { name: "Продолжить" }).click();
  await expectPath(page, "/support/inbox/cases/case-demo-deposit");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("projectId"))
    .toBe(projectId);
});

test("returns canonical deep links to the legacy launchers after project rollback", async ({
  page,
}) => {
  await login(page);
  await page.goto(`/support/inbox?projectId=${projectId}`);
  await expect(
    page.getByRole("heading", { level: 1, name: "Поддержка" }),
  ).toBeVisible();

  await setRollout(page, {
    enabled: true,
    shellEnabled: false,
    hardOff: false,
    version: 2,
  });
  await page.goto("/overview");

  await page.goto(`/support/inbox/conversations/conv_3?projectId=${projectId}`);
  await expectPath(page, "/users");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("conversationId"))
    .toBe("conv_3");
  await expect(
    page.getByRole("heading", {
      level: 1,
      name: "Рабочее место поддержки временно выключено",
    }),
  ).toBeVisible();
  await expect(
    page.getByRole("textbox", { name: "Ответ пользователю" }),
  ).toHaveCount(0);
  await expect(page.getByRole("button", { name: /Назначить/ })).toHaveCount(0);

  await page.goto(`/users/usr_1?projectId=${projectId}`);
  await expectPath(page, "/users/usr_1");
  await expect(
    page.getByText("Пользователь · usr_1", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Проверить доступ снова" }).click();
  await expectPath(page, "/users/usr_1");

  await page.goto(
    `/support/inbox/cases/case-demo-deposit?projectId=${projectId}`,
  );
  await expectPath(page, "/cases/case-demo-deposit");
  await expect(
    page.getByText("Обращение · case-demo-deposit", { exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: /Изменить статус/ }),
  ).toHaveCount(0);

  await setRollout(page, {
    enabled: true,
    shellEnabled: false,
    hardOff: true,
    version: 3,
  });
  await page.goto(`/support/inbox?projectId=${projectId}`);
  await expectPath(page, "/users");

  await page.goto(
    `/support/inbox?projectId=${projectId}&endUserId=usr_2&entry=live`,
  );
  await expectPath(page, "/live");
  await expect(
    page.getByText("Пользователь · usr_2", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Проверить доступ снова" }).click();
  await expectPath(page, "/live");
  await expect
    .poll(() => new URL(page.url()).searchParams.get("endUserId"))
    .toBe("usr_2");
});
