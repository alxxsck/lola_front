export interface SupportAnalyticsGeneration {
  projectId: string;
  datasetCode: string;
  generationId: string;
  updatedAt: string;
  freshness: "READY" | "PARTIAL" | "DEGRADED" | "UNAVAILABLE";
}

const freshnessStates = new Set<SupportAnalyticsGeneration["freshness"]>([
  "READY",
  "PARTIAL",
  "DEGRADED",
  "UNAVAILABLE",
]);

export function parseSupportAnalyticsGeneration(
  value: unknown,
): SupportAnalyticsGeneration | null {
  if (!value || typeof value !== "object") return null;
  const event = value as Record<string, unknown>;
  if (
    typeof event.projectId !== "string" ||
    typeof event.datasetCode !== "string" ||
    typeof event.generationId !== "string" ||
    !event.generationId ||
    typeof event.updatedAt !== "string" ||
    typeof event.freshness !== "string" ||
    !freshnessStates.has(event.freshness as SupportAnalyticsGeneration["freshness"])
  )
    return null;
  return {
    projectId: event.projectId,
    datasetCode: event.datasetCode,
    generationId: event.generationId,
    updatedAt: event.updatedAt,
    freshness: event.freshness as SupportAnalyticsGeneration["freshness"],
  };
}
