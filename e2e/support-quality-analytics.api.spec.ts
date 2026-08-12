import {
  expect,
  test,
  type APIRequestContext,
  type APIResponse,
  type Page,
  type TestInfo,
} from '@playwright/test';

const apiOrigin = process.env.E2E_API_ORIGIN ?? 'http://127.0.0.1:3000';
const projectPublicKey = process.env.E2E_TICKET33_PROJECT_PUBLIC_KEY;
const mutationProofEnabled = process.env.E2E_TICKET33_MUTATION_PROOF === '1';
const operatorAccessToken = process.env.E2E_TICKET33_OPERATOR_TOKEN;

type Credentials = {
  accessToken?: string;
  cmsUserId?: string;
  email?: string;
  password?: string;
};

type ApiContext = {
  headers: { Authorization: string };
  project: { id: string; name: string; publicKey: string };
  user: { id: string; email: string };
};

type CatalogDataset = {
  datasetCode: string;
  datasetRevisionId: string;
  readiness: { status: string };
  metrics: Array<{ code: string; requiredPermissionCodes: string[] }>;
};

type QueryDefinition = {
  version: 1;
  datasetRevisionId: string;
  metrics: string[];
  groupBy: string[];
  filters: never[];
  range: {
    from: string;
    until: string;
    grain: 'DAY';
    timezone: 'UTC';
  };
  limit: number;
};

type QualityTask = {
  id: string;
  caseId: string;
  conversationId: string;
  operatorCmsUserId: string;
  scorecardId: string;
  scorecardRevisionNumber: number;
  defaultEvidenceMessageId: string;
  defaultScores: Array<{
    itemCode: string;
    applicable: boolean;
    rating?: string;
    score?: number;
    feedback?: string;
    rootCause?: string;
    coachingTheme?: string;
  }>;
  selectionReasonCode: string;
  state: string;
  version: number;
};

type QualityReview = {
  id: string;
  state: string;
  version: number;
  operatorCmsUserId: string;
  scores?: Array<{
    itemCode: string;
    applicable: boolean;
    rating: string | null;
    score: number | null;
    feedback: string | null;
    rootCause: string | null;
    coachingTheme: string | null;
  }>;
  evidence?: Array<{ messageId: string; rationale: string | null }>;
};

test.skip(
  process.env.VITE_DATA_MODE !== 'api' || !projectPublicKey,
  'Ticket 33 release proof requires the real backend and E2E_TICKET33_PROJECT_PUBLIC_KEY.',
);

test.describe.configure({ mode: 'serial' });

function credentials(testInfo: TestInfo): Credentials {
  const users = JSON.parse(process.env.E2E_USERS ?? '[]') as Credentials[];
  return (
    users[testInfo.project.name.includes('mobile') ? 3 : 0] ?? {
      email: process.env.E2E_LOGIN,
      password: process.env.E2E_PASSWORD,
    }
  );
}

async function body<T>(response: APIResponse, expectedStatus: number | number[] = 200): Promise<T> {
  const expected = Array.isArray(expectedStatus) ? expectedStatus : [expectedStatus];
  const payload = (await response.json().catch(() => null)) as T;
  expect(
    expected,
    `${response.request().method()} ${response.url()} returned ${response.status()}: ${JSON.stringify(payload)}`,
  ).toContain(response.status());
  return payload;
}

function utcDay(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function commandHeaders(context: ApiContext, version?: number): Record<string, string> {
  return {
    ...context.headers,
    'Idempotency-Key': crypto.randomUUID(),
    ...(version === undefined ? {} : { 'If-Match': `"${version}"` }),
  };
}

async function resolveContext(
  request: APIRequestContext,
  supplied: Credentials,
): Promise<ApiContext> {
  let accessToken = supplied.accessToken;
  if (!accessToken) {
    if (!supplied.email || !supplied.password) {
      throw new Error('Provide E2E_USERS or E2E_LOGIN/E2E_PASSWORD for the Ticket 33 API proof.');
    }
    const authenticated = await body<{
      accessToken: string;
      user: { id: string; email: string };
    }>(
      await request.post(`${apiOrigin}/api/v1/auth/login`, {
        data: { identifier: supplied.email, secret: supplied.password },
      }),
    );
    accessToken = authenticated.accessToken;
    supplied.cmsUserId ??= authenticated.user.id;
    supplied.email ??= authenticated.user.email;
  }

  const headers = { Authorization: `Bearer ${accessToken}` };
  const me = await body<{
    projects: Array<{ id: string; name: string; publicKey: string }>;
    user: { id: string; email: string };
  }>(await request.get(`${apiOrigin}/api/v1/auth/me`, { headers }));
  const project = me.projects.find((candidate) => candidate.publicKey === projectPublicKey);
  expect(
    project,
    `Ticket 33 project ${projectPublicKey} must be visible to the release-proof actor`,
  ).toBeTruthy();
  return { headers, project: project!, user: me.user };
}

async function restoreUiSession(
  page: Page,
  supplied: Credentials,
  context: ApiContext,
): Promise<void> {
  if (supplied.accessToken) {
    await page.route('**/api/v1/auth/refresh', async (route) => {
      await route.fulfill({
        contentType: 'application/json',
        status: 200,
        body: JSON.stringify({
          kind: 'AUTHENTICATED',
          accessToken: supplied.accessToken,
          expiresIn: 900,
          refreshExpiresIn: 900,
          tokenType: 'Bearer',
          user: {
            id: context.user.id,
            email: context.user.email,
            displayName: 'Проверка аналитики поддержки',
          },
        }),
      });
    });
    await page.goto('/overview');
  } else {
    await page.goto('/login');
    await page.getByLabel('Email', { exact: true }).fill(supplied.email!);
    await page.getByLabel('Пароль').fill(supplied.password!);
    await page.getByRole('button', { name: 'Продолжить' }).click();
  }

  const projectChoice = page
    .locator('button.project-option')
    .filter({ hasText: context.project.name });
  if (await projectChoice.isVisible().catch(() => false)) await projectChoice.click();
  await expect(page).toHaveURL(/\/overview$/);
}

test('real catalog, bounded Quality registries and Query receipt agree with the UI', async ({
  page,
  request,
}, testInfo) => {
  test.setTimeout(120_000);
  const supplied = credentials(testInfo);
  const context = await resolveContext(request, supplied);
  const root = `${apiOrigin}/api/v1/admin/projects/${context.project.id}`;

  const catalog = await body<{ datasets: CatalogDataset[] }>(
    await request.get(`${root}/reporting/catalog`, { headers: context.headers }),
  );
  expect(catalog.datasets).toHaveLength(10);
  expect(
    catalog.datasets.every((dataset) =>
      ['READY', 'PARTIAL', 'UNAVAILABLE', 'DEGRADED'].includes(dataset.readiness.status),
    ),
  ).toBe(true);

  for (const path of [
    'support/quality/tasks?limit=25',
    'support/quality/reviews?limit=25',
    'support/quality/disputes?limit=25&state=OPEN',
    'support/quality/calibrations?limit=25',
  ]) {
    const pageResult = await body<{ items: unknown[]; nextCursor?: string }>(
      await request.get(`${root}/${path}`, { headers: context.headers }),
    );
    expect(pageResult.items.length).toBeLessThanOrEqual(25);
    if (pageResult.nextCursor) expect(pageResult.nextCursor.length).toBeGreaterThan(20);
  }
  const scorecards = await body<unknown[]>(
    await request.get(`${root}/support/quality/scorecards`, {
      headers: context.headers,
    }),
  );
  expect(Array.isArray(scorecards)).toBe(true);

  const dataset = catalog.datasets.find(
    (candidate) => candidate.readiness.status === 'READY' && candidate.metrics.length > 0,
  );
  expect(
    dataset,
    'At least one support Dataset must be READY for the Query Run release proof',
  ).toBeTruthy();
  const until = new Date();
  const from = new Date(until.getTime() - 7 * 86_400_000);
  const query: QueryDefinition = {
    version: 1,
    datasetRevisionId: dataset!.datasetRevisionId,
    metrics: [dataset!.metrics[0]!.code],
    groupBy: [],
    filters: [],
    range: {
      from: utcDay(from),
      until: utcDay(until),
      grain: 'DAY',
      timezone: 'UTC',
    },
    limit: 100,
  };
  const estimate = await body<{
    canonicalQueryHash: string;
    highCostConfirmationRequired: boolean;
  }>(
    await request.post(`${root}/reporting/queries/validate`, {
      headers: context.headers,
      data: query,
    }),
  );
  const idempotencyKey = crypto.randomUUID();
  const createRun = () =>
    request.post(`${root}/reporting/query-runs`, {
      headers: {
        ...context.headers,
        'Idempotency-Key': idempotencyKey,
      },
      data: {
        query,
        expectedQueryHash: estimate.canonicalQueryHash,
        highCostConfirmed: estimate.highCostConfirmationRequired,
      },
    });
  const run = await body<{ runId: string; queryHash: string }>(await createRun(), [200, 201, 202]);
  const replay = await body<{ runId: string; queryHash: string }>(
    await createRun(),
    [200, 201, 202],
  );
  expect(replay).toMatchObject({
    runId: run.runId,
    queryHash: run.queryHash,
  });

  let result:
    | {
        runId: string;
        status: string;
        receipt?: {
          datasetRevisionId: string;
          requestHash: string;
          completeness: string;
        };
      }
    | undefined;
  await expect
    .poll(
      async () => {
        result = await body(
          await request.get(`${root}/reporting/query-runs/${run.runId}/result`, {
            headers: context.headers,
          }),
        );
        return result.status;
      },
      { timeout: 60_000 },
    )
    .not.toMatch(/QUEUED|RUNNING/);
  expect(result).toMatchObject({ runId: run.runId });
  if (!result) throw new Error('Query Run completed without a result payload');
  expect(result.receipt?.datasetRevisionId).toBe(dataset!.datasetRevisionId);
  expect(result.receipt?.requestHash).toMatch(/^[0-9a-f]{64}$/);
  expect(['COMPLETE', 'PARTIAL']).toContain(result.receipt?.completeness);

  await restoreUiSession(page, supplied, context);
  await page.goto('/support/analytics');
  await expect(page.getByRole('heading', { name: 'Аналитика поддержки', level: 1 })).toBeVisible();
  await expect(page.getByText('семейств данных', { exact: true })).toBeVisible();
  await page.goto('/support/quality/disputes');
  await expect(page.getByRole('heading', { name: 'Апелляции', level: 1 })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('disposable Quality task completes claim, pinned evidence, submit, acknowledgment and dispute', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'The mutable disposable proof runs once.');
  test.skip(
    !mutationProofEnabled || !operatorAccessToken,
    'Set E2E_TICKET33_MUTATION_PROOF=1 and a narrow E2E_TICKET33_OPERATOR_TOKEN for the destructive disposable-project proof.',
  );
  test.setTimeout(180_000);
  const supplied = credentials(testInfo);
  const reviewer = await resolveContext(request, supplied);
  const root = `${apiOrigin}/api/v1/admin/projects/${reviewer.project.id}/support/quality`;
  const taskPage = await body<{ items: QualityTask[] }>(
    await request.get(`${root}/tasks?limit=25`, { headers: reviewer.headers }),
  );
  const task = taskPage.items.find((item) => item.state === 'READY');
  expect(task, 'Disposable Ticket 33 Project must contain one READY sampling task').toBeTruthy();

  const claimed = await body<QualityTask>(
    await request.post(`${root}/tasks/${task!.id}/claim`, {
      headers: commandHeaders(reviewer, task!.version),
    }),
  );
  expect(claimed.state).toBe('CLAIMED');

  const createKey = crypto.randomUUID();
  const createData = {
    taskId: claimed.id,
    selectionReasonCode: claimed.selectionReasonCode,
    scorecardId: claimed.scorecardId,
    scorecardRevisionNumber: claimed.scorecardRevisionNumber,
    caseId: claimed.caseId,
    conversationId: claimed.conversationId,
    operatorCmsUserId: claimed.operatorCmsUserId,
    summary: 'Сквозная проверка Ticket 33',
    scores: claimed.defaultScores,
    evidence: [
      {
        messageId: claimed.defaultEvidenceMessageId,
        rationale: 'Закреплённое доказательство из задания',
      },
    ],
  };
  const create = () =>
    request.post(`${root}/reviews`, {
      headers: { ...reviewer.headers, 'Idempotency-Key': createKey },
      data: createData,
    });
  let review = await body<QualityReview>(await create(), [200, 201]);
  const replay = await body<QualityReview>(await create(), [200, 201]);
  expect(replay.id).toBe(review.id);

  const draft = await body<QualityReview>(
    await request.get(`${root}/reviews/${review.id}`, { headers: reviewer.headers }),
  );
  expect(draft).toMatchObject({ state: 'DRAFT', operatorCmsUserId: claimed.operatorCmsUserId });
  expect(draft.evidence?.[0]?.messageId).toBe(claimed.defaultEvidenceMessageId);

  review = await body<QualityReview>(
    await request.put(`${root}/reviews/${review.id}/draft`, {
      headers: commandHeaders(reviewer, review.version),
      data: {
        summary: 'Проверено по закреплённой версии критериев',
        scores: draft.scores?.map((score) => ({
          itemCode: score.itemCode,
          applicable: score.applicable,
          ...(score.rating === null ? {} : { rating: score.rating }),
          ...(score.score === null ? {} : { score: score.score }),
          ...(score.feedback === null ? {} : { feedback: score.feedback }),
          ...(score.rootCause === null ? {} : { rootCause: score.rootCause }),
          ...(score.coachingTheme === null ? {} : { coachingTheme: score.coachingTheme }),
        })),
        evidence: draft.evidence?.map((item) => ({
          messageId: item.messageId,
          ...(item.rationale === null ? {} : { rationale: item.rationale }),
        })),
      },
    }),
  );
  review = await body<QualityReview>(
    await request.post(`${root}/reviews/${review.id}/submit`, {
      headers: commandHeaders(reviewer, review.version),
    }),
  );
  expect(review.state).toBe('SUBMITTED');

  const staleSubmit = await request.post(`${root}/reviews/${review.id}/submit`, {
    headers: commandHeaders(reviewer, review.version - 1),
  });
  expect(staleSubmit.status()).toBe(409);

  const operator = await resolveContext(request, {
    accessToken: operatorAccessToken,
    cmsUserId: claimed.operatorCmsUserId,
  });
  expect(operator.user.id).toBe(claimed.operatorCmsUserId);
  let operatorReview = await body<QualityReview>(
    await request.get(`${root}/reviews/${review.id}`, { headers: operator.headers }),
  );
  operatorReview = await body<QualityReview>(
    await request.post(`${root}/reviews/${review.id}/acknowledge`, {
      headers: commandHeaders(operator, operatorReview.version),
    }),
  );
  const dispute = await body<{ reviewId: string; state: string }>(
    await request.post(`${root}/reviews/${review.id}/disputes`, {
      headers: commandHeaders(operator, operatorReview.version),
      data: { reason: 'Проверка безопасного жизненного цикла апелляции' },
    }),
    [200, 201],
  );
  expect(dispute).toMatchObject({ reviewId: review.id, state: 'OPEN' });

  await restoreUiSession(page, supplied, reviewer);
  await page.goto(`/support/quality/reviews/${review.id}`);
  await expect(page.getByRole('heading', { name: /Оценка качества/ })).toBeVisible();
  await expect(page.getByText('Проверка безопасного жизненного цикла апелляции')).toBeVisible();
});

test('disposable published report completes export and schedule lifecycle against the real API', async ({
  page,
  request,
}, testInfo) => {
  test.skip(testInfo.project.name.includes('mobile'), 'The mutable disposable proof runs once.');
  test.skip(
    !mutationProofEnabled,
    'Set E2E_TICKET33_MUTATION_PROOF=1 for the disposable-project artifact proof.',
  );
  test.setTimeout(180_000);
  const supplied = credentials(testInfo);
  const context = await resolveContext(request, supplied);
  await restoreUiSession(page, supplied, context);
  await page.goto('/support/analytics/quality');
  await expect(page.getByRole('heading', { name: 'Качество поддержки', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Сохранить отчёт' })).toBeEnabled({
    timeout: 60_000,
  });

  await page.getByRole('button', { name: 'Сохранить отчёт' }).click();
  const dialog = page.getByRole('dialog', { name: 'Сохранить Support-отчёт' });
  await dialog.getByLabel('Название').fill(`Ticket 33 · ${Date.now()}`);
  await dialog.getByRole('button', { name: 'Сохранить и опубликовать' }).click();
  await expect(page.getByText('Отчёт сохранён и опубликован.')).toBeVisible();

  await page.getByRole('button', { name: 'CSV' }).click();
  await expect(page.getByText(/CSV-экспорт поставлен в очередь/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Скачать' })).toBeVisible({ timeout: 70_000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Скачать' }).click();
  expect((await download).suggestedFilename()).toMatch(/\.csv$/);
  await page.getByRole('button', { name: 'Отозвать' }).click();
  await expect(page.getByText(/Доступ к экспорту отозван/)).toBeVisible();

  await page.getByRole('button', { name: 'Расписание' }).click();
  await page.getByLabel('Время').fill('08:30');
  await page.getByRole('button', { name: 'Создать расписание' }).click();
  await expect(page.getByText(/Расписание активно/)).toBeVisible();
  await page.getByRole('button', { name: 'Пауза' }).click();
  await expect(page.getByText(/Расписание приостановлено/)).toBeVisible();
  await page.getByRole('button', { name: 'Возобновить' }).click();
  await expect(page.getByText(/Расписание активно/)).toBeVisible();
  await page.getByRole('button', { name: 'Архивировать' }).click();
  await expect(page.getByText(/Расписание архивировано/)).toBeVisible();
});
