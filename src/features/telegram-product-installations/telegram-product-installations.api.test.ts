import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  telegramChannelAdminCreate,
  telegramChannelAdminDisable,
  telegramChannelAdminGet,
  telegramChannelAdminRotate,
  telegramChannelAdminSetBroadcastsEnabled,
  telegramChannelAdminTest,
  telegramLinkAdminGet,
} from "@/shared/api/generated/lola-backend";
import { telegramProductInstallationsApi } from "./telegram-product-installations.api";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  telegramChannelAdminCreate: vi.fn(),
  telegramChannelAdminDisable: vi.fn(),
  telegramChannelAdminGet: vi.fn(),
  telegramChannelAdminRotate: vi.fn(),
  telegramChannelAdminSetBroadcastsEnabled: vi.fn(),
  telegramChannelAdminTest: vi.fn(),
  telegramLinkAdminGet: vi.fn(),
}));

describe("product Telegram API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("keeps product installation and end-user summary on dedicated generated routes", async () => {
    await telegramProductInstallationsApi.get("project-1");
    await telegramProductInstallationsApi.create(
      "project-1",
      { botToken: "secret-token" },
      "create-key",
    );
    await telegramProductInstallationsApi.rotate("project-1", {
      botToken: "new-secret-token",
      expectedVersion: 2,
    });
    await telegramProductInstallationsApi.disable("project-1", {
      expectedVersion: 3,
    });
    await telegramProductInstallationsApi.test(
      "project-1",
      "installation-1",
      { expectedVersion: 4 },
      "test-key",
    );
    await telegramProductInstallationsApi.setBroadcastsEnabled(
      "project-1",
      { enabled: true, expectedVersion: 7 },
      "broadcasts-key",
    );
    await telegramProductInstallationsApi.getEndUserSummary(
      "project-1",
      "end-user-1",
    );

    expect(telegramChannelAdminGet).toHaveBeenCalledWith("project-1");
    expect(telegramChannelAdminCreate).toHaveBeenCalledWith(
      "project-1",
      { botToken: "secret-token" },
      { headers: { "Idempotency-Key": "create-key" } },
    );
    expect(telegramChannelAdminRotate).toHaveBeenCalledWith("project-1", {
      botToken: "new-secret-token",
      expectedVersion: 2,
    });
    expect(telegramChannelAdminDisable).toHaveBeenCalledWith("project-1", {
      expectedVersion: 3,
    });
    expect(telegramChannelAdminTest).toHaveBeenCalledWith(
      "project-1",
      "installation-1",
      { expectedVersion: 4 },
      { headers: { "Idempotency-Key": "test-key" } },
    );
    expect(telegramChannelAdminSetBroadcastsEnabled).toHaveBeenCalledWith(
      "project-1",
      { enabled: true, expectedVersion: 7 },
      { headers: { "Idempotency-Key": "broadcasts-key" } },
    );
    expect(telegramLinkAdminGet).toHaveBeenCalledWith(
      "project-1",
      "end-user-1",
    );
  });
});
