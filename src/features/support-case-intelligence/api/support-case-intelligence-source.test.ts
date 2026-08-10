import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  caseIntelligenceCurrent,
  caseIntelligenceDryRun,
  caseIntelligencePublishDetection,
  caseIntelligenceSaveBudgetDraft,
  caseIntelligenceSaveDetectionDraft,
} from "@/shared/api/generated/retenive-backend";
import {
  createDefaultBudgetPolicy,
  createDefaultDetectionPolicy,
} from "../model/support-case-intelligence-policy";
import { apiSupportCaseIntelligenceSource } from "./support-case-intelligence-source";

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  caseIntelligenceCompileDetection: vi.fn(),
  caseIntelligenceCurrent: vi.fn(),
  caseIntelligenceDiscardDetectionDraft: vi.fn(),
  caseIntelligenceDryRun: vi.fn(),
  caseIntelligenceLookupCommand: vi.fn(),
  caseIntelligencePublishBudget: vi.fn(),
  caseIntelligencePublishDetection: vi.fn(),
  caseIntelligenceSaveBudgetDraft: vi.fn(),
  caseIntelligenceSaveDetectionDraft: vi.fn(),
}));

describe("apiSupportCaseIntelligenceSource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("reads and previews through the generated client", async () => {
    vi.mocked(caseIntelligenceCurrent).mockResolvedValue({
      allowedActions: [],
    });
    vi.mocked(caseIntelligenceDryRun).mockResolvedValue({
      caseDecision: "DEFER",
      matchedRuleCodes: [],
      reasonCode: "NO_RULE_MATCH",
    });
    const definition = createDefaultDetectionPolicy();

    await apiSupportCaseIntelligenceSource.read("project-1");
    await apiSupportCaseIntelligenceSource.dryRun(
      "project-1",
      definition,
      "Нужна помощь",
      "ru-RU",
    );

    expect(caseIntelligenceCurrent).toHaveBeenCalledWith(
      "project-1",
      undefined,
    );
    expect(caseIntelligenceDryRun).toHaveBeenCalledWith(
      "project-1",
      { definition, input: "Нужна помощь", locale: "ru-RU" },
      undefined,
    );
  });

  it("sends exact version, body and key and disables automatic auth replay for commands", async () => {
    vi.mocked(caseIntelligenceSaveDetectionDraft).mockResolvedValue(
      {} as never,
    );
    vi.mocked(caseIntelligencePublishDetection).mockResolvedValue({} as never);
    vi.mocked(caseIntelligenceSaveBudgetDraft).mockResolvedValue({} as never);
    const definition = createDefaultDetectionPolicy();
    const budget = createDefaultBudgetPolicy();

    await apiSupportCaseIntelligenceSource.saveDetectionDraft(
      "project-1",
      definition,
      7,
      "detection-key",
    );
    await apiSupportCaseIntelligenceSource.publishDetection(
      "project-1",
      "revision-8",
      8,
      "Проверено лидом",
      "publish-key",
    );
    await apiSupportCaseIntelligenceSource.saveBudgetDraft(
      "project-1",
      budget,
      4,
      "budget-key",
    );

    expect(caseIntelligenceSaveDetectionDraft).toHaveBeenCalledWith(
      "project-1",
      { definition, expectedVersion: 7, idempotencyKey: "detection-key" },
      expect.objectContaining({ _noAuthRetry: true }),
    );
    expect(caseIntelligencePublishDetection).toHaveBeenCalledWith(
      "project-1",
      {
        revisionId: "revision-8",
        expectedVersion: 8,
        reason: "Проверено лидом",
        idempotencyKey: "publish-key",
      },
      expect.objectContaining({ _noAuthRetry: true }),
    );
    expect(caseIntelligenceSaveBudgetDraft).toHaveBeenCalledWith(
      "project-1",
      { definition: budget, expectedVersion: 4, idempotencyKey: "budget-key" },
      expect.objectContaining({ _noAuthRetry: true }),
    );
  });
});
