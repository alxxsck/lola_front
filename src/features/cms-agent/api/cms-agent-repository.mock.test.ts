import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/config/data-mode", () => ({
  isMockMode: true,
}));

import { cmsAgentRepository } from "./cms-agent-repository";

describe("cmsAgentRepository in mock mode", () => {
  it("returns the current domain-reference execution contract", async () => {
    await expect(
      cmsAgentRepository.execute("project-1", "request-1"),
    ).resolves.toMatchObject({
      interpretation: { outcome: "PLANNED", replayed: false },
      result: {
        domainId: expect.any(String),
        domainKind: "AI_ANALYSIS",
        relation: "CREATED",
        result: { runId: expect.any(String), status: "QUEUED" },
      },
    });
  });
});
