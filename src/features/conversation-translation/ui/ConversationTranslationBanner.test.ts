import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import type { ConversationTranslationResponseDto } from "@/shared/api/generated/models";
import ConversationTranslationBanner from "./ConversationTranslationBanner.vue";

function state(
  source: ConversationTranslationResponseDto["language"]["source"],
): ConversationTranslationResponseDto {
  return {
    availability: { available: true, reason: null },
    budget: {
      consumedMicros: "0",
      hardExhausted: false,
      hardLimitMicros: null,
      hardPercent: null,
      reservedMicros: "0",
      softLimitMicros: null,
      softPercent: null,
    },
    configRevision: "translation-config-1",
    supportedLocales: ["ru", "de"],
    language: { locale: "de", needsConfirmation: false, source },
    preference: {
      enabled: true,
      endUserLocaleOverride: null,
      updatedAt: "2026-07-30T10:00:00.000Z",
      version: 1,
      workingLocale: "ru",
    },
    projectVersion: 1,
  };
}

describe("conversation translation banner", () => {
  it.each([
    ["MANUAL", "выбран вручную"],
    ["PROFILE", "из профиля"],
    ["RECENT_MESSAGES", "по последним сообщениям"],
    ["CASE_HINT", "из обращения"],
    ["UNKNOWN", "источник не определён"],
  ] as const)("объясняет источник языка %s", (source, explanation) => {
    const wrapper = shallowMount(ConversationTranslationBanner, {
      props: {
        state: state(source),
        loading: false,
        saving: false,
        canManage: true,
        eligibleCount: 0,
      },
    });

    expect(wrapper.text()).toContain("Язык ответов");
    expect(wrapper.text()).toContain("de");
    expect(wrapper.text()).toContain(explanation);
  });

  it("помечает explicit override как ручной выбор", () => {
    const value = state("PROFILE");
    value.preference.endUserLocaleOverride = "de";
    const wrapper = shallowMount(ConversationTranslationBanner, {
      props: {
        state: value,
        loading: false,
        saving: false,
        canManage: true,
        eligibleCount: 0,
      },
    });

    expect(wrapper.text()).toContain("выбран вручную");
    expect(wrapper.text()).not.toContain("из профиля");
  });
});
