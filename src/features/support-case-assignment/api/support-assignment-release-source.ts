import { supportCaseAssignmentRelease } from "@/shared/api/generated/retenive-backend";
import type {
  ReleaseSupportCaseAssignmentDtoReasonCode,
  SupportCaseAssignmentMutationResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { isMockMode } from "@/shared/config/data-mode";

/**
 * A snapshot of the server-authorized assignment release. `actionEtag` is an
 * opaque optimistic-concurrency value and must never be rendered or logged.
 */
export interface SupportAssignmentReleaseIntent {
  caseId: string;
  assignmentId: string;
  expectedAssignmentVersion: number;
  actionEtag: string;
  reasonCode: ReleaseSupportCaseAssignmentDtoReasonCode;
  reasonNote?: string;
}

export interface SupportAssignmentReleaseReceipt {
  assignmentId: string;
  caseId: string;
  assignmentVersion: number;
  caseVersion: number;
}

export interface SupportAssignmentReleaseSource {
  release(
    projectId: string,
    intent: SupportAssignmentReleaseIntent,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportAssignmentReleaseReceipt>;
}

export class SupportAssignmentReleaseReceiptError extends Error {
  constructor() {
    super("Support assignment release returned an unexpected intent");
    this.name = "SupportAssignmentReleaseReceiptError";
  }
}

function mapReceipt(
  value: SupportCaseAssignmentMutationResponseDto,
): SupportAssignmentReleaseReceipt {
  if (value.intent !== "RELEASE_CASE_ASSIGNMENT")
    throw new SupportAssignmentReleaseReceiptError();
  return {
    assignmentId: value.assignment.id,
    caseId: value.assignment.caseId,
    assignmentVersion: value.assignmentVersion,
    caseVersion: value.caseVersion,
  };
}

const apiSource: SupportAssignmentReleaseSource = {
  async release(projectId, intent, idempotencyKey, signal) {
    let response: SupportCaseAssignmentMutationResponseDto;
    try {
      response = await supportCaseAssignmentRelease(
        projectId,
        intent.caseId,
        {
          assignmentId: intent.assignmentId,
          expectedAssignmentVersion: intent.expectedAssignmentVersion,
          reasonCode: intent.reasonCode,
          ...(intent.reasonNote ? { reasonNote: intent.reasonNote } : {}),
        },
        {
          signal,
          headers: {
            "If-Match": intent.actionEtag,
            "Idempotency-Key": idempotencyKey,
          },
        },
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
    return mapReceipt(response);
  },
};

const mockSource: SupportAssignmentReleaseSource = {
  async release(_projectId, _intent, _idempotencyKey, signal) {
    if (signal?.aborted) throw signal.reason;
    throw new Error("Mock assignment release is not configured");
  },
};

export const supportAssignmentReleaseSource: SupportAssignmentReleaseSource =
  isMockMode ? mockSource : apiSource;
