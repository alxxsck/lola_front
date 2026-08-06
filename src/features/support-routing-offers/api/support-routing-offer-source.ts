import {
  supportRoutingOfferAccept,
  supportRoutingOfferDecline,
  supportRoutingOfferList,
} from "@/shared/api/generated/retenive-backend";
import type {
  SupportRoutingOfferActionReceiptDto,
  SupportRoutingOwnOfferDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { isMockMode } from "@/shared/config/data-mode";

export type SupportRoutingOfferActionKind = "ACCEPT" | "DECLINE";
export type SupportRoutingOfferActionOutcome = "ACCEPTED" | "DECLINED";

/**
 * An operator-bound routing offer. `offerToken` is an opaque capability: it
 * must be used only for its matching action and never rendered or logged.
 */
export interface SupportRoutingOffer {
  assignmentId: string;
  caseId: string;
  assignmentVersion: number;
  actionEtag: string;
  offerToken: string;
  expiresAt: string;
}

export interface SupportRoutingOfferReceipt {
  assignmentId: string;
  assignmentVersion: number;
  assignmentRootVersion: number;
  caseVersion: number;
  outcome: SupportRoutingOfferActionOutcome;
}

export interface SupportRoutingOfferAction {
  offer: SupportRoutingOffer;
  kind: SupportRoutingOfferActionKind;
  idempotencyKey: string;
}

export interface SupportRoutingOfferSource {
  list(projectId: string, signal?: AbortSignal): Promise<SupportRoutingOffer[]>;
  act(
    projectId: string,
    action: SupportRoutingOfferAction,
    signal?: AbortSignal,
  ): Promise<SupportRoutingOfferReceipt>;
}

function mapOffer(value: SupportRoutingOwnOfferDto): SupportRoutingOffer {
  if (!value.acceptToken || !value.actionEtag)
    throw new Error("Support routing offer is missing its action capability");
  return {
    assignmentId: value.assignmentId,
    caseId: value.caseId,
    assignmentVersion: value.assignmentVersion,
    actionEtag: value.actionEtag,
    offerToken: value.acceptToken,
    expiresAt: value.expiresAt,
  };
}

function mapReceipt(
  value: SupportRoutingOfferActionReceiptDto,
): SupportRoutingOfferReceipt {
  if (value.outcome !== "ACCEPTED" && value.outcome !== "DECLINED")
    throw new Error("Support routing offer returned an unknown action outcome");
  return {
    assignmentId: value.assignmentId,
    assignmentVersion: value.assignmentVersion,
    assignmentRootVersion: value.assignmentRootVersion,
    caseVersion: value.caseVersion,
    outcome: value.outcome,
  };
}

const apiSource: SupportRoutingOfferSource = {
  async list(projectId, signal) {
    try {
      const response = await supportRoutingOfferList(projectId, undefined, { signal });
      return response.offers.map(mapOffer);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async act(projectId, action, signal) {
    try {
      const request =
        action.kind === "ACCEPT"
          ? supportRoutingOfferAccept
          : supportRoutingOfferDecline;
      return mapReceipt(
        await request(
          projectId,
          action.offer.assignmentId,
          {
            expectedAssignmentVersion: action.offer.assignmentVersion,
            offerToken: action.offer.offerToken,
          },
          {
            signal,
            headers: {
              "If-Match": action.offer.actionEtag,
              "Idempotency-Key": action.idempotencyKey,
            },
          },
        ),
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockSource: SupportRoutingOfferSource = {
  async list(_projectId, signal) {
    if (signal?.aborted) throw signal.reason;
    return [];
  },
  async act(_projectId, _action, signal) {
    if (signal?.aborted) throw signal.reason;
    throw new Error("Mock routing offers are not configured");
  },
};

export const supportRoutingOfferSource: SupportRoutingOfferSource = isMockMode
  ? mockSource
  : apiSource;
