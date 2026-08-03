import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import EndUserSelect from "./EndUserSelect.vue";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  profile: vi.fn(),
}));

vi.mock("@/features/end-user-profile/api/end-user-profile-repository", () => ({
  endUserProfileRepository: {
    list: mocks.list,
    profile: mocks.profile,
  },
}));
vi.mock("@/shared/config/data-mode", () => ({ isMockMode: false }));

describe("EndUserSelect", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.mockResolvedValue({
      endUserId: "user-1",
      externalUserId: "customer-42",
      locale: "ru",
    });
    mocks.list.mockResolvedValue({ items: [], nextCursor: null });
  });

  it("shows the product user ID for an existing internal selection", async () => {
    const wrapper = mount(EndUserSelect, {
      props: { projectId: "project-1", modelValue: "user-1" },
    });
    await flushPromises();

    expect(
      wrapper.get('[data-testid="paged-search-trigger"]').text(),
    ).toContain("customer-42");
    expect(mocks.profile).toHaveBeenCalledWith("project-1", "user-1");
  });
});
