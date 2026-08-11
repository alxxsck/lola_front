import {
  supportCaseNotificationPolicyDisable,
  supportCaseNotificationPolicyListAvailableTeams,
  supportCaseNotificationPolicyPreview,
  supportCaseNotificationPolicyPublish,
  supportCaseNotificationPolicyReadCommandResult,
  supportCaseNotificationPolicyReadCurrent,
  supportCaseNotificationPolicyReadMetrics,
  supportCaseNotificationPolicyRestore,
  supportCaseNotificationPolicySaveDraft,
} from "@/shared/api/generated/retenive-backend";
import type {
  DisableSupportCaseNotificationPolicyDto,
  PublishSupportCaseNotificationPolicyDto,
  ReadSupportCaseNotificationCommandResultDtoOperation,
  RestoreSupportCaseNotificationPolicyDto,
  SaveSupportCaseNotificationDraftDto,
  SupportCaseNotificationAvailableTeamDto,
  SupportCaseNotificationCommandResultResponseDto,
  SupportCaseNotificationMetricsResponseDto,
  SupportCaseNotificationPolicyCurrentResponseDto,
  SupportCaseNotificationPolicyInputDto,
  SupportCaseNotificationPolicyPreviewResponseDto,
  SupportCaseNotificationPolicyReceiptResponseDto,
  SupportCaseNotificationPolicyRevisionResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { noAuthRetryRequestOptions } from "@/shared/api/http/axios-instance";
import { isMockMode } from "@/shared/config/data-mode";

export type NotificationPolicyOperation =
  ReadSupportCaseNotificationCommandResultDtoOperation;
export type NotificationPolicyCommandBody =
  | SaveSupportCaseNotificationDraftDto
  | PublishSupportCaseNotificationPolicyDto
  | DisableSupportCaseNotificationPolicyDto
  | RestoreSupportCaseNotificationPolicyDto;

export interface SupportCaseNotificationPolicySource {
  read(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<SupportCaseNotificationPolicyCurrentResponseDto>;
  readMetrics(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<SupportCaseNotificationMetricsResponseDto>;
  listTeams(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<readonly SupportCaseNotificationAvailableTeamDto[]>;
  preview(
    projectId: string,
    input: SupportCaseNotificationPolicyInputDto,
    signal?: AbortSignal,
  ): Promise<SupportCaseNotificationPolicyPreviewResponseDto>;
  saveDraft(
    projectId: string,
    body: SaveSupportCaseNotificationDraftDto,
    key: string,
    signal?: AbortSignal,
  ): Promise<SupportCaseNotificationPolicyReceiptResponseDto>;
  publish(
    projectId: string,
    body: PublishSupportCaseNotificationPolicyDto,
    key: string,
    signal?: AbortSignal,
  ): Promise<SupportCaseNotificationPolicyReceiptResponseDto>;
  disable(
    projectId: string,
    body: DisableSupportCaseNotificationPolicyDto,
    key: string,
    signal?: AbortSignal,
  ): Promise<SupportCaseNotificationPolicyReceiptResponseDto>;
  restore(
    projectId: string,
    body: RestoreSupportCaseNotificationPolicyDto,
    key: string,
    signal?: AbortSignal,
  ): Promise<SupportCaseNotificationPolicyReceiptResponseDto>;
  lookup(
    projectId: string,
    operation: NotificationPolicyOperation,
    key: string,
    signal?: AbortSignal,
  ): Promise<SupportCaseNotificationCommandResultResponseDto>;
}

const options = (signal?: AbortSignal) => (signal ? { signal } : undefined);
const commandOptions = (key: string, signal?: AbortSignal) => ({
  ...noAuthRetryRequestOptions(),
  headers: { "Idempotency-Key": key },
  ...(signal ? { signal } : {}),
});

export const apiSupportCaseNotificationPolicySource: SupportCaseNotificationPolicySource =
  {
    async read(projectId, signal) {
      try {
        return await supportCaseNotificationPolicyReadCurrent(
          projectId,
          options(signal),
        );
      } catch (cause) {
        throw normalizeApiError(cause);
      }
    },
    async readMetrics(projectId, signal) {
      try {
        return await supportCaseNotificationPolicyReadMetrics(
          projectId,
          options(signal),
        );
      } catch (cause) {
        throw normalizeApiError(cause);
      }
    },
    async listTeams(projectId, signal) {
      try {
        const items: SupportCaseNotificationAvailableTeamDto[] = [];
        let cursor: string | undefined;
        do {
          const page = await supportCaseNotificationPolicyListAvailableTeams(
            projectId,
            { limit: 100, ...(cursor ? { cursor } : {}) },
            options(signal),
          );
          items.push(...page.items);
          cursor = page.nextCursor ?? undefined;
        } while (cursor);
        return items;
      } catch (cause) {
        throw normalizeApiError(cause);
      }
    },
    async preview(projectId, input, signal) {
      try {
        return await supportCaseNotificationPolicyPreview(
          projectId,
          input,
          options(signal),
        );
      } catch (cause) {
        throw normalizeApiError(cause);
      }
    },
    async saveDraft(projectId, body, key, signal) {
      try {
        return await supportCaseNotificationPolicySaveDraft(
          projectId,
          body,
          commandOptions(key, signal),
        );
      } catch (cause) {
        throw normalizeApiError(cause);
      }
    },
    async publish(projectId, body, key, signal) {
      try {
        return await supportCaseNotificationPolicyPublish(
          projectId,
          body,
          commandOptions(key, signal),
        );
      } catch (cause) {
        throw normalizeApiError(cause);
      }
    },
    async disable(projectId, body, key, signal) {
      try {
        return await supportCaseNotificationPolicyDisable(
          projectId,
          body,
          commandOptions(key, signal),
        );
      } catch (cause) {
        throw normalizeApiError(cause);
      }
    },
    async restore(projectId, body, key, signal) {
      try {
        return await supportCaseNotificationPolicyRestore(
          projectId,
          body,
          commandOptions(key, signal),
        );
      } catch (cause) {
        throw normalizeApiError(cause);
      }
    },
    async lookup(projectId, operation, key, signal) {
      try {
        return await supportCaseNotificationPolicyReadCommandResult(
          projectId,
          { operation, idempotencyKey: key },
          options(signal),
        );
      } catch (cause) {
        throw normalizeApiError(cause);
      }
    },
  };

const mockPolicies = new Map<
  string,
  SupportCaseNotificationPolicyCurrentResponseDto
>();
const mockReceipts = new Map<
  string,
  SupportCaseNotificationPolicyReceiptResponseDto
>();

function mockCurrent(
  projectId: string,
): SupportCaseNotificationPolicyCurrentResponseDto {
  const value = mockPolicies.get(projectId);
  if (value) return value;
  const created: SupportCaseNotificationPolicyCurrentResponseDto = {
    version: 0,
    effectiveStatus: "OFF",
    current: null,
    draft: null,
    restorableRevisions: [],
    allowedClasses: ["PRODUCT_INQUIRY", "PRODUCT_PROBLEM"],
    allowedPriorities: ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"],
    allowedChannels: ["BROWSER_PUSH"],
    allowedTopicCodes: ["PAYMENTS", "ACCOUNT_ACCESS", "PRODUCT_USAGE"],
  };
  mockPolicies.set(projectId, created);
  return created;
}

function revision(
  input: SupportCaseNotificationPolicyInputDto,
  number: number,
  status: "DRAFT" | "PUBLISHED" | "DISABLED",
): SupportCaseNotificationPolicyRevisionResponseDto {
  return {
    id: `00000000-0000-4000-8000-${String(number).padStart(12, "0")}`,
    revisionNumber: number,
    status,
    ...structuredClone(input),
    templateRevision: "support-case-created-v1",
    deepLinkTarget: "SUPPORT_OPERATOR_WORKSPACE",
    contentHash: String(number).padStart(64, "0"),
    createdAt: new Date().toISOString(),
    publishedAt: status === "PUBLISHED" ? new Date().toISOString() : null,
  };
}

function receipt(
  projectId: string,
  key: string,
  update: (
    current: SupportCaseNotificationPolicyCurrentResponseDto,
  ) => SupportCaseNotificationPolicyCurrentResponseDto,
) {
  const receiptKey = `${projectId}:${key}`;
  const existing = mockReceipts.get(receiptKey);
  if (existing) return { ...structuredClone(existing), replayed: true };
  const policy = update(structuredClone(mockCurrent(projectId)));
  mockPolicies.set(projectId, policy);
  const value: SupportCaseNotificationPolicyReceiptResponseDto = {
    receiptId: crypto.randomUUID(),
    replayed: false,
    policy,
  };
  mockReceipts.set(receiptKey, value);
  return structuredClone(value);
}

const mockSupportCaseNotificationPolicySource: SupportCaseNotificationPolicySource =
  {
    async read(projectId) {
      return structuredClone(mockCurrent(projectId));
    },
    async readMetrics() {
      return {
        from: new Date(Date.now() - 7 * 86400000).toISOString(),
        to: new Date().toISOString(),
        admittedOccurrences: 38,
        deliveries: 22,
        digests: 0,
        eligibleRecipients: 12,
        subscribedRecipients: 8,
        failures: 0,
        authorizationCancellations: 1,
        expiredPolicyCount: 0,
      };
    },
    async listTeams() {
      return [
        {
          id: "10000000-0000-4000-8000-000000000001",
          code: "TIER_1",
          name: "Первая линия",
        },
        {
          id: "10000000-0000-4000-8000-000000000002",
          code: "PAYMENTS",
          name: "Платежи",
        },
      ];
    },
    async preview(_projectId, input) {
      const off = input.mode === "OFF";
      const recipients =
        input.recipientRule === "TEAM_SUBSCRIBERS"
          ? input.teamIds.length * 4
          : 12;
      return {
        issues: [],
        estimatedEligibleRecipients: recipients,
        matchingOccurrencesLast7Days: off ? 0 : 38,
        estimatedImmediateDeliveriesLast7Days:
          input.mode === "IMMEDIATE" ? 38 * recipients : 0,
        estimatedDigestWindowsLast7Days: input.mode === "DIGEST" ? 21 : 0,
        examples: off
          ? []
          : [
              {
                occurrence: "CREATED",
                conversationClass: "PRODUCT_PROBLEM",
                topicCode: input.topicCodes[0] ?? "PAYMENTS",
                priority: "HIGH",
                occurredAt: new Date(Date.now() - 3600000).toISOString(),
              },
              {
                occurrence: "REOPENED",
                conversationClass: "PRODUCT_INQUIRY",
                topicCode: input.topicCodes[0] ?? "PRODUCT_USAGE",
                priority: "NORMAL",
                occurredAt: new Date(Date.now() - 7200000).toISOString(),
              },
            ],
        publishable: true,
      };
    },
    async saveDraft(projectId, body, key) {
      return receipt(projectId, key, (current) => ({
        ...current,
        version: current.version + 1,
        draft: revision(body, current.version + 1, "DRAFT"),
      }));
    },
    async publish(projectId, body, key) {
      return receipt(projectId, key, (current) => {
        const source =
          current.draft?.id === body.revisionId
            ? current.draft
            : current.current;
        if (!source) return current;
        const published = {
          ...source,
          status: "PUBLISHED" as const,
          publishedAt: new Date().toISOString(),
        };
        return {
          ...current,
          version: current.version + 1,
          current: published,
          draft: null,
          effectiveStatus: published.mode === "OFF" ? "OFF" : "ACTIVE",
        };
      });
    },
    async disable(projectId, _body, key) {
      return receipt(projectId, key, (current) => ({
        ...current,
        version: current.version + 1,
        effectiveStatus: "OFF",
        current: current.current
          ? { ...current.current, status: "DISABLED" }
          : null,
      }));
    },
    async restore(projectId, body, key) {
      return receipt(projectId, key, (current) => {
        const source = current.restorableRevisions.find(
          (item) => item.id === body.revisionId,
        );
        return source
          ? {
              ...current,
              version: current.version + 1,
              current: {
                ...source,
                status: "PUBLISHED",
                publishedAt: new Date().toISOString(),
              },
              effectiveStatus: "ACTIVE",
            }
          : current;
      });
    },
    async lookup(projectId, operation, key) {
      const found = mockReceipts.get(`${projectId}:${key}`);
      return {
        found: Boolean(found),
        operation,
        receiptId: found?.receiptId ?? null,
        policy: found?.policy ?? null,
      };
    },
  };

export const supportCaseNotificationPolicySource = isMockMode
  ? mockSupportCaseNotificationPolicySource
  : apiSupportCaseNotificationPolicySource;
