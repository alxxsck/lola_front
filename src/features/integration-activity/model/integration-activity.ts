export type IntegrationActivityType = "CONNECTION" | "PERSONAL_MESSAGE";
export type IntegrationActivityStatus =
  "PENDING" | "SUCCEEDED" | "FAILED" | "CANCELLED" | "OUTCOME_UNKNOWN";
export type IntegrationActivityContentState =
  "AVAILABLE" | "REDACTED" | "NOT_APPLICABLE";

export interface IntegrationActivityItem {
  id: string;
  provider: string;
  activityType: IntegrationActivityType;
  status: IntegrationActivityStatus;
  state: string;
  endUser: { id: string; externalId: string };
  origin: { kind: string; id: string | null };
  attemptCount: number;
  errorCode: string | null;
  contentState: IntegrationActivityContentState;
  createdAt: string;
  updatedAt: string;
  finishedAt: string | null;
}

export interface IntegrationActivityAttempt {
  attemptNumber: number;
  outcome: string;
  errorCode: string | null;
  retryAfterMs: number | null;
  startedAt: string;
  finishedAt: string;
}

export interface IntegrationActivityMilestone {
  state: string;
  at: string;
}

export interface IntegrationActivityDetail extends IntegrationActivityItem {
  sourceResourceKind: string;
  sourceResourceId: string;
  requestId: string | null;
  correlationId: string | null;
  conversationId: string | null;
  scenarioRunId: string | null;
  attempts: IntegrationActivityAttempt[];
  milestones: IntegrationActivityMilestone[];
}

export interface IntegrationActivityContent {
  state: "AVAILABLE" | "REDACTED";
  kind: string;
  text: string | null;
  attachment: {
    kind: string;
    mimeType: string;
    filename: string;
    sizeBytes: number;
  } | null;
  redactedAt: string | null;
}

export interface IntegrationActivityFilters {
  cursor?: string;
  limit?: number;
  provider?: string[];
  activityType?: IntegrationActivityType[];
  status?: IntegrationActivityStatus[];
  externalUserId?: string;
  createdFrom?: string;
  createdTo?: string;
}

export interface IntegrationActivityPage {
  items: IntegrationActivityItem[];
  nextCursor: string | null;
}

export interface IntegrationActivityRepository {
  list(
    projectId: string,
    filters?: IntegrationActivityFilters,
  ): Promise<IntegrationActivityPage>;
  get(
    projectId: string,
    activityId: string,
  ): Promise<IntegrationActivityDetail>;
  content(
    projectId: string,
    activityId: string,
  ): Promise<IntegrationActivityContent>;
}

export const activityStatusOptions: Array<{
  label: string;
  value: IntegrationActivityStatus;
}> = [
  { label: "Ожидает", value: "PENDING" },
  { label: "Успешно", value: "SUCCEEDED" },
  { label: "Ошибка", value: "FAILED" },
  { label: "Отменено", value: "CANCELLED" },
  { label: "Результат неизвестен", value: "OUTCOME_UNKNOWN" },
];

const stateLabels: Record<string, string> = {
  AWAITING_TELEGRAM: "Ожидает открытия Telegram",
  AWAITING_CONFIRMATION: "Ожидает подтверждения",
  CONNECTED: "Telegram подключён",
  RELINKED: "Telegram переподключён",
  EXPIRED: "Попытка истекла",
  CANCELLED: "Попытка отменена",
  ATTEMPTS_EXHAUSTED: "Попытки исчерпаны",
  DISCONNECTED: "Telegram отключён",
  STOPPED: "Пользователь остановил бота",
  BLOCKED: "Бот заблокирован",
  QUEUED: "В очереди",
  SENDING: "Отправляется",
  RETRY_WAIT: "Повторная попытка",
  SENT: "Отправлено",
  FAILED_PERMANENT: "Не доставлено",
  OUTCOME_UNKNOWN: "Результат неизвестен",
};

export function activityStateLabel(state: string): string {
  return stateLabels[state] ?? state;
}

export function activityTypeLabel(type: IntegrationActivityType): string {
  return type === "CONNECTION" ? "Подключение" : "Личное сообщение";
}

export function activityOriginLabel(kind: string): string {
  return (
    {
      CMS_USER: "CMS User",
      AI: "Lola AI",
      SCENARIO: "Сценарий",
      SYSTEM: "Система",
      END_USER: "End User",
    }[kind] ?? kind
  );
}

export function activityStatusLabel(status: IntegrationActivityStatus): string {
  return (
    activityStatusOptions.find((option) => option.value === status)?.label ??
    status
  );
}

export function activityStatusSeverity(
  status: IntegrationActivityStatus,
): "success" | "danger" | "warn" | "info" | "secondary" {
  if (status === "SUCCEEDED") return "success";
  if (status === "FAILED") return "danger";
  if (status === "PENDING") return "info";
  if (status === "OUTCOME_UNKNOWN") return "warn";
  return "secondary";
}
