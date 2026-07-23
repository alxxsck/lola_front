import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type {
  TelegramBroadcast,
  TelegramBroadcastPermissions,
} from "../model/telegram-broadcast";
import TelegramBroadcastList from "./TelegramBroadcastList.vue";

const permissions: TelegramBroadcastPermissions = {
  read: true,
  draft: true,
  approve: false,
  operate: false,
};

const item: TelegramBroadcast = {
  id: "broadcast-1",
  projectId: "project-1",
  title: "Июльское обновление",
  status: "SCHEDULED",
  version: 4,
  revision: {
    id: "revision-2",
    revisionNumber: 2,
    contentHash:
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    text: "Обновление доступно.",
    createdAt: "2026-07-23T09:00:00.000Z",
  },
  content: { text: "Обновление доступно." },
  audience: { kind: "ALL_EXPLICITLY_OPTED_IN" },
  approval: {
    id: "approval-1",
    revisionId: "revision-2",
    contentHash:
      "bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
    recipientCount: 12,
    successfulTestId: "test-1",
    audiencePolicy: "ALL_EXPLICITLY_OPTED_IN",
    approvedAt: "2026-07-23T10:00:00.000Z",
    approvedByActorType: "CMS_USER",
  },
  latestTest: null,
  recipientCount: 12,
  scheduledAt: "2026-07-25T12:00:00.000Z",
  progress: null,
  allowedActions: ["START", "CANCEL"],
  createdAt: "2026-07-23T09:00:00.000Z",
  updatedAt: "2026-07-23T10:00:00.000Z",
};

describe("TelegramBroadcastList", () => {
  it("renders textual lifecycle, consent-safe audience and opens an item", async () => {
    const wrapper = mount(TelegramBroadcastList, {
      props: {
        items: [item],
        total: 1,
        loading: false,
        permissions,
        nextCursor: null,
      },
    });

    expect(wrapper.text()).toContain("Запланирована");
    expect(wrapper.text()).toContain("12");
    expect(wrapper.text()).toContain("только с явным согласием");
    await wrapper
      .get('button[aria-label="Открыть рассылку Июльское обновление"]')
      .trigger("click");
    expect(wrapper.emitted("open")).toEqual([["broadcast-1"]]);
  });

  it("gates create by draft capability and announces loading", () => {
    const readonly = mount(TelegramBroadcastList, {
      props: {
        items: [],
        total: 0,
        loading: true,
        permissions: { ...permissions, draft: false },
        nextCursor: null,
      },
    });

    expect(readonly.find('[data-action="create"]').exists()).toBe(false);
    expect(readonly.get('[role="status"]').attributes("aria-live")).toBe(
      "polite",
    );
    expect(readonly.text()).toContain("Загружаем рассылки");
  });

  it("uses snapshot-implying status and recipientCount for an approved summary", () => {
    const wrapper = mount(TelegramBroadcastList, {
      props: {
        items: [
          {
            ...item,
            status: "APPROVED",
            approval: null,
            recipientCount: 17,
          },
        ],
        total: 1,
        loading: false,
        permissions,
        nextCursor: null,
      },
    });

    expect(wrapper.text()).toContain("Зафиксированная аудитория: 17");
    expect(wrapper.text()).not.toContain(
      "Снимок аудитории ещё не зафиксирован",
    );
  });

  it("does not claim a fixed snapshot for a broadcast cancelled from draft", () => {
    const wrapper = mount(TelegramBroadcastList, {
      props: {
        items: [
          {
            ...item,
            status: "CANCELLED",
            approval: null,
            recipientCount: 0,
          },
        ],
        total: 1,
        loading: false,
        permissions,
        nextCursor: null,
      },
    });

    expect(wrapper.text()).toContain("Получателей: 0");
    expect(wrapper.text()).not.toContain("Зафиксированная аудитория");
    expect(wrapper.text()).not.toContain(
      "Снимок аудитории ещё не зафиксирован",
    );
  });
});
