export type AIReviewCostLevel = "LOW" | "MEDIUM" | "HIGH";
export type AIReviewRunStatus =
  "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED" | "OUTCOME_UNKNOWN";

export interface AIReviewSettings {
  projectVersion: number;
  enabled: boolean;
  dailyRunLimit: number;
  limits: { dailyRunLimit: { min: number; max: number } };
}

export interface AIReviewScope {
  endUserId: string;
  localDate: string;
  eventCodes: string[];
  instruction?: string;
}

export interface AIReviewEstimate {
  eventCount: number;
  redactedBytes: number;
  estimatedInputTokens: number;
  costLevel: AIReviewCostLevel;
  requiresConfirmation: boolean;
  blocked: boolean;
  blockedReason?: string;
  timezone: string;
  range: { start: string; end: string };
}

export interface AIReviewRun {
  id: string;
  status: AIReviewRunStatus;
  costLevel: AIReviewCostLevel;
  eventCount: number;
  redactedBytes: number;
  estimatedInputTokens: number;
  proposalId?: string;
  errorCode?: string;
  createdAt: string;
  completedAt?: string;
}
