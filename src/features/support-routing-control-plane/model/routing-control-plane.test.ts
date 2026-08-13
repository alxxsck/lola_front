import { describe, expect, it } from 'vitest';
import {
  emptyPolicyDraft,
  emptyQueueDraft,
  labelUnknown,
  normalizeRoutingResourceCode,
  routingResourceCodeError,
  routingQueueLabel,
  routingQueuePurpose,
  routingPolicyLabel,
} from './routing-control-plane';

describe('routing control plane domain', () => {
  it('normalizes an underscore in a routing identifier before it reaches the server', () => {
    expect(normalizeRoutingResourceCode(' call_admin ')).toBe('call-admin');
    expect(routingResourceCodeError('call_admin')).toBeNull();
  });

  it('explains identifiers that cannot satisfy the server format', () => {
    expect(routingResourceCodeError('срочная-поддержка')).toBe(
      'Используйте латинские буквы, цифры и дефис; первый символ — буква.',
    );
    expect(routingResourceCodeError('a')).toBe('Введите не меньше двух символов.');
  });

  it('keeps retry attempts inside the backend contract', () => {
    const draft = emptyPolicyDraft();
    expect(draft.retry.maxAttempts).toBeGreaterThanOrEqual(1);
    expect(draft.retry.maxAttempts).toBeLessThanOrEqual(5);
  });

  it('creates a closed guided queue predicate instead of raw JSON', () => {
    expect(emptyQueueDraft().filter).toEqual({
      schemaVersion: 1,
      predicate: {
        kind: 'AND',
        children: [{ kind: 'ENUM_IN', field: 'STATUS', values: ['OPEN'] }],
      },
    });
  });

  it('renders future enum values without claiming success', () => {
    expect(labelUnknown('FUTURE_STATE', { READY: 'Готово' })).toBe(
      'Неизвестное состояние · FUTURE_STATE',
    );
  });

  it('renders an empty policy catalog without crashing the overview', () => {
    expect(routingPolicyLabel(undefined)).toBe('Не настроена');
    expect(routingPolicyLabel({ code: 'balanced' })).toBe('Сбалансированная');
  });

  it('explains platform queues with human labels instead of technical slugs', () => {
    const queue = {
      code: 'waiting-admin',
      name: 'waiting-admin',
      kind: 'SYSTEM' as const,
      description: null,
    };
    expect(routingQueueLabel(queue)).toBe('Ожидают администратора');
    expect(routingQueuePurpose(queue)).toContain('решение администратора');
  });

  it('preserves a project queue name and description', () => {
    const queue = {
      code: 'vip',
      name: 'VIP-клиенты',
      kind: 'PROJECT' as const,
      description: 'Персональное обслуживание',
    };
    expect(routingQueueLabel(queue)).toBe('VIP-клиенты');
    expect(routingQueuePurpose(queue)).toBe('Персональное обслуживание');
  });
});
