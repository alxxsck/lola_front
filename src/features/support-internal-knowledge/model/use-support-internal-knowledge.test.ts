import { describe, expect, it, vi } from 'vitest';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  SupportKnowledgeCitationDraftResponseDto,
  SupportKnowledgeSearchItemResponseDto,
} from '@/shared/api/generated/models';
import type {
  SupportInternalKnowledgeSource,
  SupportKnowledgeScope,
  SupportKnowledgeTextDocument,
} from '../api/support-internal-knowledge-source';
import { createSupportInternalKnowledgeController } from './use-support-internal-knowledge';

const item: SupportKnowledgeSearchItemResponseDto = {
  documentId: 'document-1',
  revisionId: 'revision-3',
  revisionNumber: 3,
  sourceType: 'TEXT' as const,
  title: 'Проверка депозита',
  language: 'ru',
  publishedAt: '2026-08-09T10:00:00.000Z',
  snippet: 'Проверьте статус операции.',
  allowedActions: ['OPEN', 'INSERT_QUOTE', 'INSERT_LINK'],
};

function setup() {
  let scope: SupportKnowledgeScope | null = {
    projectId: 'project-1',
    caseId: 'case-1',
    conversationId: 'conversation-1',
  };
  let allowed = true;
  let canInsert = true;
  const onInsert = vi.fn();
  const onForbidden = vi.fn();
  const source: SupportInternalKnowledgeSource = {
    search: vi.fn().mockResolvedValue({
      items: [item],
      nextCursor: null,
      freshness: {
        state: 'CURRENT',
        catalogGeneration: 4,
        evaluatedAt: '2026-08-09T10:00:00.000Z',
      },
    }),
    open: vi.fn().mockResolvedValue({
      ...item,
      sourceType: 'TEXT',
      allowedActions: ['INSERT_QUOTE', 'INSERT_LINK', 'REPORT_PROBLEM'],
      contentText: 'Проверьте статус операции.',
      freshness: {
        state: 'CURRENT',
        catalogGeneration: 4,
        evaluatedAt: '2026-08-09T10:00:00.000Z',
      },
    }),
    createCitation: vi.fn().mockResolvedValue({
      id: 'citation-1',
      documentId: item.documentId,
      revisionId: item.revisionId,
      revisionNumber: 3,
      mode: 'QUOTE',
      state: 'READY',
      version: 1,
      text: 'Проверьте статус операции.',
      expiresAt: '2026-08-10T10:00:00.000Z',
      actionEtag: '"citation-1"',
    }),
    updateCitation: vi.fn().mockImplementation(async (_scope, draft, text) => ({
      ...draft,
      text,
      version: draft.version + 1,
    })),
    download: vi.fn(),
  };
  const controller = createSupportInternalKnowledgeController(
    {
      scope: () => scope,
      allowed: () => allowed,
      canInsert: () => canInsert,
      onInsert,
      onForbidden,
    },
    source,
  );
  return {
    controller,
    source,
    onInsert,
    onForbidden,
    setScope: (next: SupportKnowledgeScope | null) => {
      scope = next;
    },
    deny: () => {
      allowed = false;
    },
    denyInsert: () => {
      canInsert = false;
    },
  };
}

describe('Support Internal Knowledge controller', () => {
  it('searches and opens the exact immutable revision', async () => {
    const { controller, source } = setup();
    controller.query.value = 'депозит';
    await controller.search();
    await controller.open(controller.items.value[0]!);
    expect(source.open).toHaveBeenCalledWith(
      expect.objectContaining({ caseId: 'case-1' }),
      expect.objectContaining({ documentId: 'document-1', revisionId: 'revision-3' }),
    );
    expect(controller.selected.value?.contentText).toContain('статус');
  });

  it('creates an editable citation and pins the final text before send', async () => {
    const { controller, source, onInsert } = setup();
    await controller.insert(item, 'QUOTE', 'Проверьте статус операции.');
    expect(onInsert).toHaveBeenCalledWith('Проверьте статус операции.');
    await expect(
      controller.prepareForSend('Ответ оператора\n\nПроверьте статус операции.'),
    ).resolves.toBe('citation-1');
    expect(source.updateCitation).toHaveBeenCalledWith(
      expect.objectContaining({ conversationId: 'conversation-1' }),
      expect.objectContaining({ id: 'citation-1', version: 1 }),
      'Ответ оператора\n\nПроверьте статус операции.',
    );
  });

  it('does not create a citation when reply authority is absent', async () => {
    const { controller, source, denyInsert } = setup();
    denyInsert();
    await controller.insert(item, 'QUOTE', 'Проверьте статус операции.');
    expect(source.createCitation).not.toHaveBeenCalled();
  });

  it('does not attach a second source over an active citation', async () => {
    const { controller, source } = setup();
    await controller.insert(item, 'QUOTE', 'Проверьте статус операции.');
    await controller.insert(item, 'LINK');
    expect(source.createCitation).toHaveBeenCalledTimes(1);
  });

  it('does not restore protected text after an in-flight insert is discarded', async () => {
    const { controller, source, onInsert } = setup();
    let resolve!: (value: SupportKnowledgeCitationDraftResponseDto) => void;
    vi.mocked(source.createCitation).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    const pending = controller.insert(item, 'QUOTE', 'Проверьте статус операции.');
    controller.accepted();
    resolve({
      id: 'citation-late',
      documentId: item.documentId,
      revisionId: item.revisionId,
      revisionNumber: item.revisionNumber,
      mode: 'QUOTE',
      state: 'READY',
      version: 1,
      text: 'Проверьте статус операции.',
      expiresAt: '2026-08-10T10:00:00.000Z',
      actionEtag: '"citation-late"',
    });
    await pending;

    expect(controller.activeCitation.value).toBeNull();
    expect(controller.inserting.value).toBe(false);
    expect(onInsert).not.toHaveBeenCalled();
  });

  it('fails closed when citation edit changes immutable identity', async () => {
    const { controller, source } = setup();
    await controller.insert(item, 'QUOTE', 'Проверьте статус операции.');
    vi.mocked(source.updateCitation).mockResolvedValueOnce({
      ...controller.activeCitation.value!,
      revisionId: 'different-revision',
      text: 'Отредактированный ответ',
      version: 2,
    });

    await expect(controller.prepareForSend('Отредактированный ответ')).resolves.toBeUndefined();
    expect(controller.activeCitation.value).toBeNull();
    expect(controller.recoveryRequired.value).toBe(true);
    expect(controller.preparing.value).toBe(false);
  });

  it('keeps the stale source visible until the operator discards its text', async () => {
    const { controller } = setup();
    await controller.insert(item, 'QUOTE', 'Проверьте статус операции.');

    controller.requireRecovery();

    expect(controller.activeCitation.value?.id).toBe('citation-1');
    expect(controller.recoveryRequired.value).toBe(true);
    expect(controller.canInsert.value).toBe(false);
    expect(controller.error.value).toContain('вместе с производным текстом');

    controller.accepted();
    expect(controller.activeCitation.value).toBeNull();
    expect(controller.recoveryRequired.value).toBe(false);
  });

  it('purges the protected projection on concealed access loss', async () => {
    const { controller, source, onForbidden } = setup();
    controller.query.value = 'депозит';
    await controller.search();
    vi.mocked(source.open).mockRejectedValueOnce(
      new ApiError(404, 'NOT_FOUND_OR_FORBIDDEN', 'hidden'),
    );
    await controller.open(item);
    expect(controller.items.value).toEqual([]);
    expect(controller.activeCitation.value).toBeNull();
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it('fences a late response from the previous Case', async () => {
    const { controller, source, setScope } = setup();
    let resolve!: (value: Awaited<ReturnType<SupportInternalKnowledgeSource['search']>>) => void;
    vi.mocked(source.search).mockReturnValueOnce(
      new Promise((done) => {
        resolve = done;
      }),
    );
    controller.query.value = 'депозит';
    const pending = controller.search();
    setScope({ projectId: 'project-1', caseId: 'case-2', conversationId: 'conversation-2' });
    resolve({
      items: [item],
      nextCursor: null,
      freshness: {
        state: 'CURRENT',
        catalogGeneration: 4,
        evaluatedAt: '2026-08-09T10:00:00.000Z',
      },
    });
    await pending;
    expect(controller.items.value).toEqual([]);
  });

  it('keeps the latest document when two opens resolve out of order', async () => {
    const { controller, source } = setup();
    const secondItem = {
      ...item,
      documentId: 'document-2',
      revisionId: 'revision-1',
      title: 'Второй материал',
    };
    let resolveFirst!: (value: SupportKnowledgeTextDocument) => void;
    let resolveSecond!: (value: SupportKnowledgeTextDocument) => void;
    vi.mocked(source.open)
      .mockReturnValueOnce(
        new Promise((done) => {
          resolveFirst = done;
        }),
      )
      .mockReturnValueOnce(
        new Promise((done) => {
          resolveSecond = done;
        }),
      );

    const first = controller.open(item);
    const second = controller.open(secondItem);
    resolveSecond({
      ...secondItem,
      sourceType: 'TEXT',
      allowedActions: ['INSERT_QUOTE'],
      contentText: 'Новый ответ',
      freshness: {
        state: 'CURRENT',
        catalogGeneration: 4,
        evaluatedAt: '2026-08-09T10:00:00.000Z',
      },
    });
    await second;
    resolveFirst({
      ...item,
      sourceType: 'TEXT',
      allowedActions: ['INSERT_QUOTE'],
      contentText: 'Старый ответ',
      freshness: {
        state: 'CURRENT',
        catalogGeneration: 4,
        evaluatedAt: '2026-08-09T10:00:00.000Z',
      },
    });
    await first;

    expect(controller.selected.value?.documentId).toBe('document-2');
  });

  it('rejects a download whose immutable identity changed', async () => {
    const { controller, source } = setup();
    const close = vi.fn();
    const replace = vi.fn();
    const open = vi.spyOn(globalThis, 'open').mockReturnValue({
      opener: null,
      close,
      location: { replace },
    } as unknown as Window);
    const file = {
      ...item,
      sourceType: 'FILE' as const,
      allowedActions: ['DOWNLOAD' as const],
    };
    vi.mocked(source.download).mockResolvedValueOnce({
      documentId: 'different-document',
      revisionId: file.revisionId,
      grantId: 'grant-1',
      filename: 'proof.pdf',
      url: 'https://downloads.example.test/proof.pdf',
      expiresAt: '2026-08-09T10:01:00.000Z',
    });

    await controller.download(file);

    expect(controller.error.value).toContain('безопасную ссылку');
    expect(close).toHaveBeenCalledOnce();
    expect(replace).not.toHaveBeenCalled();
    open.mockRestore();
  });
});
