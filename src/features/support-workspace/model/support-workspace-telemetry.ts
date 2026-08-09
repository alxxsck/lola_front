export type SupportWorkspaceTelemetryEvent =
  | "support_workspace_rollout_read"
  | "support_workspace_rollout_command"
  | "support_workspace_rollout_recovery"
  | "support_workspace_core_feedback";

const allowedFields: Record<
  SupportWorkspaceTelemetryEvent,
  readonly string[]
> = {
  support_workspace_rollout_read: ["outcome", "duration_ms", "viewport"],
  support_workspace_rollout_command: [
    "operation",
    "outcome",
    "duration_ms",
    "duplicate_prevented",
    "viewport",
  ],
  support_workspace_rollout_recovery: [
    "operation",
    "outcome",
    "duration_ms",
    "recovered",
    "viewport",
  ],
  support_workspace_core_feedback: [
    "operation",
    "outcome",
    "duration_ms",
    "duplicate_prevented",
    "recovered",
    "mismatch_count",
    "viewport",
  ],
};

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
      allowedFields[name]
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, value[key]]),
    );
    window.dispatchEvent(
      new CustomEvent("retenive:analytics", { detail: { name, payload } }),
    );
  } catch {
    // Operational telemetry must never block Support work or rollout recovery.
  }
}
