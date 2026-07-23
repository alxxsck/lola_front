import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  telegramPersonalOutboundCreate,
  telegramPersonalOutboundGet,
  telegramPersonalOutboundList,
} from "@/shared/api/generated/lola-backend";
import {
  TELEGRAM_PERSONAL_UPLOAD_TIMEOUT_MS,
  telegramPersonalMessagesApi,
} from "./telegram-personal-messages.api";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  telegramPersonalOutboundCreate: vi.fn(),
  telegramPersonalOutboundGet: vi.fn(),
  telegramPersonalOutboundList: vi.fn(),
}));

describe("Telegram personal messages API", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the typed multipart operation with one explicit idempotency key", async () => {
    const signal = new AbortController().signal;
    const attachment = new File(["hello"], "note.txt", {
      type: "text/plain",
    });
    await telegramPersonalMessagesApi.create(
      "project-1",
      "end-user-1",
      { text: "Подпись", file: attachment },
      "message-intent-1",
      { signal, onUploadProgress: vi.fn() },
    );

    expect(telegramPersonalOutboundCreate).toHaveBeenCalledWith(
      "project-1",
      "end-user-1",
      { text: "Подпись", file: attachment },
      expect.objectContaining({
        headers: { "Idempotency-Key": "message-intent-1" },
        signal,
        timeout: 300_000,
        onUploadProgress: expect.any(Function),
      }),
    );
    expect(TELEGRAM_PERSONAL_UPLOAD_TIMEOUT_MS).toBe(300_000);
  });

  it("keeps the caller abort signal on a long-running upload", async () => {
    const controller = new AbortController();
    await telegramPersonalMessagesApi.create(
      "project-1",
      "end-user-1",
      {
        text: "",
        file: new File(["content"], "archive.zip", {
          type: "application/zip",
        }),
      },
      "message-intent-2",
      { signal: controller.signal },
    );

    const requestConfig = vi.mocked(telegramPersonalOutboundCreate).mock
      .calls[0]?.[3];
    expect(requestConfig?.signal).toBe(controller.signal);
    expect(requestConfig?.signal?.aborted).toBe(false);

    controller.abort();
    expect(requestConfig?.signal?.aborted).toBe(true);
  });

  it("keeps list and detail scoped to the selected Project and End User", async () => {
    const signal = new AbortController().signal;
    await telegramPersonalMessagesApi.list("project-1", "end-user-1", {
      signal,
      limit: 12,
      cursor: "message-9",
    });
    await telegramPersonalMessagesApi.get(
      "project-1",
      "end-user-1",
      "message-1",
      { signal },
    );

    expect(telegramPersonalOutboundList).toHaveBeenCalledWith(
      "project-1",
      "end-user-1",
      { limit: 12, cursor: "message-9" },
      { signal },
    );
    expect(telegramPersonalOutboundGet).toHaveBeenCalledWith(
      "project-1",
      "end-user-1",
      "message-1",
      { signal },
    );
  });
});
