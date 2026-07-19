import { z } from "zod";
import {
  translationCancel,
  translationCreate,
  translationGet,
  translationRetryTarget,
  translationUsageReport,
} from "@/shared/api/generated/lola-backend";
import type {
  CreateTranslationJobDto,
  TranslationUsageReportParams,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";

const aggregateSchema = z.object({
  requests: z.number().int().nonnegative(),
  successes: z.number().int().nonnegative(),
  errors: z.number().int().nonnegative(),
  inputCharacters: z.number().int().nonnegative(),
  outputCharacters: z.number().int().nonnegative(),
  billableCharacters: z.number().int().nonnegative(),
  cacheHits: z.number().int().nonnegative(),
  estimatedCostMicros: z.string(),
  estimatedSavingsMicros: z.string(),
  actualCostMicros: z.string().nullable(),
  billingCurrency: z.string(),
  latencyP50Ms: z.number().nullable(),
  latencyP95Ms: z.number().nullable(),
});

const usageSchema = z.object({
  totals: aggregateSchema,
  series: z.array(aggregateSchema.extend({ day: z.string() })),
  targetLocales: z.array(
    aggregateSchema.extend({ targetLocale: z.string() }),
  ),
  statuses: z.array(aggregateSchema.extend({ status: z.string() })),
  budget: z
    .object({
      consumedMicros: z.string(),
      reservedMicros: z.string(),
      softLimitMicros: z.string().nullable(),
      hardLimitMicros: z.string().nullable(),
      softPercent: z.number().nullable(),
      hardPercent: z.number().nullable(),
      hardExhausted: z.boolean(),
    })
    .optional(),
});

async function apiCall<T>(request: () => Promise<T>): Promise<T> {
  try {
    return await request();
  } catch (cause) {
    throw normalizeApiError(cause);
  }
}

export type TranslationUsage = z.infer<typeof usageSchema>;

export const translationRepository = {
  create(
    projectId: string,
    request: CreateTranslationJobDto,
    options: { idempotencyKey: string },
  ) {
    return apiCall(() =>
      translationCreate(projectId, request, {
        headers: { "Idempotency-Key": options.idempotencyKey },
      }),
    );
  },

  get(projectId: string, jobId: string) {
    return apiCall(() => translationGet(projectId, jobId));
  },

  cancel(projectId: string, jobId: string) {
    return apiCall(() => translationCancel(projectId, jobId));
  },

  retryTarget(projectId: string, jobId: string, targetLocale: string) {
    return apiCall(() =>
      translationRetryTarget(projectId, jobId, targetLocale),
    );
  },

  async usage(projectId: string, params: TranslationUsageReportParams) {
    const response = await apiCall(() =>
      translationUsageReport(projectId, params),
    );
    return usageSchema.parse(response);
  },
};
