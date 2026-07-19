import { flushPromises, shallowMount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import ProfileIntegrationPage from "./ProfileIntegrationPage.vue";

vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({ project: { id: "project-1" } }),
}));
vi.mock("@/shared/api/repository", () => ({ repository: { mode: "mock" } }));

describe("ProfileIntegrationPage", () => {
  it("turns backend integration into a numbered Russian workflow", async () => {
    const wrapper = shallowMount(ProfileIntegrationPage);
    await flushPromises();

    expect(wrapper.text()).toContain("Как передавать данные");
    expect(wrapper.text()).toContain("1Подготовьте поля");
    expect(wrapper.text()).toContain("2Выберите способ");
    expect(wrapper.text()).toContain("3Отправьте профиль");
    expect(wrapper.text()).toContain("4Проверьте результат");
    expect(wrapper.text()).toContain("Обновлять профиль при изменении");
    expect(
      wrapper
        .find('button-stub[label="Открыть профиль пользователя"]')
        .exists(),
    ).toBe(true);
    expect(wrapper.text()).not.toContain("Integration guide");
  });
});
