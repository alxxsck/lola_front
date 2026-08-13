import {
  supportCaseAssignmentAssign,
  supportCaseAssignmentAssignWithOverride,
  supportCaseAssignmentBatchExecute,
  supportCaseAssignmentBatchOutcome,
  supportCaseAssignmentCommandOutcome,
  supportCaseAssignmentRelease,
  supportCaseAssignmentTransfer,
  supportCaseAssignmentTransferWithOverride,
  supportLeadInvestigation,
} from '@/shared/api/generated/retenive-backend';
import type {
  AssignSupportCaseAssignmentDtoReasonCode,
  ForceAssignSupportCaseAssignmentDtoReasonCode,
  ForceTransferSupportCaseAssignmentDtoReasonCode,
  ReleaseSupportCaseAssignmentDtoReasonCode,
  SupportCaseAssignmentBatchItemRequestDto,
  SupportCaseAssignmentBatchResponseDto,
  SupportLeadSafeFactDto,
  TransferSupportCaseAssignmentDtoReasonCode,
} from '@/shared/api/generated/models';
import {
  supportAssignmentSource,
  type SupportAssignmentSnapshot,
} from '@/features/support-case-assignment/api/support-assignment-source';
import { normalizeApiError } from '@/shared/api/http/api-error';
import { isMockMode } from '@/shared/config/data-mode';

interface TargetedLeadIntent {
  snapshot: SupportAssignmentSnapshot;
  teamId: string;
  operatorId: string;
  reasonNote?: string;
}

export interface SupportLeadAssignIntent extends TargetedLeadIntent {
  kind: 'ASSIGN';
  reasonCode: AssignSupportCaseAssignmentDtoReasonCode;
}

export interface SupportLeadTransferIntent extends TargetedLeadIntent {
  kind: 'TRANSFER';
  reasonCode: TransferSupportCaseAssignmentDtoReasonCode;
}

interface ForceLeadIntent extends TargetedLeadIntent {
  bypassAvailability: boolean;
  bypassCapacity: boolean;
  reasonNote: string;
}

export interface SupportLeadForceAssignIntent extends ForceLeadIntent {
  kind: 'FORCE_ASSIGN';
  reasonCode: ForceAssignSupportCaseAssignmentDtoReasonCode;
}

export interface SupportLeadForceTransferIntent extends ForceLeadIntent {
  kind: 'FORCE_TRANSFER';
  reasonCode: ForceTransferSupportCaseAssignmentDtoReasonCode;
}

export interface SupportLeadReleaseIntent {
  kind: 'RELEASE';
  snapshot: SupportAssignmentSnapshot;
  reasonCode: ReleaseSupportCaseAssignmentDtoReasonCode;
  reasonNote?: string;
}

export type SupportLeadAssignmentIntent =
  | SupportLeadAssignIntent
  | SupportLeadTransferIntent
  | SupportLeadForceAssignIntent
  | SupportLeadForceTransferIntent
  | SupportLeadReleaseIntent;

export interface SupportLeadAssignmentReceipt {
  intent:
    | 'ASSIGN_CASE_ASSIGNMENT'
    | 'ASSIGN_CASE_ASSIGNMENT_WITH_OVERRIDE'
    | 'TRANSFER_CASE_ASSIGNMENT'
    | 'TRANSFER_CASE_ASSIGNMENT_WITH_OVERRIDE'
    | 'RELEASE_CASE_ASSIGNMENT';
  caseId: string;
  assignmentId: string;
  caseVersion: number;
  assignmentVersion: number;
  actionEtag: string;
}

export interface SupportLeadAssignmentSource {
  readCase(
    projectId: string,
    caseId: string,
    signal?: AbortSignal,
  ): Promise<SupportAssignmentSnapshot>;
  execute(
    projectId: string,
    intent: SupportLeadAssignmentIntent,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportLeadAssignmentReceipt>;
  lookupOutcome(
    projectId: string,
    caseId: string,
    idempotencyKey: string,
    expectedIntent: SupportLeadAssignmentReceipt['intent'],
    signal?: AbortSignal,
  ): Promise<SupportLeadAssignmentReceipt>;
  executeBatch(
    projectId: string,
    items: SupportCaseAssignmentBatchItemRequestDto[],
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportCaseAssignmentBatchResponseDto>;
  lookupBatchOutcome(
    projectId: string,
    idempotencyKey: string,
    expectedItems: SupportCaseAssignmentBatchItemRequestDto[],
    signal?: AbortSignal,
  ): Promise<SupportCaseAssignmentBatchResponseDto>;
  readAudit(
    projectId: string,
    caseId: string,
    signal?: AbortSignal,
  ): Promise<SupportLeadSafeFactDto[]>;
}

export class SupportLeadAssignmentIntegrityError extends Error {
  constructor() {
    super('Support Lead assignment response failed integrity validation');
    this.name = 'SupportLeadAssignmentIntegrityError';
  }
}

export function expectedSupportLeadAssignmentReceiptIntent(intent: SupportLeadAssignmentIntent) {
  return (
    {
      ASSIGN: 'ASSIGN_CASE_ASSIGNMENT',
      FORCE_ASSIGN: 'ASSIGN_CASE_ASSIGNMENT_WITH_OVERRIDE',
      TRANSFER: 'TRANSFER_CASE_ASSIGNMENT',
      FORCE_TRANSFER: 'TRANSFER_CASE_ASSIGNMENT_WITH_OVERRIDE',
      RELEASE: 'RELEASE_CASE_ASSIGNMENT',
    } as const
  )[intent.kind];
}

function mapReceipt(
  caseId: string,
  value: Awaited<ReturnType<typeof supportCaseAssignmentCommandOutcome>>,
  intent?: SupportLeadAssignmentReceipt['intent'],
): SupportLeadAssignmentReceipt {
  const allowedIntents: SupportLeadAssignmentReceipt['intent'][] = [
    'ASSIGN_CASE_ASSIGNMENT',
    'ASSIGN_CASE_ASSIGNMENT_WITH_OVERRIDE',
    'TRANSFER_CASE_ASSIGNMENT',
    'TRANSFER_CASE_ASSIGNMENT_WITH_OVERRIDE',
    'RELEASE_CASE_ASSIGNMENT',
  ];
  if (
    value.assignment.caseId !== caseId ||
    (intent && value.intent !== intent) ||
    !allowedIntents.includes(value.intent as SupportLeadAssignmentReceipt['intent']) ||
    !value.assignment.id ||
    !value.actionEtag
  )
    throw new SupportLeadAssignmentIntegrityError();
  return {
    intent: value.intent as SupportLeadAssignmentReceipt['intent'],
    caseId: value.assignment.caseId,
    assignmentId: value.assignment.id,
    caseVersion: value.caseVersion,
    assignmentVersion: value.assignmentVersion,
    actionEtag: value.actionEtag,
  };
}

function validateBatchReceipt(
  value: SupportCaseAssignmentBatchResponseDto,
  expectedItems: SupportCaseAssignmentBatchItemRequestDto[],
): SupportCaseAssignmentBatchResponseDto {
  const expected = new Map(expectedItems.map((item) => [item.clientItemId, item.caseId]));
  const seen = new Set<string>();
  const succeeded = value.items.filter((item) => item.status === 'SUCCEEDED');
  const failed = value.items.filter((item) => item.status === 'FAILED');
  const pending = value.items.filter((item) => item.status === 'PENDING');
  const countsAreValid =
    value.itemCount === expectedItems.length &&
    value.items.length === expectedItems.length &&
    value.succeededCount === succeeded.length &&
    value.failedCount === failed.length &&
    value.processedCount === value.succeededCount + value.failedCount &&
    value.processedCount <= value.itemCount;
  const itemsAreValid = value.items.every((item) => {
    if (seen.has(item.clientItemId)) return false;
    seen.add(item.clientItemId);
    const expectedItem = expectedItems.find(
      (candidate) => candidate.clientItemId === item.clientItemId,
    );
    if (!expectedItem || expected.get(item.clientItemId) !== item.caseId) return false;
    if (item.status === 'PENDING') return !item.receipt && !item.error;
    if (item.status === 'FAILED') return Boolean(item.error) && !item.receipt;
    const receipt = item.receipt;
    return Boolean(
      receipt &&
      !item.error &&
      receipt.assignment.caseId === item.caseId &&
      receipt.assignment.team.id === expectedItem.teamId &&
      receipt.assignment.operator.id === expectedItem.operatorCmsUserId &&
      receipt.intent ===
        (expectedItem.force ? 'ASSIGN_CASE_ASSIGNMENT_WITH_OVERRIDE' : 'ASSIGN_CASE_ASSIGNMENT'),
    );
  });
  const lifecycleIsValid =
    value.status === 'PROCESSING'
      ? value.outcome === 'PENDING' && pending.length > 0
      : pending.length === 0 &&
        value.processedCount === value.itemCount &&
        value.outcome ===
          (failed.length === 0 ? 'SUCCEEDED' : succeeded.length === 0 ? 'FAILED' : 'PARTIAL');
  if (!countsAreValid || !itemsAreValid || !lifecycleIsValid)
    throw new SupportLeadAssignmentIntegrityError();
  return value;
}

export const supportLeadAssignmentCommandSource: Omit<SupportLeadAssignmentSource, 'readCase'> = {
  async readAudit(projectId, caseId, signal) {
    try {
      const value = await supportLeadInvestigation(
        projectId,
        caseId,
        { limit: 50 },
        signal ? { signal } : undefined,
      );
      if (value.caseId !== caseId) throw new SupportLeadAssignmentIntegrityError();
      return value.data.facts.filter((fact) => fact.factKind === 'ASSIGNMENT');
    } catch (cause) {
      if (cause instanceof SupportLeadAssignmentIntegrityError) throw cause;
      throw normalizeApiError(cause);
    }
  },
  async execute(projectId, intent, idempotencyKey, signal) {
    const snapshot = intent.snapshot;
    const current = snapshot.currentAssignment;
    const config = {
      ...(signal ? { signal } : {}),
      headers: {
        ...(current ? { 'If-Match': current.actionEtag } : {}),
        'Idempotency-Key': idempotencyKey,
      },
    };
    try {
      const value =
        intent.kind === 'ASSIGN'
          ? await supportCaseAssignmentAssign(
              projectId,
              snapshot.caseId,
              {
                teamId: intent.teamId,
                operatorCmsUserId: intent.operatorId,
                expectedCaseVersion: snapshot.caseVersion,
                caseReadToken: snapshot.caseReadToken,
                reasonCode: intent.reasonCode,
                ...(intent.reasonNote ? { reasonNote: intent.reasonNote } : {}),
              },
              config,
            )
          : intent.kind === 'FORCE_ASSIGN'
            ? await supportCaseAssignmentAssignWithOverride(
                projectId,
                snapshot.caseId,
                {
                  teamId: intent.teamId,
                  operatorCmsUserId: intent.operatorId,
                  expectedCaseVersion: snapshot.caseVersion,
                  caseReadToken: snapshot.caseReadToken,
                  bypassAvailability: intent.bypassAvailability,
                  bypassCapacity: intent.bypassCapacity,
                  reasonCode: intent.reasonCode,
                  reasonNote: intent.reasonNote,
                },
                config,
              )
            : intent.kind === 'RELEASE'
              ? await (() => {
                  if (!current) throw new SupportLeadAssignmentIntegrityError();
                  return supportCaseAssignmentRelease(
                    projectId,
                    snapshot.caseId,
                    {
                      assignmentId: current.id,
                      expectedAssignmentVersion: current.version,
                      reasonCode: intent.reasonCode,
                      ...(intent.reasonNote ? { reasonNote: intent.reasonNote } : {}),
                    },
                    config,
                  );
                })()
              : await (() => {
                  if (!current) throw new SupportLeadAssignmentIntegrityError();
                  return intent.kind === 'TRANSFER'
                    ? supportCaseAssignmentTransfer(
                        projectId,
                        snapshot.caseId,
                        {
                          assignmentId: current.id,
                          expectedAssignmentVersion: current.version,
                          teamId: intent.teamId,
                          operatorCmsUserId: intent.operatorId,
                          reasonCode: intent.reasonCode,
                          ...(intent.reasonNote ? { reasonNote: intent.reasonNote } : {}),
                        },
                        config,
                      )
                    : supportCaseAssignmentTransferWithOverride(
                        projectId,
                        snapshot.caseId,
                        {
                          assignmentId: current.id,
                          expectedAssignmentVersion: current.version,
                          teamId: intent.teamId,
                          operatorCmsUserId: intent.operatorId,
                          reasonCode: intent.reasonCode,
                          bypassAvailability: intent.bypassAvailability,
                          bypassCapacity: intent.bypassCapacity,
                          reasonNote: intent.reasonNote,
                        },
                        config,
                      );
                })();
      return mapReceipt(snapshot.caseId, value, expectedSupportLeadAssignmentReceiptIntent(intent));
    } catch (cause) {
      if (cause instanceof SupportLeadAssignmentIntegrityError) throw cause;
      throw normalizeApiError(cause);
    }
  },

  async lookupOutcome(projectId, caseId, idempotencyKey, intent, signal) {
    try {
      return mapReceipt(
        caseId,
        await supportCaseAssignmentCommandOutcome(projectId, caseId, {
          ...(signal ? { signal } : {}),
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
        intent,
      );
    } catch (cause) {
      if (cause instanceof SupportLeadAssignmentIntegrityError) throw cause;
      throw normalizeApiError(cause);
    }
  },

  async executeBatch(projectId, items, idempotencyKey, signal) {
    try {
      return validateBatchReceipt(
        await supportCaseAssignmentBatchExecute(
          projectId,
          { items },
          {
            ...(signal ? { signal } : {}),
            headers: { 'Idempotency-Key': idempotencyKey },
          },
        ),
        items,
      );
    } catch (cause) {
      if (cause instanceof SupportLeadAssignmentIntegrityError) throw cause;
      throw normalizeApiError(cause);
    }
  },

  async lookupBatchOutcome(projectId, idempotencyKey, expectedItems, signal) {
    try {
      return validateBatchReceipt(
        await supportCaseAssignmentBatchOutcome(projectId, {
          ...(signal ? { signal } : {}),
          headers: { 'Idempotency-Key': idempotencyKey },
        }),
        expectedItems,
      );
    } catch (cause) {
      if (cause instanceof SupportLeadAssignmentIntegrityError) throw cause;
      throw normalizeApiError(cause);
    }
  },
};

const mockSource: SupportLeadAssignmentSource = {
  readCase: supportAssignmentSource.readCase,
  async execute(_projectId, intent) {
    return {
      intent: expectedSupportLeadAssignmentReceiptIntent(intent),
      caseId: intent.snapshot.caseId,
      assignmentId: intent.snapshot.currentAssignment?.id ?? 'mock-lead-assignment',
      caseVersion: intent.snapshot.caseVersion + 1,
      assignmentVersion: (intent.snapshot.currentAssignment?.version ?? 0) + 1,
      actionEtag: 'mock-lead-assignment-etag',
    };
  },
  async lookupOutcome() {
    throw new Error('Mock outcome lookup is not configured');
  },
  async executeBatch(_projectId, items) {
    return {
      batchId: 'mock-assignment-batch',
      status: 'COMPLETED',
      outcome: 'SUCCEEDED',
      itemCount: items.length,
      processedCount: items.length,
      succeededCount: items.length,
      failedCount: 0,
      items: items.map((item) => ({
        clientItemId: item.clientItemId,
        caseId: item.caseId,
        status: 'SUCCEEDED',
      })),
    };
  },
  async lookupBatchOutcome() {
    throw new Error('Mock batch outcome lookup is not configured');
  },
  async readAudit() {
    return [];
  },
};

export const supportLeadAssignmentSource: SupportLeadAssignmentSource = isMockMode
  ? mockSource
  : {
      readCase: supportAssignmentSource.readCase,
      ...supportLeadAssignmentCommandSource,
    };
