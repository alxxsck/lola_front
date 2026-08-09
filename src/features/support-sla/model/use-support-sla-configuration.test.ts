import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type { SupportSlaConfigurationSource } from "../api/support-sla-configuration-source";
import { createSupportSlaConfigurationController } from "./use-support-sla-configuration";

const etag = (letter: string) => `"ssla1.${letter.repeat(43)}"`;
const configuration = {
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
          nextHumanResponseBusinessSeconds: 7200,
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

function publishedSnapshot(actionEtag = etag("a")) {
  return {
    mode: "SLA_SETTINGS" as const,
    rootVersion: 1,
    actionEtag,
    rolloutState: "SHADOW" as const,
    reconciliationCheckpoint: "checkpoint-1",
    draft: null,
    publishedConfiguration: {
      calendarRevision: {
        id: "calendar-1",
        revisionNumber: 1,
        sourceDraftGeneration: 1,
        contentHash: "a".repeat(64),
        publishedAt: "2026-08-10T10:00:00.000Z",
        calendarEngineRevision: "calendar-engine-1",
        tzdbVersion: "2026a",
        calendar: structuredClone(configuration.calendar),
      },
      policyRevision: {
        id: "policy-1",
        revisionNumber: 1,
        sourceDraftGeneration: 1,
        contentHash: "b".repeat(64),
        publishedAt: "2026-08-10T10:00:00.000Z",
        policy: structuredClone(configuration.policy),
      },
    },
  };
}

function draftSnapshot(actionEtag = etag("b")) {
  return {
    ...publishedSnapshot(actionEtag),
    rootVersion: 2,
    draft: {
      generation: 2,
      version: 1,
      contentHash: "c".repeat(64),
      configuration: structuredClone(configuration),
    },
  };
}

function setup(sourceOverrides: Partial<SupportSlaConfigurationSource> = {}) {
  const source: SupportSlaConfigurationSource = {
    read: vi.fn().mockResolvedValue(publishedSnapshot()),
    replaceDraft: vi.fn().mockResolvedValue({
      intent: "REPLACE_SLA_DRAFT",
      rootVersion: 2,
      actionEtag: etag("b"),
      draft: {
        generation: 2,
        version: 1,
        contentHash: "c".repeat(64),
      },
    }),
    discardDraft: vi.fn(),
    publish: vi.fn(),
    ...sourceOverrides,
  };
  const onForbidden = vi.fn();
  const controller = createSupportSlaConfigurationController(
    {
      actorId: () => "operator-1",
      projectId: () => "project-1",
      canRead: () => true,
      canManage: () => true,
      onForbidden,
      createIdempotencyKey: () => "sla-command-key-1",
    },
    source,
  );
  return { controller, source, onForbidden };
}

describe("Support SLA configuration controller", () => {
  beforeEach(() => vi.clearAllMocks());

  it("saves a complete draft, reconciles normalized state, and preserves rollout", async () => {
    const { controller, source } = setup();
    vi.mocked(source.read)
      .mockResolvedValueOnce(publishedSnapshot())
      .mockResolvedValueOnce(draftSnapshot());

    await controller.load();
    controller.form.value.rules[0]!.targetsMinutes.resolution = 600;
    await controller.saveDraft();

    expect(source.replaceDraft).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        policy: expect.objectContaining({
          rules: [
            expect.objectContaining({
              targets: expect.objectContaining({
                resolutionBusinessSeconds: 36_000,
              }),
            }),
          ],
        }),
      }),
      etag("a"),
      "sla-command-key-1",
      expect.any(AbortSignal),
    );
    expect(controller.snapshot.value?.rolloutState).toBe("SHADOW");
    expect(controller.snapshot.value?.draft?.version).toBe(1);
    expect(controller.dirty.value).toBe(false);
    expect(controller.success.value).toContain("Черновик сохранён");
  });

  it("keeps local edits while reconciling an OCC conflict", async () => {
    const { controller, source } = setup({
      replaceDraft: vi.fn().mockRejectedValue(
        new ApiError(
          409,
          "conflict",
          undefined,
          undefined,
          "SLA_DRAFT_VERSION_CONFLICT",
        ),
      ),
    });
    vi.mocked(source.read)
      .mockResolvedValueOnce(publishedSnapshot())
      .mockResolvedValueOnce(draftSnapshot());

    await controller.load();
    controller.form.value.timeZone = "Europe/Paris";
    await controller.saveDraft();

    expect(controller.form.value.timeZone).toBe("Europe/Paris");
    expect(controller.snapshot.value?.draft?.version).toBe(1);
    expect(controller.conflict.value).toBe(true);
    expect(controller.error.value).toContain("конфигурация изменилась");
  });

  it("recognizes an accepted save after a transport timeout by GET reconcile", async () => {
    const { controller, source } = setup({
      replaceDraft: vi.fn().mockRejectedValue(
        new ApiError(0, "timeout", undefined, undefined, "NETWORK_ERROR"),
      ),
    });
    const accepted = draftSnapshot();
    accepted.draft!.configuration!.policy.rules[0]!.targets.resolutionBusinessSeconds =
      36_000;
    vi.mocked(source.read)
      .mockResolvedValueOnce(publishedSnapshot())
      .mockResolvedValueOnce(accepted);

    await controller.load();
    controller.form.value.rules[0]!.targetsMinutes.resolution = 600;
    await controller.saveDraft();

    expect(controller.recovery.value).toBeNull();
    expect(controller.dirty.value).toBe(false);
    expect(controller.success.value).toContain("подтверждено сверкой");
  });
});
