import { flushPromises, mount } from "@vue/test-utils";
import { createPinia, setActivePinia } from "pinia";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { useAuthStore } from "@/features/auth/auth.store";
import { supportWorkspaceRolloutSource } from "@/features/support-workspace/api/support-workspace-rollout-source";
import { ensureSupportWorkspaceShellAdmission } from "@/features/support-workspace/model/support-workspace-shell-admission";
import SupportWorkspaceRolloutPage from "./SupportWorkspaceRolloutPage.vue";

const etag = (letter: string) => `"swr1.${letter.repeat(43)}"`;
const replace = vi.fn().mockResolvedValue(undefined);

vi.mock("vue-router", () => ({ useRouter: () => ({ replace }) }));
vi.mock(
  "@/features/support-workspace/api/support-workspace-rollout-source",
  () => ({
    supportWorkspaceRolloutSource: {
      read: vi.fn(),
      update: vi.fn(),
    },
  }),
);
vi.mock(
  "@/features/support-workspace/model/support-workspace-shell-admission",
  () => ({
    clearSupportWorkspaceShellAdmission: vi.fn(),
    ensureSupportWorkspaceShellAdmission: vi.fn(),
  }),
);

const root = {
  enabled: true,
  shellEnabled: false,
  hardOff: false,
  version: 1,
  actionEtag: etag("a"),
};

function authenticate(permissions = [
  "project.support.workspace.rollout.manage",
  "project.conversations.read",
]) {
  const auth = useAuthStore();
  auth.$patch({
    phase: "AUTHENTICATED",
    user: {
      id: "operator-1",
      email: "operator@example.test",
      name: "Operator",
    },
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
  return mount(SupportWorkspaceRolloutPage, {
    global: {
      stubs: {
        Button: {
          props: ["label", "disabled"],
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
        Message: { template: "<div><slot /></div>" },
        Skeleton: { template: "<div />" },
        Tag: { props: ["value"], template: "<span>{{ value }}</span>" },
      },
    },
  });
}

describe("SupportWorkspaceRolloutPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setActivePinia(createPinia());
    vi.mocked(supportWorkspaceRolloutSource.read).mockResolvedValue(root);
    vi.mocked(supportWorkspaceRolloutSource.update).mockResolvedValue({
      ...root,
      hardOff: true,
      version: 2,
      actionEtag: etag("b"),
    });
    vi.mocked(ensureSupportWorkspaceShellAdmission).mockResolvedValue({
      rolloutState: "DISABLED",
      rolloutVersion: 1,
      entryPointMode: "LEGACY_LAUNCHER",
      legacyAdapterMode: "LAUNCHER_ONLY",
      evaluatedAt: "2026-08-09T10:00:00.000Z",
      admissionRevision: "a".repeat(64),
      capabilities: {
        supportWorkspaceShell: "UNAVAILABLE",
        cases: "UNAVAILABLE",
        conversations: "UNAVAILABLE",
      },
    });
  });

  it("renders server authority and safe presets without secrets", async () => {
    authenticate();
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain("Project rollout");
    expect(wrapper.text()).toContain("LEGACY_LAUNCHER · DISABLED");
    expect(wrapper.text()).toContain("Включить pilot");
    expect(wrapper.text()).toContain("Emergency hard-off");
    expect(wrapper.text()).not.toContain(root.actionEtag);
    expect(wrapper.text()).not.toContain("Idempotency-Key");
  });

  it("confirms a destructive preset and sends only the safe complete body", async () => {
    authenticate();
    vi.mocked(supportWorkspaceRolloutSource.read)
      .mockResolvedValueOnce(root)
      .mockResolvedValue({
        ...root,
        hardOff: true,
        version: 2,
        actionEtag: etag("b"),
      });
    const wrapper = mountPage();
    await flushPromises();
    await wrapper.get("textarea").setValue("Emergency rollback rehearsal");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Emergency hard-off")!
      .trigger("click");
    await wrapper
      .findAll("button")
      .find((button) => button.text() === "Подтвердить hard-off")!
      .trigger("click");
    await flushPromises();

    expect(supportWorkspaceRolloutSource.update).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({
        actionEtag: root.actionEtag,
        idempotencyKey: expect.any(String),
        body: {
          enabled: true,
          shellEnabled: false,
          hardOff: true,
          reason: "Emergency rollback rehearsal",
        },
      }),
      expect.any(AbortSignal),
    );
    expect(wrapper.text()).toContain("подтверждено сервером");
  });

  it("does not infer admission for a manage-only actor", async () => {
    authenticate(["project.support.workspace.rollout.manage"]);
    const wrapper = mountPage();
    await flushPromises();

    expect(wrapper.text()).toContain(
      "Не читается этой ролью — вывод по rollout-флагам не делается",
    );
    expect(ensureSupportWorkspaceShellAdmission).not.toHaveBeenCalled();
  });

  it("requires a separate clear-hard-off preset before pilot enable", async () => {
    authenticate();
    vi.mocked(supportWorkspaceRolloutSource.read).mockResolvedValue({
      ...root,
      hardOff: true,
    });
    const wrapper = mountPage();
    await flushPromises();

    const enable = wrapper
      .findAll("button")
      .find((button) => button.text() === "Включить pilot");
    const clear = wrapper
      .findAll("button")
      .find((button) => button.text() === "Снять hard-off безопасно");

    expect(enable?.attributes("disabled")).toBeDefined();
    expect(clear?.attributes("disabled")).toBeUndefined();
  });

  it("purges protected rollout DOM when permission is revoked", async () => {
    const auth = authenticate();
    const wrapper = mountPage();
    await flushPromises();
    expect(wrapper.text()).toContain("Project rollout");

    auth.project!.effectivePermissionCodes = [];
    await flushPromises();

    expect(wrapper.text()).not.toContain("Version 1");
    expect(wrapper.text()).toContain("Rollout недоступен");
  });
});
