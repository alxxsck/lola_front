import { flushPromises, mount, type VueWrapper } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import PrimeVue from "primevue/config";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import { buildPlatformSafetyPolicy } from "@/features/platform-case-intelligence-safety/model/platform-case-intelligence-safety";
import type { PlatformCaseIntelligenceSafetyStateResponseDto } from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import PlatformCaseIntelligenceSafetyPage from "./PlatformCaseIntelligenceSafetyPage.vue";

const api = vi.hoisted(() => ({
  read: vi.fn(),
  publish: vi.fn(),
  lookup: vi.fn(),
}));

vi.mock(
  "@/features/platform-case-intelligence-safety/api/platform-case-intelligence-safety",
  () => ({
    readPlatformCaseIntelligenceSafety: api.read,
    publishPlatformCaseIntelligenceSafety: api.publish,
    lookupPlatformCaseIntelligenceSafetyCommand: api.lookup,
  }),
);

function publishedState(): PlatformCaseIntelligenceSafetyStateResponseDto {
  const definition = buildPlatformSafetyPolicy(
    {
      classifierRevisionId: "classifier-v1",
      calibratorRevisionId: "calibrator-v1",
      labelledDatasetRevisionId: "labelled-v1",
      sentinelDatasetRevisionId: "sentinel-v1",
      localesText: "ru\nen",
      channels: ["TEXT"],
      minimumCriticalRecall: "0.95",
      maximumFalseNegativeRate: "0.05",
      minimumSamples: "100",
      reason: "Первичная активация",
    },
    "00000000-0000-4000-8000-000000000001",
  );
  return {
    minimumSafetyRevisionId: "safety-revision-1",
    reconciliationState: "IDLE",
    revision: {
      compiledPolicy: {} as never,
      compiledPolicyHash: "a".repeat(64),
      compilerRevisionId: "compiler-v1",
      createdAt: "2026-08-11T10:00:00.000Z",
      createdByCmsUserId: "operator-1",
      definition,
      id: "safety-revision-1",
      publishedAt: "2026-08-11T10:00:00.000Z",
      publishedByCmsUserId: "operator-1",
      status: "PUBLISHED",
      version: 1,
    },
    updatedAt: "2026-08-11T10:00:00.000Z",
    version: 1,
  };
}

async function mountPage(): Promise<VueWrapper> {
  const pinia = createPinia();
  setActivePinia(pinia);
  const auth = useAuthStore();
  auth.$patch({
    restored: true,
    phase: "AUTHENTICATED",
    user: {
      id: "operator-1",
      email: "operator@example.com",
      name: "Оператор",
      platformPermissionCodes: [
        "platform.case_intelligence.safety.manage",
      ],
    },
    project: null,
    projects: [],
  });
  const router = createRouter({
    history: createMemoryHistory(),
    routes: [
      {
        path: "/platform/case-intelligence/safety",
        name: "platform-case-intelligence-safety",
        component: PlatformCaseIntelligenceSafetyPage,
      },
      {
        path: "/login",
        name: "login",
        component: { template: "<div>login</div>" },
      },
      {
        path: "/settings/security",
        name: "security-settings",
        component: { template: "<div>security</div>" },
      },
    ],
  });
  await router.push("/platform/case-intelligence/safety");
  await router.isReady();
  const wrapper = mount(RouterView, {
    global: {
      plugins: [pinia, router, PrimeVue],
      stubs: {
        Dialog: {
          props: ["visible"],
          emits: ["update:visible"],
          template:
            '<div v-if="visible" role="dialog"><slot /><slot name="footer" /></div>',
        },
      },
    },
  });
  await flushPromises();
  return wrapper;
}

async function completeForm(wrapper: VueWrapper): Promise<void> {
  await wrapper
    .get('[data-testid="safety-classifier"]')
    .setValue("classifier-v1");
  await wrapper
    .get('[data-testid="safety-calibrator"]')
    .setValue("calibrator-v1");
  await wrapper
    .get('[data-testid="safety-labelled-dataset"]')
    .setValue("labelled-v1");
  await wrapper
    .get('[data-testid="safety-sentinel-dataset"]')
    .setValue("sentinel-v1");
  await wrapper
    .get('[data-testid="safety-reason"]')
    .setValue("Первичная активация");
}

describe("Platform Case Intelligence safety page", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("crypto", {
      randomUUID: vi
        .fn()
        .mockReturnValueOnce("00000000-0000-4000-8000-000000000010")
        .mockReturnValueOnce("00000000-0000-4000-8000-000000000011"),
    });
    api.read.mockResolvedValue(null);
    api.publish.mockResolvedValue(publishedState());
  });

  it("publishes the fixed global policy for each locale and channel", async () => {
    const wrapper = await mountPage();

    expect(wrapper.text()).toContain("Защита ещё не настроена");
    expect(wrapper.text()).toContain("Проектное переопределение запрещено");
    await completeForm(wrapper);
    await wrapper.get("form").trigger("submit");

    const dialog = wrapper.get('[role="dialog"]');
    expect(dialog.text()).toContain("Admission gates8");
    await dialog.get('[data-testid="publish-safety"]').trigger("click");
    await flushPromises();

    expect(api.publish).toHaveBeenCalledOnce();
    const payload = api.publish.mock.calls[0]![0];
    expect(payload.expectedVersion).toBe(0);
    expect(payload.definition.classes).toHaveLength(4);
    expect(payload.definition.gates).toHaveLength(8);
    expect(payload.definition.gates).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          locale: "ru",
          channel: "TEXT",
          riskClass: "SELF_HARM_OR_SUICIDE",
        }),
        expect.objectContaining({
          locale: "en",
          channel: "TEXT",
          riskClass: "RESPONSIBLE_GAMING_CRISIS",
        }),
      ]),
    );
    expect(wrapper.text()).toContain("Защита активна · версия 1");
  });

  it("requires a fresh MFA login without replaying publication", async () => {
    api.publish.mockRejectedValue(
      new ApiError(
        428,
        "unsafe backend text",
        undefined,
        "request-1",
        "REAUTHENTICATION_REQUIRED",
      ),
    );
    const wrapper = await mountPage();

    await completeForm(wrapper);
    await wrapper.get("form").trigger("submit");
    await wrapper.get('[data-testid="publish-safety"]').trigger("click");
    await flushPromises();

    expect(api.publish).toHaveBeenCalledOnce();
    expect(wrapper.text()).toContain("Требуется свежий вход с MFA");
    expect(wrapper.text()).not.toContain("unsafe backend text");
  });
});
