import { beforeEach, describe, expect, it, vi } from "vitest";
import { attributeContractRepository } from "./attribute-contract-repository";

const api = vi.hoisted(() => ({
  publications: vi.fn(),
  publication: vi.fn(),
}));

vi.mock("@/shared/api/generated/retenive-backend", async (importOriginal) => {
  const original =
    await importOriginal<typeof import("@/shared/api/generated/retenive-backend")>();
  return {
    ...original,
    attributeContractPublications: api.publications,
    attributeContractPublication: api.publication,
  };
});

describe("Attribute Contract repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("exposes publication list and detail as first-class history", async () => {
    api.publications.mockResolvedValue({ items: [], nextCursor: null });
    api.publication.mockResolvedValue({ id: "publication-7", sequence: 7 });

    await attributeContractRepository.publications("project-1", { limit: 25 });
    await attributeContractRepository.publication(
      "project-1",
      "publication-7",
    );

    expect(api.publications).toHaveBeenCalledWith("project-1", { limit: 25 });
    expect(api.publication).toHaveBeenCalledWith(
      "project-1",
      "publication-7",
    );
  });
});
