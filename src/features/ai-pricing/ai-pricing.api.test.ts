import { beforeEach, describe, expect, it, vi } from "vitest";
import {
  aiPricingRevisionGet,
  aiPricingRevisionPublish,
} from "@/shared/api/generated/lola-backend";
import {
  fetchTextToSpeechPricing,
  parseTextToSpeechPricing,
  publishTextToSpeechPricing,
} from "./ai-pricing.api";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  aiPricingRevisionGet: vi.fn(),
  aiPricingRevisionPublish: vi.fn(),
}));

const revision = {
  id: "00000000-0000-4000-8000-000000000001",
  provider: "xai",
  operation: "speech",
  currency: "usd",
  unit: "per_million_input_characters",
  rate: "15",
  effectiveFrom: "2026-07-29T10:00:00.000Z",
  sourceUrl: "https://docs.x.ai/developers/pricing",
  changeReason: "Initial verified public rate",
  createdBy: { type: "CMS_USER", id: "operator-1" },
  createdAt: "2026-07-29T10:00:00.000Z",
} as const;

const state = {
  current: revision,
  history: [revision],
  hasMore: false,
  nextCursor: null,
  sourceUrl: "https://docs.x.ai/developers/pricing",
};

describe("xAI Text-to-Speech pricing API", () => {
  beforeEach(() => {
    vi.mocked(aiPricingRevisionGet).mockReset();
    vi.mocked(aiPricingRevisionPublish).mockReset();
  });

  it("loads cursor-paginated immutable pricing state", async () => {
    vi.mocked(aiPricingRevisionGet).mockResolvedValue(state);
    const signal = new AbortController().signal;

    await expect(
      fetchTextToSpeechPricing({ cursor: revision.id, limit: 25 }, signal),
    ).resolves.toEqual(state);
    expect(aiPricingRevisionGet).toHaveBeenCalledWith(
      { cursor: revision.id, limit: 25 },
      { signal },
    );
  });

  it("publishes only the decimal rate and mandatory reason", async () => {
    vi.mocked(aiPricingRevisionPublish).mockResolvedValue(state);

    await expect(
      publishTextToSpeechPricing({
        ratePerMillionCharacters: "16.5",
        changeReason: "Public pricing changed",
      }),
    ).resolves.toEqual(state);
    expect(aiPricingRevisionPublish).toHaveBeenCalledWith({
      ratePerMillionCharacters: "16.5",
      changeReason: "Public pricing changed",
    });
  });

  it("rejects a mutable or provider-confused pricing response", () => {
    expect(
      parseTextToSpeechPricing({
        ...state,
        current: { ...revision, provider: "other" },
      }),
    ).toBeUndefined();
    expect(
      parseTextToSpeechPricing({
        ...state,
        current: { ...revision, rate: "-15" },
      }),
    ).toBeUndefined();
    expect(
      parseTextToSpeechPricing({
        ...state,
        sourceUrl: "javascript:alert(1)",
      }),
    ).toBeUndefined();
    expect(
      parseTextToSpeechPricing({
        ...state,
        sourceUrl: "https://user:secret@docs.x.ai/developers/pricing",
      }),
    ).toBeUndefined();
  });
});
