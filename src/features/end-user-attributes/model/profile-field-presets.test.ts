import { describe, expect, it } from "vitest";

import { createContractField } from "./contract-domain";
import {
  applyProfileFieldPreset,
  profileFieldPresets,
} from "./profile-field-presets";

describe("profile field presets", () => {
  it("defines a compatible value type for every system purpose", () => {
    expect(
      profileFieldPresets
        .filter((preset) => preset.value !== "CUSTOM")
        .every((preset) => preset.key && preset.valueType),
    ).toBe(true);
  });

  it("updates generated suggestions when switching between presets", () => {
    const field = createContractField();

    let suggestion = applyProfileFieldPreset(field, "COUNTRY");
    suggestion = applyProfileFieldPreset(field, "CUSTOM", suggestion);
    applyProfileFieldPreset(field, "CURRENCY", suggestion);

    expect(field).toMatchObject({
      semanticRole: "CURRENCY",
      label: "Валюта",
      key: "currency",
      valueType: "CURRENCY_CODE",
    });
  });

  it("never replaces an administrator's custom label or key", () => {
    const field = {
      ...createContractField(),
      label: "Язык рассылки",
      key: "messageLanguage",
    };

    applyProfileFieldPreset(field, "LOCALE");

    expect(field).toMatchObject({
      semanticRole: "LOCALE",
      label: "Язык рассылки",
      key: "messageLanguage",
      valueType: "STRING",
    });
  });
});
