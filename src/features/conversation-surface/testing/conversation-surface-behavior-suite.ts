import type { VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { nextTick } from "vue";
import type {
  ConversationSurfaceComposer,
  ConversationSurfaceTranslation,
} from "../model/conversation-surface-contract";

interface ConversationSurfaceBehaviorSuiteOptions {
  name: string;
  mount: () => VueWrapper | Promise<VueWrapper>;
  expectedMessageIds: string[];
  translationAvailable: boolean;
  translatedText: string;
  translation: ConversationSurfaceTranslation;
  composer: Extract<ConversationSurfaceComposer, { mode: "PUBLIC_REPLY" }>;
  alternateComposer: Extract<
    ConversationSurfaceComposer,
    { mode: "PUBLIC_REPLY" }
  >;
  messagesWithGap: unknown[];
}

export function runConversationSurfaceBehaviorSuite(
  options: ConversationSurfaceBehaviorSuiteOptions,
): void {
  describe(`shared Conversation Surface behavior: ${options.name}`, () => {
    it("uses the canonical log, translation controls and public composer", async () => {
      const wrapper = await options.mount();

      expect(wrapper.findAll('[role="log"]')).toHaveLength(1);
      expect(
        wrapper
          .findAll("[data-message-id]")
          .map((message) => message.attributes("data-message-id")),
      ).toEqual(options.expectedMessageIds);
      expect(
        wrapper.findAll('[aria-label="Режим отображения сообщений"]'),
      ).toHaveLength(options.translationAvailable ? 1 : 0);
      expect(
        wrapper.find('textarea[aria-label="Ответ пользователю"]').exists(),
      ).toBe(true);
      expect(wrapper.findAll(".conversation-composer")).toHaveLength(1);
    });

    it("switches between original and translated rendering through the adapter", async () => {
      const wrapper = await options.mount();
      const toggle = wrapper.get('[data-action="show-translated-messages"]');
      expect(toggle.attributes("aria-pressed")).toBe("false");
      await toggle.trigger("click");
      expect(wrapper.emitted("change-translation-mode")?.at(-1)).toEqual([
        "TRANSLATED",
      ]);

      await wrapper.setProps({
        translation: { ...options.translation, mode: "TRANSLATED" },
      });
      expect(wrapper.text()).toContain(options.translatedText);
      expect(
        wrapper
          .get('[data-action="show-translated-messages"]')
          .attributes("aria-pressed"),
      ).toBe("true");
    });

    it("renders bulk progress and reply preview from adapter-owned state", async () => {
      const progressWrapper = await options.mount();
      await progressWrapper.setProps({
        translation: {
          ...options.translation,
          progress: { completed: 2, total: 5, cancellable: true },
        },
      });
      expect(progressWrapper.get('[role="status"]').text()).toContain("2 из 5");

      const previewWrapper = await options.mount();
      await previewWrapper.setProps({
        composer: {
          ...options.composer,
          sendCapability: { kind: "TRANSLATED_PREVIEW" },
          replyPreview: {
            draft: {
              status: "READY",
              targetLocale: "en",
              translatedText: "Translated reply",
              warnings: [],
            },
            targetLocale: "en",
            busy: false,
            stale: false,
            disabled: false,
          },
        },
      });
      const preview = previewWrapper.findComponent({
        name: "ReplyTranslationPreview",
      });
      expect(preview.exists()).toBe(true);
      expect(preview.props("draft")).toMatchObject({
        status: "READY",
        translatedText: "Translated reply",
      });
    });

    it("requests authoritative reconcile and recovers the conversation-scoped draft", async () => {
      const wrapper = await options.mount();
      const textarea = wrapper.get('textarea[aria-label="Ответ пользователю"]');

      await textarea.setValue("Черновик переживает reconnect");
      await wrapper.setProps({ messages: options.messagesWithGap });
      await nextTick();
      expect(wrapper.emitted("reconcile-required")?.at(-1)?.[0]).toEqual(
        expect.arrayContaining([
          { kind: "ORDINAL_GAP", afterOrdinal: 1, beforeOrdinal: 3 },
        ]),
      );

      await wrapper.setProps({ composer: options.alternateComposer });
      await wrapper
        .get('textarea[aria-label="Ответ пользователю"]')
        .setValue("Другой диалог");
      await wrapper.setProps({ composer: options.composer });

      expect(
        wrapper.get('textarea[aria-label="Ответ пользователю"]').element,
      ).toHaveProperty("value", "Черновик переживает reconnect");
    });
  });
}
