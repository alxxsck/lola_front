import { describe, expect, expectTypeOf, it } from "vitest";
import type { TelegramAdminLinkEffectiveStatus } from "@/shared/api/generated/models";
import {
  MAX_TELEGRAM_CAPTION_LENGTH,
  MAX_TELEGRAM_TEXT_LENGTH,
  TELEGRAM_MEDIA_ACCEPT,
  TELEGRAM_PERSONAL_SAFE_ERROR_POLICY,
  telegramPersonalFailureLabel,
  telegramPersonalSafeErrorPolicy,
  type TelegramPersonalLinkStatus,
  type TelegramPersonalSafeErrorCode,
  validateTelegramPersonalDraft,
} from "./telegram-personal-message.model";

function file(size: number, type: string, name = "attachment.bin"): File {
  return new File([new Uint8Array(size)], name, { type });
}

describe("Telegram personal message policy", () => {
  it("keeps the personal link status exhaustive over backend states plus UNKNOWN", () => {
    expectTypeOf<TelegramPersonalLinkStatus>().toEqualTypeOf<
      TelegramAdminLinkEffectiveStatus | "UNKNOWN"
    >();
  });

  it("accepts bounded text without an attachment", () => {
    expect(
      validateTelegramPersonalDraft({
        text: "x".repeat(MAX_TELEGRAM_TEXT_LENGTH),
        file: null,
      }),
    ).toBeNull();
    expect(
      validateTelegramPersonalDraft({
        text: "x".repeat(MAX_TELEGRAM_TEXT_LENGTH + 1),
        file: null,
      }),
    ).toContain("4096");
    expect(
      validateTelegramPersonalDraft({ text: "   ", file: null }),
    ).toContain("сообщение");
  });

  it("uses the shorter caption limit when media is attached", () => {
    const attachment = file(16, "image/jpeg", "photo.jpg");
    expect(
      validateTelegramPersonalDraft({
        text: "x".repeat(MAX_TELEGRAM_CAPTION_LENGTH),
        file: attachment,
      }),
    ).toBeNull();
    expect(
      validateTelegramPersonalDraft({
        text: "x".repeat(MAX_TELEGRAM_CAPTION_LENGTH + 1),
        file: attachment,
      }),
    ).toContain("1024");
    expect(
      validateTelegramPersonalDraft({ text: "   ", file: attachment }),
    ).toContain("подпись");
  });

  it.each([
    ["image/jpeg", 10 * 1024 * 1024],
    ["image/png", 10 * 1024 * 1024],
    ["image/webp", 10 * 1024 * 1024],
    ["video/mp4", 50 * 1024 * 1024],
    ["application/pdf", 50 * 1024 * 1024],
    ["application/zip", 50 * 1024 * 1024],
    ["text/plain", 50 * 1024 * 1024],
  ])("accepts %s through its exact byte boundary", (type, maximum) => {
    expect(
      validateTelegramPersonalDraft({
        text: "",
        file: file(maximum, type),
      }),
    ).toBeNull();
    expect(
      validateTelegramPersonalDraft({
        text: "",
        file: file(maximum + 1, type),
      }),
    ).toContain(type.startsWith("image/") ? "10 МБ" : "50 МБ");
  });

  it("rejects empty and non-allowlisted files without trusting the extension", () => {
    expect(
      validateTelegramPersonalDraft({
        text: "",
        file: file(0, "image/png", "photo.png"),
      }),
    ).toContain("пуст");
    expect(
      validateTelegramPersonalDraft({
        text: "",
        file: file(16, "image/gif", "photo.png"),
      }),
    ).toContain("не поддерживается");
    expect(TELEGRAM_MEDIA_ACCEPT).not.toContain("image/gif");
  });

  it.each([
    ["TELEGRAM_LINK_REVOKED", "отключил связь"],
    ["TELEGRAM_LINK_RELINKED", "переподключил"],
    ["TELEGRAM_CHANNEL_ROTATED", "Настройки Telegram проекта изменились"],
    ["TELEGRAM_CHANNEL_DISABLED", "сейчас недоступен"],
    [
      "TELEGRAM_CHANNEL_VERSION_CONFLICT",
      "Настройки Telegram проекта изменились",
    ],
    [
      "TELEGRAM_CHANNEL_WEBHOOK_GENERATION_STALE",
      "Настройки Telegram проекта изменились",
    ],
  ])("renders intentional lifecycle copy for %s", (code, expected) => {
    expect(telegramPersonalFailureLabel(code)).toContain(expected);
  });

  it("uses one typed safe policy for lifecycle refresh and unknown errors", () => {
    const lifecycleCodes = [
      "TELEGRAM_LINK_REVOKED",
      "TELEGRAM_LINK_RELINKED",
      "TELEGRAM_CHANNEL_ROTATED",
      "TELEGRAM_CHANNEL_DISABLED",
      "TELEGRAM_CHANNEL_VERSION_CONFLICT",
      "TELEGRAM_CHANNEL_WEBHOOK_GENERATION_STALE",
    ] as const satisfies readonly TelegramPersonalSafeErrorCode[];

    for (const code of lifecycleCodes) {
      expect(TELEGRAM_PERSONAL_SAFE_ERROR_POLICY[code].staleLinkState).toBe(
        true,
      );
      expect(
        TELEGRAM_PERSONAL_SAFE_ERROR_POLICY[code].createLabel,
      ).toBeTruthy();
      expect(
        TELEGRAM_PERSONAL_SAFE_ERROR_POLICY[code].terminalLabel,
      ).toBeTruthy();
    }
    expect(telegramPersonalSafeErrorPolicy("raw provider error")).toEqual({
      staleLinkState: false,
      terminalLabel: "Не удалось отправить сообщение в Telegram.",
    });
  });
});
