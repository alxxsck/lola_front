import { ref } from "vue";
import { mount } from "@vue/test-utils";
import PrimeVue from "primevue/config";
import { describe, expect, it, vi } from "vitest";
import SupportLeadAssignmentDesk from "./SupportLeadAssignmentDesk.vue";

function controller(requiredOverrides: string[] = []) {
  const draft = ref(null);
  const hasAuthority = ref(true);
  const hasForceAuthority = ref(true);
  return {
    caseId: ref(null),
    snapshot: ref({
      caseId: "case-1",
      caseVersion: 8,
      caseReadToken: "sc1.private",
      assignmentState: "UNASSIGNED",
      currentAssignment: null,
      workforceRevision: { id: "workforce-1", number: 3 },
      actions: {
        claim: false,
        assign: requiredOverrides.length === 0,
        assignWithOverride: true,
        release: false,
        transfer: false,
        transferWithOverride: false,
      },
      teams: [
        {
          id: "team-1",
          code: "PAYMENTS",
          name: "Платежи",
          actions: {
            claim: false,
            assign: requiredOverrides.length === 0,
            assignWithOverride: true,
            transfer: false,
            transferWithOverride: false,
          },
          operators: [
            {
              id: "operator-1",
              displayName: "Анна Смирнова",
              availableCapacityUnits: requiredOverrides.length ? 0 : 200,
              effectiveAvailability: requiredOverrides.length
                ? "OFFLINE"
                : "AVAILABLE",
              requiredOverrides,
              actions: {
                claim: false,
                assign: requiredOverrides.length === 0,
                assignWithOverride: true,
                transfer: false,
                transferWithOverride: false,
              },
            },
          ],
        },
      ],
    }),
    loading: ref(false),
    mutating: ref(false),
    reconciling: ref(false),
    error: ref(""),
    success: ref(""),
    draft,
    unknownOutcome: ref(false),
    auditFacts: ref([]),
    auditLoading: ref(false),
    auditError: ref(""),
    hasAuthority,
    hasForceAuthority,
    open: vi.fn(),
    load: vi.fn(),
    loadAudit: vi.fn(),
    setDraft: vi.fn((value) => (draft.value = value)),
    submit: vi.fn(),
    reconcileUnknownOutcome: vi.fn(),
    reset: vi.fn(),
  };
}

const stubs = {
  Dialog: {
    props: ["visible", "header"],
    emits: ["update:visible"],
    template:
      '<section v-if="visible" role="dialog"><h2>{{ header }}</h2><slot /><slot name="footer" /></section>',
  },
  Select: {
    props: ["modelValue", "options", "optionLabel", "optionValue"],
    emits: ["update:modelValue"],
    template:
      '<select :value="modelValue" v-bind="$attrs" @change="$emit(\'update:modelValue\', $event.target.value)"><option v-for="option in options" :key="option[optionValue]" :value="option[optionValue]">{{ option[optionLabel] }}</option></select>',
  },
  Textarea: { template: '<textarea v-bind="$attrs" />' },
};

describe("SupportLeadAssignmentDesk", () => {
  it("opens the same audited Lead use case and exposes only eligible operator-in-Team targets", async () => {
    const assignment = controller();
    const wrapper = mount(SupportLeadAssignmentDesk, {
      props: {
        controller: assignment as never,
        caseId: "case-1",
        caseLabel: "Бонус не начислен",
      },
      global: { plugins: [PrimeVue], stubs },
    });

    await wrapper
      .get("button[aria-label='Управлять назначением лида']")
      .trigger("click");

    expect(assignment.open).toHaveBeenCalledWith("case-1");
    expect(wrapper.get("[role='dialog']").text()).toContain(
      "Бонус не начислен",
    );
    expect(
      wrapper.get("select[aria-label='Команда назначения']").text(),
    ).toContain("Платежи");
    expect(
      wrapper.get("select[aria-label='Оператор назначения']").text(),
    ).toContain("Анна Смирнова");
    expect(wrapper.html()).not.toContain("sc1.private");
  });

  it("makes the force bypass and protected reason explicit before confirmation", async () => {
    const assignment = controller(["AVAILABILITY", "CAPACITY"]);
    const wrapper = mount(SupportLeadAssignmentDesk, {
      props: {
        controller: assignment as never,
        caseId: "case-1",
        caseLabel: "Критический Case",
      },
      global: { plugins: [PrimeVue], stubs },
    });

    await wrapper
      .get("button[aria-label='Управлять назначением лида']")
      .trigger("click");

    expect(wrapper.get("[data-force-warning]").text()).toContain(
      "недоступность",
    );
    expect(wrapper.get("[data-force-warning]").text()).toContain(
      "лимит нагрузки",
    );
    expect(
      wrapper.get("textarea[aria-label='Обоснование исключения']"),
    ).toBeDefined();
    expect(
      wrapper
        .get("button[aria-label='Подтвердить назначение лидом']")
        .attributes("disabled"),
    ).toBeDefined();
  });

  it("shows safe assignment audit facts without protected free-form notes", async () => {
    const assignment = controller();
    assignment.auditFacts.value = [
      {
        activityId: "activity-1",
        activitySequence: "1",
        actor: { type: "CMS_USER", cmsUserId: "lead-1", systemCode: null },
        assignmentId: "assignment-1",
        caseId: "case-1",
        commandOutcome: "APPLIED",
        conversationId: null,
        deliveryId: null,
        deliveryState: null,
        eligibilityOverride: {
          bypassAvailability: true,
          bypassCapacity: false,
        },
        eventCode: "SUPPORT_CASE_ASSIGNMENT_ASSIGNED",
        factKind: "ASSIGNMENT",
        messageId: null,
        occurredAt: "2026-08-08T10:00:00.000Z",
        operatorCmsUserId: "operator-1",
        ownerVersion: 1,
        reasonCode: "ROUTING_AUTO_ASSIGN",
        schemaVersion: 1,
        targetTeamId: "team-1",
      },
    ] as never;
    const wrapper = mount(SupportLeadAssignmentDesk, {
      props: {
        controller: assignment as never,
        caseId: "case-1",
        caseLabel: "Критический Case",
      },
      global: { plugins: [PrimeVue], stubs },
    });

    await wrapper
      .get("button[aria-label='Управлять назначением лида']")
      .trigger("click");

    expect(wrapper.text()).toContain("История ответственности");
    expect(wrapper.text()).toContain(
      "Исключение: доступность да, лимит нагрузки нет",
    );
    expect(wrapper.text()).toContain("применено");
    expect(wrapper.text()).toContain("Автоматическое назначение");
    expect(wrapper.text()).toContain("Платежи · Анна Смирнова");
    expect(wrapper.text()).not.toContain("team-1");
    expect(wrapper.text()).not.toContain("operator-1");
    expect(wrapper.text()).not.toContain("Критический риск для пользователя");
  });

  it("closes and purges the dialog when Lead authority is revoked", async () => {
    const assignment = controller();
    const wrapper = mount(SupportLeadAssignmentDesk, {
      props: {
        controller: assignment as never,
        caseId: "case-1",
        caseLabel: "Критический Case",
      },
      global: { plugins: [PrimeVue], stubs },
    });
    await wrapper
      .get("button[aria-label='Управлять назначением лида']")
      .trigger("click");

    assignment.hasAuthority.value = false;
    await wrapper.vm.$nextTick();

    expect(wrapper.find("[role='dialog']").exists()).toBe(false);
    expect(assignment.reset).toHaveBeenCalled();
  });

  it("does not expose a force-only target without force authority", async () => {
    const assignment = controller(["AVAILABILITY"]);
    assignment.hasForceAuthority.value = false;
    const wrapper = mount(SupportLeadAssignmentDesk, {
      props: {
        controller: assignment as never,
        caseId: "case-1",
        caseLabel: "Критический Case",
      },
      global: { plugins: [PrimeVue], stubs },
    });
    await wrapper
      .get("button[aria-label='Управлять назначением лида']")
      .trigger("click");

    expect(wrapper.find("option[value='operator-1']").exists()).toBe(false);
    expect(wrapper.find("[data-force-warning]").exists()).toBe(false);
  });

  it("closes a force dialog when only force authority is revoked", async () => {
    const assignment = controller(["AVAILABILITY"]);
    const wrapper = mount(SupportLeadAssignmentDesk, {
      props: {
        controller: assignment as never,
        caseId: "case-1",
        caseLabel: "Критический Case",
      },
      global: { plugins: [PrimeVue], stubs },
    });
    await wrapper
      .get("button[aria-label='Управлять назначением лида']")
      .trigger("click");
    expect(wrapper.find("[role='dialog']").exists()).toBe(true);

    assignment.hasForceAuthority.value = false;
    await wrapper.vm.$nextTick();

    expect(wrapper.find("[role='dialog']").exists()).toBe(false);
    expect(assignment.reset).toHaveBeenCalled();
  });
});
