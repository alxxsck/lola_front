import { describe, expect, it } from "vitest";
import { supportQualitySource } from "./support-quality-source";

describe("supportQualitySource", () => {
  it("moves a claimed draft through save and submit with OCC versions", async () => {
    const tasks = await supportQualitySource.listTasks("project-1");
    const ready = tasks.items.find(({ state }) => state === "READY")!;
    const claimed = await supportQualitySource.claimTask("project-1", ready);
    expect(claimed).toMatchObject({ state: "CLAIMED", version: 2 });

    const draft = await supportQualitySource.readReview(
      "project-1",
      "review-001",
    );
    const saved = await supportQualitySource.saveDraft(
      "project-1",
      draft.id,
      draft.version,
      {
        summary: "Конкретная обратная связь",
        scores: draft.scores.map((item) => ({
          itemCode: item.itemCode,
          applicable: item.applicable,
          score: item.score ?? undefined,
        })),
        evidence: draft.evidence.map((item) => ({
          messageId: item.messageId,
          rationale: item.rationale ?? undefined,
        })),
      },
    );
    expect(saved.version).toBe(draft.version + 1);
    const submitted = await supportQualitySource.submit(
      "project-1",
      draft.id,
      saved.version,
    );
    expect(submitted).toMatchObject({
      state: "SUBMITTED",
      version: saved.version + 1,
    });
  });

  it("keeps disputes separate from the immutable submitted score", async () => {
    const before = await supportQualitySource.readReview(
      "project-1",
      "review-002",
    );
    const dispute = await supportQualitySource.dispute(
      "project-1",
      before.id,
      before.version,
      "Нужно пересмотреть критерий точности",
    );
    const after = await supportQualitySource.readReview("project-1", before.id);
    expect(dispute.state).toBe("OPEN");
    expect(after.totalScore).toBe(before.totalScore);
    expect(after.disputes).toContainEqual(dispute);
  });
});
