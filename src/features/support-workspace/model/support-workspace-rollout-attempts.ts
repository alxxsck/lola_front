import type { SupportWorkspaceRolloutCommand } from "@/features/support-workspace/api/support-workspace-rollout-source";

export type SupportWorkspaceRolloutAttemptState =
  | "IN_FLIGHT"
  | "UNKNOWN_OUTCOME"
  | "RETRYABLE_FAILURE"
  | "QUARANTINED";

export interface RetainedSupportWorkspaceRolloutAttempt {
  command: SupportWorkspaceRolloutCommand;
  state: SupportWorkspaceRolloutAttemptState;
}

const retainedAttempts = new Map<
  string,
  RetainedSupportWorkspaceRolloutAttempt
>();

export function supportWorkspaceRolloutAttemptScope(
  actorId: string | undefined,
  projectId: string | undefined,
): string | null {
  if (!actorId || !projectId) return null;
  return `${actorId}\u0000${projectId}`;
}

export function retainSupportWorkspaceRolloutAttempt(
  scope: string,
  command: SupportWorkspaceRolloutCommand,
  state: SupportWorkspaceRolloutAttemptState,
): void {
  retainedAttempts.set(scope, { command: structuredClone(command), state });
}

export function readRetainedSupportWorkspaceRolloutAttempt(
  scope: string,
): RetainedSupportWorkspaceRolloutAttempt | null {
  const value = retainedAttempts.get(scope);
  return value ? structuredClone(value) : null;
}

export function forgetRetainedSupportWorkspaceRolloutAttempt(
  scope: string,
): void {
  retainedAttempts.delete(scope);
}

export function clearRetainedSupportWorkspaceRolloutAttempts(): void {
  retainedAttempts.clear();
}
