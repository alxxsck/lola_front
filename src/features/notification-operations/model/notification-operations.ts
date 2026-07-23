import type {
  NotificationOperationsDeliveriesChannel,
  NotificationOperationsDeliveriesStatus,
  NotificationOperationsDeliveryResponseDtoReplayEligibility,
  NotificationOperationsIntegrationResponseDtoKind,
  NotificationOperationsProviderHealthDtoChannel,
  NotificationOperationsProviderHealthDtoState,
  NotificationQuarantineDtoReason,
} from "@/shared/api/generated/models";

export type NotificationOperationsChannel =
  NotificationOperationsDeliveriesChannel;
export type NotificationOperationsDeliveryFilterStatus =
  NotificationOperationsDeliveriesStatus;
export type NotificationOperationsReplayEligibility =
  NotificationOperationsDeliveryResponseDtoReplayEligibility;
export type NotificationOperationsIntegrationKind =
  NotificationOperationsIntegrationResponseDtoKind;
export type NotificationOperationsQuarantineReason =
  NotificationQuarantineDtoReason;

export interface NotificationOperationsPermissions {
  read: boolean;
  operate: boolean;
}

export interface NotificationOperationsQueueHealth {
  queueKind:
    | "OPERATIONAL_NOTIFICATION"
    | "TELEGRAM_PERSONAL"
    | "TELEGRAM_BROADCAST"
    | "OTHER";
  channel: NotificationOperationsChannel | "TELEGRAM_PRODUCT" | "OTHER";
  status: string;
  count: number;
  oldestAgeSeconds: number;
  attemptsInWindow: number;
}

export interface NotificationOperationsProviderHealth {
  channel: NotificationOperationsProviderHealthDtoChannel;
  state: NotificationOperationsProviderHealthDtoState;
}

export interface NotificationOperationsAdmissionHealth {
  scope: "INSTALLATION" | "CHAT";
  exhaustedBucketCount: number;
  maximumRetryDelaySeconds: number;
}

export interface NotificationOperationsRetentionHealth {
  notificationPayloadBacklog: number;
  personalContentBacklog: number;
  broadcastContentBacklog: number;
  linkSecretBacklog: number;
  operationalEvidenceBacklog: number;
  lastSuccessfulBatchAt: string | null;
}

export interface NotificationOperationsHealth {
  observedAt: string;
  queues: NotificationOperationsQueueHealth[];
  permanentCount: number;
  ambiguousCount: number;
  suppressedCount: number;
  deadLetterCount: number;
  providers: NotificationOperationsProviderHealth[];
  telegramProductAdmission: NotificationOperationsAdmissionHealth[];
  retention: NotificationOperationsRetentionHealth;
}

export type NotificationOperationsSafeErrorCategory =
  | "RATE_LIMITED"
  | "TRANSIENT"
  | "DESTINATION_INVALID"
  | "PAYLOAD_INVALID"
  | "LEASE_EXPIRED"
  | "EXHAUSTED"
  | "QUARANTINED"
  | "OTHER";

export interface NotificationOperationsDelivery {
  id: string;
  projectId: string;
  channel: NotificationOperationsChannel;
  status: string;
  errorCategory: NotificationOperationsSafeErrorCategory;
  attemptCount: number;
  operationsVersion: number;
  replayEligibility: NotificationOperationsReplayEligibility;
  contentAvailable: false;
  createdAt: string;
  updatedAt: string;
}

export interface NotificationOperationsIntegration {
  integrationId: string;
  kind: NotificationOperationsIntegrationKind;
  projectId: string;
  status: string;
  version: number;
  maskedIdentity: string;
  quarantineAllowed: boolean;
}

export interface NotificationOperationsPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface NotificationOperationsFilters {
  projectId: string;
  channel: NotificationOperationsChannel | "";
  status: NotificationOperationsDeliveryFilterStatus | "";
  integrationKind: NotificationOperationsIntegrationKind | "";
  integrationStatus: string;
}

export interface NotificationOperationsSafeError {
  kind:
    | "AMBIGUOUS"
    | "CONFLICT"
    | "FRESH_AUTH"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "INVALID_STATE"
    | "UNKNOWN";
  message: string;
  retryable: boolean;
}

export const NOTIFICATION_OPERATIONS_QUARANTINE_REASONS: ReadonlyArray<{
  value: NotificationOperationsQuarantineReason;
  label: string;
}> = [
  {
    value: "CREDENTIAL_COMPROMISED",
    label: "Credential скомпрометирован",
  },
  {
    value: "PROVIDER_ACCOUNT_COMPROMISED",
    label: "Аккаунт provider скомпрометирован",
  },
  {
    value: "INCIDENT_CONTAINMENT",
    label: "Локализация инцидента",
  },
  { value: "OPERATOR_REQUEST", label: "Запрос оператора" },
];

export function notificationOperationsPermissions(
  permissionCodes: readonly string[],
): NotificationOperationsPermissions {
  return {
    read: permissionCodes.includes("platform.notifications.operations.read"),
    operate: permissionCodes.includes(
      "platform.notifications.operations.operate",
    ),
  };
}

export function canReplayNotificationDelivery(
  delivery: NotificationOperationsDelivery,
  permissions: NotificationOperationsPermissions,
): boolean {
  return (
    permissions.operate &&
    delivery.replayEligibility === "ELIGIBLE_KNOWN_NOT_ACCEPTED"
  );
}

export function canQuarantineNotificationIntegration(
  integration: NotificationOperationsIntegration,
  permissions: NotificationOperationsPermissions,
): boolean {
  return permissions.operate && integration.quarantineAllowed;
}

export function safeNotificationOperationsError(
  cause: unknown,
): NotificationOperationsSafeError {
  const value =
    cause && typeof cause === "object"
      ? (cause as { status?: unknown; code?: unknown })
      : {};
  const status = typeof value.status === "number" ? value.status : undefined;
  const code = typeof value.code === "string" ? value.code : undefined;
  if (
    status === 428 ||
    code === "REAUTHENTICATION_REQUIRED" ||
    code === "MFA_REQUIRED"
  )
    return {
      kind: "FRESH_AUTH",
      message:
        "Требуется свежий вход с MFA. Команда не повторялась автоматически.",
      retryable: false,
    };
  if (
    status === 0 ||
    code === "NETWORK_ERROR" ||
    code === "TIMEOUT" ||
    code === "OUTCOME_UNKNOWN"
  )
    return {
      kind: "AMBIGUOUS",
      message:
        "Результат запроса не подтверждён. Можно явно повторить тот же запрос с сохранённым ключом.",
      retryable: true,
    };
  if (status === 409 || code?.includes("VERSION_CONFLICT"))
    return {
      kind: "CONFLICT",
      message:
        "Состояние уже изменилось. Загружены актуальные данные; подтвердите действие заново.",
      retryable: false,
    };
  if (status === 403)
    return {
      kind: "FORBIDDEN",
      message: "Доступ к операциям доставки изменился.",
      retryable: false,
    };
  if (status === 404)
    return {
      kind: "NOT_FOUND",
      message: "Ресурс не найден или больше недоступен.",
      retryable: false,
    };
  if (
    code?.includes("INELIGIBLE") ||
    code?.includes("INVALID_STATE") ||
    code?.includes("DESTINATION_CHANGED")
  )
    return {
      kind: "INVALID_STATE",
      message:
        "Действие больше не разрешено для текущего состояния. Данные обновлены.",
      retryable: false,
    };
  return {
    kind: "UNKNOWN",
    message: "Не удалось выполнить операцию. Обновите данные и повторите.",
    retryable: false,
  };
}
