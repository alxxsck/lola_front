import type {
  SupportCaseNotificationPolicyInputDto,
  SupportCaseNotificationPolicyRevisionResponseDto,
} from '@/shared/api/generated/models';

export type SupportCaseNotificationPolicyForm = SupportCaseNotificationPolicyInputDto;

export interface PolicyFormIssue {
  path: string;
  message: string;
}

export function createDefaultNotificationPolicy(): SupportCaseNotificationPolicyForm {
  return {
    mode: 'IMMEDIATE',
    occurrences: ['CREATED'],
    conversationClasses: ['PRODUCT_PROBLEM', 'PRODUCT_INQUIRY'],
    topicCodes: [],
    minimumPriority: 'NORMAL',
    recipientRule: 'ALL_ELIGIBLE_SUBSCRIBERS',
    teamIds: [],
    channels: ['BROWSER_PUSH'],
    effectiveFrom: null,
    effectiveUntil: null,
    digestWindowMinutes: null,
    digestMaxItems: null,
    reason: 'Настройка уведомлений о новых обращениях',
  };
}

export function policyFromRevision(
  revision: SupportCaseNotificationPolicyRevisionResponseDto,
): SupportCaseNotificationPolicyForm {
  return {
    mode: revision.mode,
    occurrences: [...revision.occurrences],
    conversationClasses: [...revision.conversationClasses],
    topicCodes: [...revision.topicCodes],
    minimumPriority: revision.minimumPriority,
    recipientRule: revision.recipientRule,
    teamIds: [...revision.teamIds],
    channels: [...revision.channels],
    effectiveFrom: revision.effectiveFrom ?? null,
    effectiveUntil: revision.effectiveUntil ?? null,
    digestWindowMinutes: revision.digestWindowMinutes ?? null,
    digestMaxItems: revision.digestMaxItems ?? null,
    reason: 'Обновление политики уведомлений',
  };
}

export function clonePolicyForm(
  form: SupportCaseNotificationPolicyForm,
): SupportCaseNotificationPolicyForm {
  // Vue wraps the editor value in a Proxy, while the DTO contains JSON-only data.
  return JSON.parse(JSON.stringify(form)) as SupportCaseNotificationPolicyForm;
}

export function policyFingerprint(form: SupportCaseNotificationPolicyForm): string {
  const definition: Partial<SupportCaseNotificationPolicyForm> = clonePolicyForm(form);
  delete definition.reason;
  return JSON.stringify(definition);
}

export function revisionFingerprint(
  revision: SupportCaseNotificationPolicyRevisionResponseDto,
): string {
  return policyFingerprint(policyFromRevision(revision));
}

export function validatePolicyForm(
  form: SupportCaseNotificationPolicyForm,
  allowedTopicCodes: readonly string[],
): PolicyFormIssue[] {
  const issues: PolicyFormIssue[] = [];
  if (form.reason.trim().length < 3 || form.reason.trim().length > 500) {
    issues.push({
      path: 'reason',
      message: 'Укажите причину длиной от 3 до 500 символов.',
    });
  }
  if (form.mode === 'OFF') {
    if (
      form.topicCodes.length ||
      form.teamIds.length ||
      form.effectiveFrom ||
      form.effectiveUntil ||
      form.digestWindowMinutes ||
      form.digestMaxItems
    ) {
      issues.push({
        path: 'mode',
        message: 'Для выключенной политики не задаются темы, команды, срок и параметры сводки.',
      });
    }
    return issues;
  }
  if (!form.occurrences.length) {
    issues.push({
      path: 'occurrences',
      message: 'Выберите создание, повторное открытие или оба события.',
    });
  }
  if (!form.conversationClasses.length) {
    issues.push({
      path: 'conversationClasses',
      message: 'Выберите хотя бы один тип обращения.',
    });
  }
  if (form.topicCodes.some((code) => !allowedTopicCodes.includes(code))) {
    issues.push({
      path: 'topicCodes',
      message: 'Одна из выбранных тем больше недоступна в проекте.',
    });
  }
  if (form.recipientRule === 'TEAM_SUBSCRIBERS' && !form.teamIds.length) {
    issues.push({
      path: 'teamIds',
      message: 'Выберите хотя бы одну команду получателей.',
    });
  }
  if (form.effectiveFrom && form.effectiveUntil) {
    const from = Date.parse(form.effectiveFrom);
    const until = Date.parse(form.effectiveUntil);
    if (!Number.isFinite(from) || !Number.isFinite(until) || until <= from) {
      issues.push({
        path: 'effectiveUntil',
        message: 'Дата окончания должна быть позже даты начала.',
      });
    }
  }
  if (form.mode === 'DIGEST') {
    if (
      form.digestWindowMinutes == null ||
      form.digestWindowMinutes < 5 ||
      form.digestWindowMinutes > 1440
    ) {
      issues.push({
        path: 'digestWindowMinutes',
        message: 'Интервал сводки — от 5 минут до 24 часов.',
      });
    }
    if (form.digestMaxItems == null || form.digestMaxItems < 1 || form.digestMaxItems > 100) {
      issues.push({
        path: 'digestMaxItems',
        message: 'В одной сводке может быть от 1 до 100 обращений.',
      });
    }
  }
  return issues;
}

export function policyStatusLabel(status: string): string {
  return (
    (
      {
        OFF: 'Выключена',
        SCHEDULED: 'Запланирована',
        ACTIVE: 'Работает',
        EXPIRED: 'Срок истёк',
      } as Record<string, string>
    )[status] ?? 'Состояние неизвестно'
  );
}

export function policyModeLabel(mode: string): string {
  return (
    ({ OFF: 'Не отправлять', IMMEDIATE: 'Сразу', DIGEST: 'Сводкой' } as Record<string, string>)[
      mode
    ] ?? 'Неизвестный режим'
  );
}
