import { beforeEach, describe, expect, it, vi } from "vitest";

const generated = vi.hoisted(() => ({
  estimate: vi.fn(),
  submit: vi.fn(),
  execute: vi.fn(),
}));

vi.mock("@/shared/api/generated/lola-backend", () => ({
  projectAIAnalysisEstimate: generated.estimate,
  cmsAgentRequestSubmit: generated.submit,
  cmsAgentRequestExecute: generated.execute,
}));

vi.mock("@/shared/config/data-mode", () => ({
  isMockMode: false,
}));

import { cmsAgentRepository } from "./cms-agent-repository";

describe("cmsAgentRepository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("submits and executes through the generated Project-scoped client", async () => {
    generated.estimate.mockResolvedValue({
      confirmationRequired: false,
      executionPath: "CMS_AGENT",
      reservedCostUsdTicks: "100",
    });
    generated.submit.mockResolvedValue({ requestId: "request-1" });
    generated.execute.mockResolvedValue({
      interpretation: { outcome: "PLANNED" },
      analysis: {
        analysisId: "analysis-1",
        runId: "run-1",
        status: "QUEUED",
      },
    });

    await expect(
      cmsAgentRepository.estimate("project-1", {
        executionPath: "CMS_AGENT",
        question: "Сколько депозитов было вчера?",
      }),
    ).resolves.toMatchObject({ executionPath: "CMS_AGENT" });
    await expect(
      cmsAgentRepository.submit("project-1", {
        idempotencyKey: "request-key",
        text: "Сколько депозитов было вчера?",
      }),
    ).resolves.toEqual({ requestId: "request-1" });
    await expect(
      cmsAgentRepository.execute("project-1", "request-1"),
    ).resolves.toMatchObject({
      interpretation: { outcome: "PLANNED" },
      analysis: { analysisId: "analysis-1" },
    });

    expect(generated.estimate).toHaveBeenCalledWith("project-1", {
      executionPath: "CMS_AGENT",
      question: "Сколько депозитов было вчера?",
    });
    expect(generated.submit).toHaveBeenCalledWith("project-1", {
      idempotencyKey: "request-key",
      text: "Сколько депозитов было вчера?",
    });
    expect(generated.execute).toHaveBeenCalledWith("project-1", "request-1");
  });
});
