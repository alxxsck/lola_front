import { beforeEach, describe, expect, it, vi } from 'vitest';

const generated = vi.hoisted(() => ({
  assign: vi.fn(),
  forceAssign: vi.fn(),
  transfer: vi.fn(),
  forceTransfer: vi.fn(),
  release: vi.fn(),
  outcome: vi.fn(),
  batch: vi.fn(),
  batchOutcome: vi.fn(),
}));

vi.mock('@/shared/api/generated/retenive-backend', () => ({
  supportCaseAssignmentAssign: generated.assign,
  supportCaseAssignmentAssignWithOverride: generated.forceAssign,
  supportCaseAssignmentTransfer: generated.transfer,
  supportCaseAssignmentTransferWithOverride: generated.forceTransfer,
  supportCaseAssignmentRelease: generated.release,
  supportCaseAssignmentCommandOutcome: generated.outcome,
  supportCaseAssignmentBatchExecute: generated.batch,
  supportCaseAssignmentBatchOutcome: generated.batchOutcome,
}));

import {
  SupportLeadAssignmentIntegrityError,
  supportLeadAssignmentCommandSource,
} from './support-lead-assignment-source';

const snapshot = {
  caseId: 'case-1',
  caseVersion: 8,
  caseReadToken: 'sc1.read-token',
  assignmentState: 'UNASSIGNED' as const,
  currentAssignment: null,
  workforceRevision: { id: 'workforce-1', number: 3 },
  actions: {
    claim: false,
    assign: true,
    assignWithOverride: true,
    release: false,
    transfer: false,
    transferWithOverride: false,
  },
  teams: [],
};

const receipt = {
  intent: 'ASSIGN_CASE_ASSIGNMENT',
  caseVersion: 9,
  assignmentVersion: 1,
  actionEtag: 'sa1.etag',
  assignment: { id: 'assignment-1', caseId: 'case-1' },
};

describe('support lead assignment command source', () => {
  beforeEach(() => vi.clearAllMocks());

  it('sends an ordinary Lead assignment with the captured Case authority', async () => {
    generated.assign.mockResolvedValue(receipt);

    await supportLeadAssignmentCommandSource.execute(
      'project-1',
      {
        kind: 'ASSIGN',
        snapshot,
        teamId: 'team-1',
        operatorId: 'operator-1',
        reasonCode: 'SKILL_MATCH',
        reasonNote: 'Нужен специалист по платежам',
      },
      'lead-command-1',
    );

    expect(generated.assign).toHaveBeenCalledWith(
      'project-1',
      'case-1',
      {
        teamId: 'team-1',
        operatorCmsUserId: 'operator-1',
        expectedCaseVersion: 8,
        caseReadToken: 'sc1.read-token',
        reasonCode: 'SKILL_MATCH',
        reasonNote: 'Нужен специалист по платежам',
      },
      { headers: { 'Idempotency-Key': 'lead-command-1' } },
    );
  });

  it('uses the explicit force command and never hides bypass evidence', async () => {
    generated.forceAssign.mockResolvedValue({
      ...receipt,
      intent: 'ASSIGN_CASE_ASSIGNMENT_WITH_OVERRIDE',
    });

    await supportLeadAssignmentCommandSource.execute(
      'project-1',
      {
        kind: 'FORCE_ASSIGN',
        snapshot,
        teamId: 'team-1',
        operatorId: 'operator-1',
        bypassAvailability: true,
        bypassCapacity: false,
        reasonCode: 'CUSTOMER_HARM_PREVENTION',
        reasonNote: 'Критический риск для пользователя',
      },
      'lead-command-2',
    );

    expect(generated.forceAssign).toHaveBeenCalledWith(
      'project-1',
      'case-1',
      expect.objectContaining({
        bypassAvailability: true,
        bypassCapacity: false,
        reasonCode: 'CUSTOMER_HARM_PREVENTION',
        reasonNote: 'Критический риск для пользователя',
      }),
      { headers: { 'Idempotency-Key': 'lead-command-2' } },
    );
  });

  it('looks up an unknown single-command outcome with the same idempotency key', async () => {
    generated.outcome.mockResolvedValue(receipt);

    const result = await supportLeadAssignmentCommandSource.lookupOutcome(
      'project-1',
      'case-1',
      'lead-command-3',
      'ASSIGN_CASE_ASSIGNMENT',
    );

    expect(result.assignmentId).toBe('assignment-1');
    expect(generated.outcome).toHaveBeenCalledWith('project-1', 'case-1', {
      headers: { 'Idempotency-Key': 'lead-command-3' },
    });
  });

  it('rejects an outcome receipt for a different command intent', async () => {
    generated.outcome.mockResolvedValue({
      ...receipt,
      intent: 'RELEASE_CASE_ASSIGNMENT',
    });

    await expect(
      supportLeadAssignmentCommandSource.lookupOutcome(
        'project-1',
        'case-1',
        'lead-command-3',
        'ASSIGN_CASE_ASSIGNMENT',
      ),
    ).rejects.toBeInstanceOf(SupportLeadAssignmentIntegrityError);
  });

  it('rejects a successful receipt from another Case', async () => {
    generated.assign.mockResolvedValue({
      ...receipt,
      assignment: { id: 'assignment-1', caseId: 'case-other' },
    });

    await expect(
      supportLeadAssignmentCommandSource.execute(
        'project-1',
        {
          kind: 'ASSIGN',
          snapshot,
          teamId: 'team-1',
          operatorId: 'operator-1',
          reasonCode: 'LOAD_BALANCE',
        },
        'lead-command-4',
      ),
    ).rejects.toBeInstanceOf(SupportLeadAssignmentIntegrityError);
  });

  it('preserves per-item batch outcomes and rejects receipt substitution', async () => {
    const items = [
      {
        clientItemId: 'item-1',
        caseId: 'case-1',
        teamId: 'team-1',
        operatorCmsUserId: 'operator-1',
        expectedCaseVersion: 8,
        caseReadToken: 'sc1.read-token',
        force: false,
        bypassAvailability: false,
        bypassCapacity: false,
        reasonCode: 'LEAD_INTERVENTION' as const,
        reasonNote: 'Балансировка очереди',
      },
    ];
    generated.batch.mockResolvedValue({
      batchId: 'batch-1',
      status: 'COMPLETED',
      outcome: 'FAILED',
      itemCount: 1,
      processedCount: 1,
      succeededCount: 0,
      failedCount: 1,
      items: [
        {
          clientItemId: 'item-1',
          caseId: 'case-other',
          status: 'FAILED',
          error: { code: 'CASE_VERSION_CONFLICT' },
        },
      ],
    });

    await expect(
      supportLeadAssignmentCommandSource.executeBatch('project-1', items, 'batch-key-1'),
    ).rejects.toBeInstanceOf(SupportLeadAssignmentIntegrityError);
  });
});
