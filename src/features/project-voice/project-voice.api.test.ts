import { beforeEach, describe, expect, it, vi } from "vitest";
import { xaiVoiceCatalogList } from "@/shared/api/generated/retenive-backend";
import {
  fetchProjectVoiceCatalog,
  parseProjectVoiceCatalog,
} from "./project-voice.api";

const mocks = vi.hoisted(() => ({ mockMode: false }));

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  xaiVoiceCatalogList: vi.fn(),
}));
vi.mock("@/shared/config/data-mode", () => ({
  get isMockMode() {
    return mocks.mockMode;
  },
}));

describe("Project voice catalog API", () => {
  beforeEach(() => {
    mocks.mockMode = false;
    vi.mocked(xaiVoiceCatalogList).mockReset();
  });

  it("uses an xAI demo catalog without a backend request in mock mode", async () => {
    mocks.mockMode = true;

    await expect(fetchProjectVoiceCatalog("project-1")).resolves.toMatchObject({
      stale: false,
      items: expect.arrayContaining([
        { id: "eve", name: "Eve", language: "multilingual" },
        { id: "rex", name: "Rex", language: "multilingual" },
      ]),
    });
    expect(xaiVoiceCatalogList).not.toHaveBeenCalled();
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
