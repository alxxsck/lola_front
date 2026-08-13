import type {
  EndUserCaseEscalationResponseDto,
  EndUserCaseEscalationResponseDtoSource,
  EndUserCaseEscalationResponseDtoStatus,
} from '@/shared/api/generated/models';

export type EndUserCaseEscalationAction =
  'REQUEST' | 'CLAIM' | 'RELEASE' | 'TRANSFER' | 'CLOSE' | 'CANCEL';

export interface EndUserCaseEscalationDialogScope {
  projectId: string;
  caseId: string;
  caseVersion: number;
  escalationId: string | null;
  escalationVersion: number | null;
}

export const isSameEndUserCaseEscalationScope = (
  expected: EndUserCaseEscalationDialogScope | null,
  current: EndUserCaseEscalationDialogScope | null,
): boolean =>
  expected !== null &&
  current !== null &&
  expected.projectId === current.projectId &&
  expected.caseId === current.caseId &&
  expected.caseVersion === current.caseVersion &&
  expected.escalationId === current.escalationId &&
  expected.escalationVersion === current.escalationVersion;

export const activeEndUserCaseEscalation = (
  items: readonly EndUserCaseEscalationResponseDto[],
): EndUserCaseEscalationResponseDto | null =>
  items.find(({ status }) => status === 'REQUESTED' || status === 'CLAIMED') ?? null;

export const endUserCaseEscalationStatusLabel = (
  value: EndUserCaseEscalationResponseDtoStatus,
): string =>
  ({
    REQUESTED: 'Ожидает специалиста',
    CLAIMED: 'В работе у специалиста',
    CLOSED: 'Помощь завершена',
    CANCELLED: 'Запрос отменён',
  })[value] ?? value;

export const endUserCaseEscalationSourceLabel = (
  value: EndUserCaseEscalationResponseDtoSource,
): string =>
  ({
    END_USER_REQUEST: 'Попросил пользователь',
    RETENIVE_DECISION: 'Решение Retenive',
    CMS_USER: 'Запросил администратор',
    SYSTEM_POLICY: 'Правило проекта',
  })[value] ?? value;

export const endUserCaseEscalationReasonLabel = (value: string): string =>
  ({
    SUPPORT_REQUEST: 'Нужна помощь специалиста',
    DEPOSIT_HELP: 'Вопрос по депозиту',
    ACCOUNT_HELP: 'Вопрос по аккаунту',
    OTHER: 'Другая причина',
  })[value] ?? value.replaceAll('_', ' ').toLocaleLowerCase('ru');
