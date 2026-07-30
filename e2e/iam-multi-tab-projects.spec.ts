import {
  expect,
  test,
  type BrowserContext,
  type Route,
} from "@playwright/test";

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "IAM network fixtures require the API-mode frontend adapter",
);

const firstProjectId = "00000000-0000-4000-8000-000000000101";
const secondProjectId = "00000000-0000-4000-8000-000000000102";

function json(route: Route, body: unknown, status = 200) {
  return route.fulfill({
    status,
    contentType: "application/json",
    body: JSON.stringify(body),
  });
}

function project(id: string, name: string) {
  return {
    id,
    name,
    slug: name.toLowerCase().replaceAll(" ", "-"),
    status: "ACTIVE",
    supportedLocales: ["ru"],
    membershipId: `10000000-0000-4000-8000-${id.slice(-12)}`,
    membershipStatus: "ACTIVE",
    membershipVersion: 1,
    roleKeys: ["PROJECT_VIEWER"],
    effectivePermissionCodes: [],
  };
}

async function installStrictRotationFixtures(context: BrowserContext) {
  let refreshCount = 0;
  let refreshInFlight = false;
  let familyActive = true;
  let currentAccessToken = "";

  await context.route("**/api/v1/**", async (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && path === "/api/v1/auth/refresh") {
      if (!familyActive)
        return json(route, {
          error: {
            code: "AUTHENTICATION_FAILED",
            message: "Authentication failed",
          },
        }, 401);
      if (refreshInFlight) {
        familyActive = false;
        return json(route, {
          error: {
            code: "AUTHENTICATION_FAILED",
            message: "Refresh reuse detected",
          },
        }, 401);
      }
      refreshInFlight = true;
      await new Promise((resolve) => setTimeout(resolve, 50));
      refreshCount += 1;
      currentAccessToken = `cms_access_generation_${refreshCount}`;
      refreshInFlight = false;
      return json(route, {
        kind: "AUTHENTICATED",
        tokenType: "Bearer",
        accessToken: currentAccessToken,
        expiresIn: 1,
        refreshExpiresIn: 3600,
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "operator@example.com",
          displayName: "Оператор",
        },
      });
    }
    if (request.method() === "GET" && path === "/api/v1/auth/me") {
      if (
        !familyActive ||
        request.headers().authorization !== `Bearer ${currentAccessToken}`
      )
        return json(route, {
          error: {
            code: "AUTHENTICATION_FAILED",
            message: "Authentication failed",
          },
        }, 401);
      return json(route, {
        user: {
          id: "00000000-0000-4000-8000-000000000001",
          email: "operator@example.com",
          displayName: "Оператор",
        },
        platformPermissionCodes: [],
        projects: [
          project(firstProjectId, "Project One"),
          project(secondProjectId, "Project Two"),
        ],
      });
    }
    return json(route, {
      error: {
        code: "UNHANDLED_FIXTURE",
        message: `${request.method()} ${path}`,
      },
    }, 501);
  });

  return {
    refreshCount: () => refreshCount,
    familyActive: () => familyActive,
  };
}

test("tabs share auth generations while keeping independent Projects across reloads", async ({
  context,
}) => {
  const fixture = await installStrictRotationFixtures(context);
  const tabs = await Promise.all(
    [
      [firstProjectId, "Project One"],
      [firstProjectId, "Project One"],
      [secondProjectId, "Project Two"],
      [secondProjectId, "Project Two"],
    ].map(async ([projectId, projectName]) => {
      const page = await context.newPage();
      await page.addInitScript((selectedProjectId) => {
        sessionStorage.setItem(
          "lola-cms-selected-project-v1",
          selectedProjectId,
        );
      }, projectId);
      await page.goto("/overview");
      await expect(page.locator(".overview-header")).toContainText(projectName);
      return { page, projectId, projectName };
    }),
  );
  expect(fixture.refreshCount()).toBe(1);

  await tabs[0]!.page.waitForTimeout(1_100);
  await Promise.all(tabs.map(({ page }) => page.reload()));

  for (const { page, projectId, projectName } of tabs) {
    await expect(page.locator(".overview-header")).toContainText(projectName);
    await expect
      .poll(() =>
        page.evaluate(() =>
          sessionStorage.getItem("lola-cms-selected-project-v1"),
        ),
      )
      .toBe(projectId);
  }
  expect(fixture.refreshCount()).toBe(2);
  expect(fixture.familyActive()).toBe(true);
});
