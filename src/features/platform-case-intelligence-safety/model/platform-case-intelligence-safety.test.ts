import { describe, expect, it } from "vitest";
import type { PlatformSafetyModelCatalogItem } from "@/features/platform-case-intelligence-safety/api/platform-case-intelligence-safety";
import {
  createPlatformSafetyDraft,
  normalizePlatformSafetyReasoning,
  validatePlatformSafetyDraft,
} from "./platform-case-intelligence-safety";

const models: PlatformSafetyModelCatalogItem[] = [
  {
    id: "grok-4.3",
    displayName: "Grok 4.3",
    reasoningEfforts: ["medium", "high"],
    reteniveTested: false,
    selectable: true,
    providerAvailable: true,
    inputPricePerMillion: "2",
    cachedInputPricePerMillion: "0.5",
    outputPricePerMillion: "10",
  },
  {
    id: "grok-4.5",
    displayName: "Grok 4.5",
    reasoningEfforts: ["medium", "high"],
    reteniveTested: true,
    selectable: true,
    providerAvailable: true,
    inputPricePerMillion: "3",
    cachedInputPricePerMillion: "0.75",
    outputPricePerMillion: "15",
  },
];

describe("platform Global Safety profile", () => {
  it("defaults to the recommended available model without asking for internal IDs", () => {
    const draft = createPlatformSafetyDraft(null, models);

    expect(draft).toEqual({
      modelId: "grok-4.5",
      reasoningEffort: "medium",
      reason: "",
    });
    expect(Object.keys(draft)).not.toEqual(
      expect.arrayContaining([
        "classifierRevisionId",
        "calibratorRevisionId",
        "labelledDatasetRevisionId",
      ]),
    );
  });

  it("validates only the product choices and audit reason", () => {
    const draft = createPlatformSafetyDraft(null, models);
    expect(validatePlatformSafetyDraft(draft, models, false)).toEqual([
      expect.objectContaining({ path: "reason" }),
    ]);

    draft.reason = "Первичная активация обязательной защиты";
    expect(validatePlatformSafetyDraft(draft, models, false)).toEqual([]);
    expect(validatePlatformSafetyDraft(draft, models, true)).toEqual([
      expect.objectContaining({ path: "modelId" }),
    ]);
  });

  it("keeps reasoning within the selected model capabilities", () => {
    const draft = {
      modelId: "grok-4.3",
      reasoningEffort: "high" as const,
      reason: "Смена модели",
    };
    const mediumOnly: PlatformSafetyModelCatalogItem = {
      ...models[0]!,
      reasoningEfforts: ["medium"],
    };

    normalizePlatformSafetyReasoning(draft, mediumOnly);

    expect(draft.reasoningEffort).toBe("medium");
  });
});
