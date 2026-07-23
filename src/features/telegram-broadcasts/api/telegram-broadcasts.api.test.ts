import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  TelegramBroadcastDetailResponseDto,
  TelegramBroadcastPreviewResponseDto,
  TelegramBroadcastResponseDto,
} from "@/shared/api/generated/models";

const generated = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
  update: vi.fn(),
  approve: vi.fn(),
  cancel: vi.fn(),
  outcomes: vi.fn(),
  pause: vi.fn(),
  preview: vi.fn(),
  resume: vi.fn(),
  schedule: vi.fn(),
  start: vi.fn(),
  test: vi.fn(),
}));

vi.mock("@/shared/api/generated/lola-backend", () => ({
  telegramBroadcastList: generated.list,
  telegramBroadcastCreate: generated.create,
  telegramBroadcastGet: generated.get,
  telegramBroadcastUpdate: generated.update,
  telegramBroadcastApprove: generated.approve,
  telegramBroadcastCancel: generated.cancel,
  telegramBroadcastOutcomes: generated.outcomes,
  telegramBroadcastPause: generated.pause,
  telegramBroadcastPreview: generated.preview,
  telegramBroadcastResume: generated.resume,
  telegramBroadcastSchedule: generated.schedule,
  telegramBroadcastStart: generated.start,
  telegramBroadcastTest: generated.test,
}));

import {
  mapTelegramBroadcastDetail,
  mapTelegramBroadcastSafeFailureCategory,
  mapTelegramBroadcastSummary,
  telegramBroadcastsApi,
} from "./telegram-broadcasts.api";

const summaryDto: TelegramBroadcastResponseDto = {
  id: "broadcast-1",
  projectId: "project-1",
  title: "Июльское обновление",
  status: "DRAFT",
  version: 2,
  revision: {
    id: "revision-2",
    revisionNumber: 2,
    contentHash:
      "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
    text: "Обновление доступно.",
    createdAt: "2026-07-23T10:00:00.000Z",
  },
  recipientCount: 0,
  scheduledAt: null,
  allowedActions: ["EDIT", "PREVIEW", "TEST_SEND", "APPROVE", "CANCEL"],
  createdAt: "2026-07-23T09:00:00.000Z",
  updatedAt: "2026-07-23T10:00:00.000Z",
};

const detailDto: TelegramBroadcastDetailResponseDto = {
  ...summaryDto,
  latestTest: {
    id: "test-1",
    label: "Анна Смирнова",
    revisionId: "revision-2",
    status: "SENT",
    currentRevision: true,
    sentAt: "2026-07-23T10:05:00.000Z",
  },
  approval: null,
  progress: {
    total: 0,
    pending: 0,
    sending: 0,
    sent: 0,
    retryWait: 0,
    outcomeUnknown: 0,
    failedPermanent: 0,
    suppressedLink: 0,
    suppressedConsent: 0,
    suppressedInstallation: 0,
    cancelled: 0,
  },
};

describe("telegram broadcasts generated adapter", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    generated.list.mockResolvedValue({
      items: [summaryDto],
      nextCursor: "next-page",
      total: 3,
    });
    generated.get.mockResolvedValue(detailDto);
    for (const operation of [
      generated.create,
      generated.update,
      generated.approve,
      generated.cancel,
      generated.pause,
      generated.resume,
      generated.schedule,
      generated.start,
    ])
      operation.mockResolvedValue(summaryDto);
  });

  it("maps generated list/detail into consent-safe UI models", async () => {
    const signal = new AbortController().signal;

    const page = await telegramBroadcastsApi.list(
      "project-1",
      { limit: 25, cursor: "cursor-1" },
      { signal },
    );
    const detail = await telegramBroadcastsApi.get(
      "project-1",
      "broadcast-1",
      { signal },
    );

    expect(generated.list).toHaveBeenCalledWith(
      "project-1",
      { limit: 25, cursor: "cursor-1" },
      { signal },
    );
    expect(page).toEqual({
      items: [mapTelegramBroadcastSummary(summaryDto)],
      nextCursor: "next-page",
      total: 3,
    });
    expect(detail).toEqual(mapTelegramBroadcastDetail(detailDto));
    expect(detail.latestTest).toMatchObject({
      id: "test-1",
      status: "SENT",
      currentRevision: true,
    });
  });

  it("maps draft writes to generated title/text DTOs with OCC and idempotency", async () => {
    const signal = new AbortController().signal;
    const options = { signal, idempotencyKey: "draft-intent" };
    const draft = {
      title: "Июльское обновление",
      content: { text: "Обновление доступно." },
      audience: { kind: "ALL_EXPLICITLY_OPTED_IN" as const },
    };

    await telegramBroadcastsApi.create("project-1", draft, options);
    await telegramBroadcastsApi.updateDraft(
      "project-1",
      "broadcast-1",
      { expectedVersion: 2, draft },
      options,
    );

    expect(generated.create).toHaveBeenCalledWith(
      "project-1",
      { title: draft.title, text: draft.content.text },
      {
        signal,
        headers: { "Idempotency-Key": "draft-intent" },
      },
    );
    expect(generated.update).toHaveBeenCalledWith(
      "project-1",
      "broadcast-1",
      { expectedVersion: 2, title: draft.title, text: draft.content.text },
      {
        signal,
        headers: { "Idempotency-Key": "draft-intent" },
      },
    );
  });

  it("uses exact generated preview/test/approval/schedule contracts", async () => {
    const signal = new AbortController().signal;
    const options = { signal, idempotencyKey: "command-intent" };
    const previewDto: TelegramBroadcastPreviewResponseDto = {
      version: 2,
      revisionId: "revision-2",
      contentHash:
        "aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      renderedText: "Обновление доступно.",
      eligibleRecipientCount: 12,
      totalEvaluated: 15,
      exclusions: {
        consentNotActive: 1,
        staleConsent: 1,
        noActiveLink: 1,
        installationUnavailable: 0,
      },
    };
    generated.preview.mockResolvedValue(previewDto);
    generated.test.mockResolvedValue({
      id: "test-1",
      label: "Анна Смирнова",
      revisionId: "revision-2",
      status: "SENT",
      currentRevision: true,
      sentAt: "2026-07-23T10:05:00.000Z",
      version: 2,
    });

    await telegramBroadcastsApi.preview(
      "project-1",
      "broadcast-1",
      { expectedVersion: 2 },
      options,
    );
    const test = await telegramBroadcastsApi.testSend(
      "project-1",
      "broadcast-1",
      {
        expectedVersion: 2,
        endUserExternalId: "customer-anna",
        label: "Анна Смирнова",
      },
      options,
    );
    await telegramBroadcastsApi.approve(
      "project-1",
      "broadcast-1",
      {
        expectedVersion: 2,
        expectedContentHash: previewDto.contentHash,
        expectedRecipientCount: 12,
        successfulTestId: "test-1",
      },
      options,
    );
    await telegramBroadcastsApi.schedule(
      "project-1",
      "broadcast-1",
      {
        expectedVersion: 3,
        scheduledAt: "2026-07-25T12:00:00.000Z",
      },
      options,
    );

    expect(generated.test).toHaveBeenCalledWith(
      "project-1",
      "broadcast-1",
      {
        expectedVersion: 2,
        endUserExternalId: "customer-anna",
        label: "Анна Смирнова",
      },
      expect.objectContaining({
        signal,
        headers: { "Idempotency-Key": "command-intent" },
      }),
    );
    expect(test).not.toHaveProperty("endUserExternalId");
    expect(generated.approve.mock.calls[0]?.[2]).toEqual({
      expectedVersion: 2,
      expectedContentHash: previewDto.contentHash,
      expectedRecipientCount: 12,
      successfulTestId: "test-1",
    });
    expect(generated.schedule.mock.calls[0]?.[2]).toEqual({
      expectedVersion: 3,
      scheduledAt: "2026-07-25T12:00:00.000Z",
    });
  });

  it("maps paginated outcomes without recipient identity or raw errors", async () => {
    const signal = new AbortController().signal;
    generated.outcomes.mockResolvedValue({
      items: [
        {
          id: "opaque-outcome",
          status: "SUPPRESSED_CONSENT",
          errorCode: "END_USER_WITHDREW",
          createdAt: "2026-07-23T10:10:00.000Z",
          finishedAt: "2026-07-23T10:10:01.000Z",
        },
      ],
      nextCursor: null,
      total: 1,
    });

    const page = await telegramBroadcastsApi.listDeliveries(
      "project-1",
      "broadcast-1",
      { limit: 50 },
      { signal },
    );

    expect(page.items).toEqual([
      {
        id: "opaque-outcome",
        status: "SUPPRESSED_CONSENT",
        safeFailureCategory: "CONSENT_REVOKED",
        createdAt: "2026-07-23T10:10:00.000Z",
        finishedAt: "2026-07-23T10:10:01.000Z",
      },
    ]);
    expect(JSON.stringify(page.items)).not.toMatch(
      /endUser|telegramUser|chatId|raw/i,
    );
  });

  it("maps every public backend outcome code to a stable safe category", () => {
    expect(
      [
        "TELEGRAM_BROADCAST_DELIVERY_FENCE_LOST",
        "TELEGRAM_BROADCAST_WORKER_LEASE_EXPIRED",
        "TELEGRAM_OUTCOME_UNKNOWN",
        "TELEGRAM_PROVIDER_RESPONSE_INVALID",
      ].map(mapTelegramBroadcastSafeFailureCategory),
    ).toEqual([
      "AMBIGUOUS_PROVIDER_RESULT",
      "AMBIGUOUS_PROVIDER_RESULT",
      "AMBIGUOUS_PROVIDER_RESULT",
      "AMBIGUOUS_PROVIDER_RESULT",
    ]);
    expect(
      [
        "END_USER_WITHDREW",
        "TELEGRAM_BROADCAST_CONSENT_STALE",
      ].map(mapTelegramBroadcastSafeFailureCategory),
    ).toEqual(["CONSENT_REVOKED", "CONSENT_REVOKED"]);
    expect(
      ["PROVIDER_BLOCKED", "TELEGRAM_USER_BLOCKED"].map(
        mapTelegramBroadcastSafeFailureCategory,
      ),
    ).toEqual(["RECIPIENT_UNAVAILABLE", "RECIPIENT_UNAVAILABLE"]);
    expect(
      [
        "TELEGRAM_BOT_TOKEN_INVALID",
        "TELEGRAM_BROADCAST_INSTALLATION_STALE",
      ].map(mapTelegramBroadcastSafeFailureCategory),
    ).toEqual(["INSTALLATION_UNAVAILABLE", "INSTALLATION_UNAVAILABLE"]);
    expect(
      [
        "TELEGRAM_PRODUCT_LOCAL_RATE_LIMIT",
        "TELEGRAM_RETRY_AFTER_UNSUPPORTED",
      ].map(mapTelegramBroadcastSafeFailureCategory),
    ).toEqual(["RATE_LIMIT_EXHAUSTED", "RATE_LIMIT_EXHAUSTED"]);
    expect(
      mapTelegramBroadcastSafeFailureCategory(
        "TELEGRAM_BROADCAST_LINK_STALE",
      ),
    ).toBe("LINK_NOT_ACTIVE");
    expect(
      mapTelegramBroadcastSafeFailureCategory(
        "TELEGRAM_BROADCAST_INTERNAL_FAILURE",
      ),
    ).toBe("INTERNAL_FAILURE");
    expect(
      ["BROADCAST_CANCELLED", "TELEGRAM_BROADCAST_NOT_RUNNING"].map(
        mapTelegramBroadcastSafeFailureCategory,
      ),
    ).toEqual(["CANCELLED", "CANCELLED"]);
    expect(mapTelegramBroadcastSafeFailureCategory("RAW_PROVIDER_SECRET")).toBe(
      null,
    );
  });
});
