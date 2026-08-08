import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import UiElementPicker from "@/features/interface/UiElementPicker.vue";
import SendActionDialog from "./SendActionDialog.vue";

const mocks = vi.hoisted(() => ({
  getElements: vi.fn(),
  sendAdminMessage: vi.fn(),
  toast: vi.fn(),
}));

vi.mock("@/shared/api/repository", () => ({
  repository: {
    mode: "api",
    getElements: mocks.getElements,
    sendAdminMessage: mocks.sendAdminMessage,
  },
}));
vi.mock("primevue/usetoast", () => ({
  useToast: () => ({ add: mocks.toast }),
}));

describe("SendActionDialog", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.getElements.mockResolvedValue([
      {
        id: "page-home",
        projectId: "project-1",
        code: "home",
        name: "Главная",
        kind: "PAGE",
        route: "/home",
        config: {},
        enabled: true,
        aiEnabled: true,
        aiDescription: "Главная страница",
        aiAliases: [],
      },
    ]);
    mocks.sendAdminMessage.mockResolvedValue({ duplicate: false });
  });

  it("sends the code committed by the interface catalog picker", async () => {
    const wrapper = shallowMount(SendActionDialog, {
      props: {
        visible: false,
        projectId: "project-1",
        userId: "user-1",
        recipientName: "Анна",
        session: {
          id: "session-1",
          userId: "user-1",
          externalId: "external-1",
          userName: "Анна",
          device: "Desktop",
          startedAt: new Date().toISOString(),
          lastSeenAt: new Date().toISOString(),
          status: "ONLINE",
        },
        canReadTargets: true,
      },
      global: {
        stubs: {
          Dialog: {
            props: ["visible"],
            template:
              '<section v-if="visible"><slot /><slot name="footer" /></section>',
          },
        },
      },
    });

    await wrapper.setProps({ visible: true });
    await flushPromises();
    await wrapper.findAllComponents({ name: "Select" })[0]?.vm.$emit(
      "update:modelValue",
      "COMMAND",
    );
    await flushPromises();
    await wrapper.getComponent(UiElementPicker).vm.$emit(
      "update:modelValue",
      "home",
    );
    await wrapper.get('button-stub[label="Отправить"]').trigger("click");
    await flushPromises();

    expect(mocks.sendAdminMessage).toHaveBeenCalledWith(
      "project-1",
      "user-1",
      expect.objectContaining({
        interactionSessionId: "session-1",
        actions: [
          expect.objectContaining({
            type: "OPEN_PAGE",
            config: { pageId: "home" },
          }),
        ],
      }),
    );
  });
});
