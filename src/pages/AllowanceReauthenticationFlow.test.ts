import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { createMemoryHistory, createRouter, RouterView } from "vue-router";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { authApi } from "@/features/auth/auth.api";
import { useAuthStore } from "@/features/auth/auth.store";
import LoginPage from "./LoginPage.vue";
import MfaPage from "./MfaPage.vue";

vi.mock("@/features/auth/auth.api", () => ({
  authApi: {
    mode: "api",
    cancelMfa: vi.fn(),
    login: vi.fn(),
    restore: vi.fn(),
    logout: vi.fn(),
    logoutAll: vi.fn(),
    completePasswordSetup: vi.fn(),
    completeMfaPasskey: vi.fn(),
    completeMfaRecovery: vi.fn(),
    refreshContext: vi.fn(),
  },
}));

const InputTextStub = {
  inheritAttrs: false,
  props: ["id", "modelValue", "type"],
  emits: ["update:modelValue"],
  template:
    '<input v-bind="$attrs" :id="id" :type="type" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)">',
};

describe("allowance reauthentication navigation", () => {
  beforeEach(() => {
    setActivePinia(createPinia());
    vi.clearAllMocks();
    vi.mocked(authApi.restore).mockResolvedValue(null);
    vi.mocked(authApi.login).mockResolvedValue({
      kind: "MFA_REQUIRED",
      ceremonyToken: "lmf_memory-only",
      expiresAt: "2026-08-03T12:00:00.000Z",
      publicKey: { challenge: "challenge" },
      recoveryAvailable: false,
    });
    vi.mocked(authApi.completeMfaPasskey).mockResolvedValue({
      kind: "AUTHENTICATED",
      context: {
        user: { id: "owner-1", email: "owner@example.com", name: "Owner" },
        projects: [
          {
            id: "project-1",
            name: "Project One",
            slug: "one",
            status: "ACTIVE",
          },
          {
            id: "project-2",
            name: "Project Two",
            slug: "two",
            status: "ACTIVE",
          },
        ],
      },
    });
  });

  it("returns Login → passkey → Project selection → Limits and consumes redirect once", async () => {
    const pinia = createPinia();
    setActivePinia(pinia);
    const router = createRouter({
      history: createMemoryHistory(),
      routes: [
        { path: "/login", name: "login", component: LoginPage },
        { path: "/auth/mfa", name: "mfa", component: MfaPage },
        {
          path: "/ai-costs",
          name: "ai-costs",
          component: { template: '<div data-testid="limits">Limits</div>' },
        },
      ],
    });
    await router.push("/login?redirect=/ai-costs?tab=limits");
    await router.isReady();
    const wrapper = mount(RouterView, {
      global: {
        plugins: [pinia, router],
        stubs: {
          InputText: InputTextStub,
          Message: { template: "<div><slot /></div>" },
          Checkbox: { template: '<input type="checkbox">' },
        },
      },
    });

    await wrapper.get("#login").setValue("owner@example.com");
    await wrapper.get("#password").setValue("permanent passphrase");
    await wrapper.get("form").trigger("submit");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("mfa");

    await wrapper.get('[data-testid="mfa-passkey-action"]').trigger("click");
    await flushPromises();
    expect(router.currentRoute.value.name).toBe("login");
    expect(wrapper.text()).toContain("Выберите проект");

    await wrapper.findAll("button.project-option")[0]!.trigger("click");
    await flushPromises();

    expect(router.currentRoute.value.fullPath).toBe("/ai-costs?tab=limits");
    expect(useAuthStore().consumePostAuthenticationRedirect()).toBeNull();
    expect(authApi.login).toHaveBeenCalledOnce();
    expect(authApi.completeMfaPasskey).toHaveBeenCalledOnce();
  });
});
