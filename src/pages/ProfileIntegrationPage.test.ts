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

  it("opens with session transfer selected and explains every value in the example", async () => {
    const wrapper = shallowMount(ProfileIntegrationPage);
    await flushPromises();

    const methods = wrapper.findAll(".method-grid button");
    expect(methods[0]?.text()).toContain("Передавать профиль при запуске сессии");
    expect(methods[0]?.classes()).toContain("selected");
    expect(wrapper.text()).toContain("В примере нет реальных данных пользователя");
    expect(wrapper.text()).toContain("Версия опубликованной структуры полей");
    expect(wrapper.text()).toContain("Уникальный ключ запроса");
    expect(wrapper.text()).toContain("Время, на которое данные были актуальны");
    expect(wrapper.text()).toContain("Порядковый номер обновления");
    const example = wrapper.find('code-block-stub[language="JavaScript"]');
    expect(example.attributes("code")).toContain(
      'const lolaUrl = "https://your-lola.example.com"',
    );
    expect(example.attributes("code")).toContain("fetch(`${lolaUrl}/api");
    expect(example.attributes("code")).toContain(
      "Authorization: `Bearer ${token}`",
    );
  });
});
