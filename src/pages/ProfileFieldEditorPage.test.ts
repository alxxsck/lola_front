import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createContractField } from "@/features/end-user-attributes/model/contract-domain";
import type { AttributeContractWorkspaceResponseDto } from "@/shared/api/generated/models";
import ProfileFieldEditorPage from "./ProfileFieldEditorPage.vue";

const mocks = vi.hoisted(() => ({ push: vi.fn() }));

vi.mock("vue-router", () => ({
  useRoute: () => ({ name: "profile-field-create", params: {} }),
  useRouter: () => ({ push: mocks.push }),
  onBeforeRouteLeave: vi.fn(),
}));
vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({ project: { id: "project-1" } }),
}));
vi.mock("@/shared/api/repository", () => ({ repository: { mode: "mock" } }));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: vi.fn() }) }));

describe("ProfileFieldEditorPage", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
  });

  it("shows administrator language and only relevant value constraints", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();

    expect(wrapper.text()).toContain("Новое поле профиля");
    expect(wrapper.text()).toContain("Где можно использовать поле");
    expect(wrapper.text()).toContain("Обязательно ли передавать поле?");
    expect(wrapper.text()).not.toContain("Нужно ли передавать поле?");
    expect(wrapper.text()).toContain("Для чего нужно это поле? *");
    expect(wrapper.text()).toContain("Пример для ИИ");
    expect(wrapper.text()).toContain("ИИ получит значение и описание поля");
    expect(wrapper.text()).toContain("Поле придёт во фронтенд");
    expect(wrapper.text()).not.toContain("Значение получит код страницы");
    expect(wrapper.text()).toContain("Расширенные настройки");
    expect(wrapper.text()).toContain("Минимальная длина");
    expect(wrapper.text()).not.toContain("Всего цифр");
    expect(wrapper.text()).not.toContain("Admin read");
    expect(wrapper.text()).not.toContain("Allowed values");

    const vm = wrapper.vm as unknown as {
      form: { valueType: string };
    };
    vm.form.valueType = "DECIMAL";
    await wrapper.vm.$nextTick();
    expect(wrapper.text()).toContain("Всего цифр");
    expect(wrapper.text()).toContain("Знаков после запятой");
    expect(wrapper.text()).not.toContain("Минимальная длина");
  });

  it("adds a valid field to the draft and returns to the field list", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: { label: string; key: string; purpose: string };
      error: string;
      save: () => Promise<void>;
    };
    vm.form.label = "Город";
    vm.form.key = "city";
    vm.form.purpose = "Показывать город в карточке пользователя";
    await vm.save();

    expect(vm.error).toBe("");
    expect(
      window.localStorage.getItem("lola:demo:profile-fields:project-1"),
    ).toContain('"key":"city"');
    expect(mocks.push).toHaveBeenCalledWith("/profile-fields");
  });

  it("maps validation errors to the exact field", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: { label: string; key: string };
      fieldErrors: Record<string, string>;
      save: () => Promise<void>;
    };
    vm.form.label = "";
    vm.form.key = "Invalid key";
    await vm.save();

    expect(vm.fieldErrors.label).toBe("Укажите название поля.");
    expect(vm.fieldErrors.key).toContain("Ключ начинается");
    expect(mocks.push).not.toHaveBeenCalled();
  });

  it("marks the purpose as optional for an internal field with no consumers", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: {
        classification: string;
        policies: Record<string, boolean | string>;
      };
      purposeRequired: boolean;
    };
    vm.form.classification = "INTERNAL";
    Object.assign(vm.form.policies, {
      adminRead: false,
      aiRead: false,
      audienceRead: false,
      clientRead: false,
      exportRead: false,
      indexPolicy: "NONE",
      templateRead: false,
    });
    await wrapper.vm.$nextTick();

    expect(vm.purposeRequired).toBe(false);
    expect(wrapper.text()).toContain(
      "Необязательно для внутреннего поля, недоступного другим разделам.",
    );
  });

  it("edits a Locale Attribute as canonical locale chips with a required default", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: {
        semanticRole?: string | null;
        valueType: string;
        constraints: { allowedValues?: unknown[]; defaultLocale?: string };
      };
      localeInput: string;
      addLocale: () => void;
    };
    vm.form.semanticRole = "LOCALE";
    await wrapper.vm.$nextTick();
    vm.localeInput = "pt-br";
    vm.addLocale();
    vm.localeInput = "en";
    vm.addLocale();
    await wrapper.vm.$nextTick();

    expect(vm.form.valueType).toBe("STRING");
    expect(vm.form.constraints.allowedValues).toEqual(["pt-BR", "en"]);
    expect(vm.form.constraints.defaultLocale).toBe("pt-BR");
    expect(wrapper.text()).toContain(
      "Значение этого атрибута у пользователя определяет язык сообщений сценария",
    );
    expect(wrapper.text()).toContain("Основной язык проекта");
  });

  it("keeps key and type editable for a saved draft-only field", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: ReturnType<typeof createContractField>;
      workspace: AttributeContractWorkspaceResponseDto;
    };
    vm.form.definitionId = "definition-draft-only";
    vm.workspace.currentRevision = {
      fields: [],
    } as unknown as NonNullable<
      AttributeContractWorkspaceResponseDto["currentRevision"]
    >;
    await wrapper.vm.$nextTick();

    expect(
      wrapper
        .find('input-text-stub[id="profile-field-key"]')
        .attributes("disabled"),
    ).toBe("false");
    expect(wrapper.findAll("select-stub")[0]?.attributes("disabled")).toBe(
      "false",
    );
    expect(wrapper.text()).toContain(
      "После первой публикации ключ и тип данных изменить нельзя.",
    );
  });

  it("locks key and type when the field exists in the current revision", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: ReturnType<typeof createContractField>;
      workspace: AttributeContractWorkspaceResponseDto;
    };
    vm.form.definitionId = "definition-published";
    vm.workspace.currentRevision = {
      fields: [{ definitionId: "definition-published" }],
    } as unknown as NonNullable<
      AttributeContractWorkspaceResponseDto["currentRevision"]
    >;
    await wrapper.vm.$nextTick();

    expect(
      wrapper
        .find('input-text-stub[id="profile-field-key"]')
        .attributes("disabled"),
    ).toBe("true");
    expect(wrapper.findAll("select-stub")[0]?.attributes("disabled")).toBe(
      "true",
    );
  });

  it("keeps identity locked when a published field has draft changes", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: ReturnType<typeof createContractField>;
      workspace: AttributeContractWorkspaceResponseDto;
    };
    vm.form.definitionId = "definition-published";
    vm.form.label = "Название из черновика";
    vm.workspace.currentRevision = {
      fields: [
        {
          definitionId: "definition-published",
          label: "Опубликованное название",
        },
      ],
    } as unknown as NonNullable<
      AttributeContractWorkspaceResponseDto["currentRevision"]
    >;
    await wrapper.vm.$nextTick();

    expect(
      wrapper
        .find('input-text-stub[id="profile-field-key"]')
        .attributes("disabled"),
    ).toBe("true");
    expect(wrapper.findAll("select-stub")[0]?.attributes("disabled")).toBe(
      "true",
    );
  });

  it("does not change the type of a published field assigned as LOCALE", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: ReturnType<typeof createContractField>;
      workspace: AttributeContractWorkspaceResponseDto;
    };
    vm.form.definitionId = "definition-published";
    vm.form.valueType = "INTEGER";
    vm.workspace.currentRevision = {
      fields: [{ definitionId: "definition-published" }],
    } as unknown as NonNullable<
      AttributeContractWorkspaceResponseDto["currentRevision"]
    >;

    vm.form.semanticRole = "LOCALE";
    await wrapper.vm.$nextTick();

    expect(vm.form.valueType).toBe("INTEGER");
    expect(confirm).not.toHaveBeenCalled();
  });
});
