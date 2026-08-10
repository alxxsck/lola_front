export type SupportWorkspaceTelemetryEvent = "support_workspace_core_feedback";

const allowedFields = [
  "operation",
  "outcome",
  "duration_ms",
  "duplicate_prevented",
  "recovered",
  "mismatch_count",
  "viewport",
] as const;

export function supportWorkspaceViewportBucket(): string {
  if (window.innerWidth < 480) return "mobile";
  if (window.innerWidth < 1024) return "tablet";
  return "desktop";
}

export function reportSupportWorkspaceTelemetry(
  name: SupportWorkspaceTelemetryEvent,
  value: Record<string, string | number | boolean | null | undefined>,
): void {
  try {
    const payload = Object.fromEntries(
      allowedFields
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, value[key]]),
    );
    window.dispatchEvent(
      new CustomEvent("retenive:analytics", { detail: { name, payload } }),
    );
  } catch {
    // Operational telemetry must never block Support work.
  }
}
