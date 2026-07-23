import type {
  TelegramAdminLinkEffectiveStatus,
  TelegramPersonalMessageResponseDto,
  TelegramPersonalMessageStatus,
} from "@/shared/api/generated/models";

export type TelegramPersonalLinkStatus =
  TelegramAdminLinkEffectiveStatus | "UNKNOWN";

export const MAX_TELEGRAM_TEXT_LENGTH = 4096;
export const MAX_TELEGRAM_CAPTION_LENGTH = 1024;
export const MAX_TELEGRAM_PHOTO_BYTES = 10 * 1024 * 1024;
export const MAX_TELEGRAM_MEDIA_BYTES = 50 * 1024 * 1024;

const MEDIA_LIMITS = new Map<string, number>([
  ["image/jpeg", MAX_TELEGRAM_PHOTO_BYTES],
  ["image/png", MAX_TELEGRAM_PHOTO_BYTES],
  ["image/webp", MAX_TELEGRAM_PHOTO_BYTES],
  ["video/mp4", MAX_TELEGRAM_MEDIA_BYTES],
  ["application/pdf", MAX_TELEGRAM_MEDIA_BYTES],
  ["application/zip", MAX_TELEGRAM_MEDIA_BYTES],
  ["text/plain", MAX_TELEGRAM_MEDIA_BYTES],
]);

export const TELEGRAM_MEDIA_ACCEPT = [...MEDIA_LIMITS.keys()].join(",");

export interface TelegramPersonalDraft {
  text: string;
  file: File | null;
}

export function validateTelegramPersonalDraft(
  draft: TelegramPersonalDraft,
): string | null {
  const { file, text } = draft;
  if (!file) {
    if (!text.trim()) return "Введите сообщение.";
    if (text.length > MAX_TELEGRAM_TEXT_LENGTH)
      return "Сообщение не должно превышать 4096 символов.";
    return null;
  }
  if (!file.size) return "Файл пустой.";
  const maximum = MEDIA_LIMITS.get(file.type);
  if (!maximum) return "Формат файла не поддерживается.";
  if (file.size > maximum) {
    return maximum === MAX_TELEGRAM_PHOTO_BYTES
      ? "Изображение не должно превышать 10 МБ."
      : "Файл не должен превышать 50 МБ.";
  }
  if (text && !text.trim()) return "Удалите пустую подпись или введите текст.";
  if (text.length > MAX_TELEGRAM_CAPTION_LENGTH)
    return "Подпись не должна превышать 1024 символа.";
  return null;
}

export function terminalTelegramPersonalStatus(
  status: TelegramPersonalMessageStatus,
): boolean {
  return ["SENT", "FAILED_PERMANENT", "OUTCOME_UNKNOWN", "CANCELLED"].includes(
    status,
  );
}

export function telegramPersonalStatusLabel(
  message: TelegramPersonalMessageResponseDto,
): string {
  switch (message.status) {
    case "QUEUED":
      return "В очереди";
    case "SENDING":
      return "Отправляется";
    case "RETRY_WAIT":
      return "Повтор ожидает";
    case "SENT":
      return "Отправлено в Telegram";
    case "OUTCOME_UNKNOWN":
      return "Результат неизвестен";
    case "FAILED_PERMANENT":
      return "Не отправлено";
    case "CANCELLED":
      return "Отменено";
  }
}

interface TelegramPersonalSafeErrorPolicy {
  staleLinkState: boolean;
  terminalLabel: string;
  createLabel?: string;
}

const GENERIC_TERMINAL_ERROR = "Не удалось отправить сообщение в Telegram.";
const GENERIC_CREATE_ERROR = "Не удалось поставить сообщение в очередь.";

export const TELEGRAM_PERSONAL_SAFE_ERROR_POLICY = {
  TELEGRAM_USER_BLOCKED: {
    staleLinkState: true,
    terminalLabel: "Пользователь заблокировал бота. Новая отправка недоступна.",
    createLabel: "Пользователь заблокировал бота. Новая отправка недоступна.",
  },
  TELEGRAM_LINK_BLOCKED: {
    staleLinkState: true,
    terminalLabel: "Пользователь заблокировал бота. Новая отправка недоступна.",
    createLabel: "Пользователь заблокировал бота. Новая отправка недоступна.",
  },
  TELEGRAM_LINK_NOT_ACTIVE: {
    staleLinkState: true,
    terminalLabel: "Связь пользователя с Telegram изменилась. Обновите статус.",
    createLabel: "Пользователь больше не подключён к Telegram.",
  },
  TELEGRAM_LINK_REVOKED: {
    staleLinkState: true,
    terminalLabel: "Пользователь отключил связь с Telegram.",
    createLabel: "Пользователь отключил связь с Telegram.",
  },
  TELEGRAM_LINK_RELINKED: {
    staleLinkState: true,
    terminalLabel: "Пользователь переподключил Telegram. Обновите статус.",
    createLabel: "Пользователь переподключил Telegram. Обновите статус.",
  },
  TELEGRAM_DELIVERY_FENCE_LOST: {
    staleLinkState: true,
    terminalLabel: "Связь пользователя с Telegram изменилась. Обновите статус.",
    createLabel: "Связь или Telegram проекта изменились. Обновите статус.",
  },
  TELEGRAM_DELIVERY_FENCE_CHANGED: {
    staleLinkState: true,
    terminalLabel: "Связь пользователя с Telegram изменилась. Обновите статус.",
    createLabel: "Связь или Telegram проекта изменились. Обновите статус.",
  },
  TELEGRAM_CHANNEL_NOT_ACTIVE: {
    staleLinkState: true,
    terminalLabel: "Пользовательский Telegram проекта сейчас недоступен.",
    createLabel: "Пользовательский Telegram проекта сейчас отключён.",
  },
  TELEGRAM_CHANNEL_DISABLED: {
    staleLinkState: true,
    terminalLabel: "Пользовательский Telegram проекта сейчас недоступен.",
    createLabel: "Пользовательский Telegram проекта сейчас отключён.",
  },
  TELEGRAM_CHANNEL_ROTATED: {
    staleLinkState: true,
    terminalLabel: "Настройки Telegram проекта изменились. Обновите статус.",
    createLabel: "Связь или Telegram проекта изменились. Обновите статус.",
  },
  TELEGRAM_CHANNEL_VERSION_CONFLICT: {
    staleLinkState: true,
    terminalLabel: "Настройки Telegram проекта изменились. Обновите статус.",
    createLabel: "Связь или Telegram проекта изменились. Обновите статус.",
  },
  TELEGRAM_CHANNEL_WEBHOOK_GENERATION_STALE: {
    staleLinkState: true,
    terminalLabel: "Настройки Telegram проекта изменились. Обновите статус.",
    createLabel: "Связь или Telegram проекта изменились. Обновите статус.",
  },
  TELEGRAM_CHANNEL_INVALID: {
    staleLinkState: true,
    terminalLabel: "Пользовательский Telegram проекта сейчас недоступен.",
    createLabel: "Пользовательский Telegram проекта сейчас недоступен.",
  },
  TELEGRAM_BOT_TOKEN_INVALID: {
    staleLinkState: true,
    terminalLabel: "Пользовательский Telegram проекта сейчас недоступен.",
    createLabel: "Пользовательский Telegram проекта сейчас недоступен.",
  },
  TELEGRAM_MEDIA_INVALID: {
    staleLinkState: false,
    terminalLabel: "Telegram отклонил содержимое сообщения.",
    createLabel: "Формат, размер или содержимое файла не поддерживаются.",
  },
  TELEGRAM_PERSONAL_MEDIA_INTEGRITY_FAILURE: {
    staleLinkState: false,
    terminalLabel: "Telegram отклонил содержимое сообщения.",
  },
  TELEGRAM_PAYLOAD_INVALID: {
    staleLinkState: false,
    terminalLabel: "Telegram отклонил содержимое сообщения.",
  },
  TELEGRAM_RETRY_EXHAUSTED: {
    staleLinkState: false,
    terminalLabel: "Telegram не ответил после нескольких попыток.",
  },
  TELEGRAM_WORKER_LEASE_EXPIRED: {
    staleLinkState: false,
    terminalLabel: "Отправка завершилась внутренней ошибкой.",
  },
  TELEGRAM_PROVIDER_RESPONSE_INVALID: {
    staleLinkState: false,
    terminalLabel: "Отправка завершилась внутренней ошибкой.",
  },
  TELEGRAM_MESSAGE_IDEMPOTENCY_CONFLICT: {
    staleLinkState: false,
    terminalLabel: GENERIC_TERMINAL_ERROR,
    createLabel: "Этот запрос уже использован с другим содержимым.",
  },
  TELEGRAM_TEXT_INVALID: {
    staleLinkState: false,
    terminalLabel: GENERIC_TERMINAL_ERROR,
    createLabel: "Проверьте длину текста сообщения.",
  },
  TELEGRAM_CAPTION_INVALID: {
    staleLinkState: false,
    terminalLabel: GENERIC_TERMINAL_ERROR,
    createLabel: "Проверьте длину подписи к файлу.",
  },
} as const satisfies Record<string, TelegramPersonalSafeErrorPolicy>;

export type TelegramPersonalSafeErrorCode =
  keyof typeof TELEGRAM_PERSONAL_SAFE_ERROR_POLICY;

export function telegramPersonalSafeErrorPolicy(
  code: string | null | undefined,
): TelegramPersonalSafeErrorPolicy {
  if (
    code &&
    Object.prototype.hasOwnProperty.call(
      TELEGRAM_PERSONAL_SAFE_ERROR_POLICY,
      code,
    )
  )
    return TELEGRAM_PERSONAL_SAFE_ERROR_POLICY[
      code as TelegramPersonalSafeErrorCode
    ];
  return {
    staleLinkState: false,
    terminalLabel: GENERIC_TERMINAL_ERROR,
  };
}

export function telegramPersonalFailureLabel(
  code: string | null | undefined,
): string {
  return telegramPersonalSafeErrorPolicy(code).terminalLabel;
}

export function telegramPersonalCreateErrorLabel(
  status: number,
  code: string | null | undefined,
): string {
  if (status === 403) return "Недостаточно прав для отправки в Telegram.";
  return (
    telegramPersonalSafeErrorPolicy(code).createLabel ?? GENERIC_CREATE_ERROR
  );
}
