import type { VueWrapper } from "@vue/test-utils";
import { describe, expect, it } from "vitest";

interface ConversationSurfaceBehaviorSuiteOptions {
  name: string;
  mount: () => VueWrapper | Promise<VueWrapper>;
  expectedMessageIds: string[];
  translationAvailable: boolean;
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
  });
}
