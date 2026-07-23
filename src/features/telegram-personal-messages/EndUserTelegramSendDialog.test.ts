import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { TelegramPersonalMessageResponseDto } from "@/shared/api/generated/models";
import EndUserTelegramSendDialog from "./EndUserTelegramSendDialog.vue";
import type { TelegramPersonalLinkStatus } from "./telegram-personal-message.model";

const mocks = vi.hoisted(() => ({
  list: vi.fn(),
  create: vi.fn(),
  get: vi.fn(),
}));

vi.mock("./telegram-personal-messages.api", () => ({
  telegramPersonalMessagesApi: mocks,
}));

const message = (
  status: TelegramPersonalMessageResponseDto["status"],
  overrides: Partial<TelegramPersonalMessageResponseDto> = {},
): TelegramPersonalMessageResponseDto => ({
  id: "message-1",
  projectId: "project-1",
  endUserId: "end-user-1",
  kind: "TEXT",
  status,
  attemptCount: status === "QUEUED" ? 0 : 1,
  providerMessageId: null,
  errorCode: null,
  nextAttemptAt: null,
  sentAt: null,
  createdAt: "2026-07-24T09:00:00.000Z",
  updatedAt: "2026-07-24T09:01:00.000Z",
  finishedAt: null,
  ...overrides,
});

function mountDialog(
  props: Partial<{
    visible: boolean;
    projectId: string;
    endUserId: string | null;
    linkStatus: TelegramPersonalLinkStatus;
    canSend: boolean;
    targetLabel: string;
  }> = {},
) {
  return mount(EndUserTelegramSendDialog, {
    props: {
      visible: true,
      projectId: "project-1",
      endUserId: "end-user-1",
      linkStatus: "ACTIVE",
      canSend: true,
      targetLabel: "Safe User",
      "onUpdate:visible": vi.fn(),
      ...props,
    },
    global: {
      stubs: {
        Dialog: {
          props: ["visible"],
          emits: ["update:visible"],
          template: '<section v-if="visible"><slot /></section>',
        },
        Button: {
          props: ["label", "disabled"],
          emits: ["click"],
          template:
            '<button type="button" :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
        },
        Textarea: {
          props: ["modelValue", "disabled", "maxlength"],
          emits: ["update:modelValue"],
          template:
            '<textarea :value="modelValue" :disabled="disabled" :maxlength="maxlength" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
        Message: { template: "<div><slot /></div>" },
      },
    },
  });
}

describe("EndUserTelegramSendDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers();
    mocks.list.mockResolvedValue({ items: [], nextCursor: null });
    mocks.create.mockResolvedValue(message("SENT"));
  });

  it("sends active-user text once and renders Telegram acceptance wording", async () => {
    const wrapper = mountDialog();
    await flushPromises();
    await wrapper.get("textarea").setValue("Сохраните эту инструкцию");
    await wrapper.get("form").trigger("submit");
    await flushPromises();

    expect(mocks.create).toHaveBeenCalledTimes(1);
    expect(mocks.create).toHaveBeenCalledWith(
      "project-1",
      "end-user-1",
      { text: "Сохраните эту инструкцию", file: null },
      expect.any(String),
      expect.objectContaining({ signal: expect.any(AbortSignal) }),
    );
    expect(wrapper.text()).toContain("Отправлено в Telegram");
    expect(wrapper.text()).not.toContain("Прочитано");
    expect(wrapper.get("textarea").element.value).toBe("");
  });

  it.each(
    [
      "UNLINKED",
      "PENDING_CONFIRMATION",
      "BLOCKED",
      "REVOKED",
    ] as const satisfies readonly TelegramPersonalLinkStatus[],
  )(
    "keeps history readable but blocks a new send for %s",
    async (linkStatus) => {
      const wrapper = mountDialog({ linkStatus });
      await flushPromises();

      expect(mocks.list).toHaveBeenCalled();
      expect(wrapper.find("form").exists()).toBe(true);
      expect(wrapper.text()).toContain("только при активной связи");
      expect(
        wrapper
          .findAll("button")
          .find((button) => button.text() === "Отправить в Telegram")
          ?.attributes("disabled"),
      ).toBeDefined();
      expect(mocks.create).not.toHaveBeenCalled();
    },
  );

  it("rejects a non-allowlisted file before any multipart request", async () => {
    const wrapper = mountDialog();
    await flushPromises();
    const input = wrapper.get('input[type="file"]');
    Object.defineProperty(input.element, "files", {
      configurable: true,
      value: [new File(["gif"], "animation.gif", { type: "image/gif" })],
    });
    await input.trigger("change");
    await wrapper.get("form").trigger("submit");

    expect(wrapper.text()).toContain("Формат файла не поддерживается");
    expect(mocks.create).not.toHaveBeenCalled();
  });

  it("clears the in-memory draft immediately on permission loss", async () => {
    const wrapper = mountDialog();
    await flushPromises();
    await wrapper.get("textarea").setValue("Черновик");
    expect(wrapper.emitted("dirty-change")?.at(-1)).toEqual([true]);

    await wrapper.setProps({ canSend: false });
    await flushPromises();

    expect(wrapper.find("form").exists()).toBe(false);
    expect(wrapper.emitted("dirty-change")?.at(-1)).toEqual([false]);
    expect(wrapper.text()).toContain("Недостаточно прав");
  });

  it("renders only safe status copy for permanent and ambiguous outcomes", async () => {
    mocks.list.mockResolvedValue({
      items: [
        message("FAILED_PERMANENT", {
          id: "failed",
          errorCode: "raw provider description 998877665544332211",
        }),
        message("OUTCOME_UNKNOWN", { id: "unknown" }),
      ],
      nextCursor: null,
    });
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.text()).toContain("Не удалось отправить сообщение");
    expect(wrapper.text()).toContain("Автоматический повтор отключён");
    expect(wrapper.text()).not.toContain("raw provider");
    expect(wrapper.text()).not.toContain("998877665544332211");
  });

  it("renders retry timing with a safe fallback for invalid dates", async () => {
    mocks.list.mockResolvedValue({
      items: [
        message("RETRY_WAIT", {
          id: "scheduled",
          nextAttemptAt: "2026-07-24T09:05:00.000Z",
        }),
        message("RETRY_WAIT", {
          id: "invalid",
          nextAttemptAt: "provider raw date",
        }),
      ],
      nextCursor: null,
    });
    const wrapper = mountDialog();
    await flushPromises();

    expect(wrapper.text()).toContain("Следующая попытка:");
    expect(wrapper.text()).toContain("Время следующей попытки уточняется");
    expect(wrapper.text()).not.toContain("provider raw date");
  });
});
