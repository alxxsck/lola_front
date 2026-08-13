import { beforeEach, describe, expect, it, vi } from 'vitest';

const generated = vi.hoisted(() => ({
  supportMacroReplyDraftCreate: vi.fn(),
  supportMacroNoteDraftCreate: vi.fn(),
}));

vi.mock('@/shared/config/data-mode', () => ({ isMockMode: false }));
vi.mock('@/shared/api/generated/retenive-backend', () => ({
  ...generated,
  supportMacroArchive: vi.fn(),
  supportMacroAuthoringCatalog: vi.fn(),
  supportMacroCatalog: vi.fn(),
  supportMacroCreate: vi.fn(),
  supportMacroListRevisions: vi.fn(),
  supportMacroNoteDraftEdit: vi.fn(),
  supportMacroPreview: vi.fn(),
  supportMacroPublish: vi.fn(),
  supportMacroReadAuthoring: vi.fn(),
  supportMacroReplaceDraft: vi.fn(),
  supportMacroReplyDraftEdit: vi.fn(),
  supportMacroRollback: vi.fn(),
}));

import { supportMacroSource } from './support-macros-source';

const receipt = {
  id: 'draft-1',
  macroId: 'macro-1',
  macroRevisionId: 'revision-1',
  macroRevisionNumber: 1,
  targetKind: 'PUBLIC_REPLY' as const,
  conversationId: 'conversation-1',
  endUserCaseId: 'case-1',
  state: 'READY' as const,
  version: 1,
  locale: 'ru',
  text: 'Ответ',
  renderedHash: 'a'.repeat(64),
  expiresAt: '2026-08-09T10:15:00.000Z',
  createdAt: '2026-08-09T10:00:00.000Z',
  updatedAt: '2026-08-09T10:00:00.000Z',
  actionEtag: '"smd1.test"',
};

describe('support Macro transport', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generated.supportMacroReplyDraftCreate.mockResolvedValue(receipt);
    generated.supportMacroNoteDraftCreate.mockResolvedValue({
      ...receipt,
      targetKind: 'INTERNAL_NOTE',
      conversationId: null,
    });
  });

  it('sends an Idempotency-Key for both public and internal draft creation', async () => {
    await supportMacroSource.createDraft(
      {
        kind: 'PUBLIC_REPLY',
        projectId: 'project-1',
        endUserId: 'user-1',
        conversationId: 'conversation-1',
        caseId: 'case-1',
        macroId: 'macro-1',
        expectedMacroRevisionId: 'revision-1',
        locale: 'pt-BR',
      },
      'public-command-key',
    );
    await supportMacroSource.createDraft(
      {
        kind: 'INTERNAL_NOTE',
        projectId: 'project-1',
        caseId: 'case-1',
        macroId: 'macro-1',
        expectedMacroRevisionId: 'revision-1',
      },
      'note-command-key',
    );

    expect(generated.supportMacroReplyDraftCreate).toHaveBeenCalledWith(
      'project-1',
      'user-1',
      'conversation-1',
      expect.objectContaining({ locale: 'pt-BR' }),
      { headers: { 'Idempotency-Key': 'public-command-key' } },
    );
    expect(generated.supportMacroNoteDraftCreate).toHaveBeenCalledWith(
      'project-1',
      'case-1',
      {
        macroId: 'macro-1',
        expectedMacroRevisionId: 'revision-1',
      },
      { headers: { 'Idempotency-Key': 'note-command-key' } },
    );
  });
});
