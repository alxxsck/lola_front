import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import { supportSlaConfigurationSource } from "@/features/support-sla/api/support-sla-configuration-source";
import type { SupportSlaConfigurationSettingsResponseDto } from "@/shared/api/generated/models";
import SupportSlaSettingsPage from "./SupportSlaSettingsPage.vue";

vi.mock(
  "@/features/support-sla/api/support-sla-configuration-source",
  () => ({
    supportSlaConfigurationSource: {
      read: vi.fn(),
      replaceDraft: vi.fn(),
      discardDraft: vi.fn(),
      publish: vi.fn(),
    },
  }),
);

const etag = (letter: string) => `"ssla1.${letter.repeat(43)}"`;
const configuration = {
  calendar: {
    timeZone: "Europe/Madrid",
    weekly: [{ isoWeekday: 1, intervals: [{ startMinute: 540, endMinute: 1080 }] }],
    exceptions: [],
  },
  policy: {
    rules: [
      {
        code: "DEFAULT",
        order: 0,
        when: {},
        targets: {
          firstHumanResponseBusinessSeconds: 3600,
          nextHumanResponseBusinessSeconds: 7200,
          resolutionBusinessSeconds: 28_800,
        },
        atRiskRemainingPercent: 20,
        pause: {
          firstHumanResponseStatuses: [],
          nextHumanResponseStatuses: ["WAITING_END_USER" as const],
          resolutionStatuses: ["WAITING_END_USER" as const],
        },
      },
    ],
  },
};

function snapshot(): SupportSlaConfigurationSettingsResponseDto {
  return {
    mode: "SLA_SETTINGS" as const,
    rootVersion: 4,
    actionEtag: etag("a"),
    rolloutState: "SHADOW" as const,
    reconciliationCheckpoint: "checkpoint-4",
    draft: {
      generation: 4,
      version: 1,
      contentHash: "c".repeat(64),
      configuration,
    },
    publishedConfiguration: {
      calendarRevision: {
        id: "calendar-3",
        revisionNumber: 3,
        sourceDraftGeneration: 3,
        contentHash: "a".repeat(64),
        publishedAt: "2026-08-09T10:00:00.000Z",
        calendarEngineRevision: "calendar-engine-1",
        tzdbVersion: "2026a",
        calendar: configuration.calendar,
      },
      policyRevision: {
        id: "policy-3",
        revisionNumber: 3,
        sourceDraftGeneration: 3,
        contentHash: "b".repeat(64),
        publishedAt: "2026-08-09T10:00:00.000Z",
        policy: configuration.policy,
      },
    },
  };
}

function authenticate(permissions: string[]) {
  const auth = useAuthStore();
  auth.$patch({
    phase: "AUTHENTICATED",
    user: { id: "operator-1", email: "operator@example.test", name: "Operator" },
    project: {
      id: "project-1",
      name: "Lucky Stars",
      effectivePermissionCodes: permissions,
    },
    projects: [],
  });
  return auth;
}

function mountPage() {
  return mount(SupportSlaSettingsPage, {
    global: {
      stubs: {
        Button: {
          props: ["label", "disabled", "loading"],
          emits: ["click"],
          template:
            '<button type="button" :disabled="disabled" @click="$emit(\'click\', $event)">{{ label }}<slot /></button>',
        },
        Dialog: {
          props: ["visible", "header"],
          emits: ["update:visible", "hide"],
          template:
            '<section v-if="visible" role="dialog"><h2>{{ header }}</h2><slot /><slot name="footer" /></section>',
        },
        InputText: {
          props: ["modelValue", "disabled", "ariaLabel"],
          emits: ["update:modelValue"],
          template:
            '<input :aria-label="ariaLabel" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
        },
        InputNumber: {
          props: ["modelValue", "disabled", "ariaLabel"],
          emits: ["update:modelValue"],
          template:
            '<input type="number" :aria-label="ariaLabel" :disabled="disabled" :value="modelValue" @input="$emit(\'update:modelValue\', Number($event.target.value))" />',
        },
        MultiSelect: {
          props: ["modelValue", "disabled", "ariaLabel"],
          template: '<div :aria-label="ariaLabel" />',
        },
        DatePicker: { template: "<input />" },
        Message: { template: "<div><slot /></div>" },
        Skeleton: { template: "<div />" },
        Tag: { props: ["value"], template: "<span>{{ value }}</span>" },
      },
    },
  });
}

describe("SupportSlaSettingsPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(supportSlaConfigurationSource.read).mockResolvedValue(snapshot());
  });

  it("shows separate published, draft, local, and calculation states without secrets", async () => {
    authenticate(["project.support.sla.read", "project.support.sla.manage"]);
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Календарь и правила SLA");
    expect(wrapper.text()).toContain("Публикация №3");
    expect(wrapper.text()).toContain("Черновик 1");
    expect(wrapper.text()).toContain("Проверочный режим");
    expect(wrapper.text()).not.toContain(etag("a"));
    expect(wrapper.text()).not.toContain("Idempotency-Key");
    expect(wrapper.text()).not.toContain("Включить SLA");
  });

  it("keeps a read-only reader on the published projection", async () => {
    authenticate(["project.support.sla.read"]);
    const readOnly = snapshot();
    readOnly.draft = null;
    vi.mocked(supportSlaConfigurationSource.read).mockResolvedValue(readOnly);

    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Только просмотр");
    expect(wrapper.text()).not.toContain("Сохранить черновик");
    expect(wrapper.text()).not.toContain("Удалить черновик");
    expect(wrapper.text()).not.toContain("Опубликовать");
  });

  it("purges protected content when SLA permission is revoked", async () => {
    const auth = authenticate(["project.support.sla.read", "project.support.sla.manage"]);
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("Europe/Madrid");

    auth.project!.effectivePermissionCodes = [];
    await flushPromises();

    expect(wrapper.text()).not.toContain("Europe/Madrid");
    expect(wrapper.text()).toContain("Настройка SLA недоступна");
  });
});
