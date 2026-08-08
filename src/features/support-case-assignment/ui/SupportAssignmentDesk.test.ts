import { computed, ref } from "vue";
import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it, vi } from "vitest";
import type { SupportAssignmentSnapshot } from "@/features/support-case-assignment/api/support-assignment-source";
import SupportAssignmentDesk from "./SupportAssignmentDesk.vue";

function controller() {
  return {
    caseSnapshot: ref<SupportAssignmentSnapshot | null>({
      caseId: "case-1",
      caseVersion: 9,
      caseReadToken: '"sc1.private"',
      assignmentState: "ASSIGNED" as const,
      currentAssignment: {
        id: "assignment-1",
        version: 3,
        actionEtag: '"sa1.private"',
      },
      workforceRevision: { id: "workforce-1", number: 4 },
      actions: { claim: false, assign: false, assignWithOverride: false, release: true, transfer: true, transferWithOverride: false },
      teams: [],
    }),
    caseLoading: ref(false),
    mutating: ref(false),
    error: ref(""),
    unknownOutcome: ref(false),
    draft: ref(null),
    canRetry: computed(() => false),
    canClaim: computed(() => false),
    canRelease: computed(() => true),
    canTransfer: computed(() => false),
    loadCase: vi.fn(),
    setDraft: vi.fn(),
    submit: vi.fn(),
    retryUnknownOutcome: vi.fn(),
    offers: ref([]),
    offerLoading: ref(false),
    offerChangingId: ref(null),
    offerError: ref(""),
    offerUnknownOutcome: ref(false),
    offerCanRetry: computed(() => false),
    loadOffers: vi.fn(),
    actOnOffer: vi.fn(),
    retryUnknownOfferOutcome: vi.fn(),
  };
}

const selectedAssignment = {
  id: "assignment-1",
  operatorName: "Анна",
  teamName: "Платежи",
  version: 3,
  actionEtag: '"sa1.private"',
};

describe("SupportAssignmentDesk", () => {
  it("keeps assignment, claimant, viewers and availability as distinct states", () => {
    const wrapper = mount(SupportAssignmentDesk, {
      props: {
        controller: controller() as never,
        assignment: selectedAssignment,
        claimantLabel: "Максим · эскалация",
        viewersLabel: "Presence ещё не подключён",
        availabilityLabel: "Доступен для новых обращений",
      },
      global: { plugins: [PrimeVue] },
    });

    expect(wrapper.get("[data-assignment-state]").text()).toContain("Анна");
    expect(wrapper.get("[data-claimant-state]").text()).toContain("Максим");
    expect(wrapper.get("[data-viewers-state]").text()).toContain("Presence");
    expect(wrapper.get("[data-availability-state]").text()).toContain(
      "Доступен",
    );
    expect(wrapper.get("button[aria-label='Снять назначение']")).toBeDefined();
    expect(wrapper.find("button[aria-label='Передать назначение']").exists()).toBe(
      false,
    );
    expect(wrapper.html()).not.toContain("sa1.private");
    expect(wrapper.html()).not.toContain("sc1.private");
  });

  it("keeps the audited release draft outside the transport call until confirmation", async () => {
    const assignment = controller();
    const wrapper = mount(SupportAssignmentDesk, {
      props: {
        controller: assignment as never,
        assignment: selectedAssignment,
        claimantLabel: "Не назначен",
        viewersLabel: "Presence ещё не подключён",
        availabilityLabel: "Доступен",
      },
      global: {
        plugins: [PrimeVue],
        stubs: {
          Dialog: {
            props: ["visible", "header"],
            template:
              '<section v-if="visible" role="dialog"><h2>{{ header }}</h2><slot /><slot name="footer" /></section>',
          },
          Select: {
            props: ["modelValue", "options", "optionLabel", "optionValue"],
            emits: ["update:modelValue"],
            template:
              '<select :value="modelValue" v-bind="$attrs" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option[optionValue]" :value="option[optionValue]">{{ option[optionLabel] }}</option></select>',
          },
        },
      },
    });

    await wrapper.get("button[aria-label='Снять назначение']").trigger("click");
    expect(wrapper.get("[role='dialog']").text()).toContain("Снять назначение");
    await wrapper
      .get("textarea[aria-label='Комментарий к снятию назначения']")
      .setValue("Завершение смены");
    await wrapper
      .get("button[aria-label='Подтвердить снятие назначения']")
      .trigger("click");

    expect(assignment.setDraft).toHaveBeenCalledWith({
      kind: "RELEASE",
      reasonCode: "WORK_RETURNED",
      reasonNote: "Завершение смены",
    });
    expect(assignment.submit).toHaveBeenCalledOnce();
  });

  it("uses only eligible Team and operator options for transfer", async () => {
    const assignment = controller();
    assignment.canRelease = computed(() => false);
    assignment.canTransfer = computed(() => true);
    assignment.caseSnapshot.value!.teams = [
      {
        id: "team-2",
        code: "VIP",
        name: "VIP",
        actions: { claim: false, assign: false, assignWithOverride: false, transfer: true, transferWithOverride: false },
        operators: [
          {
            id: "operator-2",
            displayName: "Максим",
            availableCapacityUnits: 300,
            effectiveAvailability: "AVAILABLE",
            requiredOverrides: [],
            actions: { claim: false, assign: false, assignWithOverride: false, transfer: true, transferWithOverride: false },
          },
        ],
      },
    ];
    const wrapper = mount(SupportAssignmentDesk, {
      props: {
        controller: assignment as never,
        assignment: selectedAssignment,
        claimantLabel: "Не назначен",
        viewersLabel: "Presence ещё не подключён",
        availabilityLabel: "Доступен",
      },
      global: {
        plugins: [PrimeVue],
        stubs: {
          Dialog: {
            props: ["visible", "header"],
            template:
              '<section v-if="visible" role="dialog"><h2>{{ header }}</h2><slot /><slot name="footer" /></section>',
          },
          Select: {
            props: ["modelValue", "options", "optionLabel", "optionValue"],
            emits: ["update:modelValue"],
            template:
              '<select :value="modelValue" v-bind="$attrs" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option[optionValue]" :value="option[optionValue]">{{ option[optionLabel] }}</option></select>',
          },
        },
      },
    });

    await wrapper
      .get("button[aria-label='Передать назначение']")
      .trigger("click");
    expect(wrapper.get("select[aria-label='Команда для передачи']").text()).toContain(
      "VIP",
    );
    expect(
      wrapper.get("select[aria-label='Оператор для передачи']").text(),
    ).toContain("Максим");
    await wrapper
      .get("button[aria-label='Подтвердить передачу назначения']")
      .trigger("click");

    expect(assignment.setDraft).toHaveBeenCalledWith({
      kind: "TRANSFER",
      teamId: "team-2",
      operatorId: "operator-2",
      reasonCode: "SKILL_HANDOFF",
    });
    expect(assignment.submit).toHaveBeenCalledOnce();
  });

  it("claims into a Team authorized by the current Case snapshot", async () => {
    const assignment = controller();
    assignment.canRelease = computed(() => false);
    assignment.canClaim = computed(() => true);
    assignment.caseSnapshot.value!.assignmentState = "UNASSIGNED";
    assignment.caseSnapshot.value!.teams = [
      {
        id: "team-1",
        code: "PAYMENTS",
        name: "Платежи",
        actions: { claim: true, assign: false, assignWithOverride: false, transfer: false, transferWithOverride: false },
        operators: [],
      },
    ];
    const wrapper = mount(SupportAssignmentDesk, {
      props: {
        controller: assignment as never,
        assignment: null,
        claimantLabel: "Не назначен",
        viewersLabel: "Presence ещё не подключён",
        availabilityLabel: "Доступен",
      },
      global: {
        plugins: [PrimeVue],
        stubs: {
          Dialog: {
            props: ["visible", "header"],
            template:
              '<section v-if="visible" role="dialog"><h2>{{ header }}</h2><slot /><slot name="footer" /></section>',
          },
          Select: {
            props: ["modelValue", "options", "optionLabel", "optionValue"],
            emits: ["update:modelValue"],
            template:
              '<select :value="modelValue" v-bind="$attrs" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option[optionValue]" :value="option[optionValue]">{{ option[optionLabel] }}</option></select>',
          },
        },
      },
    });

    await wrapper.get("button[aria-label='Взять в работу']").trigger("click");
    expect(wrapper.get("select[aria-label='Команда для назначения']").text()).toContain(
      "Платежи",
    );
    await wrapper
      .get("button[aria-label='Подтвердить назначение на себя']")
      .trigger("click");

    expect(assignment.setDraft).toHaveBeenCalledWith({
      kind: "CLAIM",
      teamId: "team-1",
    });
    expect(assignment.submit).toHaveBeenCalledOnce();
  });

  it("offers exact retry after an unknown assignment outcome", async () => {
    const assignment = controller();
    assignment.unknownOutcome.value = true;
    assignment.canRetry = computed(() => true);
    const wrapper = mount(SupportAssignmentDesk, {
      props: {
        controller: assignment as never,
        assignment: selectedAssignment,
        claimantLabel: "Не назначен",
        viewersLabel: "Не загружены",
        availabilityLabel: "Доступен",
      },
      global: { plugins: [PrimeVue] },
    });

    await wrapper.get("button[aria-label='Повторить тот же запрос']").trigger("click");
    expect(assignment.retryUnknownOutcome).toHaveBeenCalledOnce();
  });

  it("closes an open release dialog when authority is revoked", async () => {
    const assignment = controller();
    const releaseAllowed = ref(true);
    assignment.canRelease = computed(() => releaseAllowed.value);
    const wrapper = mount(SupportAssignmentDesk, {
      props: {
        controller: assignment as never,
        assignment: selectedAssignment,
        claimantLabel: "Не назначен",
        viewersLabel: "Не загружены",
        availabilityLabel: "Доступен",
      },
      global: {
        plugins: [PrimeVue],
        stubs: {
          Dialog: {
            props: ["visible", "header"],
            template:
              '<section v-if="visible" role="dialog"><h2>{{ header }}</h2><slot /><slot name="footer" /></section>',
          },
          Select: { template: "<select />" },
          Textarea: { template: "<textarea />" },
        },
      },
    });

    await wrapper.get("button[aria-label='Снять назначение']").trigger("click");
    expect(wrapper.find("[role='dialog']").exists()).toBe(true);
    releaseAllowed.value = false;
    assignment.draft.value = null;
    await wrapper.vm.$nextTick();
    expect(wrapper.find("[role='dialog']").exists()).toBe(false);
  });

});
