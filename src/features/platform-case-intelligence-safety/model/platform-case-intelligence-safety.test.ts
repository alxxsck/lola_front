import { describe, expect, it } from "vitest";
import {
  buildPlatformSafetyPolicy,
  createPlatformSafetyDraft,
  hasUniformPlatformSafetyGates,
  parsePlatformSafetyLocales,
  validatePlatformSafetyDraft,
} from "./platform-case-intelligence-safety";

describe("platform Case Intelligence safety policy", () => {
  it("builds all mandatory risk gates for every language and channel", () => {
    const draft = createPlatformSafetyDraft();
    draft.classifierRevisionId = "classifier-v1";
    draft.calibratorRevisionId = "calibrator-v1";
    draft.labelledDatasetRevisionId = "labelled-v1";
    draft.sentinelDatasetRevisionId = "sentinel-v1";
    draft.localesText = "ru, en\nru";
    draft.channels = ["TEXT", "TELEGRAM"];
    draft.reason = "Первичная активация обязательной защиты";

    expect(validatePlatformSafetyDraft(draft)).toEqual([]);
    expect(parsePlatformSafetyLocales(draft.localesText)).toEqual(["ru", "en"]);

    const policy = buildPlatformSafetyPolicy(
      draft,
      "00000000-0000-4000-8000-000000000001",
    );
    expect(policy.classes).toHaveLength(4);
    expect(policy.gates).toHaveLength(16);
    expect(policy.gates).toContainEqual({
      locale: "ru",
      channel: "TEXT",
      riskClass: "SELF_HARM_OR_SUICIDE",
      minimumCriticalRecall: 0.95,
      maximumFalseNegativeRate: 0.05,
      minimumSamples: 100,
    });
  });

  it("blocks an incomplete or unsafe publication draft", () => {
    const draft = createPlatformSafetyDraft();
    draft.minimumCriticalRecall = "0.89";
    draft.maximumFalseNegativeRate = "0.11";

    expect(validatePlatformSafetyDraft(draft)).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ path: "classifierRevisionId" }),
        expect.objectContaining({ path: "minimumCriticalRecall" }),
        expect.objectContaining({ path: "maximumFalseNegativeRate" }),
        expect.objectContaining({ path: "reason" }),
      ]),
    );
  });

  it("detects existing per-gate threshold differences", () => {
    const draft = createPlatformSafetyDraft();
    draft.classifierRevisionId = "classifier-v1";
    draft.calibratorRevisionId = "calibrator-v1";
    draft.labelledDatasetRevisionId = "labelled-v1";
    draft.sentinelDatasetRevisionId = "sentinel-v1";
    draft.reason = "Проверка порогов";
    const policy = buildPlatformSafetyPolicy(
      draft,
      "00000000-0000-4000-8000-000000000001",
    );

    expect(hasUniformPlatformSafetyGates(policy)).toBe(true);
    policy.gates[1]!.minimumSamples += 1;
    expect(hasUniformPlatformSafetyGates(policy)).toBe(false);
  });
});
