import { afterEach, describe, expect, it, vi } from 'vitest';
import { createSupportConversationCollaborationController } from './use-support-conversation-collaboration';
import { ApiError } from '@/shared/api/http/api-error';

function fixture(overrides: Record<string, unknown> = {}) {
  return {
    conversationId: 'conversation-1',
    generation: '7',
    observedAt: '2026-08-08T10:00:00.000Z',
    currentMessageOrdinal: 12,
    viewers: [],
    typers: [],
    collision: { state: 'CLEAR' as const, observedMessageOrdinal: 12 },
    ...overrides,
  };
}

describe('support conversation collaboration controller', () => {
  afterEach(() => vi.useRealTimers());

  it('purges expired viewers and typers and ignores an old typing stop', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-08T10:00:00.000Z');
    const source = { read: vi.fn().mockResolvedValue(fixture()) };
    const controller = createSupportConversationCollaborationController(source, {
      actorId: () => 'operator-1',
    });
    await controller.select('project-1', 'conversation-1');

    controller.applyTypingHint({
      projectId: 'project-1',
      conversationId: 'conversation-1',
      generation: '2',
      watchGeneration: '8',
      isTyping: true,
      expiresAt: '2026-08-08T10:00:05.000Z',
      actor: {
        cmsUserId: 'operator-2',
        displayName: 'Анна',
        generation: '8',
        expiresAt: '2026-08-08T10:01:00.000Z',
      },
    });
    controller.applyTypingHint({
      projectId: 'project-1',
      conversationId: 'conversation-1',
      generation: '9',
      watchGeneration: '7',
      isTyping: false,
      expiresAt: '2026-08-08T10:00:04.000Z',
      actor: {
        cmsUserId: 'operator-2',
        displayName: 'Анна',
        generation: '7',
        expiresAt: '2026-08-08T10:01:00.000Z',
      },
    });

    expect(controller.typers.value.map((item) => item.displayName)).toEqual(['Анна']);
    await vi.advanceTimersByTimeAsync(5_001);
    expect(controller.typers.value).toEqual([]);
  });

  it('keeps a stop tombstone so an older start cannot revive typing', async () => {
    const source = { read: vi.fn().mockResolvedValue(fixture()) };
    const controller = createSupportConversationCollaborationController(source, {
      actorId: () => 'operator-1',
    });
    await controller.select('project-1', 'conversation-1');
    const hint = (generation: string, isTyping: boolean) => ({
      projectId: 'project-1',
      conversationId: 'conversation-1',
      generation,
      watchGeneration: '8',
      isTyping,
      expiresAt: '2099-08-08T10:00:05.000Z',
      actor: {
        cmsUserId: 'operator-2',
        displayName: 'Анна',
        generation: '8',
        expiresAt: '2099-08-08T10:01:00.000Z',
      },
    });
    controller.applyTypingHint(hint('9', false));
    controller.applyTypingHint(hint('8', true));
    expect(controller.typers.value).toEqual([]);
    controller.reset();
  });

  it('keeps the draft collision baseline stable and purges on revoke', async () => {
    const source = { read: vi.fn().mockResolvedValue(fixture()) };
    const controller = createSupportConversationCollaborationController(source, {
      actorId: () => 'operator-1',
    });
    await controller.select('project-1', 'conversation-1');
    controller.setDraftActive(true, 12);
    controller.setDraftActive(true, 15);
    await controller.reconcile();
    expect(source.read).toHaveBeenLastCalledWith(
      'project-1',
      'conversation-1',
      12,
      expect.any(AbortSignal),
    );

    controller.revoke('project-1', 'conversation-1');
    expect(controller.viewers.value).toEqual([]);
    expect(controller.typers.value).toEqual([]);
    expect(controller.collision.value.state).toBe('NOT_ARMED');
  });

  it('does not let an older viewers snapshot revive stale presence', async () => {
    vi.useFakeTimers();
    vi.setSystemTime('2026-08-08T10:00:00.000Z');
    const source = { read: vi.fn().mockResolvedValue(fixture()) };
    const controller = createSupportConversationCollaborationController(source, {
      actorId: () => 'operator-1',
    });
    await controller.select('project-1', 'conversation-1');
    const anna = {
      cmsUserId: 'operator-2',
      displayName: 'Анна',
      generation: '9',
      expiresAt: '2026-08-08T10:01:00.000Z',
    };

    controller.applyViewers('project-1', 'conversation-1', '9', [anna]);
    controller.applyViewers('project-1', 'conversation-1', '8', []);

    expect(controller.viewers.value).toEqual([anna]);
  });

  it('does not let a stale REST response overwrite a newer event', async () => {
    let release!: (value: ReturnType<typeof fixture>) => void;
    const pending = new Promise<ReturnType<typeof fixture>>((resolve) => {
      release = resolve;
    });
    const source = {
      read: vi.fn().mockResolvedValueOnce(fixture()).mockReturnValueOnce(pending),
    };
    const controller = createSupportConversationCollaborationController(source, {
      actorId: () => 'operator-1',
    });
    await controller.select('project-1', 'conversation-1');
    controller.setDraftActive(true, 12);
    const reconciliation = controller.reconcile();
    controller.applyViewers('project-1', 'conversation-1', '9', [
      {
        cmsUserId: 'operator-2',
        displayName: 'Анна',
        generation: '9',
        expiresAt: '2099-08-08T10:01:00.000Z',
      },
    ]);
    release(
      fixture({
        generation: '8',
        viewers: [],
        collision: {
          state: 'OTHER_OPERATOR_REPLIED',
          observedMessageOrdinal: 12,
          messageId: 'message-13',
          messageOrdinal: 13,
          cmsUserId: 'operator-3',
          createdAt: '2026-08-08T10:00:01.000Z',
        },
      }),
    );
    await reconciliation;
    expect(controller.viewers.value.map((item) => item.displayName)).toEqual(['Анна']);
    expect(controller.collision.value.state).toBe('OTHER_OPERATOR_REPLIED');
    controller.reset();
  });

  it('purges identities immediately when authoritative access is revoked', async () => {
    const onAccessRevoked = vi.fn();
    const source = {
      read: vi
        .fn()
        .mockResolvedValueOnce(
          fixture({
            viewers: [
              {
                cmsUserId: 'operator-2',
                displayName: 'Анна',
                generation: '7',
                expiresAt: '2099-08-08T10:01:00.000Z',
              },
            ],
          }),
        )
        .mockRejectedValueOnce(new ApiError(403, 'Forbidden')),
    };
    const controller = createSupportConversationCollaborationController(source, {
      actorId: () => 'operator-1',
      onAccessRevoked,
    });
    await controller.select('project-1', 'conversation-1');
    await controller.reconcile();
    expect(controller.viewers.value).toEqual([]);
    expect(controller.typers.value).toEqual([]);
    expect(onAccessRevoked).toHaveBeenCalledTimes(1);
    controller.applyViewers('project-1', 'conversation-1', '8', [
      {
        cmsUserId: 'operator-3',
        displayName: 'Иван',
        generation: '8',
        expiresAt: '2099-08-08T10:01:00.000Z',
      },
    ]);
    controller.applyTypingHint({
      projectId: 'project-1',
      conversationId: 'conversation-1',
      generation: '9',
      watchGeneration: '1',
      isTyping: true,
      expiresAt: '2099-08-08T10:00:05.000Z',
      actor: {
        cmsUserId: 'operator-3',
        displayName: 'Иван',
        generation: '8',
        expiresAt: '2099-08-08T10:01:00.000Z',
      },
    });
    expect(controller.viewers.value).toEqual([]);
    expect(controller.typers.value).toEqual([]);
  });
});
