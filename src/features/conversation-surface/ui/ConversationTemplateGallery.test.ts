import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it } from "vitest";
import type { SupportMacroResponseDto } from "@/shared/api/generated/models";
import ConversationTemplateGallery from "./ConversationTemplateGallery.vue";

const macro = {
  id: "macro-1",
  stableCode: "payment-check",
  lifecycle: "ACTIVE",
  version: 1,
  draft: null,
  publishedRevision: {
    id: "revision-3",
    revisionNumber: 3,
    contentHash: "a".repeat(64),
    publishedAt: "2026-08-09T10:00:00.000Z",
    configuration: {
      compilerRevision: 1,
      title: "Проверка платежа",
      shortcuts: ["deposit"],
      locale: "ru",
      body: "Проверяю статус платежа.",
      translations: { ru: "Проверяю статус платежа." },
      visibility: { mode: "PROJECT", teamIds: [], topicCodes: ["PAYMENTS"] },
      variables: [],
      contentHash: "a".repeat(64),
    },
  },
  actionEtag: '"sm1.test"',
  applicability: {
    visibility: "PROJECT",
    teamIds: [],
    categoryCodes: [],
    locale: "ru",
  },
} as SupportMacroResponseDto;

describe("ConversationTemplateGallery", () => {
  it("searches and selects a server-owned macro without emitting send", async () => {
    const wrapper = mount(ConversationTemplateGallery, {
      props: {
        visible: true,
        macros: [macro],
        query: "",
        loading: false,
        applyingId: null,
      },
      attachTo: document.body,
      global: {
        plugins: [PrimeVue],
        stubs: {
          Dialog: {
            props: ["visible"],
            template:
              '<section v-if="visible"><slot name="header" /><slot /></section>',
          },
        },
      },
    });

    await wrapper.get('input[aria-label="Найти шаблон"]').setValue("платёж");
    await wrapper.get("form").trigger("submit");
    expect(wrapper.emitted("search")).toEqual([["платёж"]]);

    const row = wrapper.get(".macro-row");
    expect(row.text()).toContain("Проверка платежа");
    expect(row.text()).toContain("Версия 3");
    await row.trigger("click");
    expect(wrapper.emitted("select")).toEqual([[macro]]);
    expect(wrapper.emitted("send")).toBeUndefined();
  });

  it("keeps the shared legacy User workspace gallery usable", async () => {
    const template = {
      id: "checking",
      label: "Проверяю",
      text: "Проверяю информацию.",
      description: "Ответ в работе",
    };
    const wrapper = mount(ConversationTemplateGallery, {
      props: { visible: true, templates: [template] },
      global: {
        plugins: [PrimeVue],
        stubs: {
          Dialog: {
            props: ["visible"],
            template:
              '<section v-if="visible"><slot name="header" /><slot /></section>',
          },
        },
      },
    });

    expect(wrapper.find('[role="search"]').exists()).toBe(false);
    await wrapper.get(".macro-row").trigger("click");
    expect(wrapper.emitted("select")).toEqual([[template]]);
  });
});
