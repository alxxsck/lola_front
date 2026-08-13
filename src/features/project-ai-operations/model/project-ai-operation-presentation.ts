import type {
  AiOperationActorDto,
  AiOperationListItemDtoCategory,
  AiOperationListItemDtoChargedAccount,
  AiOperationListItemDtoStatus,
} from '@/shared/api/generated/models';

export function aiOperationStatusPresentation(status: AiOperationListItemDtoStatus): {
  label: string;
  severity: 'success' | 'info' | 'warn' | 'danger';
} {
  const values: Record<
    AiOperationListItemDtoStatus,
    { label: string; severity: 'success' | 'info' | 'warn' | 'danger' }
  > = {
    STARTED: { label: 'Запущено', severity: 'info' },
    RUNNING: { label: 'Выполняется', severity: 'warn' },
    SUCCEEDED: { label: 'Завершено', severity: 'success' },
    FAILED: { label: 'Ошибка', severity: 'danger' },
    CANCELLED: { label: 'Отменено', severity: 'warn' },
  };
  return values[status];
}

export function aiOperationCategoryLabel(category: AiOperationListItemDtoCategory): string {
  const values: Record<AiOperationListItemDtoCategory, string> = {
    CHAT: 'Чат',
    VOICE: 'Голос',
    SPEECH: 'Речь',
    MEMORY: 'Память',
    AI_REVIEW: 'AI-проверка',
    AI_ANALYSIS: 'AI-анализ',
    CMS_AGENT: 'AI-агент CMS',
    CASE_INTELLIGENCE: 'Анализ обращения',
    PROJECT_OVERHEAD: 'Системная AI-операция',
  };
  return values[category];
}

export function aiOperationTitleLabel(
  title: string,
  category: AiOperationListItemDtoCategory,
): string {
  const values: Record<string, string> = {
    'project ai analysis': 'Анализ проекта',
    'cms agent request': 'Запрос AI-агенту CMS',
    'user memory extraction': 'Извлечение фактов из диалога',
    'interactive assist response': 'Ответ AI-помощника',
    'case routing': 'Маршрутизация обращения',
    'case update': 'Обновление обращения',
  };
  return values[title.trim().toLowerCase()] || title.trim() || aiOperationCategoryLabel(category);
}

export function aiOperationSourceLabel(sourceKind: string): string {
  const values: Record<string, string> = {
    AI_ANALYSIS_RUN: 'Запуск анализа проекта',
    CONVERSATION_TURN: 'Ответ в диалоге',
    CMS_AGENT_REQUEST: 'Запрос к AI-агенту CMS',
    CMS_AGENT_CAPABILITY_EXECUTION: 'Действие AI-агента CMS',
    INTERACTIVE_ASSIST_RESPONSE: 'Ответ AI-помощника',
    USER_MEMORY_EXTRACTION: 'Обновление памяти пользователя',
    CASE_ROUTING: 'Маршрутизация обращения',
    CASE_UPDATE: 'Обновление обращения',
  };
  return values[sourceKind] ?? 'Системный запуск';
}

export function aiOperationDescriptionLabel(value: string): string {
  return value
    .replace(/bounded data access/gi, 'ограниченным доступом к данным')
    .replace(/read-only режиме/gi, 'режиме только для чтения')
    .replace(/read-only/gi, 'только для чтения')
    .replace(/background[- ]run/gi, 'фоновый запуск')
    .replace(/provider attempts?/gi, 'обращения к модели')
    .replace(/DB work units?/gi, 'единицы нагрузки на базу данных')
    .replace(/root intents?/gi, 'самостоятельные запуски');
}

export function aiOperationOutcomeLabel(
  code: string | null | undefined,
  status?: AiOperationListItemDtoStatus,
): string {
  const values: Record<string, string> = {
    CLARIFICATION_REQUIRED: 'Нужно уточнение',
    COMPLETED: 'Выполнено',
    SUCCESS: 'Выполнено',
    ERROR: 'Ошибка',
    PARTIAL: 'Частичный результат',
    NO_RESULT: 'Результат не получен',
    SUCCEEDED: 'Выполнено',
    FAILED: 'Завершено с ошибкой',
    CANCELLED: 'Отменено',
    RUNNING: 'Выполняется',
    STARTED: 'Запущено',
    TIMEOUT: 'Превышено время ожидания',
    RATE_LIMITED: 'Превышен лимит запросов',
    BUDGET_EXCEEDED: 'Недостаточно бюджета',
    ALLOWANCE_EXCEEDED: 'Исчерпан AI-лимит пользователя',
  };
  if (code) return values[code] ?? `Код результата: ${code}`;
  if (status) return values[status] ?? aiOperationStatusPresentation(status).label;
  return 'Результат не указан';
}

export function aiOperationChargedAccountLabel(
  account: AiOperationListItemDtoChargedAccount,
): string {
  const values: Record<AiOperationListItemDtoChargedAccount, string> = {
    END_USER_ALLOWANCE: 'AI-лимит пользователя',
    PROJECT_BUDGET: 'Бюджет проекта',
    PROJECT_OVERHEAD: 'Системные расходы проекта',
  };
  return values[account];
}

export function aiOperationActorLabel(actor: AiOperationActorDto): string {
  if (actor.displayName?.trim()) return actor.displayName.trim();
  if (actor.type === 'SYSTEM') return 'Система Retenive';
  if (actor.type === 'CMS_USER')
    return actor.id ? `Администратор ${actor.id}` : 'Администратор неизвестен';
  return actor.id ? `Пользователь ${actor.id}` : 'Пользователь неизвестен';
}

export function aiOperationCostLabel(value: string | null | undefined): string {
  if (value == null) return 'Стоимость неизвестна';
  const amount = Number(value);
  if (!Number.isFinite(amount)) return 'Стоимость неизвестна';
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 6,
  }).format(amount);
}

export function aiOperationDateLabel(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

export function compactIdentifier(value: string): string {
  return value.length > 18 ? `${value.slice(0, 8)}…${value.slice(-6)}` : value;
}
