import { flushPromises, shallowMount } from "@vue/test-utils";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { createContractField } from "@/features/end-user-attributes/model/contract-domain";
import type { AttributeContractWorkspaceResponseDto } from "@/shared/api/generated/models";
import ProfileFieldEditorPage from "./ProfileFieldEditorPage.vue";

const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  route: {
    name: "profile-field-create",
    params: {} as Record<string, string>,
    query: {} as Record<string, string>,
  },
}));

vi.mock("vue-router", () => ({
  useRoute: () => mocks.route,
  useRouter: () => ({ push: mocks.push }),
  onBeforeRouteLeave: vi.fn(),
}));
vi.mock("@/features/auth/auth.store", () => ({
  useAuthStore: () => ({ project: { id: "project-1" } }),
}));
vi.mock("@/shared/api/repository", () => ({ repository: { mode: "mock" } }));
vi.mock("primevue/usetoast", () => ({ useToast: () => ({ add: vi.fn() }) }));

describe("ProfileFieldEditorPage", () => {
  async function chooseCustom(
    wrapper: ReturnType<typeof shallowMount>,
  ): Promise<void> {
    await wrapper
      .find('input[name="profile-field-kind"][value="CUSTOM"]')
      .trigger("click");
  }

  beforeEach(() => {
    vi.clearAllMocks();
    window.localStorage.clear();
    mocks.route.name = "profile-field-create";
    mocks.route.params = {};
    mocks.route.query = {};
  });

  it("asks for the field purpose before the administrator fills its details", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();

    const text = wrapper.text();
    expect(text).toContain("Как Lola должна понимать это поле?");
    expect(text).toContain("Обычное поле");
    expect(text).toContain("Язык контента");
    expect(text).not.toContain("Что хранится в поле");
    expect(wrapper.find("fieldset.preset-section legend").exists()).toBe(true);
    expect(
      wrapper.find("fieldset.preset-section > .preset-heading").exists(),
    ).toBe(true);
    const presets = wrapper.findAll('input[name="profile-field-kind"]');
    expect(presets).toHaveLength(6);
    expect(
      presets.every((preset) => !(preset.element as HTMLInputElement).checked),
    ).toBe(true);
    await chooseCustom(wrapper);
    expect(wrapper.text()).toContain("Что хранится в поле");
    expect(wrapper.find(".advanced-content").text()).not.toContain(
      "Системное назначение",
    );
  });

  it("makes the complete preset content a label for its radio control", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();

    const option = wrapper
      .findAll(".preset-option")
      .find((item) => item.text().includes("Электронная почта"));
    const input = option?.find('input[value="EMAIL"]');
    const choice = option?.find("label.preset-choice");

    expect(input?.exists()).toBe(true);
    expect(choice?.attributes("for")).toBe(input?.attributes("id"));
    expect(choice?.text()).toContain("Электронная почта");
    expect(option?.find("label.preset-choice > .preset-icon").exists()).toBe(
      true,
    );
    expect(option?.find("label.preset-choice > .preset-copy").exists()).toBe(
      true,
    );
  });

  it("uses a compact preset confirmation without a separate close icon", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();

    const dialog = wrapper.findComponent({ name: "Dialog" });
    expect(dialog.attributes("closable")).toBe("false");
    expect(dialog.attributes("draggable")).toBe("false");
    expect(dialog.classes()).toContain("preset-switch-dialog");
  });

  it("applies a system preset before manual field setup", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();

    const countryPreset = wrapper.find(
      'input[name="profile-field-kind"][value="COUNTRY"]',
    );
    await countryPreset.trigger("click");

    const vm = wrapper.vm as unknown as {
      form: {
        semanticRole?: string | null;
        label: string;
        key: string;
        valueType: string;
      };
    };
    expect(vm.form).toMatchObject({
      semanticRole: "COUNTRY",
      label: "Страна",
      key: "country",
      valueType: "COUNTRY_CODE",
    });
    expect(wrapper.findAll("select-stub")[0]?.attributes("disabled")).toBe(
      "false",
    );
  });

  it("keeps manually entered details when the administrator changes the preset", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: {
        semanticRole?: string | null;
        label: string;
        key: string;
        valueType: string;
      };
    };
    vm.form.label = "Предпочитаемый язык";
    vm.form.key = "preferredLanguage";

    await wrapper
      .find('input[name="profile-field-kind"][value="LOCALE"]')
      .trigger("click");

    expect(vm.form).toMatchObject({
      semanticRole: "LOCALE",
      label: "Предпочитаемый язык",
      key: "preferredLanguage",
      valueType: "STRING",
    });
    expect(wrapper.text()).toContain("Языки контента");
  });

  it("does not mutate incompatible settings before the administrator confirms", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    await chooseCustom(wrapper);
    const vm = wrapper.vm as unknown as {
      form: ReturnType<typeof createContractField>;
      allowedValuesInput: string;
      pendingPreset: string | null;
      fieldKind: string | null;
      cancelPresetChange: () => void;
    };
    vm.form.valueType = "DECIMAL";
    vm.form.constraints = { precision: 8, scale: 2 };
    vm.allowedValuesInput = "10.00\n25.50";
    const before = JSON.stringify({
      form: vm.form,
      allowedValuesInput: vm.allowedValuesInput,
    });

    await wrapper
      .find('input[name="profile-field-kind"][value="LOCALE"]')
      .trigger("click");
    await wrapper.vm.$nextTick();

    expect(vm.pendingPreset).toBe("LOCALE");
    expect(vm.fieldKind).toBe("CUSTOM");
    expect(
      JSON.stringify({
        form: vm.form,
        allowedValuesInput: vm.allowedValuesInput,
      }),
    ).toBe(before);
    vm.cancelPresetChange();
    expect(vm.pendingPreset).toBeNull();
    expect(
      JSON.stringify({
        form: vm.form,
        allowedValuesInput: vm.allowedValuesInput,
      }),
    ).toBe(before);
  });

  it("restores the locale draft after a confirmed round trip through a custom field", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    await wrapper
      .find('input[name="profile-field-kind"][value="LOCALE"]')
      .trigger("click");
    const vm = wrapper.vm as unknown as {
      form: ReturnType<typeof createContractField>;
      pendingPreset: string | null;
      requestFieldKind: (kind: "CUSTOM" | "LOCALE") => void;
      confirmPresetChange: () => void;
    };
    vm.form.constraints = {
      allowedValues: ["pt-BR", "en"],
      defaultLocale: "pt-BR",
    };

    vm.requestFieldKind("CUSTOM");
    expect(vm.pendingPreset).toBe("CUSTOM");
    vm.confirmPresetChange();
    expect(vm.form.semanticRole).toBeNull();
    expect(vm.form.constraints).toEqual({});
    vm.form.description = "Общее описание после смены заготовки";
    vm.form.classification = "PERSONAL";
    vm.form.policies.aiRead = true;

    vm.requestFieldKind("LOCALE");
    expect(vm.form).toMatchObject({
      semanticRole: "LOCALE",
      description: "Общее описание после смены заготовки",
      classification: "PERSONAL",
      policies: { aiRead: true },
      constraints: {
        allowedValues: ["pt-BR", "en"],
        defaultLocale: "pt-BR",
      },
    });
  });

  it("marks a system purpose already used by another field as unavailable", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();

    const displayNamePreset = wrapper.find(
      'input[name="profile-field-kind"][value="DISPLAY_NAME"]',
    );
    expect(displayNamePreset.attributes("disabled")).toBeDefined();
    expect(displayNamePreset.element.parentElement?.textContent).toContain(
      "Уже используется",
    );
    expect(wrapper.text()).toContain("Открыть «Отображаемое имя»");
  });

  it("opens a requested system preset with ready-to-edit defaults", async () => {
    mocks.route.query = { semanticRole: "LOCALE" };
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: {
        semanticRole?: string | null;
        label: string;
        key: string;
        valueType: string;
      };
    };

    expect(vm.form).toMatchObject({
      semanticRole: "LOCALE",
      label: "Язык контента",
      key: "locale",
      valueType: "STRING",
    });
  });

  it("does not let a deep link select a system purpose already used by another field", async () => {
    mocks.route.query = { semanticRole: "DISPLAY_NAME" };
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      form: ReturnType<typeof createContractField>;
      fieldKind: string | null;
      error: string;
    };

    expect(vm.fieldKind).toBeNull();
    expect(vm.form.semanticRole).toBeNull();
    expect(vm.error).toContain("уже используется");
  });

  it("shows administrator language and only relevant value constraints", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    await chooseCustom(wrapper);

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
    await chooseCustom(wrapper);
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
    await chooseCustom(wrapper);
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
    await chooseCustom(wrapper);
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
    const emailPreset = wrapper.find(
      'input[name="profile-field-kind"][value="EMAIL"]',
    );
    expect(emailPreset.attributes("disabled")).toBeDefined();
    expect(emailPreset.element.parentElement?.textContent).toContain(
      "Для опубликованного поля создайте поле-замену",
    );
  });

  it("does not let an administrator repurpose an already published system field", async () => {
    mocks.route.name = "profile-field-edit";
    mocks.route.params = { definitionId: "attr-name" };
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    const vm = wrapper.vm as unknown as {
      workspace: AttributeContractWorkspaceResponseDto;
    };
    vm.workspace.currentRevision = {
      fields: [
        {
          definitionId: "attr-name",
          semanticRole: "DISPLAY_NAME",
        },
      ],
    } as unknown as NonNullable<
      AttributeContractWorkspaceResponseDto["currentRevision"]
    >;
    await wrapper.vm.$nextTick();

    const customPreset = wrapper.find(
      'input[name="profile-field-kind"][value="CUSTOM"]',
    );
    expect(customPreset.attributes("disabled")).toBeDefined();
    expect(customPreset.element.parentElement?.textContent).toContain(
      "Назначение опубликованного поля зафиксировано",
    );
  });

  it("keeps identity locked when a published field has draft changes", async () => {
    const wrapper = shallowMount(ProfileFieldEditorPage);
    await flushPromises();
    await chooseCustom(wrapper);
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
      fieldKind: string | null;
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
    expect(vm.fieldKind).toBeNull();
    expect(confirm).not.toHaveBeenCalled();
  });
});
