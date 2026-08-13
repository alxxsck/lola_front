import { beforeEach, describe, expect, it, vi } from 'vitest';
import type {
  SupportCaseNotificationPolicyCurrentResponseDto,
  SupportCaseNotificationPolicyRevisionResponseDto,
} from '@/shared/api/generated/models';
import { ApiError } from '@/shared/api/http/api-error';
import type { SupportCaseNotificationPolicySource } from '../api/support-case-notification-policy-source';
import { createSupportCaseNotificationPolicyController } from './use-support-case-notification-policy';

const snapshot = (): SupportCaseNotificationPolicyCurrentResponseDto => ({
  version: 0,
  effectiveStatus: 'OFF',
  current: null,
  draft: null,
  restorableRevisions: [],
  allowedClasses: ['PRODUCT_INQUIRY', 'PRODUCT_PROBLEM'],
  allowedPriorities: ['LOW', 'NORMAL', 'HIGH', 'URGENT', 'CRITICAL'],
  allowedChannels: ['BROWSER_PUSH'],
  allowedTopicCodes: ['PAYMENTS'],
});

const draft = (): SupportCaseNotificationPolicyRevisionResponseDto => ({
  id: '11111111-1111-4111-8111-111111111111',
  revisionNumber: 1,
  status: 'DRAFT',
  mode: 'IMMEDIATE',
  occurrences: ['CREATED'],
  conversationClasses: ['PRODUCT_INQUIRY'],
  topicCodes: ['PAYMENTS'],
  minimumPriority: 'NORMAL',
  recipientRule: 'ALL_ELIGIBLE_SUBSCRIBERS',
  teamIds: [],
  channels: ['BROWSER_PUSH'],
  effectiveFrom: null,
  effectiveUntil: null,
  digestWindowMinutes: null,
  digestMaxItems: null,
  templateRevision: 'support-case-created-v1',
  deepLinkTarget: 'SUPPORT_OPERATOR_WORKSPACE',
  contentHash: '1'.repeat(64),
  createdAt: '2026-08-11T10:00:00.000Z',
  publishedAt: null,
});

function source(): SupportCaseNotificationPolicySource {
  return {
    read: vi.fn().mockResolvedValue(snapshot()),
    readMetrics: vi.fn().mockResolvedValue({}),
    listTeams: vi.fn().mockResolvedValue([]),
    preview: vi.fn().mockResolvedValue({
      issues: [],
      estimatedEligibleRecipients: 2,
      matchingOccurrencesLast7Days: 3,
      estimatedImmediateDeliveriesLast7Days: 6,
      estimatedDigestWindowsLast7Days: 0,
      examples: [],
      publishable: true,
    }),
    saveDraft: vi.fn(),
    publish: vi.fn(),
    disable: vi.fn(),
    restore: vi.fn(),
    lookup: vi.fn().mockResolvedValue({ found: false, operation: 'SAVE_DRAFT' }),
  } as unknown as SupportCaseNotificationPolicySource;
}

describe('support case notification policy controller', () => {
  beforeEach(() => sessionStorage.clear());

  it('fences a late preview across a Project switch', async () => {
    let projectId = 'project-1';
    let resolvePreview!: (value: never) => void;
    const api = source();
    vi.mocked(api.preview).mockReturnValue(
      new Promise((resolve) => {
        resolvePreview = resolve;
      }),
    );
    const controller = createSupportCaseNotificationPolicyController(
      {
        actorId: () => 'actor-1',
        projectId: () => projectId,
        canManage: () => true,
      },
      api,
    );
    await controller.load();
    const run = controller.runPreview();
    projectId = 'project-2';
    controller.reset();
    resolvePreview({ issues: [], examples: [], publishable: true } as never);
    await run;
    expect(controller.preview.value).toBeNull();
  });

  it('retains an exact unknown command and reconciles it by operation and key', async () => {
    const api = source();
    vi.mocked(api.saveDraft).mockRejectedValue(new ApiError(503, 'unavailable'));
    vi.mocked(api.lookup).mockResolvedValue({
      found: false,
      operation: 'SAVE_DRAFT',
      receiptId: null,
      policy: null,
    });
    const controller = createSupportCaseNotificationPolicyController(
      {
        actorId: () => 'actor-1',
        projectId: () => 'project-1',
        canManage: () => true,
        createIdempotencyKey: () => 'stable-key',
      },
      api,
    );
    await controller.load();
    await controller.saveDraft();
    expect(controller.pending.value).toMatchObject({
      operation: 'SAVE_DRAFT',
      key: 'stable-key',
    });
    expect(api.lookup).toHaveBeenCalledWith(
      'project-1',
      'SAVE_DRAFT',
      'stable-key',
      expect.any(AbortSignal),
    );
    expect(controller.canSubmit.value).toBe(false);
    controller.reset({ forgetPending: true });
  });

  it('purges protected state and retained command on permission revoke', async () => {
    let allowed = true;
    const api = source();
    vi.mocked(api.saveDraft).mockRejectedValue(new ApiError(503, 'unavailable'));
    const controller = createSupportCaseNotificationPolicyController(
      {
        actorId: () => 'actor-1',
        projectId: () => 'project-1',
        canManage: () => allowed,
        createIdempotencyKey: () => 'stable-key',
      },
      api,
    );
    await controller.load();
    await controller.saveDraft();
    allowed = false;
    controller.reset({ forgetPending: true });
    expect(controller.current.value).toBeNull();
    allowed = true;
    await controller.load();
    expect(controller.pending.value).toBeNull();
  });

  it('replays an unknown command with the exact operation, body and key', async () => {
    const api = source();
    vi.mocked(api.saveDraft)
      .mockRejectedValueOnce(new ApiError(503, 'unavailable'))
      .mockResolvedValueOnce({
        receiptId: '22222222-2222-4222-8222-222222222222',
        replayed: true,
        policy: snapshot(),
      });
    const controller = createSupportCaseNotificationPolicyController(
      {
        actorId: () => 'actor-1',
        projectId: () => 'project-1',
        canManage: () => true,
        createIdempotencyKey: () => 'stable-key',
      },
      api,
    );
    await controller.load();
    await controller.saveDraft();
    const first = vi.mocked(api.saveDraft).mock.calls[0]!;
    await controller.replayPendingCommand();
    const second = vi.mocked(api.saveDraft).mock.calls[1]!;
    expect(second[1]).toEqual(first[1]);
    expect(second[2]).toBe(first[2]);
    expect(controller.pending.value).toBeNull();
  });

  it('never publishes a draft without a matching publishable preview', async () => {
    const api = source();
    vi.mocked(api.read).mockResolvedValue({ ...snapshot(), draft: draft() });
    const controller = createSupportCaseNotificationPolicyController(
      {
        actorId: () => 'actor-1',
        projectId: () => 'project-1',
        canManage: () => true,
      },
      api,
    );
    await controller.load();
    await controller.publish();
    expect(api.publish).not.toHaveBeenCalled();

    controller.form.value.minimumPriority = 'HIGH';
    await controller.runPreview();
    expect(controller.draftMatchesForm.value).toBe(false);
    expect(controller.previewMatchesDraft.value).toBe(false);
    await controller.publish();
    expect(api.publish).not.toHaveBeenCalled();
  });

  it('preserves local input after a version conflict and requires a new preview', async () => {
    const api = source();
    vi.mocked(api.read)
      .mockResolvedValueOnce(snapshot())
      .mockResolvedValueOnce({ ...snapshot(), version: 2 });
    vi.mocked(api.saveDraft).mockRejectedValue(new ApiError(409, 'version conflict'));
    const controller = createSupportCaseNotificationPolicyController(
      {
        actorId: () => 'actor-1',
        projectId: () => 'project-1',
        canManage: () => true,
      },
      api,
    );
    await controller.load();
    controller.form.value.reason = 'Локальная причина изменения';
    controller.form.value.topicCodes = ['PAYMENTS'];
    await controller.runPreview();
    await controller.saveDraft();
    expect(controller.current.value?.version).toBe(2);
    expect(controller.form.value.reason).toBe('Локальная причина изменения');
    expect(controller.form.value.topicCodes).toEqual(['PAYMENTS']);
    expect(controller.preview.value).toBeNull();
  });

  it('does not restore an old-scope command after an in-flight revoke', async () => {
    let allowed = true;
    let rejectSave!: (cause: unknown) => void;
    const api = source();
    vi.mocked(api.saveDraft).mockReturnValue(
      new Promise((_, reject) => {
        rejectSave = reject;
      }),
    );
    const controller = createSupportCaseNotificationPolicyController(
      {
        actorId: () => 'actor-1',
        projectId: () => 'project-1',
        canManage: () => allowed,
      },
      api,
    );
    await controller.load();
    const run = controller.saveDraft();
    allowed = false;
    controller.reset({ forgetPending: true });
    rejectSave(new ApiError(503, 'late failure'));
    await run;
    expect(controller.pending.value).toBeNull();
    expect(controller.error.value).toBeNull();
  });
});
