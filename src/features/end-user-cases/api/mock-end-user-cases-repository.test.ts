import { beforeEach, describe, expect, it } from "vitest";
import { defaultEndUserCaseFilters } from "../model/end-user-case";
import {
  mockEndUserCasesRepository,
  resetMockEndUserCases,
} from "./mock-end-user-cases-repository";

describe("mock End User Cases repository", () => {
  beforeEach(resetMockEndUserCases);

  it("keeps demo mode useful with active cases, summary and linked proposals", async () => {
    const page = await mockEndUserCasesRepository.list(
      "project-demo",
      defaultEndUserCaseFilters(),
    );
    const summary =
      await mockEndUserCasesRepository.summary("project-demo");
    const detail = await mockEndUserCasesRepository.detail(
      "project-demo",
      "case-demo-deposit",
    );

    expect(page.items).toHaveLength(2);
    expect(summary).toEqual(
      expect.objectContaining({
        totalCount: 3,
        openCount: 2,
        attentionCount: 1,
        resolvedCount: 1,
        cancelledCount: 0,
      }),
    );
    expect(detail.messages.items).toHaveLength(3);
    expect(detail.proposals.items[0]).toEqual(
      expect.objectContaining({
        id: "proposal-demo-1",
        kind: "ADMIN_ATTENTION",
      }),
    );
  });

  it("persists a versioned workflow change and resets between demo sessions", async () => {
    await expect(
      mockEndUserCasesRepository.workflow(
        "project-demo",
        "case-demo-deposit",
        {
          expectedVersion: 2,
          idempotencyKey: "demo-workflow-1",
          status: "IN_PROGRESS",
          reason: "Оператор взял обращение в работу",
        },
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        version: 3,
        status: "IN_PROGRESS",
      }),
    );

    await expect(
      mockEndUserCasesRepository.workflow(
        "project-demo",
        "case-demo-deposit",
        {
          expectedVersion: 2,
          idempotencyKey: "demo-workflow-2",
          status: "RESOLVED",
          reason: "Устаревшая вкладка",
        },
      ),
    ).rejects.toThrow("Обращение уже изменилось");

    resetMockEndUserCases();
    await expect(
      mockEndUserCasesRepository.detail(
        "project-demo",
        "case-demo-deposit",
      ),
    ).resolves.toEqual(
      expect.objectContaining({
        case: expect.objectContaining({
          version: 2,
          status: "WAITING_SYSTEM",
        }),
      }),
    );
  });
});
