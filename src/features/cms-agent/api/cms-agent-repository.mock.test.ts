import { describe, expect, it, vi } from "vitest";

vi.mock("@/shared/config/data-mode", () => ({
  isMockMode: true,
}));

import { cmsAgentRepository } from "./cms-agent-repository";

describe("cmsAgentRepository in mock mode", () => {
  it("returns the same decoded execution contract as API mode", async () => {
    await expect(
      cmsAgentRepository.execute("project-1", "request-1"),
    ).resolves.toMatchObject({
      kind: "ANALYSIS_QUEUED",
      analysisId: expect.any(String),
      runId: expect.any(String),
      status: "QUEUED",
    });
  });
});
