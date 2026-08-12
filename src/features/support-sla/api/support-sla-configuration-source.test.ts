import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  supportSlaConfigurationDiscardDraft,
  supportSlaConfigurationPublish,
  supportSlaConfigurationRead,
  supportSlaConfigurationReplaceDraft,
} from "@/shared/api/generated/retenive-backend";
import { apiSupportSlaConfigurationSource } from "./support-sla-configuration-source";

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  supportSlaConfigurationRead: vi.fn(),
  supportSlaConfigurationReplaceDraft: vi.fn(),
  supportSlaConfigurationDiscardDraft: vi.fn(),
  supportSlaConfigurationPublish: vi.fn(),
}));

const etag = `"ssla1.${"a".repeat(43)}"`;
const configuration = {
  catalogRevisionId: "catalog-r1",
  calendar: {
    timeZone: "Europe/Madrid",
    weekly: [{ isoWeekday: 1, intervals: [{ startMinute: 540, endMinute: 1080 }] }],
    exceptions: [],
  },
  policy: {
    rules: [
      {
        code: "DEFAULT",
        order: 0,
        when: {},
        targets: {
          firstHumanResponseBusinessSeconds: 3600,
          nextHumanResponseBusinessSeconds: 3600,
          resolutionBusinessSeconds: 28_800,
        },
        atRiskRemainingPercent: 20,
        pause: {
          firstHumanResponseStatuses: [],
          nextHumanResponseStatuses: ["WAITING_END_USER" as const],
          resolutionStatuses: ["WAITING_END_USER" as const],
        },
      },
    ],
  },
};

describe("apiSupportSlaConfigurationSource", () => {
  beforeEach(() => vi.clearAllMocks());

  it("sends the exact OCC and idempotency headers when saving a draft", async () => {
    vi.mocked(supportSlaConfigurationReplaceDraft).mockResolvedValue({
      intent: "REPLACE_SLA_DRAFT",
      actionEtag: etag,
      rootVersion: 2,
      draft: { generation: 1, version: 1, contentHash: "a".repeat(64), catalogRevisionId: "catalog-r1" },
    });

    await apiSupportSlaConfigurationSource.replaceDraft(
      "project-1",
      configuration,
      etag,
      "save-intent-1",
    );

    expect(supportSlaConfigurationReplaceDraft).toHaveBeenCalledWith(
      "project-1",
      configuration,
      expect.objectContaining({
        headers: { "Idempotency-Key": "save-intent-1", "If-Match": etag },
      }),
    );
  });

  it("uses separate commands for read, discard, and publish", async () => {
    vi.mocked(supportSlaConfigurationRead).mockResolvedValue({
      mode: "SLA_SETTINGS",
      rootVersion: 1,
      actionEtag: etag,
      reconciliationCheckpoint: null,
      draft: null,
      publishedConfiguration: null,
    } as never);
    vi.mocked(supportSlaConfigurationDiscardDraft).mockResolvedValue({
      intent: "DISCARD_SLA_DRAFT",
      actionEtag: etag,
      rootVersion: 2,
      draft: null,
    });
    vi.mocked(supportSlaConfigurationPublish).mockResolvedValue({
      intent: "PUBLISH_SLA_CONFIGURATION",
      actionEtag: etag,
      rootVersion: 3,
      draft: null,
      publishedConfiguration: {
        configurationRevision: {
          id: "configuration-1",
          revisionNumber: 1,
          catalogRevisionId: "catalog-r1",
          configurationHash: "c".repeat(64),
          publicationKind: "PUBLISH",
          publishedAt: "2026-08-10T10:00:00.000Z",
          rollbackSourceRevisionId: null,
        },
        calendarRevision: {
          id: "calendar-1",
          revisionNumber: 1,
          sourceDraftGeneration: 1,
          contentHash: "a".repeat(64),
          publishedAt: "2026-08-10T10:00:00.000Z",
          calendarEngineRevision: "calendar-engine-1",
          tzdbVersion: "2026a",
        },
        policyRevision: {
          id: "policy-1",
          revisionNumber: 1,
          sourceDraftGeneration: 1,
          contentHash: "b".repeat(64),
          publishedAt: "2026-08-10T10:00:00.000Z",
        },
      },
    });

    await apiSupportSlaConfigurationSource.read("project-1");
    await apiSupportSlaConfigurationSource.discardDraft(
      "project-1",
      etag,
      "discard-intent-1",
    );
    await apiSupportSlaConfigurationSource.publish(
      "project-1",
      etag,
      "publish-intent-1",
    );

    expect(supportSlaConfigurationRead).toHaveBeenCalledWith(
      "project-1",
      expect.any(Object),
    );
    expect(supportSlaConfigurationDiscardDraft).toHaveBeenCalledWith(
      "project-1",
      {},
      expect.objectContaining({
        headers: { "Idempotency-Key": "discard-intent-1", "If-Match": etag },
      }),
    );
    expect(supportSlaConfigurationPublish).toHaveBeenCalledWith(
      "project-1",
      { reason: "Publish SLA configuration from CMS" },
      expect.objectContaining({
        headers: { "Idempotency-Key": "publish-intent-1", "If-Match": etag },
      }),
    );
  });
});
