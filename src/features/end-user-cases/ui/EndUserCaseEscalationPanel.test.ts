import { mount } from '@vue/test-utils';
import { describe, expect, it } from 'vitest';
import EndUserCaseEscalationPanel from './EndUserCaseEscalationPanel.vue';

const escalation = {
  id: 'escalation-1',
  caseId: 'case-1',
  occurrenceNumber: 2,
  version: 4,
  status: 'REQUESTED',
  source: 'END_USER_REQUEST',
  reasonCode: 'DEPOSIT_HELP',
  summary: 'Пользователь просит проверить депозит вручную.',
  requester: { type: 'END_USER', id: 'user-1' },
  requestedAt: '2026-07-26T10:00:00.000Z',
  claimant: null,
  claimedAt: null,
  closedBy: null,
  closeReason: null,
  closedAt: null,
  cancelledBy: null,
  cancellationReason: null,
  cancelledAt: null,
  notificationEventId: 'notification-1',
  createdAt: '2026-07-26T10:00:00.000Z',
  updatedAt: '2026-07-26T10:00:00.000Z',
};

const buttonStub = {
  props: ['label', 'disabled'],
  emits: ['click'],
  template: '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
};

describe('EndUserCaseEscalationPanel', () => {
  it('shows a requested occurrence and exposes only authorized queue actions', async () => {
    const wrapper = mount(EndUserCaseEscalationPanel, {
      props: {
        items: [escalation] as never,
        terminal: false,
        canAssign: true,
        canManage: false,
      },
      global: { stubs: { Button: buttonStub } },
    });

    expect(wrapper.text()).toContain('Ожидает специалиста');
    expect(wrapper.text()).toContain('Попросил пользователь');
    expect(wrapper.text()).toContain('Вопрос по депозиту');
    expect(wrapper.text()).toContain('Взять в работу');
    expect(wrapper.text()).not.toContain('Отменить запрос');

    await wrapper
      .findAll('button')
      .find((button) => button.text() === 'Взять в работу')!
      .trigger('click');
    expect(wrapper.emitted('action')?.[0]).toEqual(['CLAIM']);
  });

  it('lets the claimant manage its claimed occurrence without exposing raw enums', async () => {
    const closed = {
      ...escalation,
      id: 'escalation-old',
      occurrenceNumber: 1,
      status: 'CLOSED',
      closeReason: 'Проверка завершена',
      closedAt: '2026-07-25T10:00:00.000Z',
    };
    const claimed = {
      ...escalation,
      status: 'CLAIMED',
      claimant: { id: 'cms-1', displayName: 'Анна Специалист' },
      claimedAt: '2026-07-26T10:05:00.000Z',
    };
    const wrapper = mount(EndUserCaseEscalationPanel, {
      props: {
        items: [claimed, closed] as never,
        terminal: false,
        currentCmsUserId: 'cms-1',
        canAssign: false,
        canManage: false,
      },
      global: { stubs: { Button: buttonStub } },
    });

    expect(wrapper.text()).toContain('В работе у специалиста');
    expect(wrapper.text()).toContain('Анна Специалист');
    expect(wrapper.text()).toContain('Завершить помощь');
    expect(wrapper.text()).toContain('Вернуть в очередь');
    expect(wrapper.text()).not.toContain('Передать');
    expect(wrapper.text()).toContain('История эскалаций · 1');
    expect(wrapper.text()).toContain('Помощь завершена');
    expect(wrapper.text()).not.toContain('END_USER_REQUEST');
    expect(wrapper.text()).not.toContain('CLOSED');
  });

  it('matches backend release and close permissions for a non-claimant', () => {
    const claimed = {
      ...escalation,
      status: 'CLAIMED',
      claimant: { id: 'cms-1', displayName: 'Анна Специалист' },
      claimedAt: '2026-07-26T10:05:00.000Z',
    };
    const assigner = mount(EndUserCaseEscalationPanel, {
      props: {
        items: [claimed] as never,
        terminal: false,
        currentCmsUserId: 'cms-2',
        canAssign: true,
        canManage: false,
      },
      global: { stubs: { Button: buttonStub } },
    });
    const manager = mount(EndUserCaseEscalationPanel, {
      props: {
        items: [claimed] as never,
        terminal: false,
        currentCmsUserId: 'cms-2',
        canAssign: false,
        canManage: true,
      },
      global: { stubs: { Button: buttonStub } },
    });

    expect(assigner.text()).toContain('Вернуть в очередь');
    expect(assigner.text()).toContain('Передать');
    expect(assigner.text()).not.toContain('Завершить помощь');
    expect(manager.text()).toContain('Завершить помощь');
    expect(manager.text()).toContain('Отменить запрос');
    expect(manager.text()).not.toContain('Вернуть в очередь');
  });

  it('offers a new occurrence only for nonterminal Cases with escalation permission', () => {
    const allowed = mount(EndUserCaseEscalationPanel, {
      props: {
        items: [],
        terminal: false,
        canEscalate: true,
      },
      global: { stubs: { Button: buttonStub } },
    });
    const terminal = mount(EndUserCaseEscalationPanel, {
      props: {
        items: [],
        terminal: true,
        canEscalate: true,
      },
      global: { stubs: { Button: buttonStub } },
    });

    expect(allowed.text()).toContain('Позвать специалиста');
    expect(terminal.text()).not.toContain('Позвать специалиста');
  });
});
