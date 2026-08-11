import { beforeEach, describe, expect, it, vi } from "vitest";
import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter } from "vue-router";
import { useAuthStore } from "@/features/auth/auth.store";
import { supportCaseNotificationPolicySource } from "@/features/support-case-notifications/api/support-case-notification-policy-source";
import SupportCaseNotificationPolicyPage from "./SupportCaseNotificationPolicyPage.vue";

vi.mock(
  "@/features/support-case-notifications/api/support-case-notification-policy-source",
  () => ({
    supportCaseNotificationPolicySource: {
      read: vi.fn(),
      readMetrics: vi.fn(),
      listTeams: vi.fn(),
      preview: vi.fn(),
      saveDraft: vi.fn(),
      publish: vi.fn(),
      disable: vi.fn(),
      restore: vi.fn(),
      lookup: vi.fn(),
    },
  }),
);

const snapshot = {
  version: 4,
  effectiveStatus: "ACTIVE",
  current: {
    id: "revision-4",
    revisionNumber: 4,
    status: "PUBLISHED",
    mode: "IMMEDIATE",
    occurrences: ["CREATED"],
    conversationClasses: ["PRODUCT_PROBLEM"],
    topicCodes: ["PAYMENTS"],
    minimumPriority: "NORMAL",
    recipientRule: "ALL_ELIGIBLE_SUBSCRIBERS",
    teamIds: [],
    channels: ["BROWSER_PUSH"],
    effectiveFrom: null,
    effectiveUntil: null,
    digestWindowMinutes: null,
    digestMaxItems: null,
    templateRevision: "support-case-created-v1",
    deepLinkTarget: "SUPPORT_OPERATOR_WORKSPACE",
    contentHash: "4".repeat(64),
    createdAt: "2026-08-11T10:00:00.000Z",
    publishedAt: "2026-08-11T10:00:00.000Z",
  },
  draft: null,
  restorableRevisions: [],
  allowedClasses: ["PRODUCT_PROBLEM", "PRODUCT_INQUIRY"],
  allowedPriorities: ["LOW", "NORMAL", "HIGH", "URGENT", "CRITICAL"],
  allowedChannels: ["BROWSER_PUSH"],
  allowedTopicCodes: ["PAYMENTS", "ACCOUNT_ACCESS"],
};

const stubs = {
  Button: {
    template:
      "<button :disabled='disabled' @click='$emit(\"click\")'>{{ label }}</button>",
    props: ["label", "disabled"],
  },
  Checkbox: { template: "<input type='checkbox' />" },
  Dialog: {
    template: "<div v-if='visible'><slot /><slot name='footer' /></div>",
    props: ["visible"],
  },
  InputNumber: { template: "<input type='number' />" },
  Message: { template: "<div><slot /></div>" },
  MultiSelect: { template: "<button type='button'>выбор</button>" },
  RadioButton: { template: "<input type='radio' />" },
  Select: { template: "<button type='button'>список</button>" },
  Skeleton: { template: "<div />" },
  Tag: { template: "<span>{{ value }}</span>", props: ["value"] },
  Textarea: { template: "<textarea />" },
};

describe("SupportCaseNotificationPolicyPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(supportCaseNotificationPolicySource.read).mockResolvedValue(
      snapshot as never,
    );
    vi.mocked(
      supportCaseNotificationPolicySource.readMetrics,
    ).mockResolvedValue({
      from: "2026-08-04T10:00:00.000Z",
      to: "2026-08-11T10:00:00.000Z",
      admittedOccurrences: 38,
      deliveries: 22,
      digests: 0,
      eligibleRecipients: 12,
      subscribedRecipients: 8,
      failures: 0,
      authorizationCancellations: 0,
      expiredPolicyCount: 0,
    });
    vi.mocked(supportCaseNotificationPolicySource.listTeams).mockResolvedValue([
      { id: "team-1", code: "TIER_1", name: "Первая линия" },
    ]);
    vi.mocked(supportCaseNotificationPolicySource.preview).mockResolvedValue({
      issues: [],
      estimatedEligibleRecipients: 8,
      matchingOccurrencesLast7Days: 38,
      estimatedImmediateDeliveriesLast7Days: 304,
      estimatedDigestWindowsLast7Days: 0,
      examples: [
        {
          occurrence: "CREATED",
          conversationClass: "PRODUCT_PROBLEM",
          topicCode: "PAYMENTS",
          priority: "HIGH",
          occurredAt: "2026-08-11T09:00:00.000Z",
        },
      ],
      publishable: true,
    });
  });

  async function render(
    permissions = ["project.support.notification_policy.manage"],
  ) {
    const pinia = createPinia();
    setActivePinia(pinia);
    const auth = useAuthStore();
    auth.$patch({
      phase: "AUTHENTICATED",
      user: { id: "lead-1", email: "lead@example.test" },
      project: {
        id: "project-1",
        name: "Project One",
        effectivePermissionCodes: permissions,
      },
      projects: [],
    });
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        {
          path: "/support/settings/notifications/new-cases",
          component: SupportCaseNotificationPolicyPage,
        },
        { path: "/login", component: { template: "<div />" } },
      ],
    });
    await router.push("/support/settings/notifications/new-cases");
    await router.isReady();
    const wrapper = mount(SupportCaseNotificationPolicyPage, {
      global: { plugins: [pinia, router], stubs },
    });
    await vi.waitFor(() =>
      expect(wrapper.text()).toContain("Какие обращения учитывать"),
    );
    return wrapper;
  }

  it("explains the project/personal/browser boundary and renders a summary-first editor", async () => {
    const wrapper = await render();
    expect(wrapper.text()).toContain("Зависит от подписки и браузера");
    expect(wrapper.text()).toContain("Сохранение не включает доставку");
    expect(wrapper.text()).toContain("Личные подписки остаются обязательными");
    expect(wrapper.text()).not.toContain("rollout");
    expect(wrapper.text()).not.toContain("feature flag");
  });

  it("renders safe preview examples without Case identifiers or message content", async () => {
    const wrapper = await render();
    const previewButton = wrapper
      .findAll("button")
      .find((button) => button.text() === "Проверить влияние");
    await previewButton!.trigger("click");
    await flushPromises();
    expect(wrapper.text()).toContain("304");
    expect(wrapper.text()).toContain("Безопасные примеры");
    expect(wrapper.text()).toContain("Здесь нет номера обращения");
    expect(wrapper.text()).not.toContain("caseId");
    expect(wrapper.text()).not.toContain("message");
  });
});
