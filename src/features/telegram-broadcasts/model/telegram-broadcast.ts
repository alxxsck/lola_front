export type TelegramBroadcastLifecycle =
  | "DRAFT"
  | "APPROVED"
  | "SCHEDULED"
  | "RUNNING"
  | "PAUSED"
  | "COMPLETED"
  | "COMPLETED_WITH_FAILURES"
  | "CANCELLED";

export type TelegramBroadcastAction =
  | "EDIT"
  | "PREVIEW"
  | "TEST_SEND"
  | "APPROVE"
  | "START"
  | "SCHEDULE"
  | "PAUSE"
  | "RESUME"
  | "CANCEL";

export interface TelegramBroadcastPermissions {
  read: boolean;
  draft: boolean;
  approve: boolean;
  operate: boolean;
}

export interface TelegramBroadcastDraft {
  title: string;
  content: {
    text: string;
  };
  audience: {
    kind: "ALL_EXPLICITLY_OPTED_IN";
  };
}

export type TelegramBroadcastExclusionReason =
  | "CONSENT_NOT_ACTIVE"
  | "STALE_CONSENT"
  | "NO_ACTIVE_LINK"
  | "INSTALLATION_UNAVAILABLE";

export interface TelegramBroadcastExclusion {
  reason: TelegramBroadcastExclusionReason;
  count: number;
}

export interface TelegramBroadcastPreview {
  broadcastId: string;
  version: number;
  revisionId: string;
  contentHash: string;
  renderedText: string;
  eligibleRecipientCount: number;
  totalEvaluated: number;
  exclusions: TelegramBroadcastExclusion[];
}

export interface TelegramBroadcastApproval {
  id: string;
  revisionId: string;
  contentHash: string;
  recipientCount: number;
  successfulTestId: string;
  audiencePolicy: string;
  approvedAt: string;
  approvedByActorType: string;
}

export interface TelegramBroadcastTest {
  id: string;
  label: string;
  revisionId: string;
  status:
    | "PENDING"
    | "SENDING"
    | "RETRY_WAIT"
    | "SENT"
    | "FAILED_PERMANENT"
    | "OUTCOME_UNKNOWN"
    | "CANCELLED";
  currentRevision: boolean;
  sentAt: string | null;
}

export interface TelegramBroadcastProgress {
  total: number;
  pending: number;
  sending: number;
  sent: number;
  retryWait: number;
  outcomeUnknown: number;
  failedPermanent: number;
  suppressedLink: number;
  suppressedConsent: number;
  suppressedInstallation: number;
  cancelled: number;
}

export interface TelegramBroadcast {
  id: string;
  projectId: string;
  title: string;
  status: TelegramBroadcastLifecycle;
  version: number;
  revision: {
    id: string;
    revisionNumber: number;
    contentHash: string;
    text: string;
    contentAvailable: boolean;
    createdAt: string;
  };
  content: TelegramBroadcastDraft["content"];
  audience: TelegramBroadcastDraft["audience"];
  approval: TelegramBroadcastApproval | null;
  latestTest: TelegramBroadcastTest | null;
  recipientCount: number;
  scheduledAt: string | null;
  progress: TelegramBroadcastProgress | null;
  allowedActions: TelegramBroadcastAction[];
  createdAt: string;
  updatedAt: string;
}

export interface TelegramBroadcastActionAvailability {
  edit: boolean;
  preview: boolean;
  testSend: boolean;
  approve: boolean;
  start: boolean;
  schedule: boolean;
  pause: boolean;
  resume: boolean;
  cancel: boolean;
}

export interface TelegramBroadcastSafeError {
  kind:
    | "AMBIGUOUS"
    | "CONFLICT"
    | "FRESH_AUTH"
    | "FORBIDDEN"
    | "NOT_FOUND"
    | "RATE_LIMITED"
    | "CONFIGURATION"
    | "UNKNOWN";
  message: string;
  retryable: boolean;
}

export const TELEGRAM_BROADCAST_TITLE_MAX_LENGTH = 120;
export const TELEGRAM_BROADCAST_TEXT_MAX_LENGTH = 4_096;
export const TELEGRAM_BROADCAST_END_USER_EXTERNAL_ID_MAX_LENGTH = 255;
export const TELEGRAM_BROADCAST_TEST_LABEL_MAX_LENGTH = 80;
export const TELEGRAM_BROADCAST_AUDIENCE_CAP = 10_000;

export function createEmptyBroadcastDraft(): TelegramBroadcastDraft {
  return {
    title: "",
    content: { text: "" },
    audience: { kind: "ALL_EXPLICITLY_OPTED_IN" },
  };
}

export function telegramBroadcastPermissions(
  effectivePermissionCodes: readonly string[],
): TelegramBroadcastPermissions {
  return {
    read: effectivePermissionCodes.includes("project.telegram.broadcasts.read"),
    draft: effectivePermissionCodes.includes(
      "project.telegram.broadcasts.draft",
    ),
    approve: effectivePermissionCodes.includes(
      "project.telegram.broadcasts.approve",
    ),
    operate: effectivePermissionCodes.includes(
      "project.telegram.broadcasts.operate",
    ),
  };
}

export function validateBroadcastDraft(
  draft: TelegramBroadcastDraft,
): Partial<Record<"title" | "text", string>> {
  const title = draft.title.trim();
  const text = draft.content.text.trim();
  return {
    ...(!title
      ? { title: "Укажите название рассылки." }
      : draft.title.length > TELEGRAM_BROADCAST_TITLE_MAX_LENGTH
        ? { title: "Название не должно превышать 120 символов." }
        : {}),
    ...(!text
      ? { text: "Введите сообщение." }
      : draft.content.text.length > TELEGRAM_BROADCAST_TEXT_MAX_LENGTH
        ? { text: "Сообщение не должно превышать 4096 символов." }
        : {}),
  };
}

export function validBroadcastTestLabel(label: string): boolean {
  const normalized = label.trim();
  return (
    normalized.length > 0 &&
    normalized.length <= TELEGRAM_BROADCAST_TEST_LABEL_MAX_LENGTH
  );
}

export function validBroadcastEndUserExternalId(value: string): boolean {
  const normalized = value.trim();
  return (
    normalized.length > 0 &&
    normalized.length <= TELEGRAM_BROADCAST_END_USER_EXTERNAL_ID_MAX_LENGTH
  );
}

export function broadcastActionAvailability(
  broadcast: TelegramBroadcast | null,
  permissions: TelegramBroadcastPermissions,
): TelegramBroadcastActionAvailability {
  const allows = (action: TelegramBroadcastAction) =>
    Boolean(broadcast?.allowedActions.includes(action));
  return {
    edit: permissions.draft && allows("EDIT"),
    preview: permissions.draft && allows("PREVIEW"),
    testSend: permissions.draft && allows("TEST_SEND"),
    approve: permissions.approve && allows("APPROVE"),
    start: permissions.operate && allows("START"),
    schedule: permissions.operate && allows("SCHEDULE"),
    pause: permissions.operate && allows("PAUSE"),
    resume: permissions.operate && allows("RESUME"),
    cancel: allows("CANCEL") && permissions.operate,
  };
}

export function terminalBroadcastLifecycle(
  lifecycle: TelegramBroadcastLifecycle,
): boolean {
  return ["COMPLETED", "COMPLETED_WITH_FAILURES", "CANCELLED"].includes(
    lifecycle,
  );
}

function errorShape(cause: unknown): { status?: number; code?: string } {
  if (!cause || typeof cause !== "object") return {};
  const value = cause as { status?: unknown; code?: unknown };
  return {
    ...(typeof value.status === "number" ? { status: value.status } : {}),
    ...(typeof value.code === "string" ? { code: value.code } : {}),
  };
}

export function safeBroadcastError(cause: unknown): TelegramBroadcastSafeError {
  const { status, code } = errorShape(cause);
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
        "Не удалось подтвердить результат. Повторите команду безопасно с тем же запросом.",
      retryable: true,
    };
  if (status === 409 || code?.includes("VERSION_CONFLICT"))
    return {
      kind: "CONFLICT",
      message:
        "Рассылка изменилась. Мы загрузили актуальную версию — проверьте её перед повтором.",
      retryable: false,
    };
  if (status === 403)
    return {
      kind: "FORBIDDEN",
      message: "Доступ к рассылкам изменился.",
      retryable: false,
    };
  if (status === 404)
    return {
      kind: "NOT_FOUND",
      message: "Рассылка не найдена или больше недоступна.",
      retryable: false,
    };
  if (status === 429 || code?.includes("RATE_LIMIT"))
    return {
      kind: "RATE_LIMITED",
      message: "Команда временно ограничена. Повторите позже.",
      retryable: false,
    };
  if (
    code?.includes("KILL_SWITCH") ||
    code?.includes("CHANNEL_UNAVAILABLE") ||
    code?.includes("CONFIGURATION")
  )
    return {
      kind: "CONFIGURATION",
      message:
        "Отправка Telegram сейчас недоступна. Проверьте интеграцию или обратитесь к владельцу проекта.",
      retryable: false,
    };
  return {
    kind: "UNKNOWN",
    message: "Не удалось выполнить действие. Повторите попытку.",
    retryable: false,
  };
}
