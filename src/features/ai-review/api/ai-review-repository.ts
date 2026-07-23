import {
  aIReviewEstimate,
  aIReviewGet,
  aIReviewSettings,
  aIReviewStart,
  aIReviewUpdateSettings,
} from "@/shared/api/generated/lola-backend";
import { isMockMode } from "@/shared/config/data-mode";
import type {
  AIReviewEstimate,
  AIReviewRun,
  AIReviewScope,
  AIReviewSettings,
} from "../model/ai-review";

export interface AIReviewRepository {
  getSettings(projectId: string): Promise<AIReviewSettings>;
  updateSettings(
    projectId: string,
    input: { expectedVersion: number; enabled: boolean; dailyRunLimit: number },
  ): Promise<AIReviewSettings>;
  estimate(projectId: string, scope: AIReviewScope): Promise<AIReviewEstimate>;
  start(
    projectId: string,
    input: AIReviewScope & {
      idempotencyKey: string;
      confirmedExpensive: boolean;
    },
  ): Promise<AIReviewRun>;
  get(projectId: string, runId: string): Promise<AIReviewRun>;
}

const apiRepository: AIReviewRepository = {
  async getSettings(projectId) {
    return aIReviewSettings(projectId);
  },
  async updateSettings(projectId, input) {
    return aIReviewUpdateSettings(projectId, input);
  },
  async estimate(projectId, scope) {
    return aIReviewEstimate(projectId, scope);
  },
  async start(projectId, input) {
    return aIReviewStart(projectId, input);
  },
  async get(projectId, runId) {
    return aIReviewGet(projectId, runId);
  },
};

let mockSettings: AIReviewSettings = {
  projectVersion: 1,
  enabled: false,
  dailyRunLimit: 25,
  limits: { dailyRunLimit: { min: 1, max: 1000 } },
};
const mockRuns = new Map<string, AIReviewRun>();

const mockRepository: AIReviewRepository = {
  async getSettings() {
    return structuredClone(mockSettings);
  },
  async updateSettings(_projectId, input) {
    mockSettings = {
      ...mockSettings,
      enabled: input.enabled,
      dailyRunLimit: input.dailyRunLimit,
      projectVersion: mockSettings.projectVersion + 1,
    };
    return structuredClone(mockSettings);
  },
  async estimate(_projectId, scope) {
    const eventCount = scope.eventCodes.length * 3;
    const redactedBytes = eventCount * 900;
    return {
      eventCount,
      redactedBytes,
      estimatedInputTokens: Math.ceil(redactedBytes / 3),
      costLevel: redactedBytes <= 8000 ? "LOW" : "MEDIUM",
      requiresConfirmation: false,
      blocked: false,
      timezone: "UTC",
      range: {
        start: `${scope.localDate}T00:00:00.000Z`,
        end: `${scope.localDate}T23:59:59.999Z`,
      },
    };
  },
  async start(_projectId, input) {
    const run: AIReviewRun = {
      id: input.idempotencyKey,
      status: "SUCCEEDED",
      costLevel: "LOW",
      eventCount: input.eventCodes.length * 3,
      redactedBytes: input.eventCodes.length * 2700,
      estimatedInputTokens: input.eventCodes.length * 900,
      proposalId: "30000000-0000-4000-8000-000000000003",
      createdAt: new Date().toISOString(),
      completedAt: new Date().toISOString(),
    };
    mockRuns.set(run.id, run);
    return structuredClone(run);
  },
  async get(_projectId, runId) {
    const run = mockRuns.get(runId);
    if (!run) throw new Error("AI Review Run не найден");
    return structuredClone(run);
  },
};

export const aiReviewRepository = isMockMode ? mockRepository : apiRepository;
