import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  SupportInternalNote,
  SupportInternalNoteRevision,
  SupportInternalNotesPage,
  SupportInternalNotesSource,
} from '@/features/support-internal-notes/api/support-internal-notes-source';
import { createSupportInternalNotesController } from './use-support-internal-notes';

function note(id = 'note-1'): SupportInternalNote {
  return {
    id,
    caseId: 'case-1',
    actionEtag: '"sin1.opaque"',
    body: 'Проверить подтверждение оплаты',
    lifecycle: 'ACTIVE',
    currentRevisionNumber: 1,
    creatorName: 'Алина',
    createdAt: '2026-08-06T10:00:00.000Z',
    updatedAt: '2026-08-06T10:00:00.000Z',
    tombstonedAt: null,
    hasUnavailableReferences: false,
  };
}

function revision(id = 'revision-1'): SupportInternalNoteRevision {
  return {
    id,
    noteId: 'note-1',
    revisionNumber: 1,
    body: 'Проверить подтверждение оплаты',
    reasonCode: 'INITIAL',
    authorName: 'Алина',
    createdAt: '2026-08-06T10:00:00.000Z',
  };
}

function source(overrides: Partial<SupportInternalNotesSource> = {}): SupportInternalNotesSource {
  return {
    list: vi.fn().mockResolvedValue({ items: [note()], nextCursor: null }),
    create: vi.fn().mockResolvedValue(note()),
    correct: vi.fn().mockResolvedValue(note()),
    revisions: vi.fn().mockResolvedValue({ items: [revision()], nextCursor: null }),
    tombstone: vi.fn().mockResolvedValue({ ...note(), body: null, lifecycle: 'TOMBSTONED' }),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe('support internal notes controller', () => {
  it('does not request or retain notes without the exact read grant', async () => {
    const list = vi.fn();
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => false,
        canReadHistory: () => false,
      },
      source({ list }),
    );

    await controller.load();

    expect(list).not.toHaveBeenCalled();
    expect(controller.notes.value).toEqual([]);
  });

  it('creates an internal note only with the distinct write grant and keeps its command idempotent', async () => {
    const create = vi
      .fn()
      .mockRejectedValueOnce(new Error('network timeout'))
      .mockResolvedValueOnce(note('note-2'));
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => true,
        canReadHistory: () => false,
        canWrite: () => true,
      },
      source({ create }),
    );

    const first = await controller.create('Проверить реквизиты', 'conversation-1');
    const second = await controller.create('Проверить реквизиты', 'conversation-1');

    expect(first).toBe(false);
    expect(second).toBe(true);
    expect(create).toHaveBeenCalledTimes(2);
    expect(create).toHaveBeenNthCalledWith(1, 'project-1', 'case-1', {
      body: 'Проверить реквизиты',
      conversationId: 'conversation-1',
      idempotencyKey: expect.any(String),
    });
    expect(create.mock.calls[1]?.[2]?.idempotencyKey).toBe(
      create.mock.calls[0]?.[2]?.idempotencyKey,
    );
    expect(controller.notes.value.map((item) => item.id)).toEqual(['note-2']);
  });

  it('consumes an edited macro-note draft without duplicating its body', async () => {
    const create = vi.fn().mockResolvedValue(note('note-macro'));
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => true,
        canReadHistory: () => false,
        canWrite: () => true,
      },
      source({ create }),
    );

    expect(
      await controller.create(
        'Отредактированная заметка',
        'conversation-1',
        undefined,
        'macro-note-draft-1',
      ),
    ).toBe(true);
    expect(create).toHaveBeenCalledWith('project-1', 'case-1', {
      conversationId: 'conversation-1',
      macroDraftId: 'macro-note-draft-1',
      idempotencyKey: expect.any(String),
    });
  });

  it('keeps the note surface authorized when only a Macro draft becomes stale', async () => {
    const onForbidden = vi.fn();
    const onMacroDraftRejected = vi.fn();
    const create = vi
      .fn()
      .mockRejectedValue(
        new ApiError(409, 'stale macro', undefined, undefined, 'SUPPORT_MACRO_DRAFT_SOURCE_STALE'),
      );
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => true,
        canReadHistory: () => false,
        canWrite: () => true,
        onForbidden,
        onMacroDraftRejected,
      },
      source({ create }),
    );

    expect(
      await controller.create('Текст заметки', 'conversation-1', undefined, 'macro-draft-1'),
    ).toBe(false);
    expect(onMacroDraftRejected).toHaveBeenCalledOnce();
    expect(onForbidden).not.toHaveBeenCalled();
    expect(controller.mutationError.value).toContain('Текст заметки сохранён');
  });

  it('allows an attachment-only internal note with the exact Case draft', async () => {
    const create = vi.fn().mockResolvedValue(note('note-attachment'));
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => true,
        canReadHistory: () => false,
        canWrite: () => true,
      },
      source({ create }),
    );

    expect(
      await controller.create('', 'conversation-1', {
        ids: ['attachment-1'],
        draftKey: 'case-draft-1',
      }),
    ).toBe(true);
    expect(create).toHaveBeenCalledWith('project-1', 'case-1', {
      attachmentIds: ['attachment-1'],
      attachmentDraftKey: 'case-draft-1',
      conversationId: 'conversation-1',
      idempotencyKey: expect.any(String),
    });
  });

  it('rejects oversized UTF-8 bodies and reason values outside the closed catalogs', async () => {
    const create = vi.fn();
    const correct = vi.fn();
    const tombstone = vi.fn();
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => true,
        canReadHistory: () => false,
        canWrite: () => true,
        canCorrect: () => true,
        canRedact: () => true,
      },
      source({ create, correct, tombstone }),
    );

    await controller.load();

    expect(await controller.create('я'.repeat(10_241))).toBe(false);
    expect(await controller.correct('note-1', 'Исправлено', 'FREE_TEXT')).toBe(false);
    expect(await controller.tombstone('note-1', 'CONTENT_REMOVAL')).toBe(false);
    expect(create).not.toHaveBeenCalled();
    expect(correct).not.toHaveBeenCalled();
    expect(tombstone).not.toHaveBeenCalled();
  });

  it('uses the distinct correction grant without requiring note creation authority', async () => {
    const correct = vi.fn().mockResolvedValue(note());
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => true,
        canReadHistory: () => false,
        canWrite: () => false,
        canCorrect: () => true,
      },
      source({ correct }),
    );

    await controller.load();

    expect(await controller.correct('note-1', 'Уточнённый контекст', 'CLARIFICATION')).toBe(true);
    expect(correct).toHaveBeenCalledOnce();
  });

  it('uses only the current Case scope and merges a cursor page', async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [note()], nextCursor: 'notes-2' })
      .mockResolvedValueOnce({ items: [note('note-2')], nextCursor: null });
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => true,
        canReadHistory: () => true,
      },
      source({ list }),
    );

    await controller.load();
    await controller.load(controller.nextCursor.value ?? undefined);

    expect(list).toHaveBeenNthCalledWith(1, 'project-1', 'case-1', {}, expect.any(AbortSignal));
    expect(list).toHaveBeenNthCalledWith(
      2,
      'project-1',
      'case-1',
      { cursor: 'notes-2' },
      expect.any(AbortSignal),
    );
    expect(controller.notes.value.map((item) => item.id)).toEqual(['note-1', 'note-2']);
  });

  it('does not commit note text after the selected Case changes', async () => {
    let caseId = 'case-1';
    const pending = deferred<SupportInternalNotesPage<SupportInternalNote>>();
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => caseId,
        canRead: () => true,
        canReadHistory: () => true,
      },
      source({ list: vi.fn().mockReturnValue(pending.promise) }),
    );

    const load = controller.load();
    caseId = 'case-2';
    pending.resolve({ items: [note()], nextCursor: null });
    await load;

    expect(controller.notes.value).toEqual([]);
    expect(controller.error.value).toBe('');
  });

  it('purges note and history text then asks for authority recovery after a concealed denial', async () => {
    const onForbidden = vi.fn();
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => true,
        canReadHistory: () => true,
        onForbidden,
      },
      source({
        list: vi
          .fn()
          .mockResolvedValueOnce({ items: [note()], nextCursor: null })
          .mockRejectedValueOnce(new ApiError(403, 'hidden')),
      }),
    );

    await controller.load();
    expect(controller.notes.value).toHaveLength(1);
    await controller.reconcile();

    expect(controller.notes.value).toEqual([]);
    expect(controller.history.value).toEqual([]);
    expect(controller.error.value).toBe('');
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it('reconciles an OCC conflict immediately without treating an item 404 as Case authority loss', async () => {
    const onForbidden = vi.fn();
    const onReconcileRequired = vi.fn();
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [note()], nextCursor: null })
      .mockResolvedValueOnce({ items: [], nextCursor: null });
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => true,
        canReadHistory: () => true,
        canCorrect: () => true,
        onForbidden,
        onReconcileRequired,
      },
      source({
        list,
        correct: vi.fn().mockRejectedValue(new ApiError(404, 'hidden note')),
      }),
    );

    await controller.load();
    expect(await controller.correct('note-1', 'Сохранённый черновик', 'CLARIFICATION')).toBe(false);

    expect(onForbidden).not.toHaveBeenCalled();
    expect(onReconcileRequired).toHaveBeenCalledOnce();
    expect(list).toHaveBeenCalledTimes(2);
    expect(controller.notes.value).toEqual([]);
    expect(controller.mutationError.value).toContain('Состояние обновлено');
    expect(controller.correctingNoteId.value).toBeNull();
  });

  it('releases the shared composer after a create conflict reconcile', async () => {
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => true,
        canReadHistory: () => false,
        canWrite: () => true,
      },
      source({
        create: vi.fn().mockRejectedValue(new ApiError(409, 'conflict')),
        list: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
      }),
    );

    expect(await controller.create('Сохранённый черновик')).toBe(false);

    expect(controller.creating.value).toBe(false);
    expect(controller.mutationError.value).toContain('Состояние обновлено');
  });

  it('removes a tombstoned body before the authoritative 410 reconcile completes', async () => {
    const refresh = deferred<SupportInternalNotesPage<SupportInternalNote>>();
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [note()], nextCursor: null })
      .mockReturnValueOnce(refresh.promise);
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => true,
        canReadHistory: () => true,
        canRedact: () => true,
      },
      source({
        list,
        tombstone: vi.fn().mockRejectedValue(new ApiError(410, 'gone')),
      }),
    );

    await controller.load();
    const mutation = controller.tombstone('note-1', 'PRIVACY_REQUEST');
    await vi.waitFor(() => expect(controller.notes.value).toEqual([]));
    refresh.resolve({ items: [], nextCursor: null });
    await mutation;

    expect(list).toHaveBeenCalledTimes(2);
    expect(controller.tombstoningNoteId.value).toBeNull();
  });

  it('requires history authority and discards history when that grant changes in flight', async () => {
    let canReadHistory = true;
    const pending = deferred<SupportInternalNotesPage<SupportInternalNoteRevision>>();
    const revisions = vi.fn().mockReturnValue(pending.promise);
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => true,
        canReadHistory: () => canReadHistory,
      },
      source({ revisions }),
    );

    await controller.load();
    const loadHistory = controller.openHistory('note-1');
    canReadHistory = false;
    pending.resolve({ items: [revision()], nextCursor: null });
    await loadHistory;

    expect(revisions).toHaveBeenCalledWith(
      'project-1',
      'case-1',
      'note-1',
      {},
      expect.any(AbortSignal),
    );
    expect(controller.history.value).toEqual([]);
  });

  it('does not start a history request without the distinct history permission', async () => {
    const revisions = vi.fn();
    const controller = createSupportInternalNotesController(
      {
        projectId: () => 'project-1',
        caseId: () => 'case-1',
        canRead: () => true,
        canReadHistory: () => false,
      },
      source({ revisions }),
    );

    await controller.load();
    await controller.openHistory('note-1');

    expect(revisions).not.toHaveBeenCalled();
    expect(controller.historyNoteId.value).toBeNull();
  });
});
