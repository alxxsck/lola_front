import { flushPromises, shallowMount } from "@vue/test-utils";
import DataTable from "primevue/datatable";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UsersPage from "./UsersPage.vue";

const profile = {
  endUserId: "user-1",
  externalUserId: "customer-1",
  profileVersion: "8",
  syncStatus: "VALID" as const,
  lastSeenAt: "2026-07-16T10:00:00.000Z",
  observedAt: "2026-07-16T09:59:00.000Z",
  fields: [],
};
const mocks = vi.hoisted(() => ({ list: vi.fn(), profile: vi.fn() }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((next) => {
    resolve = next;
  });
  return { promise, resolve };
}

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({ project: { id: "project-1" } }),
}));
vi.mock("@/shared/api/repository", () => ({ repository: { mode: "api" } }));
vi.mock("@/features/end-user-profile/api/end-user-profile-repository", () => ({
  endUserProfileRepository: { list: mocks.list, profile: mocks.profile },
}));

describe("UsersPage Current Profile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.list.mockResolvedValue({ items: [profile], nextCursor: null });
    mocks.profile.mockResolvedValue({
      ...profile,
      contractRevision: 3,
      ageSeconds: 60,
      receivedAt: profile.lastSeenAt,
      provenance: "PRODUCT_PROFILE",
    });
  });

  it("loads detail only after the operator opens a Current Profile", async () => {
    const wrapper = shallowMount(UsersPage);
    await flushPromises();
    expect(mocks.profile).not.toHaveBeenCalled();
    wrapper.getComponent(DataTable).vm.$emit("row-click", { data: profile });
    await flushPromises();
    expect(mocks.profile).toHaveBeenCalledWith("project-1", "user-1");
  });

  it("keeps backend cursor pagination and sort parameters", async () => {
    mocks.list
      .mockResolvedValueOnce({
        items: [profile],
        nextCursor: "opaque-profile-cursor",
      })
      .mockResolvedValueOnce({
        items: [
          { ...profile, endUserId: "user-2", externalUserId: "customer-2" },
        ],
        nextCursor: null,
      });
    const wrapper = shallowMount(UsersPage);
    await flushPromises();
    expect(mocks.list).toHaveBeenCalledWith("project-1", {
      limit: 50,
      sort: "LAST_SEEN_DESC",
    });
    await wrapper.find('button-stub[label="Загрузить ещё"]').trigger("click");
    await flushPromises();
    expect(mocks.list).toHaveBeenLastCalledWith("project-1", {
      limit: 50,
      cursor: "opaque-profile-cursor",
      sort: "LAST_SEEN_DESC",
    });
  });

  it("keeps the latest selected profile when requests resolve out of order", async () => {
    const other = {
      ...profile,
      endUserId: "user-2",
      externalUserId: "customer-2",
    };
    mocks.list.mockResolvedValue({ items: [profile, other], nextCursor: null });
    const first = deferred<Record<string, unknown>>();
    const second = deferred<Record<string, unknown>>();
    mocks.profile
      .mockReturnValueOnce(first.promise)
      .mockReturnValueOnce(second.promise);
    const wrapper = shallowMount(UsersPage);
    await flushPromises();
    const table = wrapper.getComponent(DataTable);

    table.vm.$emit("row-click", { data: profile });
    table.vm.$emit("row-click", { data: other });
    second.resolve({
      ...other,
      profileVersion: "B-VERSION",
      contractRevision: 4,
      ageSeconds: 20,
      receivedAt: other.lastSeenAt,
      provenance: "PRODUCT_PROFILE",
    });
    await flushPromises();
    first.resolve({
      ...profile,
      profileVersion: "A-VERSION",
      contractRevision: 3,
      ageSeconds: 60,
      receivedAt: profile.lastSeenAt,
      provenance: "PRODUCT_PROFILE",
    });
    await flushPromises();

    expect(
      (wrapper.vm as unknown as { detail: { profileVersion: string } }).detail
        .profileVersion,
    ).toBe("B-VERSION");
  });
});
