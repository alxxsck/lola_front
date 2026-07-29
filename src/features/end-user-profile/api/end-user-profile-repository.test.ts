import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  adminEndUserProfilesHistory,
  adminEndUserProfilesList,
} from "@/shared/api/generated/lola-backend";
import { endUserProfileRepository } from "./end-user-profile-repository";

vi.mock("@/shared/api/generated/lola-backend", () => ({
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

  it("разрешает внешний ID в внутренний UUID пользователя", async () => {
    vi.mocked(adminEndUserProfilesList).mockResolvedValue({
      items: [
        {
          endUserId: "00000000-0000-4000-8000-000000000001",
          externalUserId: "player-42",
        },
      ],
      nextCursor: null,
    } as never);

    await expect(
      endUserProfileRepository.resolveIdentity("project-1", "player-42"),
    ).resolves.toEqual({
      endUserId: "00000000-0000-4000-8000-000000000001",
      externalUserId: "player-42",
    });
    expect(adminEndUserProfilesList).toHaveBeenCalledWith("project-1", {
      externalUserId: "player-42",
      limit: 2,
    });
  });
});
