import { describe, expect, it } from "vitest";
import {
  broadcastActionAvailability,
  createEmptyBroadcastDraft,
  safeBroadcastError,
  telegramBroadcastPermissions,
  terminalBroadcastLifecycle,
  validBroadcastEndUserExternalId,
  validBroadcastTestLabel,
  validateBroadcastDraft,
  type TelegramBroadcast,
  type TelegramBroadcastPermissions,
} from "./telegram-broadcast";

const fullPermissions: TelegramBroadcastPermissions = {
  read: true,
  draft: true,
  approve: true,
  operate: true,
};

function broadcast(
  overrides: Partial<TelegramBroadcast> = {},
): TelegramBroadcast {
  return {
    id: "broadcast-1",
    projectId: "project-1",
    title: "Июльское обновление",
    status: "DRAFT",
    version: 3,
    revision: {
      id: "revision-3",
      revisionNumber: 3,
      contentHash: "content-hash-3",
      text: "Новое обновление уже доступно.",
      contentAvailable: true,
      createdAt: "2026-07-23T10:00:00.000Z",
    },
    content: { text: "Новое обновление уже доступно." },
    audience: { kind: "ALL_EXPLICITLY_OPTED_IN" },
    approval: null,
    latestTest: null,
    recipientCount: 0,
    scheduledAt: null,
    progress: null,
    allowedActions: ["EDIT", "PREVIEW", "TEST_SEND", "APPROVE", "CANCEL"],
    createdAt: "2026-07-23T10:00:00.000Z",
    updatedAt: "2026-07-23T10:00:00.000Z",
    ...overrides,
  };
}

describe("telegram broadcast model", () => {
  it("creates an explicit-consent-only draft", () => {
    expect(createEmptyBroadcastDraft()).toEqual({
      title: "",
      content: { text: "" },
      audience: { kind: "ALL_EXPLICITLY_OPTED_IN" },
    });
  });

  it("validates user-facing draft fields without accepting arbitrary audience selectors", () => {
    expect(
      validateBroadcastDraft({
        title: " ",
        content: { text: " " },
        audience: { kind: "ALL_EXPLICITLY_OPTED_IN" },
      }),
    ).toEqual({
      title: "Укажите название рассылки.",
      text: "Введите сообщение.",
    });

    expect(
      validateBroadcastDraft({
        title: "Обновление",
        content: { text: "Сообщение" },
        audience: { kind: "ALL_EXPLICITLY_OPTED_IN" },
      }),
    ).toEqual({});
  });

  it("enforces the Telegram broadcast content and test-label limits", () => {
    expect(
      validateBroadcastDraft({
        title: "А".repeat(121),
        content: { text: "Б".repeat(4_097) },
        audience: { kind: "ALL_EXPLICITLY_OPTED_IN" },
      }),
    ).toEqual({
      title: "Название не должно превышать 120 символов.",
      text: "Сообщение не должно превышать 4096 символов.",
    });

    expect(validBroadcastTestLabel("Метка")).toBe(true);
    expect(validBroadcastTestLabel(" ")).toBe(false);
    expect(validBroadcastTestLabel("А".repeat(80))).toBe(true);
    expect(validBroadcastTestLabel("А".repeat(81))).toBe(false);
    expect(validBroadcastEndUserExternalId("customer-anna")).toBe(true);
    expect(validBroadcastEndUserExternalId(" ")).toBe(false);
    expect(validBroadcastEndUserExternalId("A".repeat(255))).toBe(true);
    expect(validBroadcastEndUserExternalId("A".repeat(256))).toBe(false);
  });

  it("intersects server actions with exact permission capabilities", () => {
    expect(
      broadcastActionAvailability(broadcast(), {
        ...fullPermissions,
        approve: false,
        operate: false,
      }),
    ).toMatchObject({
      edit: true,
      preview: true,
      testSend: true,
      approve: false,
      start: false,
      schedule: false,
      pause: false,
      resume: false,
      cancel: false,
    });

    expect(
      broadcastActionAvailability(
        broadcast({
          status: "SCHEDULED",
          allowedActions: ["START", "CANCEL"],
        }),
        fullPermissions,
      ),
    ).toMatchObject({
      edit: false,
      approve: false,
      start: true,
      cancel: true,
    });
  });

  it("projects only the exact four Telegram broadcast permissions", () => {
    expect(
      telegramBroadcastPermissions([
        "project.telegram.broadcasts.read",
        "project.telegram.broadcasts.approve",
        "project.knowledge.read",
      ]),
    ).toEqual({
      read: true,
      draft: false,
      approve: true,
      operate: false,
    });
  });

  it("never renders raw provider messages or identifiers in safe errors", () => {
    expect(
      safeBroadcastError({
        status: 409,
        code: "TELEGRAM_BROADCAST_VERSION_CONFLICT",
        message: "chat_id=998877 token=secret",
      }),
    ).toEqual({
      kind: "CONFLICT",
      message:
        "Рассылка изменилась. Мы загрузили актуальную версию — проверьте её перед повтором.",
      retryable: false,
    });
  });

  it("treats completed-with-failures as terminal without inventing a failed lifecycle", () => {
    expect(terminalBroadcastLifecycle("COMPLETED_WITH_FAILURES")).toBe(true);
    expect(terminalBroadcastLifecycle("RUNNING")).toBe(false);
  });
});
