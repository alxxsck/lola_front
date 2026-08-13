import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { SupportCaseAssignmentCandidatesResponseDto } from '@/shared/api/generated/models';

const generated = vi.hoisted(() => ({
  candidates: vi.fn(),
  claim: vi.fn(),
  release: vi.fn(),
  transfer: vi.fn(),
  listOffers: vi.fn(),
  acceptOffer: vi.fn(),
  declineOffer: vi.fn(),
}));

vi.mock('@/shared/api/generated/retenive-backend', () => ({
  supportCaseAssignmentCandidatesForCase: generated.candidates,
  supportCaseAssignmentClaim: generated.claim,
  supportCaseAssignmentRelease: generated.release,
  supportCaseAssignmentTransfer: generated.transfer,
  supportRoutingOfferList: generated.listOffers,
  supportRoutingOfferAccept: generated.acceptOffer,
  supportRoutingOfferDecline: generated.declineOffer,
}));

vi.mock('@/shared/config/data-mode', () => ({ isMockMode: false }));

import {
  SupportAssignmentIntegrityError,
  supportAssignmentSource,
} from './support-assignment-source';

const candidates: SupportCaseAssignmentCandidatesResponseDto = {
  caseId: 'case-1',
  caseVersion: 9,
  caseReadToken: '"sc1.aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"',
  assignmentState: 'UNASSIGNED',
  currentAssignment: null,
  workforceRevision: { id: 'workforce-1', number: 4 },
  actions: {
    claim: true,
    assign: false,
    assignWithOverride: false,
    release: false,
    transfer: false,
    transferWithOverride: false,
  },
  teams: [
    {
      id: 'team-1',
      code: 'PAYMENTS',
      name: 'Платежи',
      actions: {
        claim: true,
        assign: false,
        assignWithOverride: false,
        transfer: false,
        transferWithOverride: false,
      },
      operators: [],
    },
  ],
};

describe('support assignment source', () => {
  beforeEach(() => vi.clearAllMocks());

  it('claims only through the Case-scoped candidate snapshot and its read token', async () => {
    generated.candidates.mockResolvedValue(candidates);
    generated.claim.mockResolvedValue({
      intent: 'CLAIM_CASE_ASSIGNMENT',
      caseVersion: 10,
      assignmentVersion: 1,
      actionEtag: '"sa1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
      assignment: {
        id: 'assignment-1',
        caseId: 'case-1',
        occurrenceNumber: 1,
        state: 'ASSIGNED',
        version: 1,
        team: { id: 'team-1', code: 'PAYMENTS', name: 'Платежи' },
        operator: { id: 'operator-1', displayName: 'Анна', avatarUrl: null },
        workforceRevisionId: 'workforce-1',
        capacityWeightUnits: 100,
        startedAt: '2026-08-08T10:00:00.000Z',
        endedAt: null,
      },
    });

    const snapshot = await supportAssignmentSource.readCase('project-1', 'case-1');
    await supportAssignmentSource.execute(
      'project-1',
      {
        kind: 'CLAIM',
        snapshot,
        teamId: 'team-1',
      },
      'assignment-intent-1',
    );

    expect(generated.candidates).toHaveBeenCalledWith('project-1', 'case-1', undefined);
    expect(generated.claim).toHaveBeenCalledWith(
      'project-1',
      'case-1',
      {
        teamId: 'team-1',
        expectedCaseVersion: 9,
        caseReadToken: candidates.caseReadToken,
      },
      { headers: { 'Idempotency-Key': 'assignment-intent-1' } },
    );
  });

  it('releases the exact current assignment with its version and action ETag', async () => {
    const assigned = {
      ...candidates,
      assignmentState: 'ASSIGNED' as const,
      currentAssignment: {
        id: 'assignment-1',
        version: 3,
        actionEtag: '"sa1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
      },
      actions: {
        claim: false,
        assign: false,
        assignWithOverride: false,
        release: true,
        transfer: false,
        transferWithOverride: false,
      },
    };
    generated.candidates.mockResolvedValue(assigned);
    generated.release.mockResolvedValue({
      intent: 'RELEASE_CASE_ASSIGNMENT',
      caseVersion: 10,
      assignmentVersion: 4,
      actionEtag: '"sa1.ccccccccccccccccccccccccccccccccccccccccccc"',
      assignment: {
        id: 'assignment-1',
        caseId: 'case-1',
        occurrenceNumber: 1,
        state: 'RELEASED',
        version: 4,
        team: { id: 'team-1', code: 'PAYMENTS', name: 'Платежи' },
        operator: { id: 'operator-1', displayName: 'Анна', avatarUrl: null },
        workforceRevisionId: 'workforce-1',
        capacityWeightUnits: 100,
        startedAt: '2026-08-08T10:00:00.000Z',
        endedAt: '2026-08-08T11:00:00.000Z',
      },
    });

    const snapshot = await supportAssignmentSource.readCase('project-1', 'case-1');
    await supportAssignmentSource.execute(
      'project-1',
      {
        kind: 'RELEASE',
        snapshot,
        reasonCode: 'SHIFT_END',
        reasonNote: 'Передача смены',
      },
      'assignment-intent-2',
    );

    expect(generated.release).toHaveBeenCalledWith(
      'project-1',
      'case-1',
      {
        assignmentId: 'assignment-1',
        expectedAssignmentVersion: 3,
        reasonCode: 'SHIFT_END',
        reasonNote: 'Передача смены',
      },
      {
        headers: {
          'If-Match': assigned.currentAssignment.actionEtag,
          'Idempotency-Key': 'assignment-intent-2',
        },
      },
    );
  });

  it('transfers only to an operator authorized by the Case candidate catalog', async () => {
    const assigned = {
      ...candidates,
      assignmentState: 'ASSIGNED' as const,
      currentAssignment: {
        id: 'assignment-1',
        version: 3,
        actionEtag: '"sa1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
      },
      actions: {
        claim: false,
        assign: false,
        assignWithOverride: false,
        release: true,
        transfer: true,
        transferWithOverride: false,
      },
      teams: [
        {
          id: 'team-2',
          code: 'VIP',
          name: 'VIP',
          actions: {
            claim: false,
            assign: false,
            assignWithOverride: false,
            transfer: true,
            transferWithOverride: false,
          },
          operators: [
            {
              id: 'operator-2',
              displayName: 'Максим',
              availableCapacityUnits: 300,
              effectiveAvailability: 'AVAILABLE',
              requiredOverrides: [],
              actions: {
                claim: false,
                assign: false,
                assignWithOverride: false,
                transfer: true,
                transferWithOverride: false,
              },
            },
          ],
        },
      ],
    };
    generated.candidates.mockResolvedValue(assigned);
    generated.transfer.mockResolvedValue({
      intent: 'TRANSFER_CASE_ASSIGNMENT',
      caseVersion: 10,
      assignmentVersion: 1,
      actionEtag: '"sa1.ccccccccccccccccccccccccccccccccccccccccccc"',
      assignment: {
        id: 'assignment-2',
        caseId: 'case-1',
        occurrenceNumber: 2,
        state: 'ASSIGNED',
        version: 1,
        team: { id: 'team-2', code: 'VIP', name: 'VIP' },
        operator: { id: 'operator-2', displayName: 'Максим', avatarUrl: null },
        workforceRevisionId: 'workforce-1',
        capacityWeightUnits: 100,
        startedAt: '2026-08-08T11:00:00.000Z',
        endedAt: null,
      },
    });

    const snapshot = await supportAssignmentSource.readCase('project-1', 'case-1');
    await supportAssignmentSource.execute(
      'project-1',
      {
        kind: 'TRANSFER',
        snapshot,
        teamId: 'team-2',
        operatorId: 'operator-2',
        reasonCode: 'SKILL_HANDOFF',
      },
      'assignment-intent-3',
    );

    expect(generated.transfer).toHaveBeenCalledWith(
      'project-1',
      'case-1',
      {
        assignmentId: 'assignment-1',
        expectedAssignmentVersion: 3,
        teamId: 'team-2',
        operatorCmsUserId: 'operator-2',
        reasonCode: 'SKILL_HANDOFF',
      },
      {
        headers: {
          'If-Match': assigned.currentAssignment.actionEtag,
          'Idempotency-Key': 'assignment-intent-3',
        },
      },
    );
  });

  it('accepts an own offer with the exact opaque capability and strong ETag', async () => {
    generated.listOffers.mockResolvedValue({
      offers: [
        {
          assignmentId: 'offer-assignment-1',
          caseId: 'case-2',
          teamId: 'team-1',
          queueId: 'queue-1',
          assignmentVersion: 6,
          fencingVersion: 2,
          expiresAt: '2026-08-08T12:00:00.000Z',
          actionEtag: '"so1.k.ddddddddddddddddddddddddddddddddddddddddddd"',
          acceptToken: 'opaque-routing-offer-token',
        },
      ],
    });
    generated.acceptOffer.mockResolvedValue({
      assignmentId: 'offer-assignment-1',
      assignmentVersion: 7,
      assignmentRootVersion: 5,
      caseVersion: 11,
      outcome: 'ACCEPTED',
    });

    const [offer] = await supportAssignmentSource.listOffers('project-1');
    await supportAssignmentSource.actOnOffer(
      'project-1',
      { kind: 'ACCEPT', offer: offer! },
      'offer-intent-1',
    );

    expect(generated.acceptOffer).toHaveBeenCalledWith(
      'project-1',
      'offer-assignment-1',
      {
        expectedAssignmentVersion: 6,
        offerToken: 'opaque-routing-offer-token',
      },
      {
        headers: {
          'If-Match': '"so1.k.ddddddddddddddddddddddddddddddddddddddddddd"',
          'Idempotency-Key': 'offer-intent-1',
        },
      },
    );
  });

  it('keeps a mismatched successful receipt distinct from transport unknown', async () => {
    generated.candidates.mockResolvedValue(candidates);
    generated.claim.mockResolvedValue({
      intent: 'CLAIM_CASE_ASSIGNMENT',
      caseVersion: 10,
      assignmentVersion: 1,
      actionEtag: '"sa1.bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"',
      assignment: {
        id: 'assignment-foreign',
        caseId: 'another-case',
      },
    });
    const snapshot = await supportAssignmentSource.readCase('project-1', 'case-1');

    await expect(
      supportAssignmentSource.execute(
        'project-1',
        { kind: 'CLAIM', snapshot, teamId: 'team-1' },
        'assignment-intent-integrity',
      ),
    ).rejects.toBeInstanceOf(SupportAssignmentIntegrityError);
  });
});
