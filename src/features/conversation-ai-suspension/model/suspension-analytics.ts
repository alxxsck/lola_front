export type SuspensionAnalyticsEvent =
  | 'conversation_ai_suspension_dialog_opened'
  | 'conversation_ai_suspension_started'
  | 'conversation_ai_suspension_extended'
  | 'conversation_ai_suspension_resumed'
  | 'conversation_ai_suspension_command_failed'
  | 'conversation_ai_suspension_indicator_opened'

const allowedFields: Record<SuspensionAnalyticsEvent, readonly string[]> = {
  conversation_ai_suspension_dialog_opened: ['source'],
  conversation_ai_suspension_started: ['duration_bucket', 'reason', 'source'],
  conversation_ai_suspension_extended: ['duration_bucket'],
  conversation_ai_suspension_resumed: ['remaining_bucket'],
  conversation_ai_suspension_command_failed: ['command', 'error_kind'],
  conversation_ai_suspension_indicator_opened: ['surface'],
}

export function reportSuspensionEvent(
  name: SuspensionAnalyticsEvent,
  value: Record<string, string | number | boolean | null | undefined>,
): void {
  try {
    const payload = Object.fromEntries(
      allowedFields[name]
        .filter((key) => value[key] !== undefined)
        .map((key) => [key, value[key]]),
    )
    window.dispatchEvent(new CustomEvent('lola:analytics', { detail: { name, payload } }))
  } catch {
    // Сбор статистики не должен влиять на управление AI.
  }
}

export function suspensionDurationBucket(seconds: number): string {
  if (seconds <= 900) return '15m'
  if (seconds <= 1_800) return '30m'
  if (seconds <= 3_600) return '1h'
  if (seconds <= 14_400) return '4h'
  if (seconds <= 86_400) return '24h'
  return '7d'
}
