import { flushPromises, mount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";

const auth = vi.hoisted(() => ({
  project: { id: "project-1" },
  user: { id: "cms-1" },
}));
const router = vi.hoisted(() => ({ replace: vi.fn() }));
const store = vi.hoisted(() => ({
  selected: {
    case: {
      id: "case-1",
      version: 2,
      projectSequence: "10",
      title: "Deposit",
      groupCode: "DEPOSIT",
      priority: "HIGH",
      endUser: { id: "user-1" },
      assignee: null,
      splitEvidence: [
        {
          id: "evidence-1",
          kind: "AI_ACTION_INVOCATION",
          contribution: "ACTION_COMPLETED",
          observedAt: "2026-07-26T10:00:00.000Z",
        },
      ],
    },
    messages: {
      items: [
        { message: { id: "message-1", role: "USER", text: "first" } },
        { message: { id: "message-2", role: "USER", text: "second" } },
      ],
    },
  } as Record<string, unknown> | null,
  filters: { preset: "ACTIVE", sort: "ATTENTION_FIRST" },
  mutating: false,
  transition: vi.fn(),
  assign: vi.fn(),
  classify: vi.fn(),
  unlinkMessage: vi.fn(),
  merge: vi.fn(),
  split: vi.fn(),
}));
const repository = vi.hoisted(() => ({
  assignees: vi.fn(),
  list: vi.fn(),
}));

vi.mock("vue-router", () => ({ useRouter: () => router }));
vi.mock("@/features/auth/auth.store", () => ({ useAuthStore: () => auth }));
vi.mock("../model/end-user-cases.store", () => ({
  useEndUserCasesStore: () => store,
}));
vi.mock("../api/end-user-cases-repository", () => ({
  endUserCasesRepository: repository,
}));

import EndUserCaseDialogs from "./EndUserCaseDialogs.vue";

type DialogApi = {
  requestTransition(status: string): void;
  requestAssignment(): Promise<void>;
  requestClassification(): void;
  requestUnlink(messageId: string): void;
  requestMerge(): Promise<void>;
  requestSplit(): void;
};

const FieldStub = {
  props: ["modelValue", "options"],
  emits: ["update:modelValue"],
  template:
    '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
};

function mountDialogs() {
  return mount(EndUserCaseDialogs, {
    props: {
      classificationOptions: [
        { code: "DEPOSIT", label: "Депозиты" },
        { code: "PAYMENT", label: "Платежи" },
      ],
    },
    global: {
      stubs: {
        Dialog: {
          props: ["visible", "header"],
          emits: ["update:visible"],
          template:
            '<section v-if="visible" :data-header="header"><slot /><slot name="footer" /></section>',
        },
        Button: {
          props: ["label", "disabled"],
          emits: ["click"],
          template:
            '<button :disabled="disabled" @click="$emit(\'click\')">{{ label }}</button>',
        },
        Message: { template: "<div><slot /></div>" },
        Textarea: FieldStub,
        InputText: FieldStub,
        Select: { ...FieldStub, name: "Select" },
        MultiSelect: { ...FieldStub, name: "MultiSelect" },
      },
    },
  });
}

const api = (wrapper: ReturnType<typeof mountDialogs>): DialogApi =>
  wrapper.vm as unknown as DialogApi;

describe("EndUserCaseDialogs", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    auth.project = { id: "project-1" };
    store.transition.mockResolvedValue(true);
    store.assign.mockResolvedValue(true);
    store.classify.mockResolvedValue(true);
    store.unlinkMessage.mockResolvedValue(true);
    store.merge.mockResolvedValue(true);
    store.split.mockResolvedValue("case-2");
    repository.assignees.mockResolvedValue({
      items: [
        { id: "cms-1", displayName: "Current" },
        { id: "cms-2", displayName: "Anna" },
      ],
    });
    repository.list.mockResolvedValue({
      items: [
        {
          id: "case-1",
          version: 2,
          projectSequence: "10",
          title: "Current",
        },
        {
          id: "case-2",
          version: 4,
          projectSequence: "11",
          title: "Duplicate",
          mergedIntoCaseId: null,
        },
        {
          id: "case-3",
          version: 1,
          projectSequence: "12",
          title: "Merged",
          mergedIntoCaseId: "case-1",
        },
      ],
      nextCursor: null,
    });
  });

  it("requires an explicit reason and submits a confirmed workflow transition", async () => {
    const wrapper = mountDialogs();
    api(wrapper).requestTransition("RESOLVED");
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Молчание пользователя не подтверждает");
    const confirm = wrapper
      .findAll("button")
      .find((button) => button.text() === "Подтвердить")!;
    expect(confirm.attributes("disabled")).toBeDefined();
    await wrapper.get("input").setValue("Проверено администратором");
    await confirm.trigger("click");
    expect(store.transition).toHaveBeenCalledWith(
      "RESOLVED",
      "Проверено администратором",
    );
  });

  it("loads all active assignees and submits the selected CMS User", async () => {
    const wrapper = mountDialogs();
    await api(wrapper).requestAssignment();
    await flushPromises();
    expect(repository.assignees).toHaveBeenCalledWith("project-1");
    expect(wrapper.text()).toContain("Исполнитель");
    const inputs = wrapper.findAll("input");
    await inputs[0]!.setValue("cms-2");
    await inputs[1]!.setValue("Передача специалисту");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Сохранить")!
      .trigger("click");
    expect(store.assign).toHaveBeenCalledWith("cms-2", "Передача специалисту");
  });

  it("submits classification and unlink corrections with mandatory reasons", async () => {
    const wrapper = mountDialogs();
    api(wrapper).requestClassification();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Классификация");
    expect(wrapper.text()).not.toContain("Код категории");
    expect(
      wrapper.findAllComponents({ name: "Select" })[0]!.props("options"),
    ).toEqual([
      { value: "DEPOSIT", label: "Депозиты" },
      { value: "PAYMENT", label: "Платежи" },
    ]);
    const classifyInputs = wrapper.findAll("input");
    await classifyInputs[0]!.setValue("PAYMENT");
    await classifyInputs[1]!.setValue("CRITICAL");
    await classifyInputs[2]!.setValue("Исправлена категория");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Сохранить")!
      .trigger("click");
    expect(store.classify).toHaveBeenCalledWith({
      groupCode: "PAYMENT",
      priority: "CRITICAL",
      reason: "Исправлена категория",
    });

    api(wrapper).requestUnlink("message-2");
    await wrapper.vm.$nextTick();
    await wrapper.get("input").setValue("Не относится к цели");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Исключить")!
      .trigger("click");
    expect(store.unlinkMessage).toHaveBeenCalledWith(
      "message-2",
      "Не относится к цели",
    );
  });

  it("keeps merge candidates tenant-user scoped and routes to a successful split", async () => {
    const wrapper = mountDialogs();
    await api(wrapper).requestMerge();
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).not.toContain("evidence");
    expect(wrapper.text()).not.toContain("audit");
    expect(repository.list).toHaveBeenCalledWith("project-1", {
      preset: "ALL",
      sort: "LAST_ACTIVITY",
      endUserId: "user-1",
    });
    wrapper
      .findComponent({ name: "MultiSelect" })
      .vm.$emit("update:modelValue", ["case-2"]);
    await wrapper.vm.$nextTick();
    await wrapper.findAll("input")[1]!.setValue("Одна цель");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Объединить")!
      .trigger("click");
    expect(store.merge).toHaveBeenCalledWith(
      [{ id: "case-2", version: 4, label: "№ 11 · Duplicate" }],
      "Одна цель",
    );

    api(wrapper).requestSplit();
    await wrapper.vm.$nextTick();
    const splitInputs = wrapper.findAll("input");
    wrapper
      .findAllComponents({ name: "MultiSelect" })[0]!
      .vm.$emit("update:modelValue", ["message-2"]);
    wrapper
      .findAllComponents({ name: "MultiSelect" })[1]!
      .vm.$emit("update:modelValue", ["evidence-1"]);
    await wrapper.vm.$nextTick();
    await splitInputs[2]!.setValue("Новая цель");
    await splitInputs[3]!.setValue("REFUND");
    await splitInputs[4]!.setValue("Другая цель");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Создать обращение")!
      .trigger("click");
    await flushPromises();
    expect(store.split).toHaveBeenCalledWith(
      ["message-2"],
      "Новая цель",
      "Другая цель",
      "REFUND",
      ["evidence-1"],
    );
    expect(router.replace).toHaveBeenCalledWith(
      expect.objectContaining({
        name: "end-user-case-detail",
        params: { caseId: "case-2" },
      }),
    );
  });
});
