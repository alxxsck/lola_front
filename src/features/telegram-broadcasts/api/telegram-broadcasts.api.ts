import {
  telegramBroadcastApprove,
  telegramBroadcastCancel,
  telegramBroadcastCreate,
  telegramBroadcastGet,
  telegramBroadcastList,
  telegramBroadcastOutcomes,
  telegramBroadcastPause,
  telegramBroadcastPreview,
  telegramBroadcastResume,
  telegramBroadcastSchedule,
  telegramBroadcastStart,
  telegramBroadcastTest,
  telegramBroadcastUpdate,
} from "@/shared/api/generated/lola-backend";
import type {
  TelegramBroadcastDetailResponseDto,
  TelegramBroadcastOutcomeDto,
  TelegramBroadcastPreviewResponseDto,
  TelegramBroadcastResponseDto,
} from "@/shared/api/generated/models";
import type { TelegramBroadcast } from "../model/telegram-broadcast";
import type {
  TelegramBroadcastDelivery,
  TelegramBroadcastsApi,
  TelegramBroadcastTestSend,
} from "../model/use-telegram-broadcasts";

function commandOptions(signal: AbortSignal, idempotencyKey: string) {
  return {
    signal,
    headers: { "Idempotency-Key": idempotencyKey },
  };
}

export function mapTelegramBroadcastSummary(
  value: TelegramBroadcastResponseDto,
): TelegramBroadcast {
  return {
    id: value.id,
    projectId: value.projectId,
    title: value.title,
    status: value.status,
    version: value.version,
    revision: {
      id: value.revision.id,
      revisionNumber: value.revision.revisionNumber,
      contentHash: value.revision.contentHash,
      text: value.revision.text ?? "",
      contentAvailable: value.revision.contentAvailable,
      createdAt: value.revision.createdAt,
    },
    content: { text: value.revision.text ?? "" },
    audience: { kind: "ALL_EXPLICITLY_OPTED_IN" },
    approval: null,
    latestTest: null,
    recipientCount: value.recipientCount,
    scheduledAt: value.scheduledAt ?? null,
    progress: null,
    allowedActions: [...value.allowedActions],
    createdAt: value.createdAt,
    updatedAt: value.updatedAt,
  };
}

export function mapTelegramBroadcastDetail(
  value: TelegramBroadcastDetailResponseDto,
): TelegramBroadcast {
  const summary = mapTelegramBroadcastSummary(value);
  return {
    ...summary,
    approval: value.approval
      ? {
          id: value.approval.id,
          revisionId: value.approval.revisionId,
          contentHash: value.approval.contentHash,
          recipientCount: value.approval.recipientCount,
          successfulTestId: value.approval.successfulTestId,
          audiencePolicy: value.approval.audiencePolicy,
          approvedAt: value.approval.approvedAt,
          approvedByActorType: value.approval.approvedByActorType,
        }
      : null,
    latestTest: value.latestTest
      ? {
          id: value.latestTest.id,
          label: value.latestTest.label,
          revisionId: value.latestTest.revisionId,
          status: value.latestTest.status,
          currentRevision: value.latestTest.currentRevision,
          sentAt: value.latestTest.sentAt ?? null,
        }
      : null,
    progress: { ...value.progress },
  };
}

function mapPreview(
  broadcastId: string,
  value: TelegramBroadcastPreviewResponseDto,
) {
  return {
    broadcastId,
    version: value.version,
    revisionId: value.revisionId,
    contentHash: value.contentHash,
    renderedText: value.renderedText,
    eligibleRecipientCount: value.eligibleRecipientCount,
    totalEvaluated: value.totalEvaluated,
    exclusions: [
      {
        reason: "CONSENT_NOT_ACTIVE" as const,
        count: value.exclusions.consentNotActive,
      },
      {
        reason: "STALE_CONSENT" as const,
        count: value.exclusions.staleConsent,
      },
      {
        reason: "NO_ACTIVE_LINK" as const,
        count: value.exclusions.noActiveLink,
      },
      {
        reason: "INSTALLATION_UNAVAILABLE" as const,
        count: value.exclusions.installationUnavailable,
      },
    ].filter((item) => item.count > 0),
  };
}

function mapTest(value: {
  id: string;
  label: string;
  revisionId: string;
  status: TelegramBroadcastTestSend["status"];
  currentRevision: boolean;
  sentAt?: string | null;
}): TelegramBroadcastTestSend {
  return {
    id: value.id,
    label: value.label,
    revisionId: value.revisionId,
    status: value.status,
    currentRevision: value.currentRevision,
    sentAt: value.sentAt ?? null,
  };
}

type PublicTelegramBroadcastOutcomeCode =
  | "BROADCAST_CANCELLED"
  | "END_USER_WITHDREW"
  | "PROVIDER_BLOCKED"
  | "TELEGRAM_BOT_TOKEN_INVALID"
  | "TELEGRAM_BROADCAST_CONSENT_STALE"
  | "TELEGRAM_BROADCAST_DELIVERY_FENCE_LOST"
  | "TELEGRAM_BROADCAST_INSTALLATION_STALE"
  | "TELEGRAM_BROADCAST_INTERNAL_FAILURE"
  | "TELEGRAM_BROADCAST_LINK_STALE"
  | "TELEGRAM_BROADCAST_NOT_RUNNING"
  | "TELEGRAM_BROADCAST_WORKER_LEASE_EXPIRED"
  | "TELEGRAM_OUTCOME_UNKNOWN"
  | "TELEGRAM_PRODUCT_LOCAL_RATE_LIMIT"
  | "TELEGRAM_PROVIDER_RESPONSE_INVALID"
  | "TELEGRAM_RETRY_AFTER_UNSUPPORTED"
  | "TELEGRAM_USER_BLOCKED";

const PUBLIC_OUTCOME_CATEGORY = {
  BROADCAST_CANCELLED: "CANCELLED",
  END_USER_WITHDREW: "CONSENT_REVOKED",
  PROVIDER_BLOCKED: "RECIPIENT_UNAVAILABLE",
  TELEGRAM_BOT_TOKEN_INVALID: "INSTALLATION_UNAVAILABLE",
  TELEGRAM_BROADCAST_CONSENT_STALE: "CONSENT_REVOKED",
  TELEGRAM_BROADCAST_DELIVERY_FENCE_LOST: "AMBIGUOUS_PROVIDER_RESULT",
  TELEGRAM_BROADCAST_INSTALLATION_STALE: "INSTALLATION_UNAVAILABLE",
  TELEGRAM_BROADCAST_INTERNAL_FAILURE: "INTERNAL_FAILURE",
  TELEGRAM_BROADCAST_LINK_STALE: "LINK_NOT_ACTIVE",
  TELEGRAM_BROADCAST_NOT_RUNNING: "CANCELLED",
  TELEGRAM_BROADCAST_WORKER_LEASE_EXPIRED: "AMBIGUOUS_PROVIDER_RESULT",
  TELEGRAM_OUTCOME_UNKNOWN: "AMBIGUOUS_PROVIDER_RESULT",
  TELEGRAM_PRODUCT_LOCAL_RATE_LIMIT: "RATE_LIMIT_EXHAUSTED",
  TELEGRAM_PROVIDER_RESPONSE_INVALID: "AMBIGUOUS_PROVIDER_RESULT",
  TELEGRAM_RETRY_AFTER_UNSUPPORTED: "RATE_LIMIT_EXHAUSTED",
  TELEGRAM_USER_BLOCKED: "RECIPIENT_UNAVAILABLE",
} as const satisfies Record<
  PublicTelegramBroadcastOutcomeCode,
  NonNullable<TelegramBroadcastDelivery["safeFailureCategory"]>
>;

export function mapTelegramBroadcastSafeFailureCategory(
  errorCode?: string | null,
): TelegramBroadcastDelivery["safeFailureCategory"] {
  if (!errorCode) return null;
  return (
    PUBLIC_OUTCOME_CATEGORY[
      errorCode as keyof typeof PUBLIC_OUTCOME_CATEGORY
    ] ?? null
  );
}

function mapOutcome(
  value: TelegramBroadcastOutcomeDto,
): TelegramBroadcastDelivery {
  return {
    id: value.id,
    status: value.status,
    safeFailureCategory: mapTelegramBroadcastSafeFailureCategory(
      value.errorCode,
    ),
    createdAt: value.createdAt,
    finishedAt: value.finishedAt ?? null,
  };
}

export const telegramBroadcastsApi: TelegramBroadcastsApi = {
  async list(projectId, query, options) {
    const response = await telegramBroadcastList(projectId, query, options);
    return {
      items: response.items.map(mapTelegramBroadcastSummary),
      nextCursor: response.nextCursor ?? null,
      total: response.total,
    };
  },

  async get(projectId, broadcastId, options) {
    return mapTelegramBroadcastDetail(
      await telegramBroadcastGet(projectId, broadcastId, options),
    );
  },

  async create(projectId, draft, options) {
    return mapTelegramBroadcastSummary(
      await telegramBroadcastCreate(
        projectId,
        { title: draft.title, text: draft.content.text },
        commandOptions(options.signal, options.idempotencyKey),
      ),
    );
  },

  async updateDraft(projectId, broadcastId, input, options) {
    return mapTelegramBroadcastSummary(
      await telegramBroadcastUpdate(
        projectId,
        broadcastId,
        {
          expectedVersion: input.expectedVersion,
          title: input.draft.title,
          text: input.draft.content.text,
        },
        commandOptions(options.signal, options.idempotencyKey),
      ),
    );
  },

  async preview(projectId, broadcastId, input, options) {
    return mapPreview(
      broadcastId,
      await telegramBroadcastPreview(
        projectId,
        broadcastId,
        input,
        commandOptions(options.signal, options.idempotencyKey),
      ),
    );
  },

  async testSend(projectId, broadcastId, input, options) {
    return mapTest(
      await telegramBroadcastTest(
        projectId,
        broadcastId,
        {
          endUserExternalId: input.endUserExternalId,
          expectedVersion: input.expectedVersion,
          label: input.label,
        },
        commandOptions(options.signal, options.idempotencyKey),
      ),
    );
  },

  async approve(projectId, broadcastId, input, options) {
    return mapTelegramBroadcastSummary(
      await telegramBroadcastApprove(
        projectId,
        broadcastId,
        input,
        commandOptions(options.signal, options.idempotencyKey),
      ),
    );
  },

  async start(projectId, broadcastId, input, options) {
    return mapTelegramBroadcastSummary(
      await telegramBroadcastStart(
        projectId,
        broadcastId,
        input,
        commandOptions(options.signal, options.idempotencyKey),
      ),
    );
  },

  async schedule(projectId, broadcastId, input, options) {
    return mapTelegramBroadcastSummary(
      await telegramBroadcastSchedule(
        projectId,
        broadcastId,
        input,
        commandOptions(options.signal, options.idempotencyKey),
      ),
    );
  },

  async pause(projectId, broadcastId, input, options) {
    return mapTelegramBroadcastSummary(
      await telegramBroadcastPause(
        projectId,
        broadcastId,
        input,
        commandOptions(options.signal, options.idempotencyKey),
      ),
    );
  },

  async resume(projectId, broadcastId, input, options) {
    return mapTelegramBroadcastSummary(
      await telegramBroadcastResume(
        projectId,
        broadcastId,
        input,
        commandOptions(options.signal, options.idempotencyKey),
      ),
    );
  },

  async cancel(projectId, broadcastId, input, options) {
    return mapTelegramBroadcastSummary(
      await telegramBroadcastCancel(
        projectId,
        broadcastId,
        input,
        commandOptions(options.signal, options.idempotencyKey),
      ),
    );
  },

  async listDeliveries(projectId, broadcastId, query, options) {
    const response = await telegramBroadcastOutcomes(
      projectId,
      broadcastId,
      query,
      options,
    );
    return {
      items: response.items.map(mapOutcome),
      nextCursor: response.nextCursor ?? null,
      total: response.total,
    };
  },
};
