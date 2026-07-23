import {
  notificationOperationsDeliveries,
  notificationOperationsHealth,
  notificationOperationsIntegrations,
  notificationOperationsQuarantine,
  notificationOperationsReplay,
} from "@/shared/api/generated/lola-backend";
import type {
  NotificationOperationsDeliveryResponseDto,
  NotificationOperationsHealthResponseDto,
  NotificationOperationsIntegrationResponseDto,
  NotificationOperationsQuarantineResponseDto,
  NotificationOperationsReplayResponseDto,
  NotificationQuarantineDtoReason,
} from "@/shared/api/generated/models";
import type {
  NotificationOperationsDelivery,
  NotificationOperationsFilters,
  NotificationOperationsHealth,
  NotificationOperationsIntegration,
  NotificationOperationsPage,
  NotificationOperationsSafeErrorCategory,
} from "../model/notification-operations";

export interface NotificationOperationsCommandOptions {
  signal: AbortSignal;
  idempotencyKey: string;
}

export interface NotificationOperationsApi {
  health(options: {
    signal: AbortSignal;
  }): Promise<NotificationOperationsHealth>;
  deliveries(
    filters: NotificationOperationsFilters,
    cursor: string | null,
    options: { signal: AbortSignal },
  ): Promise<NotificationOperationsPage<NotificationOperationsDelivery>>;
  integrations(
    filters: NotificationOperationsFilters,
    cursor: string | null,
    options: { signal: AbortSignal },
  ): Promise<NotificationOperationsPage<NotificationOperationsIntegration>>;
  replay(
    delivery: Pick<NotificationOperationsDelivery, "id" | "operationsVersion">,
    options: NotificationOperationsCommandOptions,
  ): Promise<NotificationOperationsDelivery>;
  quarantine(
    integration: Pick<
      NotificationOperationsIntegration,
      "kind" | "integrationId" | "version"
    >,
    input: {
      reason: NotificationQuarantineDtoReason;
      confirmation: string;
    },
    options: NotificationOperationsCommandOptions,
  ): Promise<
    NotificationOperationsIntegration & {
      suppressedQueuedCount: number;
    }
  >;
}

const SAFE_ERROR_CATEGORIES = new Set<NotificationOperationsSafeErrorCategory>([
  "RATE_LIMITED",
  "TRANSIENT",
  "DESTINATION_INVALID",
  "PAYLOAD_INVALID",
  "LEASE_EXPIRED",
  "EXHAUSTED",
  "QUARANTINED",
  "OTHER",
]);

const SAFE_QUEUE_KINDS = new Set([
  "OPERATIONAL_NOTIFICATION",
  "TELEGRAM_PERSONAL",
  "TELEGRAM_BROADCAST",
]);
const SAFE_QUEUE_CHANNELS = new Set([
  "SLACK_WEBHOOK",
  "TELEGRAM_OPERATIONAL",
  "TELEGRAM_PRODUCT",
]);
const SAFE_QUEUE_STATUSES = new Set([
  "PENDING",
  "DELAYED",
  "PROCESSING",
  "DELIVERED",
  "REJECTED",
  "OUTCOME_UNKNOWN",
  "DEAD_LETTER",
  "CANCELLED",
  "SUPPRESSED",
  "QUEUED",
  "SENDING",
  "RETRY_WAIT",
  "SENT",
  "FAILED_PERMANENT",
  "SUPPRESSED_LINK",
  "SUPPRESSED_CONSENT",
  "SUPPRESSED_INSTALLATION",
]);
const SAFE_DELIVERY_STATUSES = new Set([
  "REJECTED",
  "OUTCOME_UNKNOWN",
  "DEAD_LETTER",
  "CANCELLED",
  "SUPPRESSED",
  "PENDING",
]);
const SAFE_INTEGRATION_STATUSES = new Set([
  "PENDING_TEST",
  "PENDING_SETUP",
  "ACTIVE",
  "DISABLED",
  "INVALID",
]);

function commandOptions(
  expectedVersion: number,
  options: NotificationOperationsCommandOptions,
) {
  return {
    signal: options.signal,
    headers: {
      "Expected-Version": String(expectedVersion),
      "Idempotency-Key": options.idempotencyKey,
    },
  };
}

export function mapNotificationOperationsHealth(
  value: NotificationOperationsHealthResponseDto,
): NotificationOperationsHealth {
  return {
    observedAt: value.observedAt,
    queues: value.queues.map((queue) => ({
      queueKind: SAFE_QUEUE_KINDS.has(queue.queueKind)
        ? (queue.queueKind as NotificationOperationsHealth["queues"][number]["queueKind"])
        : "OTHER",
      channel: SAFE_QUEUE_CHANNELS.has(queue.channel)
        ? (queue.channel as NotificationOperationsHealth["queues"][number]["channel"])
        : "OTHER",
      status: SAFE_QUEUE_STATUSES.has(queue.status) ? queue.status : "OTHER",
      count: queue.count,
      oldestAgeSeconds: queue.oldestAgeSeconds,
      attemptsInWindow: queue.attemptsInWindow,
    })),
    permanentCount: value.permanentCount,
    ambiguousCount: value.ambiguousCount,
    suppressedCount: value.suppressedCount,
    deadLetterCount: value.deadLetterCount,
    providers: value.providers.map((provider) => ({
      channel: provider.channel,
      state: provider.state,
    })),
    telegramProductAdmission: value.telegramProductAdmission.map(
      (admission) => ({
        scope: admission.scope,
        exhaustedBucketCount: admission.exhaustedBucketCount,
        maximumRetryDelaySeconds: admission.maximumRetryDelaySeconds,
      }),
    ),
    retention: {
      notificationPayloadBacklog: value.retention.notificationPayloadBacklog,
      personalContentBacklog: value.retention.personalContentBacklog,
      broadcastContentBacklog: value.retention.broadcastContentBacklog,
      linkSecretBacklog: value.retention.linkSecretBacklog,
      operationalEvidenceBacklog: value.retention.operationalEvidenceBacklog,
      lastSuccessfulBatchAt: value.retention.lastSuccessfulBatchAt ?? null,
    },
  };
}

export function mapNotificationOperationsDelivery(
  value:
    | NotificationOperationsDeliveryResponseDto
    | NotificationOperationsReplayResponseDto,
): NotificationOperationsDelivery {
  return {
    id: value.id,
    projectId: value.projectId,
    channel: value.channel,
    status: SAFE_DELIVERY_STATUSES.has(value.status) ? value.status : "OTHER",
    errorCategory:
      "errorCategory" in value &&
      SAFE_ERROR_CATEGORIES.has(
        value.errorCategory as NotificationOperationsSafeErrorCategory,
      )
        ? (value.errorCategory as NotificationOperationsSafeErrorCategory)
        : "OTHER",
    attemptCount: value.attemptCount,
    operationsVersion: value.operationsVersion,
    replayEligibility:
      "replayEligibility" in value
        ? value.replayEligibility
        : "INELIGIBLE_STATE",
    contentAvailable: false,
    createdAt: "createdAt" in value ? value.createdAt : "",
    updatedAt: "updatedAt" in value ? value.updatedAt : "",
  };
}

export function mapNotificationOperationsIntegration(
  value:
    | NotificationOperationsIntegrationResponseDto
    | NotificationOperationsQuarantineResponseDto,
): NotificationOperationsIntegration {
  return {
    integrationId: value.integrationId,
    kind: value.kind,
    projectId: value.projectId,
    status: SAFE_INTEGRATION_STATUSES.has(value.status)
      ? value.status
      : "OTHER",
    version: value.version,
    maskedIdentity: value.maskedIdentity,
    quarantineAllowed:
      "quarantineAllowed" in value ? value.quarantineAllowed : false,
  };
}

function deliveryParams(
  filters: NotificationOperationsFilters,
  cursor: string | null,
) {
  return {
    limit: 50,
    ...(cursor ? { cursor } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.channel ? { channel: filters.channel } : {}),
    ...(filters.status ? { status: filters.status } : {}),
  };
}

function integrationParams(
  filters: NotificationOperationsFilters,
  cursor: string | null,
) {
  return {
    limit: 50,
    ...(cursor ? { cursor } : {}),
    ...(filters.projectId ? { projectId: filters.projectId } : {}),
    ...(filters.integrationKind ? { kind: filters.integrationKind } : {}),
    ...(filters.integrationStatus ? { status: filters.integrationStatus } : {}),
  };
}

export const notificationOperationsApi: NotificationOperationsApi = {
  async health(options) {
    return mapNotificationOperationsHealth(
      await notificationOperationsHealth(options),
    );
  },
  async deliveries(filters, cursor, options) {
    const response = await notificationOperationsDeliveries(
      deliveryParams(filters, cursor),
      options,
    );
    return {
      items: response.items.map(mapNotificationOperationsDelivery),
      nextCursor: response.nextCursor ?? null,
    };
  },
  async integrations(filters, cursor, options) {
    const response = await notificationOperationsIntegrations(
      integrationParams(filters, cursor),
      options,
    );
    return {
      items: response.items.map(mapNotificationOperationsIntegration),
      nextCursor: response.nextCursor ?? null,
    };
  },
  async replay(delivery, options) {
    return mapNotificationOperationsDelivery(
      await notificationOperationsReplay(
        delivery.id,
        commandOptions(delivery.operationsVersion, options),
      ),
    );
  },
  async quarantine(integration, input, options) {
    const response = await notificationOperationsQuarantine(
      integration.kind,
      integration.integrationId,
      input,
      commandOptions(integration.version, options),
    );
    return {
      ...mapNotificationOperationsIntegration(response),
      suppressedQueuedCount: response.suppressedQueuedCount,
    };
  },
};
