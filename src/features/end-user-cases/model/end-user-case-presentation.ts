import type { EndUserCasePriority, EndUserCaseStatus } from "./end-user-case";

export const endUserCaseStatusLabel = (status: EndUserCaseStatus): string =>
  ({
    OPEN: "Открыто",
    IN_PROGRESS: "В работе",
    WAITING_END_USER: "Ждём пользователя",
    WAITING_SYSTEM: "Ждём систему",
    WAITING_ADMIN: "Нужен администратор",
    RESOLVED: "Решено",
    UNRESOLVED: "Не решено",
    CANCELLED: "Отменено",
  })[status];

export const endUserCasePriorityLabel = (
  priority: EndUserCasePriority,
): string =>
  ({
    LOW: "Низкий",
    NORMAL: "Обычный",
    HIGH: "Высокий",
    URGENT: "Срочно",
    CRITICAL: "Критично",
  })[priority];

export const endUserCaseActionLabel = (status: EndUserCaseStatus): string =>
  ({
    OPEN: "Переоткрыть",
    IN_PROGRESS: "Взять в работу",
    WAITING_END_USER: "Ждём пользователя",
    WAITING_SYSTEM: "Ждём систему",
    WAITING_ADMIN: "Нужен администратор",
    RESOLVED: "Подтвердить решение",
    UNRESOLVED: "Отметить нерешённым",
    CANCELLED: "Отменить",
  })[status];

export const endUserCaseToneLabel = (tone: string): string =>
  ({
    CALM: "Спокоен",
    CONFUSED: "Растерян",
    CONCERNED: "Обеспокоен",
    FRUSTRATED: "Раздражён",
    ANGRY: "Зол",
    POSITIVE: "Позитивен",
    UNKNOWN: "Не определено",
  })[tone] ?? "Не определено";

export const endUserCaseChannelLabel = (channel: string): string =>
  ({ TEXT: "Текст", VOICE: "Голос", CMS: "Администратор" })[channel] ??
  "Другой канал";

export const endUserCaseCapabilityLabel = (code: string): string =>
  ({
    check_deposit: "Проверка депозита",
    search_logs: "Проверка данных",
  })[code] ?? "Инструмент Retenive";

export const endUserCaseGroupLabel = (code: string): string =>
  ({
    PAYMENTS: "Платежи",
    DEPOSIT: "Депозиты",
    DEPOSITS: "Депозиты",
    GAMES: "Игры",
    ACCOUNT: "Учётная запись",
    GENERAL: "Общие вопросы",
  })[code] ?? code;

export const endUserCaseEventLabel = (type: string): string =>
  ({
    CREATED: "Обращение создано",
    MESSAGE_LINKED: "Добавлено сообщение",
    REOPENED: "Обращение переоткрыто",
    UPDATED: "Данные обновлены",
    STATUS_CHANGED: "Состояние изменено",
    ASSIGNED: "Назначен исполнитель",
    CORRECTED: "Классификация исправлена",
    MERGED: "Обращения объединены",
    SPLIT: "Обращение разделено",
    ADMIN_ATTENTION_REQUESTED: "Запрошена помощь администратора",
    ADMIN_ATTENTION_CLAIMED: "Специалист взял обращение в работу",
    ADMIN_ATTENTION_RELEASED: "Обращение возвращено в очередь специалистов",
    ADMIN_ATTENTION_TRANSFERRED: "Обращение передано другому специалисту",
    ADMIN_ATTENTION_CLOSED: "Помощь специалиста завершена",
    ADMIN_ATTENTION_CANCELLED: "Запрос специалиста отменён",
  })[type] ?? "Обращение обновлено";
