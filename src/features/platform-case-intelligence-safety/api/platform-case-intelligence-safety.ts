import { request } from "@/shared/api/http/orval-mutator";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { isMockMode } from "@/shared/config/data-mode";

export type PlatformSafetyReasoningEffort = "medium" | "high";
export type PlatformSafetyRuntimeReasoningEffort =
  | "none"
  | "low"
  | PlatformSafetyReasoningEffort;

export type PlatformSafetyRiskClass =
  | "SELF_HARM_OR_SUICIDE"
  | "CREDIBLE_THREAT_OR_VIOLENCE"
  | "HARM_INVOLVING_MINORS"
  | "RESPONSIBLE_GAMING_CRISIS";

export type PlatformSafetyState = {
  version: number;
  reconciliationState: "PENDING" | "RUNNING" | "IDLE";
  profile: {
    modelId: string;
    displayName: string;
    reasoningEffort: PlatformSafetyRuntimeReasoningEffort;
  };
  coverage: {
    projects: "ALL";
    locales: "ALL";
    channels: Array<"TEXT" | "VOICE" | "TELEGRAM">;
  };
  riskClasses: PlatformSafetyRiskClass[];
  publishedAt: string;
};

export type PlatformSafetyModelCatalogItem = {
  id: string;
  displayName: string;
  reasoningEfforts: PlatformSafetyReasoningEffort[];
  reteniveTested: boolean;
  selectable: boolean;
  providerAvailable: boolean | null;
  inputPricePerMillion: string;
  cachedInputPricePerMillion: string;
  outputPricePerMillion: string;
};

export type PlatformSafetyModelCatalog = {
  stale: boolean;
  fetchedAt: string;
  maxStaleAt: string;
  items: PlatformSafetyModelCatalogItem[];
};

export type PublishPlatformSafety = {
  expectedVersion: number;
  idempotencyKey: string;
  modelId: string;
  reasoningEffort: PlatformSafetyReasoningEffort;
  reason: string;
};

const path = "/api/v1/admin/platform/case-intelligence/safety";
const riskClasses: PlatformSafetyRiskClass[] = [
  "SELF_HARM_OR_SUICIDE",
  "CREDIBLE_THREAT_OR_VIOLENCE",
  "HARM_INVOLVING_MINORS",
  "RESPONSIBLE_GAMING_CRISIS",
];
const mockCatalog: PlatformSafetyModelCatalog = {
  stale: false,
  fetchedAt: "2026-08-11T10:00:00.000Z",
  maxStaleAt: "2026-08-11T10:05:00.000Z",
  items: [
    {
      id: "grok-4.5",
      displayName: "Grok 4.5",
      reasoningEfforts: ["medium", "high"],
      reteniveTested: true,
      selectable: true,
      providerAvailable: true,
      inputPricePerMillion: "3",
      cachedInputPricePerMillion: "0.75",
      outputPricePerMillion: "15",
    },
    {
      id: "grok-4.3",
      displayName: "Grok 4.3",
      reasoningEfforts: ["medium", "high"],
      reteniveTested: false,
      selectable: true,
      providerAvailable: true,
      inputPricePerMillion: "2",
      cachedInputPricePerMillion: "0.5",
      outputPricePerMillion: "10",
    },
  ],
};
let mockState: PlatformSafetyState | null = null;

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function normalizeState(value: unknown): PlatformSafetyState {
  const source = record(value);
  const revision = record(source.revision);
  const compiled = record(revision.compiledPolicy);
  const runtime = record(compiled.runtimeClassifier);
  const profile = record(source.profile);
  const modelId = String(profile.modelId ?? runtime.modelId ?? "");
  const reasoningEffort = String(
    profile.reasoningEffort ?? runtime.reasoningEffort ?? "medium",
  );
  if (
    !Number.isInteger(source.version) ||
    !modelId ||
    !["none", "low", "medium", "high"].includes(reasoningEffort)
  ) {
    throw new Error("PLATFORM_SAFETY_STATE_INVALID");
  }
  return {
    version: Number(source.version),
    reconciliationState: ["PENDING", "RUNNING", "IDLE"].includes(
      String(source.reconciliationState),
    )
      ? (source.reconciliationState as PlatformSafetyState["reconciliationState"])
      : "IDLE",
    profile: {
      modelId,
      displayName: String(
        profile.displayName ??
          (modelId === "grok-4.5"
            ? "Grok 4.5"
            : modelId === "grok-4.3"
              ? "Grok 4.3"
              : modelId),
      ),
      reasoningEffort: reasoningEffort as PlatformSafetyRuntimeReasoningEffort,
    },
    coverage: {
      projects: "ALL",
      locales: "ALL",
      channels: ["TEXT", "VOICE", "TELEGRAM"],
    },
    riskClasses,
    publishedAt: String(source.publishedAt ?? revision.publishedAt ?? ""),
  };
}

export async function readPlatformCaseIntelligenceSafety(
  signal?: AbortSignal,
): Promise<PlatformSafetyState | null> {
  if (isMockMode) return mockState;
  try {
    const value = await request<unknown>(
      { url: path, method: "GET" },
      signal ? { signal } : undefined,
    );
    return normalizeState(value);
  } catch (cause) {
    const error = normalizeApiError(cause);
    if (
      error.status === 404 &&
      error.code === "CASE_INTELLIGENCE_SAFETY_NOT_CONFIGURED"
    )
      return null;
    throw error;
  }
}

export async function readPlatformSafetyModelCatalog(
  signal?: AbortSignal,
): Promise<PlatformSafetyModelCatalog> {
  if (isMockMode) return mockCatalog;
  try {
    return await request<PlatformSafetyModelCatalog>(
      { url: `${path}/models`, method: "GET" },
      signal ? { signal } : undefined,
    );
  } catch (cause) {
    throw normalizeApiError(cause);
  }
}

export async function publishPlatformCaseIntelligenceSafety(
  payload: PublishPlatformSafety,
  signal?: AbortSignal,
): Promise<PlatformSafetyState> {
  if (isMockMode) {
    mockState = {
      version: payload.expectedVersion + 1,
      reconciliationState: "IDLE",
      profile: {
        modelId: payload.modelId,
        displayName:
          mockCatalog.items.find((item) => item.id === payload.modelId)
            ?.displayName ?? payload.modelId,
        reasoningEffort: payload.reasoningEffort,
      },
      coverage: {
        projects: "ALL",
        locales: "ALL",
        channels: ["TEXT", "VOICE", "TELEGRAM"],
      },
      riskClasses,
      publishedAt: new Date().toISOString(),
    };
    return mockState;
  }
  try {
    const value = await request<unknown>(
      {
        url: `${path}/revisions`,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        data: payload,
      },
      signal ? { signal } : undefined,
    );
    return normalizeState(value);
  } catch (cause) {
    throw normalizeApiError(cause);
  }
}

export async function lookupPlatformCaseIntelligenceSafetyCommand(
  idempotencyKey: string,
  signal?: AbortSignal,
): Promise<PlatformSafetyState> {
  if (isMockMode && mockState) return mockState;
  try {
    const value = await request<unknown>(
      { url: `${path}/commands/${idempotencyKey}`, method: "GET" },
      signal ? { signal } : undefined,
    );
    return normalizeState(value);
  } catch (cause) {
    throw normalizeApiError(cause);
  }
}
