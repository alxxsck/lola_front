import type { CmsAgentImmediateExecutionResponseDto } from "@/shared/api/generated/models";

export type CmsAgentExecution =
  | {
      kind: "ANALYSIS_QUEUED";
      analysisId: string;
      runId: string;
      status: string;
    }
  | {
      kind:
        "CLARIFICATION_REQUIRED" | "UNSUPPORTED" | "FAILED" | "OUTCOME_UNKNOWN";
      code?: string;
    }
  | { kind: "PROTOCOL_ERROR" };

export function decodeCmsAgentExecution(
  response: CmsAgentImmediateExecutionResponseDto,
): CmsAgentExecution {
  const code = response.interpretation.code;
  if (response.interpretation.outcome === "PLANNED") {
    const domain = response.result;
    const result = record(domain?.result);
    if (
      domain?.domainKind === "AI_ANALYSIS" &&
      domain.relation === "EXECUTED" &&
      isUuid(domain.domainId) &&
      result &&
      isUuid(result.analysisId) &&
      domain.domainId === result.analysisId &&
      isUuid(result.runId) &&
      result.status === "QUEUED"
    ) {
      return {
        kind: "ANALYSIS_QUEUED",
        analysisId: result.analysisId,
        runId: result.runId,
        status: result.status,
      };
    }
    return { kind: "PROTOCOL_ERROR" };
  }
  if (response.interpretation.outcome === "CLARIFICATION_REQUIRED") {
    return { kind: "CLARIFICATION_REQUIRED", ...(code ? { code } : {}) };
  }
  if (response.interpretation.outcome === "UNSUPPORTED") {
    return { kind: "UNSUPPORTED", ...(code ? { code } : {}) };
  }
  if (response.interpretation.outcome === "FAILED") {
    return { kind: "FAILED", ...(code ? { code } : {}) };
  }
  return { kind: "OUTCOME_UNKNOWN", ...(code ? { code } : {}) };
}

function isUuid(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
  );
}

function record(value: unknown): Record<string, unknown> | undefined {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : undefined;
}
