import {
  supportCaseAssignmentCandidatesForCase,
  supportCaseAssignmentClaim,
  supportCaseAssignmentRelease,
  supportCaseAssignmentTransfer,
  supportRoutingOfferAccept,
  supportRoutingOfferDecline,
  supportRoutingOfferList,
} from '@/shared/api/generated/retenive-backend';
import type {
  ReleaseSupportCaseAssignmentDtoReasonCode,
  SupportCaseAssignmentCandidateActionsResponseDto,
  SupportCaseAssignmentCandidateTeamResponseDto,
  SupportCaseAssignmentCandidatesResponseDtoAssignmentState,
  TransferSupportCaseAssignmentDtoReasonCode,
} from '@/shared/api/generated/models';
import { ApiError, normalizeApiError } from '@/shared/api/http/api-error';
import { isMockMode } from '@/shared/config/data-mode';
import {
  claimMockSupportAssignment,
  readMockSupportAssignment,
  releaseMockSupportAssignment,
} from './support-assignment-mock-state';

export interface SupportAssignmentSnapshot {
  caseId: string;
  caseVersion: number;
  caseReadToken: string;
  assignmentState: SupportCaseAssignmentCandidatesResponseDtoAssignmentState;
  currentAssignment: {
    id: string;
    version: number;
    actionEtag: string;
  } | null;
  workforceRevision: { id: string; number: number } | null;
  actions: SupportCaseAssignmentCandidateActionsResponseDto;
  teams: SupportCaseAssignmentCandidateTeamResponseDto[];
}

export interface SupportAssignmentClaimIntent {
  kind: 'CLAIM';
  snapshot: SupportAssignmentSnapshot;
  teamId: string;
}

export interface SupportAssignmentReleaseIntent {
  kind: 'RELEASE';
  snapshot: SupportAssignmentSnapshot;
  reasonCode: ReleaseSupportCaseAssignmentDtoReasonCode;
  reasonNote?: string;
}

export interface SupportAssignmentTransferIntent {
  kind: 'TRANSFER';
  snapshot: SupportAssignmentSnapshot;
  teamId: string;
  operatorId: string;
  reasonCode: TransferSupportCaseAssignmentDtoReasonCode;
  reasonNote?: string;
}

export type SupportAssignmentIntent =
  SupportAssignmentClaimIntent | SupportAssignmentReleaseIntent | SupportAssignmentTransferIntent;

export interface SupportAssignmentReceipt {
  intent: 'CLAIM_CASE_ASSIGNMENT' | 'RELEASE_CASE_ASSIGNMENT' | 'TRANSFER_CASE_ASSIGNMENT';
  caseId: string;
  assignmentId: string;
  caseVersion: number;
  assignmentVersion: number;
}

export interface SupportAssignmentOffer {
  assignmentId: string;
  caseId: string;
  assignmentVersion: number;
  expiresAt: string;
  actionEtag: string;
  offerToken: string;
}

export interface SupportAssignmentOfferIntent {
  kind: 'ACCEPT' | 'DECLINE';
  offer: SupportAssignmentOffer;
}

export interface SupportAssignmentOfferReceipt {
  assignmentId: string;
  caseVersion: number;
  outcome: 'ACCEPTED' | 'DECLINED';
}

export class SupportAssignmentIntegrityError extends Error {
  constructor() {
    super('Support assignment response failed integrity validation');
    this.name = 'SupportAssignmentIntegrityError';
  }
}

export interface SupportAssignmentSource {
  readCase(
    projectId: string,
    caseId: string,
    signal?: AbortSignal,
  ): Promise<SupportAssignmentSnapshot>;
  execute(
    projectId: string,
    intent: SupportAssignmentIntent,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportAssignmentReceipt>;
  listOffers(projectId: string, signal?: AbortSignal): Promise<SupportAssignmentOffer[]>;
  actOnOffer(
    projectId: string,
    intent: SupportAssignmentOfferIntent,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportAssignmentOfferReceipt>;
}

function mapSnapshot(
  expectedCaseId: string,
  value: Awaited<ReturnType<typeof supportCaseAssignmentCandidatesForCase>>,
): SupportAssignmentSnapshot {
  if (value.caseId !== expectedCaseId) throw new SupportAssignmentIntegrityError();
  const current = value.currentAssignment;
  if (current && (!current.id || !current.version || !current.actionEtag))
    throw new SupportAssignmentIntegrityError();
  const workforce = value.workforceRevision;
  if (workforce && (!workforce.id || !workforce.number))
    throw new SupportAssignmentIntegrityError();
  return {
    caseId: value.caseId,
    caseVersion: value.caseVersion,
    caseReadToken: value.caseReadToken,
    assignmentState: value.assignmentState,
    currentAssignment: current
      ? {
          id: current.id!,
          version: current.version!,
          actionEtag: current.actionEtag!,
        }
      : null,
    workforceRevision: workforce ? { id: workforce.id!, number: workforce.number! } : null,
    actions: value.actions,
    teams: value.teams,
  };
}

const apiSource: SupportAssignmentSource = {
  async readCase(projectId, caseId, signal) {
    try {
      return mapSnapshot(
        caseId,
        await supportCaseAssignmentCandidatesForCase(
          projectId,
          caseId,
          signal ? { signal } : undefined,
        ),
      );
    } catch (cause) {
      if (cause instanceof SupportAssignmentIntegrityError) throw cause;
      throw normalizeApiError(cause);
    }
  },

  async execute(projectId, intent, idempotencyKey, signal) {
    try {
      const current = intent.snapshot.currentAssignment;
      const value =
        intent.kind === 'CLAIM'
          ? await supportCaseAssignmentClaim(
              projectId,
              intent.snapshot.caseId,
              {
                teamId: intent.teamId,
                expectedCaseVersion: intent.snapshot.caseVersion,
                caseReadToken: intent.snapshot.caseReadToken,
              },
              {
                ...(signal ? { signal } : {}),
                headers: { 'Idempotency-Key': idempotencyKey },
              },
            )
          : intent.kind === 'RELEASE'
            ? await (() => {
                if (!current) throw new SupportAssignmentIntegrityError();
                return supportCaseAssignmentRelease(
                  projectId,
                  intent.snapshot.caseId,
                  {
                    assignmentId: current.id,
                    expectedAssignmentVersion: current.version,
                    reasonCode: intent.reasonCode,
                    ...(intent.reasonNote ? { reasonNote: intent.reasonNote } : {}),
                  },
                  {
                    ...(signal ? { signal } : {}),
                    headers: {
                      'If-Match': current.actionEtag,
                      'Idempotency-Key': idempotencyKey,
                    },
                  },
                );
              })()
            : await (() => {
                if (!current) throw new SupportAssignmentIntegrityError();
                const team = intent.snapshot.teams.find(
                  (candidate) => candidate.id === intent.teamId && candidate.actions.transfer,
                );
                const operator = team?.operators.find(
                  (candidate) => candidate.id === intent.operatorId && candidate.actions.transfer,
                );
                if (!team || !operator) throw new SupportAssignmentIntegrityError();
                return supportCaseAssignmentTransfer(
                  projectId,
                  intent.snapshot.caseId,
                  {
                    assignmentId: current.id,
                    expectedAssignmentVersion: current.version,
                    teamId: team.id,
                    operatorCmsUserId: operator.id,
                    reasonCode: intent.reasonCode,
                    ...(intent.reasonNote ? { reasonNote: intent.reasonNote } : {}),
                  },
                  {
                    ...(signal ? { signal } : {}),
                    headers: {
                      'If-Match': current.actionEtag,
                      'Idempotency-Key': idempotencyKey,
                    },
                  },
                );
              })();
      const expectedIntent =
        intent.kind === 'CLAIM'
          ? 'CLAIM_CASE_ASSIGNMENT'
          : intent.kind === 'RELEASE'
            ? 'RELEASE_CASE_ASSIGNMENT'
            : 'TRANSFER_CASE_ASSIGNMENT';
      if (value.intent !== expectedIntent || value.assignment.caseId !== intent.snapshot.caseId)
        throw new SupportAssignmentIntegrityError();
      return {
        intent: value.intent,
        caseId: value.assignment.caseId,
        assignmentId: value.assignment.id,
        caseVersion: value.caseVersion,
        assignmentVersion: value.assignmentVersion,
      };
    } catch (cause) {
      if (cause instanceof SupportAssignmentIntegrityError) throw cause;
      throw normalizeApiError(cause);
    }
  },

  async listOffers(projectId, signal) {
    try {
      const value = await supportRoutingOfferList(
        projectId,
        undefined,
        signal ? { signal } : undefined,
      );
      return value.offers.map((offer) => {
        if (!offer.acceptToken || !offer.actionEtag) throw new SupportAssignmentIntegrityError();
        return {
          assignmentId: offer.assignmentId,
          caseId: offer.caseId,
          assignmentVersion: offer.assignmentVersion,
          expiresAt: offer.expiresAt,
          actionEtag: offer.actionEtag,
          offerToken: offer.acceptToken,
        };
      });
    } catch (cause) {
      if (cause instanceof SupportAssignmentIntegrityError) throw cause;
      throw normalizeApiError(cause);
    }
  },

  async actOnOffer(projectId, intent, idempotencyKey, signal) {
    try {
      const request =
        intent.kind === 'ACCEPT' ? supportRoutingOfferAccept : supportRoutingOfferDecline;
      const value = await request(
        projectId,
        intent.offer.assignmentId,
        {
          expectedAssignmentVersion: intent.offer.assignmentVersion,
          offerToken: intent.offer.offerToken,
        },
        {
          ...(signal ? { signal } : {}),
          headers: {
            'If-Match': intent.offer.actionEtag,
            'Idempotency-Key': idempotencyKey,
          },
        },
      );
      const expectedOutcome = intent.kind === 'ACCEPT' ? 'ACCEPTED' : 'DECLINED';
      if (value.assignmentId !== intent.offer.assignmentId || value.outcome !== expectedOutcome)
        throw new SupportAssignmentIntegrityError();
      return {
        assignmentId: value.assignmentId,
        caseVersion: value.caseVersion,
        outcome: value.outcome,
      };
    } catch (cause) {
      if (cause instanceof SupportAssignmentIntegrityError) throw cause;
      throw normalizeApiError(cause);
    }
  },
};

const mockSource: SupportAssignmentSource = {
  async readCase(_projectId, caseId, signal) {
    if (signal?.aborted) throw signal.reason;
    const assignment = readMockSupportAssignment(caseId);
    return {
      caseId,
      caseVersion: 1,
      caseReadToken: 'mock-read-token',
      assignmentState: assignment ? 'ASSIGNED' : 'UNASSIGNED',
      currentAssignment: assignment
        ? {
            id: assignment.id,
            version: assignment.version,
            actionEtag: assignment.actionEtag,
          }
        : null,
      workforceRevision: { id: 'mock-workforce', number: 1 },
      actions: {
        claim: !assignment,
        assign: !assignment,
        assignWithOverride: !assignment,
        release: Boolean(assignment),
        transfer: Boolean(assignment),
        transferWithOverride: Boolean(assignment),
      },
      teams: [
        {
          id: 'mock-team-games',
          code: 'GAMES',
          name: 'Игры',
          actions: {
            claim: !assignment,
            assign: !assignment,
            assignWithOverride: !assignment,
            transfer: Boolean(assignment),
            transferWithOverride: Boolean(assignment),
          },
          operators: [
            {
              id: 'mock-operator-anna',
              displayName: 'Анна Смирнова',
              availableCapacityUnits: 240,
              effectiveAvailability: 'AVAILABLE',
              requiredOverrides: [],
              actions: {
                claim: false,
                assign: !assignment,
                assignWithOverride: !assignment,
                transfer: Boolean(assignment),
                transferWithOverride: Boolean(assignment),
              },
            },
            {
              id: 'mock-operator-maxim',
              displayName: 'Максим Орлов',
              availableCapacityUnits: 0,
              effectiveAvailability: 'OFFLINE',
              requiredOverrides: ['AVAILABILITY', 'CAPACITY'],
              actions: {
                claim: false,
                assign: false,
                assignWithOverride: !assignment,
                transfer: false,
                transferWithOverride: Boolean(assignment),
              },
            },
          ],
        },
      ],
    };
  },
  async execute(_projectId, intent) {
    if (
      typeof sessionStorage !== 'undefined' &&
      sessionStorage.getItem('retenive:e2e:assignment-conflict-once') === '1'
    ) {
      sessionStorage.removeItem('retenive:e2e:assignment-conflict-once');
      throw new ApiError(409, 'mock conflict', undefined, undefined, 'CASE_VERSION_CONFLICT');
    }
    const assignment =
      intent.kind === 'CLAIM'
        ? claimMockSupportAssignment(intent.snapshot.caseId)
        : readMockSupportAssignment(intent.snapshot.caseId);
    if (!assignment)
      throw new ApiError(
        409,
        'mock stale assignment',
        undefined,
        undefined,
        'ASSIGNMENT_VERSION_CONFLICT',
      );
    if (intent.kind === 'RELEASE') releaseMockSupportAssignment(intent.snapshot.caseId);
    return {
      intent:
        intent.kind === 'CLAIM'
          ? 'CLAIM_CASE_ASSIGNMENT'
          : intent.kind === 'RELEASE'
            ? 'RELEASE_CASE_ASSIGNMENT'
            : 'TRANSFER_CASE_ASSIGNMENT',
      caseId: intent.snapshot.caseId,
      assignmentId: assignment.id,
      caseVersion: intent.snapshot.caseVersion + 1,
      assignmentVersion: assignment.version,
    };
  },
  async listOffers(_projectId, signal) {
    if (signal?.aborted) throw signal.reason;
    return [];
  },
  async actOnOffer() {
    throw new Error('Mock assignment offers are not configured');
  },
};

export const supportAssignmentSource: SupportAssignmentSource = isMockMode ? mockSource : apiSource;
