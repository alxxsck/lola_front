import { beforeEach, describe, expect, it, vi } from "vitest";
import { adminEndUserProfilesHistory } from "@/shared/api/generated/retenive-backend";
import { endUserProfileRepository } from "./end-user-profile-repository";

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  adminEndUserProfilesHistory: vi.fn(),
  adminEndUserProfilesList: vi.fn(),
  adminEndUserProfilesProfile: vi.fn(),
}));

describe("endUserProfileRepository", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("передаёт cursor без преобразований в endpoint истории профиля", async () => {
    vi.mocked(adminEndUserProfilesHistory).mockResolvedValue({
      items: [],
      nextCursor: "opaque-next",
    });

    await expect(
      endUserProfileRepository.history("project-1", "user-1", {
        limit: 25,
        cursor: "opaque-current",
      }),
    ).resolves.toEqual({
      items: [],
      nextCursor: "opaque-next",
    });
    expect(adminEndUserProfilesHistory).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      {
        limit: 25,
        cursor: "opaque-current",
      },
    );
  });

  it("не выполняет небезопасный поиск по внешнему ID в API mode", async () => {
    await expect(
      endUserProfileRepository.resolveIdentity("project-1", "player-42"),
    ).resolves.toBeNull();
  });
});
