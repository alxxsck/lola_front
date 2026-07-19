import { describe, expect, it } from "vitest";
import {
  applyTranslationResult,
  defaultLocalizationPolicy,
  localizedValue,
  requiredLocales,
  resolveLocalizedContent,
  targetLocalesForTranslation,
  normalizeLocalizedActionContent,
} from "./localization";
import type { ScenarioLocalizationCatalogResponseDto } from "@/shared/api/generated/models";

const catalog: ScenarioLocalizationCatalogResponseDto = {
  version: 1,
  enabled: true,
  attributeKey: "language",
  attributeContractRevision: 7,
  defaultLocale: "en",
  localizedValueSchemaVersion: 1,
  policyModes: ["ALL_PROJECT_LOCALES", "SELECTED_LOCALES"],
  locales: [
    { code: "en", language: "en", default: true },
    { code: "es", language: "es", default: false },
    { code: "pt-BR", language: "pt", default: false },
  ],
  paths: [{ actionType: "SAY", path: "config.text", maxLength: 10_000 }],
};

describe("scenario localization model", () => {
  it("uses every project locale for ALL and only selected locales for SELECTED", () => {
    expect(requiredLocales(catalog, defaultLocalizationPolicy())).toEqual([
      "en",
      "es",
      "pt-BR",
    ]);
    expect(
      requiredLocales(catalog, {
        version: 1,
        mode: "SELECTED_LOCALES",
        locales: ["en", "es"],
      }),
    ).toEqual(["en", "es"]);
  });

  it("migrates a legacy scalar to the project default without dropping archived variants", () => {
    expect(localizedValue("Hello", "en")).toEqual({ en: "Hello" });
    expect(
      localizedValue({ en: "Hello", "fr-CA": "Bonjour" }, "en"),
    ).toEqual({ en: "Hello", "fr-CA": "Bonjour" });
  });

  it("translates only empty required targets by default", () => {
    expect(
      targetLocalesForTranslation({
        catalog,
        policy: defaultLocalizationPolicy(),
        sourceLocale: "en",
        value: { en: "Hello", es: "Hola" },
        supportedTargetLocales: ["es", "pt-BR"],
      }),
    ).toEqual(["pt-BR"]);
  });

  it("applies a result only while source and target still match the request snapshot", () => {
    const snapshot = {
      sourceText: "Hello",
      targetText: "",
      sourceLocale: "en",
      targetLocale: "es",
    };
    expect(
      applyTranslationResult({
        current: { en: "Hello", es: "" },
        snapshot,
        translatedText: "Hola",
      }),
    ).toEqual({ outcome: "APPLIED", value: { en: "Hello", es: "Hola" } });
    expect(
      applyTranslationResult({
        current: { en: "Hello!", es: "" },
        snapshot,
        translatedText: "Hola",
      }).outcome,
    ).toBe("STALE_SOURCE");
    expect(
      applyTranslationResult({
        current: { en: "Hello", es: "Manual" },
        snapshot,
        translatedText: "Hola",
      }).outcome,
    ).toBe("TARGET_CONFLICT");
  });

  it("previews the requested locale and explains fallback to the project default", () => {
    expect(resolveLocalizedContent({ en: "Hello", es: "Hola" }, "es", "en"))
      .toEqual({ text: "Hola", contentLocale: "es", fallbackReason: null });
    expect(resolveLocalizedContent({ en: "Hello" }, "pt-BR", "en"))
      .toEqual({
        text: "Hello",
        contentLocale: "en",
        fallbackReason: "Вариант pt-BR не заполнен — используется основной язык",
      });
  });

  it("migrates nested action leaves to maps without dropping option ids or reminders", () => {
    const localizedCatalog = {
      ...catalog,
      paths: [
        { actionType: "ASK_CHOICE", path: "config.message", maxLength: 10_000 },
        { actionType: "ASK_CHOICE", path: "config.options[].label", maxLength: 120 },
        { actionType: "SAY", path: "config.text", maxLength: 10_000 },
      ],
    };
    const [action] = normalizeLocalizedActionContent(
      [
        {
          type: "ASK_CHOICE",
          config: {
            message: "Choose",
            options: [{ id: "yes", label: "Yes", nextNodeKey: "done" }],
            reminders: [{ actions: [{ type: "SAY", config: { text: "Still there?" } }] }],
          },
        },
      ],
      localizedCatalog,
    );
    expect(action).toMatchObject({
      config: {
        message: { en: "Choose" },
        options: [{ id: "yes", label: { en: "Yes" } }],
        reminders: [{ actions: [{ config: { text: { en: "Still there?" } } }] }],
      },
    });
  });
});
