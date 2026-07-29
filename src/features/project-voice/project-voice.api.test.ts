import { beforeEach, describe, expect, it, vi } from "vitest";
import { xaiVoiceCatalogList } from "@/shared/api/generated/lola-backend";
import {
  fetchProjectVoiceCatalog,
  parseProjectVoiceCatalog,
} from "./project-voice.api";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  xaiVoiceCatalogList: vi.fn(),
}));

describe("Project voice catalog API", () => {
  beforeEach(() => {
    vi.mocked(xaiVoiceCatalogList).mockReset();
  });

  it("loads the Project-scoped backend catalog without provider credentials", async () => {
    vi.mocked(xaiVoiceCatalogList).mockResolvedValue({
      items: [
        { id: "eve", name: "Eve", language: "multilingual" },
        { id: "rex", name: "Rex", language: "multilingual" },
      ],
      stale: false,
    });
    const signal = new AbortController().signal;

    await expect(
      fetchProjectVoiceCatalog("project-1", signal),
    ).resolves.toEqual({
      items: [
        { id: "eve", name: "Eve", language: "multilingual" },
        { id: "rex", name: "Rex", language: "multilingual" },
      ],
      stale: false,
    });
    expect(xaiVoiceCatalogList).toHaveBeenCalledWith("project-1", { signal });
  });

  it("rejects malformed, duplicate and unbounded provider data", () => {
    expect(
      parseProjectVoiceCatalog({
        items: [
          { id: "eve", name: "Eve", language: "multilingual" },
          { id: "eve", name: "Duplicate", language: "multilingual" },
        ],
        stale: false,
      }),
    ).toBeUndefined();
    expect(
      parseProjectVoiceCatalog({
        items: [{ id: "", name: "Eve", language: "multilingual" }],
        stale: false,
      }),
    ).toBeUndefined();
    expect(
      parseProjectVoiceCatalog({
        items: Array.from({ length: 101 }, (_, index) => ({
          id: `voice-${index}`,
          name: `Voice ${index}`,
          language: "multilingual",
        })),
        stale: false,
      }),
    ).toBeUndefined();
  });
});
