import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import AiAllowanceReconciliationQueue from "./AiAllowanceReconciliationQueue.vue";

const mocks = vi.hoisted(() => ({
  queue: vi.fn(),
  resolve: vi.fn(),
}));
vi.mock("../api/ai-allowance-repository", () => ({
  aiAllowanceRepository: {
    reconciliationQueue: mocks.queue,
    resolveAttempt: mocks.resolve,
  },
}));

function item(label: string, reservedAt: string) {
  return {
    id: `reservation-${label}`,
    endUserId: `user-${label}`,
    aiOperationId: `operation-${label}`,
    modelAttemptId: `attempt-${label}`,
    usageGroupId: `group-${label}`,
    category: "CHAT",
    status: "UNKNOWN_HELD",
    quotedUpperBoundUsd: "1.000000000000",
    reservedUsd: "0.000000000000",
    settledUsd: "0.000000000000",
    unknownHeldUsd: "1.000000000000",
    overageUsd: "0.000000000000",
    costQuality: "UNKNOWN",
    usageRecordId: null,
    outcomeReason: label,
    reservedAt,
    terminalAt: null,
  } as const;
}

function page(label = "oldest") {
  return {
    items: [item(label, "2026-08-01T00:00:00.000Z")],
    pageInfo: { hasMore: true, nextCursor: `reservation-${label}` },
  } as const;
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function mountQueue(
  props: { projectId?: string; canReconcile?: boolean } = {},
) {
  return mount(AiAllowanceReconciliationQueue, {
    props: {
      projectId: props.projectId ?? "project-1",
      canReconcile: props.canReconcile ?? true,
    },
    global: {
      stubs: {
        Dialog: {
          props: ["visible"],
          template: "<div v-if='visible'><slot /></div>",
        },
      },
    },
  });
}

describe("AiAllowanceReconciliationQueue", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.queue.mockResolvedValue(page());
    mocks.resolve.mockResolvedValue({ replayed: false });
  });

  it("loads a bounded oldest-first queue and paginates with status in the keyset context", async () => {
    const wrapper = mountQueue();
    await flushPromises();
    expect(wrapper.text()).toContain("oldest");
    expect(mocks.queue).toHaveBeenCalledWith("project-1", { limit: 50 });

    await wrapper.get("select").setValue("UNKNOWN_HELD");
    await flushPromises();
    expect(mocks.queue).toHaveBeenLastCalledWith("project-1", {
      limit: 50,
      status: "UNKNOWN_HELD",
    });

    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Следующие"))!
      .trigger("click");
    await flushPromises();
    expect(mocks.queue).toHaveBeenLastCalledWith("project-1", {
      limit: 50,
      cursor: "reservation-oldest",
      status: "UNKNOWN_HELD",
    });
  });

  it("requires operator confirmation and resolves the selected attempt with a stable key", async () => {
    const wrapper = mountQueue();
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Завершить"))!
      .trigger("click");
    await wrapper
      .find("textarea")
      .setValue("Verified provider outcome evidence");
    expect(wrapper.find("input[readonly]").exists()).toBe(false);
    await wrapper.find("form.resolve-form").trigger("submit");
    expect(wrapper.text()).toContain("Подтвердите проверку данных");
    expect(mocks.resolve).not.toHaveBeenCalled();

    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.find("form.resolve-form").trigger("submit");
    await flushPromises();
    expect(mocks.resolve).toHaveBeenCalledWith(
      "project-1",
      "attempt-oldest",
      {
        resolution: "SETTLE_FROM_USAGE",
        reason: "Verified provider outcome evidence",
      },
      expect.any(String),
    );
  });

  it("does not expose a late queue page from another Project", async () => {
    const previous = deferred<ReturnType<typeof page>>();
    mocks.queue
      .mockReturnValueOnce(previous.promise)
      .mockResolvedValueOnce(page("current-project"));
    const wrapper = mountQueue();
    await wrapper.setProps({ projectId: "project-2" });
    await flushPromises();
    previous.resolve(page("stale-project"));
    await flushPromises();

    expect(wrapper.text()).toContain("current-project");
    expect(wrapper.text()).not.toContain("stale-project");
  });

  it("does not query or render operator controls without reconcile permission", async () => {
    const wrapper = mountQueue({ canReconcile: false });
    await flushPromises();
    expect(wrapper.text()).toContain("Нет доступа к сверке");
    expect(mocks.queue).not.toHaveBeenCalled();
    expect(wrapper.text()).not.toContain("Завершить");
  });

  it("requires a fresh login for resolve without replaying the break-glass command", async () => {
    mocks.resolve.mockRejectedValue(
      new ApiError(
        428,
        "unsafe backend text",
        undefined,
        "step-up-request",
        "REAUTHENTICATION_REQUIRED",
      ),
    );
    const wrapper = mountQueue();
    await flushPromises();
    await wrapper
      .findAll("button")
      .find((button) => button.text().includes("Завершить"))!
      .trigger("click");
    await wrapper.find("textarea").setValue("Verified provider evidence");
    await wrapper.get('input[type="checkbox"]').setValue(true);
    await wrapper.find("form.resolve-form").trigger("submit");
    await flushPromises();

    expect(wrapper.text()).toContain("не будут повторены автоматически");
    expect(wrapper.text()).not.toContain("unsafe backend text");
    await wrapper.get('[data-testid="allowance-fresh-login"]').trigger("click");
    expect(wrapper.emitted("fresh-login")).toEqual([[]]);
    expect(mocks.resolve).toHaveBeenCalledOnce();
  });
});
