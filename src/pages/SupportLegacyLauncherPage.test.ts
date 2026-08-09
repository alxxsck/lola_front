import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import SupportLegacyLauncherPage from "./SupportLegacyLauncherPage.vue";

const mocks = vi.hoisted(() => ({
  replace: vi.fn().mockResolvedValue(undefined),
  query: { projectId: "project-1" } as Record<string, string>,
}));

vi.mock("vue-router", () => ({
  useRoute: () => ({ query: mocks.query }),
  useRouter: () => ({ replace: mocks.replace }),
}));

function mountPage(
  entryPoint: "CASES" | "USERS" | "LIVE",
  selection?: { kind: "CASE" | "CONVERSATION" | "END_USER"; id: string },
) {
  return mount(SupportLegacyLauncherPage, {
    props: {
      entryPoint,
      selectionKind: selection?.kind,
      selectionId: selection?.id,
    },
    global: {
      stubs: {
        RouterLink: {
          props: ["to"],
          template: '<a :href="to"><slot /></a>',
        },
      },
    },
  });
}

describe("SupportLegacyLauncherPage", () => {
  beforeEach(() => mocks.replace.mockClear());

  it("renders only launcher context without legacy writable controls", () => {
    const wrapper = mountPage("CASES", { kind: "CASE", id: "case-42" });

    expect(wrapper.get("h1").text()).toBe(
      "Support Workspace временно выключен",
    );
    expect(wrapper.text()).toContain("Case · case-42");
    expect(wrapper.text()).not.toContain("Ответ пользователю");
    expect(wrapper.text()).not.toContain("Изменить статус");
    expect(wrapper.text()).not.toContain("Назначить оператора");
    expect(wrapper.find("textarea").exists()).toBe(false);
    expect(wrapper.find("form").exists()).toBe(false);
  });

  it("rechecks the exact canonical selection without issuing a command", async () => {
    const wrapper = mountPage("USERS", {
      kind: "CONVERSATION",
      id: "conversation-7",
    });

    await wrapper.get("button").trigger("click");

    expect(mocks.replace).toHaveBeenCalledWith({
      name: "support-inbox-conversation",
      params: { conversationId: "conversation-7" },
      query: { projectId: "project-1" },
    });
  });

  it("rechecks a Users End User as a filtered inbox rather than a Conversation", async () => {
    const wrapper = mountPage("USERS", {
      kind: "END_USER",
      id: "end-user-7",
    });

    await wrapper.get("button").trigger("click");

    expect(mocks.replace).toHaveBeenCalledWith({
      name: "support-inbox",
      query: {
        projectId: "project-1",
        endUserId: "end-user-7",
        entry: "users",
      },
    });
  });
});
