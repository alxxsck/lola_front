import { mount } from "@vue/test-utils";
import { describe, expect, it, vi } from "vitest";
import LocalizedField from "./LocalizedField.vue";
import type {
  ScenarioLocalizationCatalogResponseDto,
  ScenarioTranslationCatalogResponseDto,
} from "@/shared/api/generated/models";

function catalog(size: number): ScenarioLocalizationCatalogResponseDto {
  const codes = [
    "en", "es", "pt-BR", "de", "fr", "it", "pl", "uk", "ja", "ko",
    "nl", "sv", "da", "fi", "nb", "cs", "ro", "tr", "id", "vi",
  ];
  return {
    version: 1,
    enabled: true,
    attributeKey: "language",
    attributeContractRevision: 1,
    defaultLocale: "en",
    localizedValueSchemaVersion: 1,
    policyModes: ["ALL_PROJECT_LOCALES", "SELECTED_LOCALES"],
    locales: codes.slice(0, size).map((code, index) => ({
      code,
      language: code.split("-")[0]!,
      default: index === 0,
    })),
    paths: [{ actionType: "SAY", path: "config.text", maxLength: 10_000 }],
  };
}

const translation: ScenarioTranslationCatalogResponseDto = {
  enabled: true,
  supportedSourceLocales: ["en"],
  supportedTargetLocales: [
    "es", "pt-BR", "de", "fr", "it", "pl", "uk", "ja", "ko", "nl",
    "sv", "da", "fi", "nb", "cs", "ro", "tr", "id", "vi",
  ],
  maxBatchCharacters: 50_000,
};

function mountField(size: number) {
  return mount(LocalizedField, {
    props: {
      modelValue: { en: "Hello" },
      catalog: catalog(size),
      translation,
      policy: { version: 1, mode: "ALL_PROJECT_LOCALES", locales: [] },
      sourceLocale: "en",
      fieldPath: "graph.actions.welcome.config.text",
      scenarioId: "scenario-1",
      projectId: "project-1",
      label: "Текст",
    },
  });
}

describe("LocalizedField", () => {
  it("always mounts the project default editor and keeps translations collapsed", () => {
    const wrapper = mountField(5);
    expect(wrapper.get("textarea").attributes("aria-label")).toContain("en");
    expect(wrapper.findAll("textarea")).toHaveLength(1);
    expect(wrapper.get("button[data-translation-trigger]").attributes("title")).toContain(
      "Google Translation LLM",
    );
  });

  it("renders a single-locale project without an empty accordion", () => {
    const wrapper = mountField(1);
    expect(wrapper.findAll("textarea")).toHaveLength(1);
    expect(wrapper.find("button[data-coverage-trigger]").exists()).toBe(false);
  });

  it("shows all target editors for up to five locales", async () => {
    const wrapper = mountField(5);
    await wrapper.get("button[data-coverage-trigger]").trigger("click");
    expect(wrapper.findAll("textarea")).toHaveLength(5);
  });

  it("mounts only one searchable target editor for a large locale set", async () => {
    const wrapper = mountField(10);
    await wrapper.get("button[data-coverage-trigger]").trigger("click");
    expect(wrapper.find("input[type='search']").exists()).toBe(true);
    expect(wrapper.findAll("textarea")).toHaveLength(2);
  });

  it("keeps only one target editor mounted with the maximum 20 locales", async () => {
    const wrapper = mountField(20);
    await wrapper.get("button[data-coverage-trigger]").trigger("click");
    expect(wrapper.findAll(".locale-list button")).toHaveLength(19);
    expect(wrapper.findAll("textarea")).toHaveLength(2);
  });

  it("emits a full map when a hidden locale is edited", async () => {
    const wrapper = mountField(5);
    await wrapper.get("button[data-coverage-trigger]").trigger("click");
    const spanish = wrapper.find("textarea[aria-label*='es']");
    await spanish.setValue("Hola");
    expect(wrapper.emitted("update:modelValue")?.at(-1)?.[0]).toEqual({
      en: "Hello",
      es: "Hola",
    });
  });

  it("requires explicit confirmation before overwriting a filled translation", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    const wrapper = mount(LocalizedField, {
      props: {
        modelValue: { en: "Hello", es: "Hola" },
        catalog: catalog(2),
        translation,
        policy: { version: 1, mode: "ALL_PROJECT_LOCALES", locales: [] },
        sourceLocale: "en",
        fieldPath: "graph.actions.welcome.config.text",
        scenarioId: "scenario-1",
        projectId: "project-1",
        label: "Текст",
      },
    });

    await wrapper.get(".translation-menu summary").trigger("click");
    await wrapper.get(".translation-menu button:last-child").trigger("click");

    expect(confirm).toHaveBeenCalledWith(expect.stringContaining("es"));
    expect(wrapper.emitted("translation-request")?.at(-1)?.[0]).toEqual(["es"]);
    confirm.mockRestore();
  });
});
