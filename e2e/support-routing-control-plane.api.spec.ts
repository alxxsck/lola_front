import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type TestInfo,
} from "@playwright/test";

const apiOrigin = process.env.E2E_API_ORIGIN ?? "http://127.0.0.1:3000";
const projectPublicKey = process.env.E2E_ROUTING_PROJECT_PUBLIC_KEY;
const caseId = process.env.E2E_ROUTING_CASE_ID;
const destructiveOptIn = process.env.E2E_ROUTING_DISPOSABLE === "1";
const archiveOptIn = process.env.E2E_ROUTING_ARCHIVE_PROJECT === "1";
const freshStrongSession = process.env.E2E_ROUTING_FRESH_STRONG_SESSION === "1";
const cleanupAccessToken = process.env.E2E_ROUTING_CLEANUP_ACCESS_TOKEN;

type Credentials = {
  accessToken?: string;
  cmsUserId?: string;
  email?: string;
  password?: string;
};

type ApiContext = {
  headers: { Authorization: string };
  cleanupHeaders: { Authorization: string };
  project: { id: string; name: string; publicKey: string };
  user: Required<Pick<Credentials, "cmsUserId" | "email">>;
};

type MutationReceipt = {
  actionEtag: string;
  team?: { id: string };
  skill?: { id: string };
};

type QueueReceipt = {
  actionEtag: string;
  queue: { id: string };
};

type PolicyReceipt = {
  actionEtag: string;
  policy: { id: string };
};

test.skip(
  process.env.VITE_DATA_MODE !== "api",
  "Routing release proof requires the real backend and a disposable staging project.",
);

test.describe.configure({ mode: "serial" });

function credentials(testInfo: TestInfo): Credentials {
  const users = JSON.parse(process.env.E2E_USERS ?? "[]") as Credentials[];
  return (
    users[testInfo.project.name.includes("mobile") ? 3 : 0] ?? {
      email: process.env.E2E_LOGIN,
      password: process.env.E2E_PASSWORD,
    }
  );
}

async function body<T>(
  response: APIResponse,
  expectedStatus: number | number[] = 200,
): Promise<T> {
  const expected = Array.isArray(expectedStatus)
    ? expectedStatus
    : [expectedStatus];
  const payload = (await response.json().catch(() => null)) as T;
  expect(
    expected,
    `${response.request().method()} ${response.url()} returned ${response.status()}: ${JSON.stringify(payload)}`,
  ).toContain(response.status());
  return payload;
}

function commandHeaders(
  context: ApiContext,
  key: string,
  actionEtag?: string,
): Record<string, string> {
  return {
    ...context.headers,
    "Idempotency-Key": key,
    ...(actionEtag ? { "If-Match": actionEtag } : {}),
  };
}

function key(prefix: string, suffix: string): string {
  return `routing-e2e-${prefix}-${suffix}`;
}

function tokenIssuedAt(token: string): number {
  const payload = token.split(".")[1];
  if (!payload) throw new Error("Cleanup access token is not a compact JWT");
  const claims = JSON.parse(
    Buffer.from(payload, "base64url").toString("utf8"),
  ) as { iat?: unknown };
  if (typeof claims.iat !== "number" || !Number.isInteger(claims.iat))
    throw new Error("Cleanup access token has no integer iat claim");
  return claims.iat * 1000;
}

async function resolveContext(
  request: APIRequestContext,
  supplied: Credentials,
): Promise<ApiContext> {
  if (
    !destructiveOptIn ||
    !archiveOptIn ||
    !freshStrongSession ||
    !cleanupAccessToken ||
    !projectPublicKey ||
    !caseId
  ) {
    throw new Error(
      "Set the three routing opt-ins, E2E_ROUTING_PROJECT_PUBLIC_KEY/E2E_ROUTING_CASE_ID, E2E_USERS, and E2E_ROUTING_CLEANUP_ACCESS_TOKEN freshly issued by passkey immediately before this command. The disposable project must contain one unassigned OPEN Case.",
    );
  }
  if (!supplied.accessToken || !supplied.cmsUserId || !supplied.email) {
    throw new Error(
      "Routing destructive E2E requires E2E_USERS with accessToken, cmsUserId and email from a fresh phishing-resistant session; password fallback is deliberately rejected.",
    );
  }
  if (Date.now() - tokenIssuedAt(cleanupAccessToken) > 45_000) {
    throw new Error(
      "E2E_ROUTING_CLEANUP_ACCESS_TOKEN must be issued by passkey less than 45 seconds before the routing test starts.",
    );
  }

  let accessToken = supplied.accessToken;
  if (!accessToken) {
    if (!supplied.email || !supplied.password) {
      throw new Error(
        "E2E_USERS or E2E_LOGIN/E2E_PASSWORD must provide routing-manager credentials.",
      );
    }
    const login = await request.post(`${apiOrigin}/api/v1/auth/login`, {
      data: { identifier: supplied.email, secret: supplied.password },
    });
    const authenticated = await body<{
      accessToken: string;
      user: { id: string; email: string };
    }>(login);
    accessToken = authenticated.accessToken;
    supplied.cmsUserId ??= authenticated.user.id;
    supplied.email ??= authenticated.user.email;
  }

  const headers = { Authorization: `Bearer ${accessToken}` };
  const cleanupHeaders = { Authorization: `Bearer ${cleanupAccessToken}` };
  const me = await body<{
    projects: Array<{ id: string; name: string; publicKey: string }>;
    user: { id: string; email: string };
  }>(await request.get(`${apiOrigin}/api/v1/auth/me`, { headers }));
  const project = me.projects.find(
    (candidate) => candidate.publicKey === projectPublicKey,
  );
  expect(
    project,
    `Disposable routing project ${projectPublicKey} must be visible to the test actor`,
  ).toBeTruthy();
  const cleanupSession = await body<{
    platformPermissionCodes: string[];
    projects: Array<{ id: string }>;
  }>(
    await request.get(`${apiOrigin}/api/v1/auth/me`, {
      headers: cleanupHeaders,
    }),
  );
  expect(cleanupSession.platformPermissionCodes).toContain(
    "platform.projects.archive",
  );
  expect(cleanupSession.platformPermissionCodes).toContain(
    "platform.projects.read",
  );
  expect(cleanupSession.projects.map((item) => item.id)).toContain(project!.id);

  return {
    headers,
    cleanupHeaders,
    project: project!,
    user: {
      cmsUserId: supplied.cmsUserId ?? me.user.id,
      email: supplied.email ?? me.user.email,
    },
  };
}

async function restoreUiSession(
  page: Page,
  supplied: Credentials,
  context: ApiContext,
): Promise<void> {
  if (!supplied.accessToken) {
    if (!supplied.email || !supplied.password)
      throw new Error("Routing UI login credentials are missing");
    await page.goto("/login");
    await page.getByLabel("Email", { exact: true }).fill(supplied.email);
    await page.getByLabel("Пароль").fill(supplied.password);
    await page.getByRole("button", { name: "Продолжить" }).click();
  } else {
    await page.route("**/api/v1/auth/refresh", async (route) => {
      await route.fulfill({
        contentType: "application/json",
        status: 200,
        body: JSON.stringify({
          kind: "AUTHENTICATED",
          accessToken: supplied.accessToken,
          expiresIn: 900,
          refreshExpiresIn: 900,
          tokenType: "Bearer",
          user: {
            id: context.user.cmsUserId,
            email: context.user.email,
            displayName: "Routing release proof",
          },
        }),
      });
    });
    await page.goto("/overview");
  }

  const projectChoice = page
    .locator("button.project-option")
    .filter({ hasText: context.project.name });
  if (await projectChoice.isVisible().catch(() => false))
    await projectChoice.click();
  await expect(page).toHaveURL(/\/overview$/);
}

test("fresh project reaches AUTO_ASSIGN and Decision explain matches Assignment", async ({
  page,
  request,
}, testInfo) => {
  test.skip(
    testInfo.project.name.includes("mobile"),
    "The mutable staging journey runs once; mobile layout is covered by the deterministic visual matrix.",
  );
  test.setTimeout(180_000);

  const supplied = credentials(testInfo);
  const context = await resolveContext(request, supplied);
  const support = `${apiOrigin}/api/v1/admin/projects/${context.project.id}/support`;
  const suffix = Date.now().toString(36);

  const initialQueues = await body<{ items: unknown[] }>(
    await request.get(`${support}/queues?limit=1`, {
      headers: context.headers,
    }),
  );
  const initialPolicies = await body<{ items: unknown[] }>(
    await request.get(`${support}/routing/policies?limit=1`, {
      headers: context.headers,
    }),
  );
  expect(initialQueues.items, "Project must start without Queue state").toEqual(
    [],
  );
  expect(
    initialPolicies.items,
    "Project must start without Routing Policy state",
  ).toEqual([]);
  const initialWorkforce = await body<{
    draft: unknown | null;
    publishedRevision: unknown | null;
    rootVersion: number;
  }>(await request.get(`${support}/workforce`, { headers: context.headers }));
  expect(
    {
      draft: initialWorkforce.draft ?? null,
      publishedRevision: initialWorkforce.publishedRevision ?? null,
      rootVersion: initialWorkforce.rootVersion,
    },
    "The destructive journey is allowed only in a pristine disposable project",
  ).toEqual({ draft: null, publishedRevision: null, rootVersion: 0 });

  let activated:
    | {
        activations: Array<{
          queueId: string;
          requestedMode: string;
          version: number;
        }>;
      }
    | undefined;
  let activatedQueueId: string | undefined;

  try {
    const team = await body<MutationReceipt>(
      await request.post(`${support}/workforce/teams`, {
        headers: commandHeaders(context, key("team", suffix)),
        data: { code: `e2e-team-${suffix}`, name: "Команда проверки" },
      }),
      201,
    );
    const skill = await body<MutationReceipt>(
      await request.post(`${support}/workforce/skills`, {
        headers: commandHeaders(context, key("skill", suffix)),
        data: {
          code: `e2e-skill-${suffix}`,
          name: "Навык проверки",
          kind: "GENERAL",
        },
      }),
      201,
    );
    expect(team.team?.id).toBeTruthy();
    expect(skill.skill?.id).toBeTruthy();

    const workforce = await body<{ actionEtag: string }>(
      await request.get(`${support}/workforce`, { headers: context.headers }),
    );
    const workforceDraft = await body<MutationReceipt>(
      await request.put(`${support}/workforce/draft`, {
        headers: commandHeaders(
          context,
          key("workforce-draft", suffix),
          workforce.actionEtag,
        ),
        data: {
          teams: [
            {
              teamId: team.team!.id,
              members: [context.user.cmsUserId],
              skills: [
                {
                  skillId: skill.skill!.id,
                  requirement: "REQUIRED",
                  minimumProficiency: 3,
                },
              ],
              languages: [
                {
                  languageTag: "ru",
                  requirement: "REQUIRED",
                  minimumProficiency: "WORKING",
                },
              ],
            },
          ],
          operators: [
            {
              cmsUserId: context.user.cmsUserId,
              maxCapacityUnits: 1000,
              skills: [
                {
                  skillId: skill.skill!.id,
                  proficiency: 5,
                  preferred: true,
                },
              ],
              languages: [
                {
                  languageTag: "ru",
                  proficiency: "NATIVE",
                  preferred: true,
                },
              ],
            },
          ],
        },
      }),
    );
    const publishedWorkforce = await body<MutationReceipt>(
      await request.post(`${support}/workforce/publish`, {
        headers: commandHeaders(
          context,
          key("workforce-publish", suffix),
          workforceDraft.actionEtag,
        ),
        data: {},
      }),
    );
    expect(publishedWorkforce.actionEtag).toBeTruthy();

    const availability = await body<{ version: number }>(
      await request.get(
        `${support}/operators/${context.user.cmsUserId}/availability`,
        { headers: context.headers },
      ),
    );
    await body(
      await request.put(`${support}/operators/me/availability`, {
        headers: commandHeaders(
          context,
          key("available", suffix),
          `"${availability.version}"`,
        ),
        data: { state: "AVAILABLE", reasonCode: "SHIFT_START" },
      }),
    );

    const queueDraft = {
      displayName: "Новые обращения",
      description: "Изолированная очередь приёмочного теста",
      visibility: { kind: "PROJECT", teamIds: [] },
      filter: {
        schemaVersion: 1,
        predicate: {
          kind: "ENUM_IN",
          field: "STATUS",
          values: ["OPEN", "IN_PROGRESS"],
        },
      },
      sort: [{ field: "EFFECTIVE_PRIORITY", direction: "DESC" }],
      routing: {
        mode: "AUTO_ASSIGN",
        primaryTeamIds: [team.team!.id],
        fallbackTeamIds: [],
      },
    };
    const queue = await body<QueueReceipt>(
      await request.post(`${support}/queues`, {
        headers: commandHeaders(context, key("queue", suffix)),
        data: { code: `e2e-queue-${suffix}`, draft: queueDraft },
      }),
      201,
    );
    activatedQueueId = queue.queue.id;
    const preview = await body<{ count?: number; countLowerBound?: number }>(
      await request.post(`${support}/queues/${queue.queue.id}/draft/preview`, {
        headers: context.headers,
        data: { sampleLimit: 10 },
      }),
    );
    expect((preview.count ?? preview.countLowerBound ?? 0) >= 1).toBe(true);
    const queuePublished = await body<QueueReceipt>(
      await request.post(`${support}/queues/${queue.queue.id}/publish`, {
        headers: commandHeaders(
          context,
          key("queue-publish", suffix),
          queue.actionEtag,
        ),
      }),
    );

    const missingPrerequisite = await request.post(
      `${support}/routing/activation/queues/${queue.queue.id}/transition`,
      {
        headers: commandHeaders(context, key("premature-activation", suffix)),
        data: {
          targetMode: "AUTO_ASSIGN",
          expectedActivationVersion: 0,
          reasonCode: "E2E_PRECONDITION_PROOF",
        },
      },
    );
    await body(missingPrerequisite, 409);

    const staleQueueWrite = await request.put(
      `${support}/queues/${queue.queue.id}/draft`,
      {
        headers: commandHeaders(
          context,
          key("stale-queue", suffix),
          queue.actionEtag,
        ),
        data: { draft: queueDraft },
      },
    );
    await body(staleQueueWrite, [409, 412, 428]);
    expect(queuePublished.actionEtag).not.toBe(queue.actionEtag);

    const policy = await body<PolicyReceipt>(
      await request.post(`${support}/routing/policies`, {
        headers: commandHeaders(context, key("policy", suffix)),
        data: {
          stableCode: `e2e-policy-${suffix}`,
          draft: {
            mandatorySkills: [skill.skill!.id],
            preferredSkills: [],
            mandatoryLanguages: ["ru"],
            preferredLanguages: [],
            capacityWeightUnits: 100,
            hardUtilizationPercent: 90,
            weights: {
              skill: 100,
              language: 100,
              load: 100,
              continuity: 50,
              idle: 50,
            },
            queueWeights: { sla: 100, priority: 50, escalation: 25, age: 10 },
            timeouts: { offerSeconds: 30, reservationSeconds: 30 },
            retry: {
              maxAttempts: 5,
              cooldownSeconds: 5,
              fallbackDelaySeconds: 5,
            },
          },
        },
      }),
      201,
    );
    const policyPublished = await body<PolicyReceipt>(
      await request.post(
        `${support}/routing/policies/${policy.policy.id}/publish`,
        {
          headers: commandHeaders(
            context,
            key("policy-publish", suffix),
            policy.actionEtag,
          ),
        },
      ),
    );

    const slots = await body<{ actionEtag: string }>(
      await request.get(`${support}/routing/queue-slots?limit=100`, {
        headers: context.headers,
      }),
    );
    await body(
      await request.put(`${support}/routing/queue-slots/${queue.queue.id}`, {
        headers: commandHeaders(context, key("slot", suffix), slots.actionEtag),
        data: { policyId: policy.policy.id, routePriority: 10 },
      }),
    );

    await expect
      .poll(
        async () => {
          const readiness = await body<{
            items: Array<{
              queueId: string;
              status: string;
              allowedTargetModes: string[];
            }>;
          }>(
            await request.get(
              `${support}/routing/readiness?queueId=${queue.queue.id}`,
              { headers: context.headers },
            ),
          );
          return readiness.items.find(
            (item) => item.queueId === queue.queue.id,
          );
        },
        { timeout: 30_000 },
      )
      .toEqual(
        expect.objectContaining({
          queueId: queue.queue.id,
          status: "READY",
          allowedTargetModes: expect.arrayContaining(["AUTO_ASSIGN"]),
        }),
      );

    const shadow = await body<{ id: string; state: string }>(
      await request.post(`${support}/routing/shadow-runs`, {
        headers: commandHeaders(context, key("shadow", suffix)),
        data: { limit: 50 },
      }),
      202,
    );
    await expect
      .poll(
        async () =>
          body<{ state: string }>(
            await request.get(`${support}/routing/shadow-runs/${shadow.id}`, {
              headers: context.headers,
            }),
          ).then((value) => value.state),
        { timeout: 45_000 },
      )
      .toBe("COMPLETED");
    const shadowDecisions = await body<{
      items: Array<{
        caseId: string;
        decisionId: string | null;
        state: string;
      }>;
    }>(
      await request.get(
        `${support}/routing/shadow-runs/${shadow.id}/decisions?limit=50`,
        { headers: context.headers },
      ),
    );
    expect(shadowDecisions.items).toContainEqual(
      expect.objectContaining({
        caseId,
        state: "COMPLETED",
        decisionId: expect.any(String),
      }),
    );

    const liveAvailability = await body<{ version: number }>(
      await request.get(
        `${support}/operators/${context.user.cmsUserId}/availability`,
        { headers: context.headers },
      ),
    );
    await body(
      await request.post(`${support}/operators/me/availability/heartbeat`, {
        headers: commandHeaders(
          context,
          key("availability-heartbeat", suffix),
          `"${liveAvailability.version}"`,
        ),
        data: {},
      }),
    );

    activated = await body<{
      activations: Array<{
        queueId: string;
        requestedMode: string;
        version: number;
      }>;
    }>(
      await request.post(
        `${support}/routing/activation/queues/${queue.queue.id}/transition`,
        {
          headers: commandHeaders(context, key("activate", suffix)),
          data: {
            targetMode: "AUTO_ASSIGN",
            expectedActivationVersion: 0,
            reasonCode: "E2E_RELEASE_PROOF",
          },
        },
      ),
    );
    expect(activated.activations).toContainEqual(
      expect.objectContaining({
        queueId: queue.queue.id,
        requestedMode: "AUTO_ASSIGN",
      }),
    );

    await expect
      .poll(
        async () => {
          const catalog = await body<{
            items: Array<{
              id: string;
              caseId: string;
              outcome: string;
              selectedOperatorId: string | null;
            }>;
          }>(
            await request.get(`${support}/routing/decisions?limit=100`, {
              headers: context.headers,
            }),
          );
          return catalog.items.find((item) => item.caseId === caseId) ?? null;
        },
        { timeout: 60_000 },
      )
      .toEqual(
        expect.objectContaining({
          caseId,
          outcome: "SELECTED",
          selectedOperatorId: context.user.cmsUserId,
        }),
      );

    const decisions = await body<{
      items: Array<{
        id: string;
        caseId: string;
        selectedOperatorId: string | null;
      }>;
    }>(
      await request.get(`${support}/routing/decisions?limit=100`, {
        headers: context.headers,
      }),
    );
    const selected = decisions.items.find((item) => item.caseId === caseId)!;
    const workspace = await body<{
      case: {
        assignment: { operator: { id: string } } | null;
      };
      routing: { decision: { id: string } | null } | null;
    }>(
      await request.get(
        `${support}/workspace?mode=SELECTION&caseId=${caseId}&messageLimit=10`,
        { headers: context.headers },
      ),
    );
    expect(workspace.case.assignment?.operator.id).toBe(
      selected.selectedOperatorId,
    );
    expect(workspace.routing?.decision?.id).toBe(selected.id);

    await restoreUiSession(page, supplied, context);
    await page.goto("/support/settings/routing/decisions");
    await expect(
      page.getByRole("heading", { level: 1, name: "Маршрутизация обращений" }),
    ).toBeVisible();
    await page.getByRole("button", { name: new RegExp(caseId!) }).click();
    await expect(
      page.getByRole("heading", { name: "Оператор выбран" }),
    ).toBeVisible();
    await expect(page.getByText("Недоступный оператор")).toHaveCount(0);
    await expect(page.getByText("Открыть обращение")).toBeVisible();

    const currentActivation = activated.activations.find(
      (item) => item.queueId === queue.queue.id,
    )!;
    const disabled = await body<{
      activations: Array<{ queueId: string; mode: string }>;
    }>(
      await request.post(
        `${support}/routing/activation/queues/${queue.queue.id}/transition`,
        {
          headers: commandHeaders(context, key("deactivate", suffix)),
          data: {
            targetMode: "DISABLED",
            expectedActivationVersion: currentActivation.version,
            reasonCode: "E2E_DRAIN_PROOF",
          },
        },
      ),
    );
    expect(disabled.activations).not.toContainEqual(
      expect.objectContaining({ queueId: queue.queue.id }),
    );
    activated = undefined;

    expect(policyPublished.actionEtag).not.toBe(policy.actionEtag);
  } finally {
    const currentActivation = activated?.activations.find(
      (item) => item.queueId === activatedQueueId,
    );
    try {
      if (currentActivation && activatedQueueId) {
        await body(
          await request.post(
            `${support}/routing/activation/queues/${activatedQueueId}/transition`,
            {
              headers: commandHeaders(context, key("cleanup-disable", suffix)),
              data: {
                targetMode: "DISABLED",
                expectedActivationVersion: currentActivation.version,
                reasonCode: "E2E_CLEANUP",
              },
            },
          ),
        );
      }
    } finally {
      const project = await body<{ version: number }>(
        await request.get(
          `${apiOrigin}/api/v1/admin/projects/${context.project.id}`,
          { headers: context.cleanupHeaders },
        ),
      );
      await body(
        await request.delete(
          `${apiOrigin}/api/v1/admin/projects/${context.project.id}`,
          {
            headers: context.cleanupHeaders,
            data: { expectedVersion: project.version },
          },
        ),
      );
    }
  }
});
