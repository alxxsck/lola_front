import { describe, expect, it } from "vitest";
import { parseSupportAnalyticsGeneration } from "./support-analytics-generation";

describe("parseSupportAnalyticsGeneration", () => {
  it("accepts the published generationId contract", () => {
    expect(
      parseSupportAnalyticsGeneration({
        projectId: "project-1",
        datasetCode: "SUPPORT_QUEUE",
        generationId: "generation-42",
        updatedAt: "2026-08-12T12:00:00.000Z",
        freshness: "READY",
      }),
    ).toEqual({
      projectId: "project-1",
      datasetCode: "SUPPORT_QUEUE",
      generationId: "generation-42",
      updatedAt: "2026-08-12T12:00:00.000Z",
      freshness: "READY",
    });
  });

  it("rejects legacy or incomplete payloads", () => {
    expect(
      parseSupportAnalyticsGeneration({
        projectId: "project-1",
        datasetCode: "SUPPORT_QUEUE",
        generation: "42",
      }),
    ).toBeNull();
  });
});
