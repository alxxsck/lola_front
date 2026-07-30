import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import TranslatedMessageBody from "./TranslatedMessageBody.vue";
import type { ConversationMessage } from "@/shared/types/domain";

function message(
  overrides: Partial<ConversationMessage> = {},
): ConversationMessage {
  return {
    id: "message-1",
    conversationId: "conversation-1",
    author: "USER",
    text: "Guten Tag",
    status: "COMPLETED",
    createdAt: "2026-07-30T10:00:00.000Z",
    ...overrides,
  };
}

describe("translated message body", () => {
  it("показывает сохранённый перевод и переключается на оригинал без API", async () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message({
          translation: {
            id: "translation-1",
            direction: "INBOUND",
            status: "COMPLETED",
            originalText: "Guten Tag",
            translatedText: "Добрый день",
            deliveredText: null,
            viewText: "Добрый день",
            sourceLocale: "de",
            targetLocale: "ru",
            errorCode: null,
            warnings: [],
            updatedAt: "2026-07-30T10:00:01.000Z",
          },
        }),
        canTranslate: true,
      },
    });

    expect(wrapper.text()).toContain("Добрый день");
    await wrapper.get("button-stub").trigger("click");
    expect(wrapper.text()).toContain("Guten Tag");
  });

  it("для outbound сначала показывает исходник оператора, затем exact delivered edit", async () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message({
          author: "ADMIN",
          text: "Guten Tag!",
          translation: {
            id: "draft-1",
            direction: "OUTBOUND",
            status: "COMPLETED",
            originalText: "Здравствуйте",
            translatedText: "Hallo",
            deliveredText: "Guten Tag!",
            viewText: "Guten Tag!",
            sourceLocale: "ru",
            targetLocale: "de",
            errorCode: null,
            warnings: ["OPERATOR_EDITED"],
            updatedAt: "2026-07-30T10:00:01.000Z",
          },
        }),
        canTranslate: true,
      },
    });

    expect(wrapper.text()).toContain("Здравствуйте");
    expect(wrapper.text()).not.toContain("Guten Tag!");
    expect(wrapper.text()).not.toContain("Hallo");
    await wrapper.get("button-stub").trigger("click");
    expect(wrapper.text()).toContain("Guten Tag!");
    expect(wrapper.text()).not.toContain("Hallo");
    expect(wrapper.text()).toContain("Изменено оператором");
  });

  it("объявляет pending как live status", () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message(),
        requested: {
          messageId: "message-1",
          translationId: "translation-1",
          state: "RUNNING",
          sourceLocale: "de",
          targetLocale: "ru",
          translatedText: null,
          errorCode: null,
          warnings: [],
          updatedAt: "2026-07-30T10:00:01.000Z",
        },
        canTranslate: true,
      },
    });

    expect(wrapper.get('[role="status"]').attributes("aria-live")).toBe(
      "polite",
    );
  });

  it("предлагает ручную сверку pending после завершения локального polling", async () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message(),
        requested: {
          messageId: "message-1",
          translationId: "translation-1",
          state: "PENDING",
          sourceLocale: "de",
          targetLocale: "ru",
          translatedText: null,
          errorCode: null,
          warnings: [],
          updatedAt: "2026-07-30T10:00:01.000Z",
        },
        busy: false,
        canTranslate: true,
      },
    });

    await wrapper.get("button-stub").trigger("click");
    expect(wrapper.emitted("reconcile")).toEqual([["message-1"]]);
  });

  it.each([
    ["SAME_LANGUAGE", "Язык сообщения совпадает с рабочим"],
    ["EMPTY_OR_NOISE", "В сообщении нет текста для перевода"],
    ["UNSUPPORTED_ROLE", "Этот тип сообщения нельзя перевести"],
    ["LANGUAGE_UNRESOLVED", "Язык сообщения не удалось определить"],
  ] as const)("безопасно объясняет SKIPPED: %s", (skipReason, explanation) => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message(),
        requested: {
          messageId: "message-1",
          state: "SKIPPED",
          skipReason,
          translatedText: null,
          updatedAt: "2026-07-30T10:00:01.000Z",
        },
        canTranslate: true,
      },
    });

    expect(wrapper.get('[role="status"]').text()).toContain(explanation);
    expect(wrapper.text()).not.toContain(skipReason);
  });

  it("использует нейтральное объяснение для SKIPPED без reason", () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message(),
        requested: {
          messageId: "message-1",
          state: "SKIPPED",
          translatedText: null,
          updatedAt: "2026-07-30T10:00:01.000Z",
        },
        canTranslate: true,
      },
    });

    expect(wrapper.get('[role="status"]').text()).toContain(
      "Перевод пропущен без обращения к модели",
    );
    expect(wrapper.text()).not.toContain(
      "Язык сообщения не удалось определить",
    );
  });

  it("оставляет per-message перевод доступным без conversation opt-in", () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message(),
        canTranslate: true,
      },
    });

    expect(wrapper.find("button-stub").exists()).toBe(true);
  });

  it("не предлагает перевод для очевидного emoji/noise", () => {
    const wrapper = shallowMount(TranslatedMessageBody, {
      props: {
        message: message({ text: "👋✨" }),
        canTranslate: true,
        workingLocale: "ru",
      },
    });

    expect(wrapper.find("button-stub").exists()).toBe(false);
  });

  it.each([
    ["русского", "Спасибо, всё получилось"],
    ["болгарского", "Благодаря"],
    ["сербского", "Хвала"],
    ["македонского", "Благодарам"],
    ["немецкого", "Danke!"],
  ])(
    "сохраняет ручное действие для содержательного %s текста",
    (_label, text) => {
      const wrapper = shallowMount(TranslatedMessageBody, {
        props: {
          message: message({ text }),
          canTranslate: true,
          workingLocale: "ru",
        },
      });

      expect(wrapper.find("button-stub").exists()).toBe(true);
    },
  );

  it.each(["ASSISTANT", "SCENARIO"] as const)(
    "предлагает ручной перевод для %s",
    (author) => {
      const wrapper = shallowMount(TranslatedMessageBody, {
        props: {
          message: message({ author }),
          canTranslate: true,
        },
      });

      expect(wrapper.find("button-stub").exists()).toBe(true);
    },
  );
});
