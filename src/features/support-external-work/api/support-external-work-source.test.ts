import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  supportExternalCaseCreateOptionsRead,
  supportExternalCaseLinksList,
  supportExternalCommandRead,
  supportExternalCommandResolveUnknown,
  supportExternalCommandSubmit,
  supportExternalConnectionList,
  supportExternalConnectionTest,
  supportExternalCommandRefreshEvidence,
  supportExternalCommandRetry,
  supportExternalInboxLinkToCase,
  supportExternalMappingPublish,
} from '@/shared/api/generated/retenive-backend';
import { apiSupportExternalWorkSource } from './support-external-work-source';

vi.mock('@/shared/api/generated/retenive-backend', () => ({
  supportExternalCaseCreateOptionsRead: vi.fn(),
  supportExternalCaseLinksList: vi.fn(),
  supportExternalCommandRead: vi.fn(),
  supportExternalCommandResolveUnknown: vi.fn(),
  supportExternalCommandSubmit: vi.fn(),
  supportExternalConnectionList: vi.fn(),
  supportExternalConnectionTest: vi.fn(),
  supportExternalCommandRefreshEvidence: vi.fn(),
  supportExternalCommandRetry: vi.fn(),
  supportExternalInboxLinkToCase: vi.fn(),
  supportExternalMappingPublish: vi.fn(),
}));

describe('Support External Work source', () => {
  beforeEach(() => vi.clearAllMocks());

  it('reads connection authority through the generated operation and caller signal', async () => {
    const signal = new AbortController().signal;
    vi.mocked(supportExternalConnectionList).mockResolvedValue({
      items: [],
      nextCursor: null,
    });

    await apiSupportExternalWorkSource.listConnections('project-1', undefined, signal);

    expect(supportExternalConnectionList).toHaveBeenCalledWith(
      'project-1',
      { limit: 50 },
      { signal },
    );
  });

  it('does not auth-replay an audited connection test and preserves its exact key', async () => {
    vi.mocked(supportExternalConnectionTest).mockResolvedValue({} as never);

    await apiSupportExternalWorkSource.testConnection(
      'project-1',
      'connection-1',
      'stable-command-key',
    );

    expect(supportExternalConnectionTest).toHaveBeenCalledWith(
      'project-1',
      'connection-1',
      {},
      expect.objectContaining({
        _noAuthRetry: true,
        headers: { 'Idempotency-Key': 'stable-command-key' },
      }),
    );
  });

  it('publishes a mapping with quoted numeric OCC and a stable key', async () => {
    vi.mocked(supportExternalMappingPublish).mockResolvedValue({} as never);

    await apiSupportExternalWorkSource.publishMapping(
      'project-1',
      'mapping-1',
      7,
      'stable-publish-key',
    );

    expect(supportExternalMappingPublish).toHaveBeenCalledWith(
      'project-1',
      'mapping-1',
      {},
      expect.objectContaining({
        _noAuthRetry: true,
        headers: {
          'Idempotency-Key': 'stable-publish-key',
          'If-Match': '"7"',
        },
      }),
    );
  });

  it('keeps quoted command OCC and idempotency headers for retry and evidence', async () => {
    vi.mocked(supportExternalCommandRetry).mockResolvedValue({} as never);
    vi.mocked(supportExternalCommandRefreshEvidence).mockResolvedValue({} as never);

    await apiSupportExternalWorkSource.retryCommand(
      'project-1',
      'case-1',
      'command-1',
      11,
      'stable-retry-key',
    );
    await apiSupportExternalWorkSource.refreshCommandEvidence(
      'project-1',
      'case-1',
      'command-1',
      { remoteItemId: 'remote-1' },
      12,
      'stable-evidence-key',
    );

    expect(supportExternalCommandRetry).toHaveBeenCalledWith(
      'project-1',
      'case-1',
      'command-1',
      expect.objectContaining({
        _noAuthRetry: true,
        headers: {
          'Idempotency-Key': 'stable-retry-key',
          'If-Match': '"11"',
        },
      }),
    );
    expect(supportExternalCommandRefreshEvidence).toHaveBeenCalledWith(
      'project-1',
      'case-1',
      'command-1',
      { remoteItemId: 'remote-1' },
      expect.objectContaining({
        _noAuthRetry: true,
        headers: {
          'Idempotency-Key': 'stable-evidence-key',
          'If-Match': '"12"',
        },
      }),
    );
  });

  it('uses generated Case operations and preserves exact audited command identity', async () => {
    const signal = new AbortController().signal;
    vi.mocked(supportExternalCaseCreateOptionsRead).mockResolvedValue({
      items: [],
    });
    vi.mocked(supportExternalCaseLinksList).mockResolvedValue({
      items: [],
      nextCursor: null,
    });
    vi.mocked(supportExternalCommandRead).mockResolvedValue({} as never);
    vi.mocked(supportExternalCommandSubmit).mockResolvedValue({} as never);
    vi.mocked(supportExternalCommandResolveUnknown).mockResolvedValue({} as never);
    vi.mocked(supportExternalInboxLinkToCase).mockResolvedValue({} as never);

    await apiSupportExternalWorkSource.readCaseCreateOptions('project-1', 'case-1', signal);
    await apiSupportExternalWorkSource.listCaseLinks('project-1', 'case-1', undefined, signal);
    await apiSupportExternalWorkSource.readCommand('project-1', 'case-1', 'command-1', signal);
    await apiSupportExternalWorkSource.submitCaseCommand(
      'project-1',
      'case-1',
      {
        intent: 'COMMENT',
        linkId: 'link-1',
        body: 'Проверили логи',
        audience: 'INTERNAL',
      },
      4,
      'stable-submit-key',
      signal,
    );
    await apiSupportExternalWorkSource.resolveCommand(
      'project-1',
      'case-1',
      'command-1',
      {
        decision: 'CONFIRM_NOT_DELIVERED',
        evidenceNote: 'Provider audit checked',
      },
      7,
      'stable-resolve-key',
      signal,
    );
    await apiSupportExternalWorkSource.linkInboxItemToCase(
      'project-1',
      'HD-2048',
      { caseId: 'case-1', mappingRevisionId: 'mapping-revision-1' },
      9,
      'stable-link-key',
      signal,
    );

    expect(supportExternalCaseCreateOptionsRead).toHaveBeenCalledWith('project-1', 'case-1', {
      signal,
    });
    expect(supportExternalCaseLinksList).toHaveBeenCalledWith(
      'project-1',
      'case-1',
      { limit: 50 },
      { signal },
    );
    expect(supportExternalCommandRead).toHaveBeenCalledWith('project-1', 'case-1', 'command-1', {
      signal,
    });
    expect(supportExternalCommandSubmit).toHaveBeenCalledWith(
      'project-1',
      'case-1',
      expect.objectContaining({ intent: 'COMMENT', body: 'Проверили логи' }),
      expect.objectContaining({
        _noAuthRetry: true,
        signal,
        headers: { 'Idempotency-Key': 'stable-submit-key', 'If-Match': '"4"' },
      }),
    );
    expect(supportExternalCommandResolveUnknown).toHaveBeenCalledWith(
      'project-1',
      'case-1',
      'command-1',
      expect.objectContaining({ decision: 'CONFIRM_NOT_DELIVERED' }),
      expect.objectContaining({
        _noAuthRetry: true,
        signal,
        headers: { 'Idempotency-Key': 'stable-resolve-key', 'If-Match': '"7"' },
      }),
    );
    expect(supportExternalInboxLinkToCase).toHaveBeenCalledWith(
      'project-1',
      'HD-2048',
      { caseId: 'case-1', mappingRevisionId: 'mapping-revision-1' },
      expect.objectContaining({
        _noAuthRetry: true,
        signal,
        headers: { 'Idempotency-Key': 'stable-link-key', 'If-Match': '"9"' },
      }),
    );
  });
});
