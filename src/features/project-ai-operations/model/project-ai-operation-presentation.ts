import type {
  AiOperationActorDto,
  AiOperationListItemDtoCategory,
  AiOperationListItemDtoChargedAccount,
  AiOperationListItemDtoStatus,
} from "@/shared/api/generated/models";

export function aiOperationStatusPresentation(
  status: AiOperationListItemDtoStatus,
): { label: string; severity: "success" | "info" | "warn" | "danger" } {
  const values: Record<
    AiOperationListItemDtoStatus,
    { label: string; severity: "success" | "info" | "warn" | "danger" }
  > = {
    STARTED: { label: "Запущено", severity: "info" },
    RUNNING: { label: "Выполняется", severity: "warn" },
    SUCCEEDED: { label: "Завершено", severity: "success" },
    FAILED: { label: "Ошибка", severity: "danger" },
    CANCELLED: { label: "Отменено", severity: "warn" },
  };
  return values[status];
}

export function aiOperationCategoryLabel(
  category: AiOperationListItemDtoCategory,
): string {
  const values: Record<AiOperationListItemDtoCategory, string> = {
    CHAT: "Чат",
    VOICE: "Голос",
    SPEECH: "Речь",
    MEMORY: "Память",
    AI_REVIEW: "AI-проверка",
    AI_ANALYSIS: "AI-анализ",
    CMS_AGENT: "AI-агент CMS",
    CASE_INTELLIGENCE: "Анализ обращения",
    PROJECT_OVERHEAD: "Системная AI-операция",
  };
  return values[category];
}

export function aiOperationChargedAccountLabel(
  account: AiOperationListItemDtoChargedAccount,
): string {
  const values: Record<AiOperationListItemDtoChargedAccount, string> = {
    END_USER_ALLOWANCE: "AI-лимит пользователя",
    PROJECT_BUDGET: "Бюджет проекта",
    PROJECT_OVERHEAD: "Системные расходы проекта",
  };
  return values[account];
}

export function aiOperationActorLabel(actor: AiOperationActorDto): string {
  if (actor.displayName?.trim()) return actor.displayName.trim();
  if (actor.type === "SYSTEM") return "Система Lola";
  if (actor.type === "CMS_USER")
    return actor.id ? `Администратор ${actor.id}` : "Администратор неизвестен";
  return actor.id ? `Пользователь ${actor.id}` : "Пользователь неизвестен";
}

export function aiOperationCostLabel(value: string | null | undefined): string {
  if (value == null) return "Стоимость неизвестна";
  const amount = Number(value);
  if (!Number.isFinite(amount)) return "Стоимость неизвестна";
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

export function aiOperationDateLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(date);
}

export function compactIdentifier(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}
