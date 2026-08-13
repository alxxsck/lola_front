import { describe, expect, it, vi } from 'vitest';
import type { SupportMacroResponseDto } from '@/shared/api/generated/models';
import type { SupportMacroSource } from '@/features/support-macros/api/support-macros-source';
import { ApiError } from '@/shared/api/http/api-error';
import { createSupportMacroController } from './use-support-macros';

const macro: SupportMacroResponseDto = {
  id: '65000000-0000-4000-8000-000000000001',
  stableCode: 'payment-check',
  lifecycle: 'ACTIVE',
  version: 3,
  draft: null,
  publishedRevision: {
    id: '65000000-0000-4000-8000-000000000002',
    revisionNumber: 3,
    contentHash: 'a'.repeat(64),
    publishedAt: '2026-08-09T10:00:00.000Z',
    configuration: {
      compilerRevision: 1,
      title: 'Проверка платежа',
      shortcuts: ['deposit'],
      locale: 'ru',
      body: 'Проверяю статус платежа.',
      translations: { ru: 'Проверяю статус платежа.' },
      visibility: { mode: 'PROJECT', teamIds: [], topicCodes: ['PAYMENTS'] },
      variables: [],
      contentHash: 'a'.repeat(64),
    },
  },
  actionEtag: '"sm1.test"',
  applicability: {
    visibility: 'PROJECT',
    teamIds: [],
    categoryCodes: ['PAYMENTS'],
    locale: 'ru',
  },
};

function draft(text = 'Проверяю статус платежа.') {
  return {
    id: '65000000-0000-4000-8000-000000000003',
    macroId: macro.id,
    macroRevisionId: macro.publishedRevision!.id,
    macroRevisionNumber: 3,
    targetKind: 'PUBLIC_REPLY' as const,
    conversationId: '65000000-0000-4000-8000-000000000004',
    endUserCaseId: '65000000-0000-4000-8000-000000000005',
    state: 'READY' as const,
    version: 1,
    locale: 'ru',
    text,
    renderedHash: 'a'.repeat(64),
    expiresAt: '2026-08-09T10:15:00.000Z',
    createdAt: '2026-08-09T10:00:00.000Z',
    updatedAt: '2026-08-09T10:00:00.000Z',
    actionEtag: '"smd1.test"',
  };
}

function setup() {
  const source: SupportMacroSource = {
    catalog: vi.fn().mockResolvedValue({
      items: [macro],
      nextCursor: null,
      freshness: {
        state: 'CURRENT',
        generation: '1',
        evaluatedAt: '2026-08-09T10:00:00.000Z',
        authorizationRevision: 'r1',
      },
    }),
    createDraft: vi.fn().mockResolvedValue(draft()),
    editDraft: vi.fn().mockImplementation(async (target) => ({
      ...draft(target.text),
      version: 2,
      actionEtag: '"smd1.edited"',
    })),
    authoringCatalog: vi.fn(),
    readAuthoring: vi.fn(),
    preview: vi.fn(),
    create: vi.fn(),
    replaceDraft: vi.fn(),
    publish: vi.fn(),
    archive: vi.fn(),
    revisions: vi.fn(),
    rollback: vi.fn(),
  };
  let caseId = '65000000-0000-4000-8000-000000000005';
  const context = {
    projectId: () => '65000000-0000-4000-8000-000000000010',
    actorId: () => '65000000-0000-4000-8000-000000000011',
    canRead: () => true,
    canUse: () => true,
    target: () => ({
      kind: 'PUBLIC_REPLY' as const,
      endUserId: '65000000-0000-4000-8000-000000000012',
      conversationId: '65000000-0000-4000-8000-000000000004',
      caseId,
    }),
  };
  return {
    source,
    controller: createSupportMacroController(context, source),
    changeCase: (next: string) => {
      caseId = next;
    },
  };
}

describe('support macro controller', () => {
  it('turns a published macro into an editable draft without sending', async () => {
    const { controller, source } = setup();

    await controller.load();
    expect(controller.items.value).toEqual([macro]);
    expect(await controller.apply(macro)).toBe('Проверяю статус платежа.');
    expect(source.createDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        kind: 'PUBLIC_REPLY',
        macroId: macro.id,
        expectedMacroRevisionId: macro.publishedRevision!.id,
      }),
      expect.any(String),
    );
    expect('send' in source).toBe(false);
  });

  it('persists an operator edit before returning macro provenance for send', async () => {
    const { controller, source } = setup();
    await controller.apply(macro);

    expect(await controller.prepareForSend('Проверил платёж, одну минуту.')).toBe(
      '65000000-0000-4000-8000-000000000003',
    );
    expect(source.editDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        actionEtag: '"smd1.test"',
        text: 'Проверил платёж, одну минуту.',
      }),
    );
  });

  it('purges protected catalog and draft when permission disappears', async () => {
    let allowed = true;
    const source = setup().source;
    const controller = createSupportMacroController(
      {
        projectId: () => 'project-1',
        actorId: () => 'actor-1',
        canRead: () => allowed,
        canUse: () => allowed,
        target: () => ({
          kind: 'PUBLIC_REPLY',
          endUserId: 'user-1',
          conversationId: 'conversation-1',
        }),
      },
      source,
    );
    await controller.load();
    await controller.apply(macro);

    allowed = false;
    await controller.load();

    expect(controller.items.value).toEqual([]);
    expect(controller.activeDraft.value).toBeNull();
  });

  it('revalidates an unchanged draft before send and rejects a Case switch', async () => {
    const { controller, source, changeCase } = setup();
    await controller.apply(macro);

    expect(await controller.prepareForSend('Проверяю статус платежа.')).toBe(
      '65000000-0000-4000-8000-000000000003',
    );
    expect(source.editDraft).toHaveBeenCalledOnce();

    changeCase('65000000-0000-4000-8000-000000000099');
    expect(await controller.prepareForSend('Проверяю статус платежа.')).toBeNull();
    expect(controller.activeDraft.value).toBeNull();
  });

  it('requires an explicit fresh Macro after server draft rejection', async () => {
    const { controller, source } = setup();
    await controller.apply(macro);
    vi.mocked(source.editDraft).mockRejectedValueOnce(
      new ApiError(409, 'stale', undefined, undefined, 'SUPPORT_MACRO_DRAFT_SOURCE_STALE'),
    );

    expect(await controller.prepareForSend('Проверяю статус платежа.')).toBeNull();
    expect(controller.recoveryRequired.value).toBe(true);
    expect(controller.activeDraft.value).toBeNull();
    const recoveryMessage = controller.error.value;
    await controller.load();
    expect(controller.recoveryRequired.value).toBe(true);
    expect(controller.error.value).toBe(recoveryMessage);

    await controller.apply(macro);
    expect(controller.recoveryRequired.value).toBe(false);
  });

  it('releases the apply state when a concurrent catalog refresh invalidates its response', async () => {
    const { controller, source } = setup();
    let resolveDraft!: (value: ReturnType<typeof draft>) => void;
    vi.mocked(source.createDraft).mockReturnValueOnce(
      new Promise((resolve) => {
        resolveDraft = resolve;
      }),
    );

    const applying = controller.apply(macro);
    expect(controller.applyingId.value).toBe(macro.id);
    await controller.load();
    resolveDraft(draft());
    await applying;

    expect(controller.applyingId.value).toBeNull();
    expect(controller.activeDraft.value).toBeNull();
  });

  it('releases the apply state when a stale draft response triggers catalog recovery', async () => {
    const { controller, source } = setup();
    vi.mocked(source.createDraft).mockRejectedValueOnce(new ApiError(409, 'catalog changed'));

    expect(await controller.apply(macro)).toBeNull();
    expect(controller.applyingId.value).toBeNull();
  });
});
