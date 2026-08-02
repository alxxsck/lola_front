import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import AiAllowanceDirectGrantPanel from "./AiAllowanceDirectGrantPanel.vue";

const mocks = vi.hoisted(() => ({
  createGrant: vi.fn(),
}));

vi.mock("../api/ai-allowance-repository", () => ({
  aiAllowanceRepository: {
    createGrant: mocks.createGrant,
  },
}));

describe("AiAllowanceDirectGrantPanel", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("reuses the command idempotency key when the same grant is retried", async () => {
    mocks.createGrant
      .mockRejectedValueOnce(new Error("Response lost"))
      .mockResolvedValueOnce({ replayed: true });
    const wrapper = mount(AiAllowanceDirectGrantPanel, {
      props: { projectId: "project-1" },
    });
    await fillGrant(wrapper, "user-1", "1.250000000000", "Loyalty reward");

    await wrapper.get("form").trigger("submit");
    await flushPromises();
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.createGrant).toHaveBeenCalledTimes(2);
    expect(mocks.createGrant.mock.calls[1]![3]).toBe(
      mocks.createGrant.mock.calls[0]![3],
    );
  });

  it("rotates the idempotency key when the grant command changes", async () => {
    mocks.createGrant.mockRejectedValue(new Error("Response lost"));
    const wrapper = mount(AiAllowanceDirectGrantPanel, {
      props: { projectId: "project-1" },
    });
    await fillGrant(wrapper, "user-1", "1.250000000000", "Loyalty reward");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    await wrapper.findAll("input")[1]!.setValue("2.500000000000");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.createGrant.mock.calls[1]![3]).not.toBe(
      mocks.createGrant.mock.calls[0]![3],
    );
  });

  it("rotates the idempotency key after a confirmed grant", async () => {
    mocks.createGrant.mockResolvedValue({ replayed: false });
    const wrapper = mount(AiAllowanceDirectGrantPanel, {
      props: { projectId: "project-1" },
    });
    await fillGrant(wrapper, "user-1", "1.250000000000", "Loyalty reward");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    await fillGrant(wrapper, "user-1", "1.250000000000", "Loyalty reward");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.createGrant.mock.calls[1]![3]).not.toBe(
      mocks.createGrant.mock.calls[0]![3],
    );
  });
});

async function fillGrant(
  wrapper: ReturnType<typeof mount>,
  endUserId: string,
  amount: string,
  reason: string,
): Promise<void> {
  const inputs = wrapper.findAll("input");
  await inputs[0]!.setValue(endUserId);
  await inputs[1]!.setValue(amount);
  await wrapper.get("textarea").setValue(reason);
}
