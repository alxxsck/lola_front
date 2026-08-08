import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import ConversationCollaborationStatus from "./ConversationCollaborationStatus.vue";

describe("ConversationCollaborationStatus", () => {
  it("shows compact viewers without implying assignment", () => {
    const wrapper = mount(ConversationCollaborationStatus, {
      props: {
        variant: "PRESENCE",
        collaboration: {
          viewers: [
            { cmsUserId: "operator-2", displayName: "Анна" },
            { cmsUserId: "operator-3", displayName: "Илья" },
          ],
          typers: [],
          collision: { state: "NOT_ARMED" },
        },
      },
    });

    expect(wrapper.text()).toContain("Смотрят: Анна и Илья");
    expect(wrapper.text()).not.toContain("назнач");
  });

  it("prioritizes an authoritative collision over typing and remains a warning", () => {
    const wrapper = mount(ConversationCollaborationStatus, {
      props: {
        variant: "COLLISION",
        collaboration: {
          viewers: [],
          typers: [{ cmsUserId: "operator-2", displayName: "Анна" }],
          collision: {
            state: "OTHER_OPERATOR_REPLIED",
            observedMessageOrdinal: 12,
            messageId: "message-13",
            messageOrdinal: 13,
            cmsUserId: "operator-2",
            createdAt: "2026-08-08T10:00:00.000Z",
          },
        },
      },
    });

    expect(wrapper.text()).toContain("Коллега уже отправил ответ");
    expect(wrapper.text()).toContain("Проверьте обновлённую переписку");
    expect(wrapper.get("[role='status']").attributes("aria-live")).toBe("polite");
    expect(wrapper.find("button").exists()).toBe(false);
  });
});
