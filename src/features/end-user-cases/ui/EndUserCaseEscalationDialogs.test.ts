import { mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const store = vi.hoisted(() => ({
  selected: {
    case: { id: "case-1", version: 3, summary: "Текущая сводка" },
    escalations: {
      items: [
        {
          id: "escalation-1",
          version: 2,
          status: "CLAIMED",
          claimant: { id: "cms-1", displayName: "Текущий специалист" },
        },
      ],
    },
  },
  mutating: false,
  detailError: null as string | null,
  requestEscalation: vi.fn(),
  claimEscalation: vi.fn(),
  releaseEscalation: vi.fn(),
  transferEscalation: vi.fn(),
  closeEscalation: vi.fn(),
  cancelEscalation: vi.fn(),
}));
const repository = vi.hoisted(() => ({ assignees: vi.fn() }));

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({
    project: { id: "project-1" },
    user: { id: "cms-1" },
  }),
}));
vi.mock("../model/end-user-cases.store", () => ({
  useEndUserCasesStore: () => store,
}));
vi.mock("../api/end-user-cases-repository", () => ({
  endUserCasesRepository: repository,
}));

import EndUserCaseEscalationDialogs from "./EndUserCaseEscalationDialogs.vue";

const stubs = {
  Dialog: {
    props: ["visible", "header"],
    template:
      '<section v-if="visible" :data-header="header"><slot /><slot name="footer" /></section>',
  },
  Message: { template: "<div><slot /></div>" },
  Button: {
    props: ["label", "disabled"],
    emits: ["click"],
    template:
      '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
  },
  Select: {
    props: ["modelValue", "options", "optionLabel", "optionValue", "inputId"],
    emits: ["update:modelValue"],
    template:
      '<select :id="inputId" :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="item in options" :key="item.value ?? item.id" :value="item.value ?? item.id">{{ item.label ?? item.displayName }}</option></select>',
  },
  Textarea: {
    props: ["modelValue"],
    emits: ["update:modelValue"],
    template:
      '<textarea :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
  },
};

describe("EndUserCaseEscalationDialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    store.detailError = null;
    store.selected.case.id = "case-1";
    store.selected.case.version = 3;
    store.selected.case.summary = "Текущая сводка";
    store.selected.escalations.items = [
      {
        id: "escalation-1",
        version: 2,
        status: "CLAIMED",
        claimant: { id: "cms-1", displayName: "Текущий специалист" },
      },
    ];
    store.requestEscalation.mockResolvedValue(true);
    store.releaseEscalation.mockResolvedValue(true);
    store.transferEscalation.mockResolvedValue(true);
    store.closeEscalation.mockResolvedValue(true);
    store.cancelEscalation.mockResolvedValue(true);
    repository.assignees.mockResolvedValue({
      items: [
        { id: "cms-1", displayName: "Текущий специалист" },
        { id: "cms-2", displayName: "Анна Специалист" },
      ],
    });
  });

  it("creates a request from the business reason and operator summary only", async () => {
    store.selected.escalations.items = [];
    const wrapper = mount(EndUserCaseEscalationDialogs, {
      props: { canEscalate: true, currentCmsUserId: "cms-1" },
      global: { stubs },
    });
    await (
      wrapper.vm as unknown as {
        requestEscalationAction: (action: "REQUEST") => Promise<void>;
      }
    ).requestEscalationAction("REQUEST");
    await wrapper.vm.$nextTick();

    expect(wrapper.get("section").attributes("data-header")).toBe(
      "Позвать специалиста",
    );
    expect(wrapper.find("label[for='case-escalation-reason']").exists()).toBe(
      true,
    );
    expect(wrapper.find("#case-escalation-reason").exists()).toBe(true);
    expect(wrapper.findAll("textarea")).toHaveLength(1);
    await wrapper.get("select").setValue("DEPOSIT_HELP");
    await wrapper.get("textarea").setValue("Проверить депозит вручную");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Отправить запрос")!
      .trigger("click");

    expect(store.requestEscalation).toHaveBeenCalledWith(
      "DEPOSIT_HELP",
      "Проверить депозит вручную",
    );
  });

  it("loads eligible assignees, excludes the claimant and transfers with a reason", async () => {
    const wrapper = mount(EndUserCaseEscalationDialogs, {
      props: { canAssign: true, currentCmsUserId: "cms-1" },
      global: { stubs },
    });
    await (
      wrapper.vm as unknown as {
        requestEscalationAction: (action: "TRANSFER") => Promise<void>;
      }
    ).requestEscalationAction("TRANSFER");
    await wrapper.vm.$nextTick();

    expect(repository.assignees).toHaveBeenCalledWith("project-1");
    expect(wrapper.text()).toContain("Анна Специалист");
    expect(wrapper.text()).not.toContain("Текущий специалист");
    await wrapper.get("textarea").setValue("Передаю профильному специалисту");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Передать")!
      .trigger("click");

    expect(store.transferEscalation).toHaveBeenCalledWith(
      "cms-2",
      "Передаю профильному специалисту",
    );
  });

  it("normalizes a long summary and surfaces a bounded mutation error", async () => {
    store.selected.escalations.items = [];
    store.selected.case.summary = "x".repeat(1_200);
    store.requestEscalation.mockResolvedValue(false);
    store.detailError = "Обращение уже изменилось";
    const wrapper = mount(EndUserCaseEscalationDialogs, {
      props: { canEscalate: true, currentCmsUserId: "cms-1" },
      global: { stubs },
    });

    await (
      wrapper.vm as unknown as {
        requestEscalationAction: (action: "REQUEST") => Promise<void>;
      }
    ).requestEscalationAction("REQUEST");
    await wrapper.vm.$nextTick();

    expect(
      (wrapper.get("textarea").element as HTMLTextAreaElement).value,
    ).toHaveLength(1_000);
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Отправить запрос")!
      .trigger("click");
    expect(wrapper.text()).toContain("Обращение уже изменилось");
  });

  it("closes an open command when its exact permission is revoked", async () => {
    store.selected.escalations.items = [];
    const wrapper = mount(EndUserCaseEscalationDialogs, {
      props: { canEscalate: true, currentCmsUserId: "cms-1" },
      global: { stubs },
    });
    await (
      wrapper.vm as unknown as {
        requestEscalationAction: (action: "REQUEST") => Promise<void>;
      }
    ).requestEscalationAction("REQUEST");
    expect(wrapper.find("section").exists()).toBe(true);

    await wrapper.setProps({ canEscalate: false });

    expect(wrapper.find("section").exists()).toBe(false);
    expect(store.requestEscalation).not.toHaveBeenCalled();
  });

  it("wires release, close and cancel to their typed commands", async () => {
    const release = mount(EndUserCaseEscalationDialogs, {
      props: { currentCmsUserId: "cms-1" },
      global: { stubs },
    });
    await (
      release.vm as unknown as {
        requestEscalationAction: (action: "RELEASE") => Promise<void>;
      }
    ).requestEscalationAction("RELEASE");
    await release.get("textarea").setValue("Вернуть профильной очереди");
    await release
      .findAll("button")
      .find((button) => button.text() === "Вернуть в очередь")!
      .trigger("click");
    expect(store.releaseEscalation).toHaveBeenCalledWith(
      "Вернуть профильной очереди",
    );

    const close = mount(EndUserCaseEscalationDialogs, {
      props: { currentCmsUserId: "cms-1" },
      global: { stubs },
    });
    await (
      close.vm as unknown as {
        requestEscalationAction: (action: "CLOSE") => Promise<void>;
      }
    ).requestEscalationAction("CLOSE");
    await close.get("select").setValue("RESOLVED");
    await close.get("textarea").setValue("Результат подтверждён");
    await close
      .findAll("button")
      .find((button) => button.text() === "Завершить")!
      .trigger("click");
    expect(store.closeEscalation).toHaveBeenCalledWith(
      "RESOLVED",
      "Результат подтверждён",
    );

    const cancel = mount(EndUserCaseEscalationDialogs, {
      props: { canManage: true, currentCmsUserId: "cms-2" },
      global: { stubs },
    });
    await (
      cancel.vm as unknown as {
        requestEscalationAction: (action: "CANCEL") => Promise<void>;
      }
    ).requestEscalationAction("CANCEL");
    await cancel.get("select").setValue("WAITING_SYSTEM");
    await cancel.get("textarea").setValue("Запрос создан ошибочно");
    await cancel
      .findAll("button")
      .find((button) => button.text() === "Отменить запрос")!
      .trigger("click");
    expect(store.cancelEscalation).toHaveBeenCalledWith(
      "WAITING_SYSTEM",
      "Запрос создан ошибочно",
    );
  });
});
