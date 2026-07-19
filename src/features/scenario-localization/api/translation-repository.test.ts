import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  translationCancel,
  translationCreate,
  translationGet,
  translationRetryTarget,
  translationUsageReport,
} from "@/shared/api/generated/lola-backend";
import { translationRepository } from "./translation-repository";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  translationCreate: vi.fn(),
  translationGet: vi.fn(),
  translationCancel: vi.fn(),
  translationRetryTarget: vi.fn(),
  translationUsageReport: vi.fn(),
}));

const request = {
  sourceLocale: "en",
  targetLocales: ["es"],
  units: [{ key: "graph.actions.welcome.config.text", text: "Hello" }],
};

describe("translationRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("creates a job with the caller idempotency key", async () => {
    vi.mocked(translationCreate).mockResolvedValue({
      jobId: "job-1",
      status: "PENDING",
      sourceHash: "hash",
      createdAt: "2026-07-19T00:00:00.000Z",
    });

    await translationRepository.create("project-1", request, {
      idempotencyKey: "request-1",
    });

    expect(translationCreate).toHaveBeenCalledWith("project-1", request, {
      headers: { "Idempotency-Key": "request-1" },
    });
  });

  it("routes get, cancel and target retry through typed endpoints", async () => {
    const job = {
      jobId: "job-1",
      status: "COMPLETED",
      sourceHash: "hash",
      createdAt: "2026-07-19T00:00:00.000Z",
      sourceLocale: "en",
      targets: [],
    };
    vi.mocked(translationGet).mockResolvedValue(job);
    vi.mocked(translationCancel).mockResolvedValue(job);
    vi.mocked(translationRetryTarget).mockResolvedValue(job);
    await translationRepository.get("project-1", "job-1");
    await translationRepository.cancel("project-1", "job-1");
    await translationRepository.retryTarget("project-1", "job-1", "es");
    expect(translationGet).toHaveBeenCalledWith("project-1", "job-1");
    expect(translationCancel).toHaveBeenCalledWith("project-1", "job-1");
    expect(translationRetryTarget).toHaveBeenCalledWith(
      "project-1",
      "job-1",
      "es",
    );
  });

  it("validates nested usage records instead of leaking unknown", async () => {
    vi.mocked(translationUsageReport).mockResolvedValue({
      totals: {
        requests: 2,
        successes: 1,
        errors: 1,
        inputCharacters: 10,
        outputCharacters: 8,
        billableCharacters: 18,
        cacheHits: 0,
        estimatedCostMicros: "120",
        estimatedSavingsMicros: "0",
        actualCostMicros: null,
        billingCurrency: "USD",
        latencyP50Ms: 100,
        latencyP95Ms: 150,
      },
      series: [],
      targetLocales: [],
      statuses: [],
      budget: {
        consumedMicros: "120",
        reservedMicros: "0",
        softLimitMicros: null,
        hardLimitMicros: "1000",
        softPercent: null,
        hardPercent: 12,
        hardExhausted: false,
      },
    });
    const result = await translationRepository.usage("project-1", {
      from: "2026-07-01T00:00:00.000Z",
      to: "2026-08-01T00:00:00.000Z",
      groupBy: "day",
    });
    expect(result.totals.billableCharacters).toBe(18);
    expect(result.budget?.hardExhausted).toBe(false);
  });
});
