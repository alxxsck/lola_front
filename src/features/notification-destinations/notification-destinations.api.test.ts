import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  notificationDestinationCreate,
  notificationDestinationCreateTelegram,
  notificationDestinationCreateTelegramBindingChallenge,
  notificationDestinationList,
  notificationDestinationTest,
  notificationDestinationTestTelegram,
  notificationDestinationUpdate,
  notificationDestinationUpdateTelegram,
} from "@/shared/api/generated/lola-backend";
import { notificationDestinationsApi } from "./notification-destinations.api";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  notificationDestinationCreate: vi.fn(),
  notificationDestinationCreateTelegram: vi.fn(),
  notificationDestinationCreateTelegramBindingChallenge: vi.fn(),
  notificationDestinationList: vi.fn(),
  notificationDestinationTest: vi.fn(),
  notificationDestinationTestTelegram: vi.fn(),
  notificationDestinationUpdate: vi.fn(),
  notificationDestinationUpdateTelegram: vi.fn(),
}));

describe("notification destinations API", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(crypto, "randomUUID")
      .mockReturnValueOnce("11111111-1111-4111-8111-111111111111")
      .mockReturnValueOnce("22222222-2222-4222-8222-222222222222");
    vi.mocked(notificationDestinationList).mockResolvedValue({ items: [] });
    vi.mocked(notificationDestinationCreate).mockResolvedValue({} as never);
    vi.mocked(notificationDestinationUpdate).mockResolvedValue({} as never);
    vi.mocked(notificationDestinationTest).mockResolvedValue({} as never);
    vi.mocked(notificationDestinationCreateTelegram).mockResolvedValue(
      {} as never,
    );
    vi.mocked(
      notificationDestinationCreateTelegramBindingChallenge,
    ).mockResolvedValue({} as never);
    vi.mocked(notificationDestinationUpdateTelegram).mockResolvedValue(
      {} as never,
    );
    vi.mocked(notificationDestinationTestTelegram).mockResolvedValue(
      {} as never,
    );
  });

  it("uses generated project-scoped contracts and fresh idempotency keys for side effects", async () => {
    await notificationDestinationsApi.list("project-1");
    await notificationDestinationsApi.createSlack("project-1", {
      displayName: "Поддержка",
      webhookUrl: "https://hooks.slack.com/services/T/B/secret",
    });
    await notificationDestinationsApi.updateSlack(
      "project-1",
      "destination-1",
      {
        expectedVersion: 3,
        desiredStatus: "ACTIVE",
      },
    );
    await notificationDestinationsApi.testSlack(
      "project-1",
      "destination-1",
      4,
    );

    expect(notificationDestinationList).toHaveBeenCalledWith("project-1");
    expect(notificationDestinationCreate).toHaveBeenCalledWith(
      "project-1",
      {
        displayName: "Поддержка",
        webhookUrl: "https://hooks.slack.com/services/T/B/secret",
      },
      {
        headers: { "Idempotency-Key": "11111111-1111-4111-8111-111111111111" },
      },
    );
    expect(notificationDestinationUpdate).toHaveBeenCalledWith(
      "project-1",
      "destination-1",
      { expectedVersion: 3, desiredStatus: "ACTIVE" },
    );
    expect(notificationDestinationTest).toHaveBeenCalledWith(
      "project-1",
      "destination-1",
      { expectedVersion: 4 },
      {
        headers: { "Idempotency-Key": "22222222-2222-4222-8222-222222222222" },
      },
    );
  });

  it("keeps operational Telegram on its dedicated generated routes", async () => {
    await notificationDestinationsApi.createOperationalTelegram(
      "project-1",
      { displayName: "Operations", botToken: `123456789:${"A".repeat(32)}` },
      "telegram-create-key",
    );
    await notificationDestinationsApi.createTelegramBindingChallenge(
      "project-1",
      "destination-telegram",
      2,
    );
    await notificationDestinationsApi.testOperationalTelegram(
      "project-1",
      "destination-telegram",
      3,
      "telegram-test-key",
    );
    await notificationDestinationsApi.updateOperationalTelegram(
      "project-1",
      "destination-telegram",
      { expectedVersion: 4, desiredStatus: "ACTIVE" },
    );

    expect(notificationDestinationCreateTelegram).toHaveBeenCalledWith(
      "project-1",
      { displayName: "Operations", botToken: `123456789:${"A".repeat(32)}` },
      { headers: { "Idempotency-Key": "telegram-create-key" } },
    );
    expect(
      notificationDestinationCreateTelegramBindingChallenge,
    ).toHaveBeenCalledWith("project-1", "destination-telegram", {
      expectedVersion: 2,
    });
    expect(notificationDestinationTestTelegram).toHaveBeenCalledWith(
      "project-1",
      "destination-telegram",
      { expectedVersion: 3 },
      { headers: { "Idempotency-Key": "telegram-test-key" } },
    );
    expect(notificationDestinationUpdateTelegram).toHaveBeenCalledWith(
      "project-1",
      "destination-telegram",
      { expectedVersion: 4, desiredStatus: "ACTIVE" },
    );
  });
});
