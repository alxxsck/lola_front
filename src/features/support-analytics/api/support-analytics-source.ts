import {
  reportingCatalogRead,
  reportingQueryResultRead,
  reportingQueryRunCreate,
  reportingQueryValidate,
} from '@/shared/api/generated/retenive-backend';
import type {
  ReportingCatalogDatasetDto,
  ReportingCatalogResponseDto,
  ReportingMetricCellDto,
  ReportingQueryDefinitionDto,
  ReportingQueryEstimateResponseDto,
  ReportingQueryResultResponseDto,
  ReportingResultRowDto,
} from '@/shared/api/generated/models';
import { ApiError, normalizeApiError } from '@/shared/api/http/api-error';
import { noAuthRetryRequestOptions } from '@/shared/api/http/axios-instance';
import { isMockMode } from '@/shared/config/data-mode';

export interface SupportAnalyticsSource {
  catalog(projectId: string, signal?: AbortSignal): Promise<ReportingCatalogResponseDto>;
  validate(
    projectId: string,
    query: ReportingQueryDefinitionDto,
    signal?: AbortSignal,
  ): Promise<ReportingQueryEstimateResponseDto>;
  run(
    projectId: string,
    query: ReportingQueryDefinitionDto,
    signal?: AbortSignal,
    highCostConfirmed?: boolean,
  ): Promise<ReportingQueryResultResponseDto>;
}

export class HighCostConfirmationRequiredError extends Error {
  constructor() {
    super('Запрос требует явного подтверждения высокой стоимости');
    this.name = 'HighCostConfirmationRequiredError';
  }
}

interface QueryAttempt {
  key: string;
  runId?: string;
  expiresAt: number;
}

const queryAttempts = new Map<string, QueryAttempt>();

function queryAttemptSignature(
  projectId: string,
  canonicalQueryHash: string,
  highCostConfirmed: boolean,
): string {
  return `${projectId}:${canonicalQueryHash}:${highCostConfirmed ? 'confirmed' : 'standard'}`;
}

function queryAttempt(signature: string): QueryAttempt {
  const now = Date.now();
  const retained = queryAttempts.get(signature);
  if (retained && retained.expiresAt > now) return retained;
  const created = {
    key: crypto.randomUUID(),
    expiresAt: now + 15 * 60_000,
  };
  queryAttempts.set(signature, created);
  return created;
}

function isAmbiguousOutcome(error: ApiError): boolean {
  return error.status === 0 || error.status >= 500;
}

export const supportAnalyticsApiSource: SupportAnalyticsSource = {
  async catalog(projectId, signal) {
    try {
      return await reportingCatalogRead(projectId, signal ? { signal } : undefined);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async validate(projectId, query, signal) {
    try {
      return await reportingQueryValidate(projectId, query, signal ? { signal } : undefined);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async run(projectId, query, signal, highCostConfirmed = false) {
    try {
      const estimate = await reportingQueryValidate(
        projectId,
        query,
        signal ? { signal } : undefined,
      );
      if (estimate.highCostConfirmationRequired && !highCostConfirmed)
        throw new HighCostConfirmationRequiredError();
      const signature = queryAttemptSignature(
        projectId,
        estimate.canonicalQueryHash,
        highCostConfirmed,
      );
      const attempt = queryAttempt(signature);
      if (!attempt.runId) {
        try {
          const run = await reportingQueryRunCreate(
            projectId,
            {
              query,
              expectedQueryHash: estimate.canonicalQueryHash,
              highCostConfirmed,
            },
            {
              ...noAuthRetryRequestOptions(),
              ...(signal ? { signal } : {}),
              headers: { 'Idempotency-Key': attempt.key },
            },
          );
          attempt.runId = run.runId;
        } catch (cause) {
          const error = normalizeApiError(cause);
          if (!isAmbiguousOutcome(error)) queryAttempts.delete(signature);
          throw error;
        }
      }
      const deadline = Date.now() + 60_000;
      while (Date.now() < deadline) {
        const result = await reportingQueryResultRead(
          projectId,
          attempt.runId,
          signal ? { signal } : undefined,
        );
        if (!['QUEUED', 'RUNNING'].includes(result.status)) {
          queryAttempts.delete(signature);
          return result;
        }
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, result.retryAfterMs ?? 350);
          signal?.addEventListener(
            'abort',
            () => {
              window.clearTimeout(timer);
              reject(new DOMException('Aborted', 'AbortError'));
            },
            { once: true },
          );
        });
      }
      throw new Error('Расчёт продолжается дольше минуты. Повторите чтение результата позже.');
    } catch (cause) {
      if (cause instanceof HighCostConfirmationRequiredError) throw cause;
      throw normalizeApiError(cause);
    }
  },
};

const families = [
  'SUPPORT_CASE',
  'SUPPORT_CONVERSATION',
  'SUPPORT_QUEUE',
  'SUPPORT_ASSIGNMENT',
  'SUPPORT_SLA',
  'SUPPORT_QUALITY',
  'SUPPORT_DELIVERY',
  'SUPPORT_EXTERNAL_WORK',
  'SUPPORT_CONTENT_USAGE',
  'SUPPORT_AI_USAGE',
] as const;
const labels: Record<string, string> = {
  SUPPORT_CASE: 'Кейсы',
  SUPPORT_CONVERSATION: 'Диалоги',
  SUPPORT_QUEUE: 'Очереди',
  SUPPORT_ASSIGNMENT: 'Назначения',
  SUPPORT_SLA: 'SLA',
  SUPPORT_QUALITY: 'Качество',
  SUPPORT_DELIVERY: 'Доставка',
  SUPPORT_EXTERNAL_WORK: 'Внешние задачи',
  SUPPORT_CONTENT_USAGE: 'Контент',
  SUPPORT_AI_USAGE: 'AI',
};
const metrics: Record<string, Array<[string, string, string]>> = {
  SUPPORT_CASE: [
    ['case_event_count', 'Создано кейсов', 'COUNT'],
    ['case_distinct_count', 'Уникальные кейсы', 'COUNT'],
  ],
  SUPPORT_CONVERSATION: [
    ['first_response_ms_average', 'Среднее первое ответное время', 'DURATION_MS'],
    ['resolution_ms_p90', 'P90 времени решения', 'DURATION_MS'],
  ],
  SUPPORT_QUEUE: [
    ['queue_entry_count', 'Входы в очередь', 'COUNT'],
    ['queue_dwell_ms_p90', 'P90 ожидания', 'DURATION_MS'],
  ],
  SUPPORT_ASSIGNMENT: [['assignment_event_count', 'События назначения', 'COUNT']],
  SUPPORT_SLA: [
    ['sla_event_count', 'События SLA', 'COUNT'],
    ['sla_elapsed_ms_p90', 'P90 SLA времени', 'DURATION_MS'],
  ],
  SUPPORT_QUALITY: [
    ['quality_review_count', 'Проверенные диалоги', 'COUNT'],
    ['quality_score_average', 'Средняя оценка', 'PERCENTAGE'],
    ['quality_score_p50', 'Медиана оценки', 'PERCENTAGE'],
    ['quality_dispute_rate', 'Доля апелляций', 'PERCENTAGE'],
  ],
  SUPPORT_DELIVERY: [['delivery_event_count', 'События доставки', 'COUNT']],
  SUPPORT_EXTERNAL_WORK: [['external_work_event_count', 'Внешние задачи', 'COUNT']],
  SUPPORT_CONTENT_USAGE: [['content_usage_count', 'Использование контента', 'COUNT']],
  SUPPORT_AI_USAGE: [
    ['ai_operation_count', 'AI-операции', 'COUNT'],
    ['ai_cost_sum', 'Стоимость AI', 'MONEY'],
  ],
};
const dimensions: Record<string, string[]> = {
  SUPPORT_QUALITY: ['OCCURRED_DAY', 'TEAM', 'OPERATOR', 'QUALITY_ITEM', 'SCORECARD_REVISION'],
  SUPPORT_CASE: ['OCCURRED_DAY', 'QUEUE', 'TEAM', 'CHANNEL', 'CATEGORY', 'PRIORITY'],
  SUPPORT_CONVERSATION: ['OCCURRED_DAY', 'TEAM', 'CHANNEL'],
  SUPPORT_QUEUE: ['OCCURRED_DAY', 'QUEUE', 'TEAM'],
  SUPPORT_ASSIGNMENT: ['OCCURRED_DAY', 'QUEUE', 'TEAM'],
  SUPPORT_SLA: ['OCCURRED_DAY', 'QUEUE', 'TEAM', 'SLA_STATE'],
  SUPPORT_DELIVERY: ['OCCURRED_DAY', 'CHANNEL', 'DELIVERY_STATE'],
  SUPPORT_EXTERNAL_WORK: ['OCCURRED_DAY', 'TEAM', 'EXTERNAL_PROVIDER'],
  SUPPORT_CONTENT_USAGE: ['OCCURRED_DAY', 'TEAM', 'CATEGORY'],
  SUPPORT_AI_USAGE: ['OCCURRED_DAY', 'TEAM', 'AI_OPERATION', 'CURRENCY'],
};
const mockCatalog: ReportingCatalogResponseDto = {
  datasets: families.map((family, index): ReportingCatalogDatasetDto => ({
    datasetCode: family,
    datasetRevisionId: `00000000-0000-5000-8000-${String(index + 1).padStart(12, '0')}`,
    revision: 1,
    name: labels[family]!,
    semanticDigest: 'a'.repeat(64),
    readiness: {
      status: 'READY',
      coverageFrom: new Date(Date.now() - 90 * 86_400_000).toISOString(),
      coverageUntil: new Date().toISOString(),
      dataAsOf: new Date(Date.now() - 18_000).toISOString(),
      projectionLagMs: 18000,
      missingSourceFamilies: [],
    },
    dimensions: (dimensions[family] ?? ['OCCURRED_DAY']).map((code) => ({
      code,
      source: family,
    })),
    metrics: (metrics[family] ?? []).map(([code, label, valueKind]) => ({
      code,
      operation: code.split('_').at(-1)?.toUpperCase() ?? 'SUM',
      classification: family === 'SUPPORT_QUALITY' ? 'SENSITIVE' : 'AGGREGATE',
      exactness: 'EXACT',
      minimumSample: family === 'SUPPORT_QUALITY' ? 5 : 1,
      requiredPermissionCodes:
        family === 'SUPPORT_QUALITY' ? ['project.reporting.sensitive.read'] : [],
      compatibleDimensions: (dimensions[family] ?? ['OCCURRED_DAY']).filter(
        (dimension) => dimension !== 'QUALITY_ITEM' || code.includes('item'),
      ),
      valueKind: `${valueKind}|${label}`,
    })),
  })),
};

function metricCell(code: string, value: number): ReportingMetricCellDto {
  return { code, state: 'VALUE', value: String(value), sampleSize: 42 };
}
function resultRows(query: ReportingQueryDefinitionDto): ReportingResultRowDto[] {
  const metricCodes = query.metrics;
  const base = [82, 86, 79, 91, 88, 93, 90];
  return base.map((value, index) => ({
    day: new Date(Date.now() - (base.length - index) * 86_400_000).toISOString().slice(0, 10),
    dimensions: query.groupBy.length
      ? Object.fromEntries(
          query.groupBy.map((code) => [
            code,
            code === 'TEAM'
              ? ['Tier 1', 'Tier 2', 'Escalations'][index % 3]
              : `Группа ${index + 1}`,
          ]),
        )
      : undefined,
    metrics: metricCodes.map((code, metricIndex) =>
      metricCell(code, code.includes('count') ? 34 + index * 3 : value - metricIndex * 4),
    ),
  }));
}
const mockSource: SupportAnalyticsSource = {
  async catalog() {
    return structuredClone(mockCatalog);
  },
  async validate(_projectId, query) {
    const dataset = mockCatalog.datasets.find(
      (item) => item.datasetRevisionId === query.datasetRevisionId,
    );
    return {
      canonicalQueryHash: 'b'.repeat(64),
      requestHash: 'c'.repeat(64),
      route: 'SYNC',
      plan: 'BOUNDED_CURRENT_PROJECTION',
      workloadLane: 'INTERACTIVE',
      estimatedSourceRows: 714,
      estimatedResultRows: query.groupBy.length ? 21 : 7,
      estimatedResultBytes: 8400,
      highCostConfirmationRequired: false,
      incompatibleFields: [],
      freshness: dataset?.readiness.status ?? 'UNAVAILABLE',
    };
  },
  async run(_projectId, query) {
    const dataset = mockCatalog.datasets.find(
      (item) => item.datasetRevisionId === query.datasetRevisionId,
    );
    if (dataset?.readiness.status !== 'READY')
      return {
        runId: `run-${Date.now()}`,
        queryHash: 'b'.repeat(64),
        status: 'DATA_UNAVAILABLE',
      };
    const rows = resultRows(query);
    return {
      runId: `run-${Date.now()}`,
      resultId: `result-${Date.now()}`,
      queryHash: 'b'.repeat(64),
      status: 'READY',
      result: {
        version: 1,
        state: 'READY',
        rows,
        comparison: query.comparison
          ? {
              kind: query.comparison.kind,
              range: {
                ...query.range,
                from: new Date(new Date(query.range.from).getTime() - 7 * 86_400_000).toISOString(),
                until: query.range.from,
              },
              rows: rows.map((row) => ({
                ...row,
                metrics: row.metrics.map((cell) => ({
                  ...cell,
                  value: String(Number(cell.value ?? 0) - 4),
                })),
              })),
            }
          : undefined,
      },
      receipt: {
        version: 1,
        resultId: `result-${Date.now()}`,
        runId: `run-${Date.now()}`,
        datasetRevisionId: query.datasetRevisionId,
        generationId: 'generation-quality-42',
        semanticDigest: 'a'.repeat(64),
        authorityDigest: 'd'.repeat(64),
        privacyEpoch: 'privacy-7',
        suppressionPolicyRevision: 'small-group-v2',
        requestHash: 'c'.repeat(64),
        snapshotAt: new Date().toISOString(),
        dataAsOf: new Date(Date.now() - 18_000).toISOString(),
        expiresAt: new Date(Date.now() + 900_000).toISOString(),
        completeness: 'COMPLETE',
        rows: rows.length,
        bytes: 8400,
        suppressedCellCount: 0,
        excludedCellCount: 0,
      },
    };
  },
};

export const supportAnalyticsSource: SupportAnalyticsSource =
  isMockMode || import.meta.env.MODE === 'test' ? mockSource : supportAnalyticsApiSource;
export function metricLabel(metric: { code: string; valueKind?: string }): string {
  return metric.valueKind?.split('|')[1] ?? metric.code.replaceAll('_', ' ');
}
export function metricUnit(metric: { valueKind?: string }): string {
  return metric.valueKind?.split('|')[0] ?? 'DECIMAL';
}
