import { beforeEach, describe, expect, it } from "vitest";
import { defaultEndUserCaseFilters } from "../model/end-user-case";
import {
  mockEndUserCasesRepository,
  resetMockEndUserCases,
} from "./mock-end-user-cases-repository";

describe("mock End User Cases repository", () => {
  beforeEach(resetMockEndUserCases);

  it("keeps demo mode useful with active cases, summary and escalations", async () => {
    const page = await mockEndUserCasesRepository.list(
      "project-demo",
      defaultEndUserCaseFilters(),
    );
    const summary = await mockEndUserCasesRepository.summary("project-demo");
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
    expect(detail.escalations.items).toEqual(expect.any(Array));
  });

  it("persists an escalation on the concrete Case", async () => {
    const before = await mockEndUserCasesRepository.detail(
      "project-demo",
      "case-demo-deposit",
    );

    await mockEndUserCasesRepository.requestEscalation(
      "project-demo",
      "case-demo-deposit",
      {
        expectedCaseVersion: before.case.version,
        reasonCode: "DEPOSIT_HELP",
        summary: "Нужна ручная проверка депозита",
      },
      "demo-escalation-independent",
    );

    const after = await mockEndUserCasesRepository.detail(
      "project-demo",
      "case-demo-deposit",
    );
    expect(after.escalations.items).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          reasonCode: "DEPOSIT_HELP",
          status: "REQUESTED",
        }),
      ]),
    );
  });

  it("resets the Case escalation timeline between demo sessions", async () => {
    const before = await mockEndUserCasesRepository.detail(
      "project-demo",
      "case-demo-deposit",
    );
    const requested = await mockEndUserCasesRepository.requestEscalation(
      "project-demo",
      "case-demo-deposit",
      {
        expectedCaseVersion: before.case.version,
        reasonCode: "DEPOSIT_HELP",
        summary: "Нужна ручная проверка депозита",
      },
      "demo-timeline-request",
    );
    await mockEndUserCasesRepository.claimEscalation(
      "project-demo",
      "case-demo-deposit",
      requested.escalation.id,
      {
        expectedCaseVersion: requested.caseVersion,
        expectedEscalationVersion: requested.escalation.version,
        reason: "Беру обращение в работу",
      },
      "demo-timeline-claim",
    );

    const mutated = await mockEndUserCasesRepository.detail(
      "project-demo",
      "case-demo-deposit",
    );
    expect(mutated.timeline.events.map(({ type }) => type)).toEqual([
      "ADMIN_ATTENTION_REQUESTED",
      "ADMIN_ATTENTION_CLAIMED",
    ]);

    resetMockEndUserCases();
    const restoredDeposit = await mockEndUserCasesRepository.detail(
      "project-demo",
      "case-demo-deposit",
    );
    const restoredGame = await mockEndUserCasesRepository.detail(
      "project-demo",
      "case-demo-game",
    );
    expect(restoredDeposit.timeline.events).toEqual([]);
    expect(restoredGame.timeline.events.map(({ type }) => type)).toEqual([
      "ADMIN_ATTENTION_REQUESTED",
    ]);
  });

  it("persists a versioned workflow change and resets between demo sessions", async () => {
    await expect(
      mockEndUserCasesRepository.workflow("project-demo", "case-demo-deposit", {
        expectedVersion: 2,
        idempotencyKey: "demo-workflow-1",
        status: "IN_PROGRESS",
        reason: "Оператор взял обращение в работу",
      }),
    ).resolves.toEqual(
      expect.objectContaining({
        version: 3,
        status: "IN_PROGRESS",
      }),
    );

    await expect(
      mockEndUserCasesRepository.workflow("project-demo", "case-demo-deposit", {
        expectedVersion: 2,
        idempotencyKey: "demo-workflow-2",
        status: "RESOLVED",
        reason: "Устаревшая вкладка",
      }),
    ).rejects.toThrow("Обращение уже изменилось");

    resetMockEndUserCases();
    await expect(
      mockEndUserCasesRepository.detail("project-demo", "case-demo-deposit"),
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
