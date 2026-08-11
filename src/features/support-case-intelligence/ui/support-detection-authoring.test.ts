import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import { mockSupportCaseIntelligenceSource } from "../api/support-case-intelligence-source";
import { createDefaultDetectionPolicy } from "../model/support-case-intelligence-policy";
import SupportDetectionCalibrationCard from "./SupportDetectionCalibrationCard.vue";
import SupportDetectionPreviewConsole from "./SupportDetectionPreviewConsole.vue";

const Button = {
  props: ["label", "disabled", "loading"],
  emits: ["click"],
  template:
    '<button :disabled="disabled || loading" @click="$emit(\'click\')">{{ label }}<slot /></button>',
};
const Tag = {
  props: ["value"],
  template: "<span>{{ value }}</span>",
};
const Message = { template: "<div><slot /></div>" };
const Select = { template: "<select />" };
const Textarea = { template: "<textarea />" };
const stubs = { Button, Tag, Message, Select, Textarea };

describe("Case Intelligence authoring workbench", () => {
  it("emits a bounded dialog instead of a single untyped phrase", async () => {
    const wrapper = mount(SupportDetectionPreviewConsole, {
      props: {
        result: null,
        locales: ["ru-RU"],
        canPreview: true,
        blocked: false,
        loading: false,
      },
      global: { stubs },
    });

    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Проверить диалог")!
      .trigger("click");

    expect(wrapper.emitted("preview")?.[0]?.[0]).toEqual([
      expect.objectContaining({
        role: "USER",
        locale: "ru-RU",
        text: "Списали деньги дважды, помогите вернуть оплату",
      }),
    ]);
  });

  it("renders the authoritative decision, confidence, cost and stages", async () => {
    const definition = createDefaultDetectionPolicy();
    const messages = [
      {
        id: "11111111-1111-4111-8111-111111111111",
        role: "USER" as const,
        text: "Обычный вопрос",
        locale: "ru-RU",
      },
    ];
    const result = await mockSupportCaseIntelligenceSource.dryRun(
      crypto.randomUUID(),
      definition,
      messages,
    );
    const wrapper = mount(SupportDetectionPreviewConsole, {
      props: {
        result,
        locales: definition.locales,
        canPreview: true,
        blocked: false,
        loading: false,
      },
      global: { stubs },
    });

    expect(wrapper.text()).toContain("Передать на проверку");
    expect(wrapper.text()).toContain("Доверие не рассчитано");
    expect(wrapper.text()).toContain("Вызовы модели");
    expect(wrapper.text()).toContain("Смысловая проверка");
    expect(wrapper.text()).toContain("ничего не изменит в обращениях");
  });

  it("shows every calibration dimension and keeps refresh permission-gated", async () => {
    const definition = createDefaultDetectionPolicy();
    const calibration =
      await mockSupportCaseIntelligenceSource.readCalibration(
        crypto.randomUUID(),
        definition,
      );
    const wrapper = mount(SupportDetectionCalibrationCard, {
      props: { calibration, loading: false, canPreview: true },
      global: { stubs },
    });

    expect(wrapper.findAll("tbody tr")).toHaveLength(4);
    expect(wrapper.text()).toContain("4 из 4");
    expect(wrapper.text()).toContain("Текст");
    await wrapper.get("button").trigger("click");
    expect(wrapper.emitted("load")).toHaveLength(1);

    await wrapper.setProps({ canPreview: false });
    expect(wrapper.get("button").attributes("disabled")).toBeDefined();
    expect(wrapper.text()).toContain("нужен доступ к предпросмотру");
  });
});
