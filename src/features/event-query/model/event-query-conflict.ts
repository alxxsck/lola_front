import type {
  EventQueryPolicyItemStateResponseDto,
  EventQueryPolicyStateResponseDto,
} from '@/shared/api/generated/models';
import { ApiError } from '@/shared/api/http/api-error';

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function conflictCurrent(cause: unknown): Record<string, unknown> | null {
  if (!(cause instanceof ApiError) || cause.status !== 409) return null;
  return record(record(cause.details)?.current);
}

export function projectPolicyConflictState(
  cause: unknown,
): EventQueryPolicyStateResponseDto | null {
  const current = conflictCurrent(cause);
  return current &&
    typeof current.concurrencyToken === 'string' &&
    record(current.configured) &&
    record(current.effective) &&
    Array.isArray(current.diagnostics)
    ? (current as unknown as EventQueryPolicyStateResponseDto)
    : null;
}

export function eventPolicyConflictState(
  cause: unknown,
): EventQueryPolicyItemStateResponseDto | null {
  const current = conflictCurrent(cause);
  return current &&
    typeof current.concurrencyToken === 'string' &&
    typeof current.definitionKeyId === 'string' &&
    typeof current.eventCode === 'string' &&
    record(current.configured) &&
    record(current.effective) &&
    record(current.lifecycleRestrictions) &&
    Array.isArray(current.diagnostics)
    ? (current as unknown as EventQueryPolicyItemStateResponseDto)
    : null;
}
