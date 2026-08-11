import { mount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import SupportCaseBrief from "./SupportCaseBrief.vue";

const stubs = {
  Button: {
    props: ["label"],
    emits: ["click"],
    template:
      '<button type="button" @click="$emit(\'click\')">{{ label }}</button>',
  },
  Dialog: {
    props: ["visible", "header"],
    emits: ["update:visible"],
    template:
      '<section v-if="visible" role="dialog"><h2>{{ header }}</h2><slot/><footer><slot name="footer"/></footer></section>',
  },
};

describe("SupportCaseBrief", () => {
  it("keeps the handoff brief compact and reveals long context on demand", async () => {
    const wrapper = mount(SupportCaseBrief, {
      props: {
        caseTitle: "Не поступил депозит",
        projectSequence: "48",
        summary:
          "Платёж найден, но провайдер ещё не вернул окончательный результат обработки операции.",
        goal: "Подтвердить статус депозита и сообщить пользователю проверяемый следующий шаг.",
        blockers: [
          "Ожидается ответ платёжного провайдера",
          "Нет подтверждённого срока зачисления",
        ],
        limitations: ["Нельзя обещать время поступления средств"],
      },
      global: { stubs },
    });

    expect(wrapper.get(".case-brief__summary").text()).toContain(
      "Платёж найден",
    );
    expect(wrapper.get(".case-brief__blockers").text()).toContain(
      "Блокеры · 2",
    );
    expect(wrapper.find('[role="dialog"]').exists()).toBe(false);

    await wrapper.get(".case-brief__expand").trigger("click");

    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.text()).toContain("Контекст обращения #48");
    expect(dialog.get(".case-brief-sheet__summary").text()).toContain(
      "Что произошло",
    );
    expect(dialog.get(".case-brief-sheet__goal").text()).toContain(
      "Что нужно получить",
    );
    expect(
      dialog.get(".case-brief-sheet__signals").attributes("aria-label"),
    ).toBe("Риски и ограничения");
    expect(dialog.findAll(".case-brief-sheet__blockers li")).toHaveLength(2);
    expect(dialog.findAll(".case-brief-sheet__limitations li")).toHaveLength(1);
    expect(dialog.text()).toContain(
      "Подтвердить статус депозита и сообщить пользователю проверяемый следующий шаг.",
    );
    expect(dialog.text()).toContain("Ожидается ответ платёжного провайдера");
    expect(dialog.text()).toContain("Нельзя обещать время поступления средств");
  });

  it("distinguishes confirmed absence of blockers from unavailable data", () => {
    const props = {
      caseTitle: "Возврат",
      projectSequence: "49",
      summary: "Возврат подтверждён.",
      goal: "Проверить баланс.",
    };
    const confirmedClear = mount(SupportCaseBrief, {
      props: { ...props, blockers: [] },
      global: { stubs },
    });
    const unavailable = mount(SupportCaseBrief, {
      props,
      global: { stubs },
    });

    expect(confirmedClear.get(".case-brief__blockers").text()).toContain(
      "Блокеры · 0",
    );
    expect(confirmedClear.get(".case-brief__blockers").text()).toContain(
      "Активных препятствий",
    );
    expect(unavailable.find(".case-brief__blockers").exists()).toBe(false);
  });
});
