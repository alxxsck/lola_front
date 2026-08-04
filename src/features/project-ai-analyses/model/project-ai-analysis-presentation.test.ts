import { describe, expect, it } from "vitest";
import {
  formatUsdTicks,
  presentAnalysisCostStatus,
  presentAnalysisResult,
  presentAnalysisStatus,
} from "./project-ai-analysis-presentation";

describe("project AI analysis presentation", () => {
  it("keeps a bounded clarification question and candidates", () => {
    expect(
      presentAnalysisResult({
        kind: "CLARIFICATION_REQUIRED",
        clarification: {
          question: "Какое определение использовать?",
          candidates: ["deposit.completed", "deposit.completed", 42],
        },
      }).clarification,
    ).toEqual({
      question: "Какое определение использовать?",
      candidates: ["deposit.completed"],
    });
  });

  it("formats integer USD ticks without losing bigint precision", () => {
    expect(formatUsdTicks("12500000000")).toBe("$1.25");
    expect(formatUsdTicks("90071992547409930000")).toBe("$9007199254.740993");
  });

  it("renders cost reconciliation states as readable business labels", () => {
    expect(presentAnalysisCostStatus("PROVIDER_REPORTED_USAGE")).toBe(
      "Usage подтверждён провайдером",
    );
    expect(presentAnalysisCostStatus("UNPRICED_MODEL")).toBe(
      "Для модели нет тарифа",
    );
  });

  it("maps lifecycle states to readable non-success-biased labels", () => {
    expect(presentAnalysisStatus("SCHEDULED")).toMatchObject({
      label: "Запланирован",
      severity: "info",
    });
    expect(presentAnalysisStatus("OUTCOME_UNKNOWN")).toMatchObject({
      label: "Исход неизвестен",
      severity: "warn",
    });
  });

  it("removes persisted limitation codes from the user-facing answer", () => {
    const result = presentAnalysisResult({
      answer: "Результат неполный: EVENT_RETENTION_LIMIT_REACHED.",
      limitations: [
        {
          code: "EVENT_RETENTION_LIMIT_REACHED",
          message: "EVENT_RETENTION_LIMIT_REACHED",
        },
      ],
    });

    expect(result.answer).toContain("доступной истории событий");
    expect(result.answer).not.toContain("EVENT_RETENTION_LIMIT_REACHED");
  });

  it("accepts the bounded structured result and rejects malformed tables", () => {
    expect(
      presentAnalysisResult({
        title: "Депозиты",
        answer: "Вчера депозит завершили 12 пользователей.",
        table: {
          columns: [
            { key: "geo", label: "GEO" },
            { key: "users", label: "Пользователи" },
          ],
          rows: [{ cells: ["ES", "12"] }],
        },
        interpretedScope: { kind: "PROJECT", description: "Весь проект" },
        interpretedTime: {
          from: "2026-07-30T00:00:00.000Z",
          to: "2026-07-31T00:00:00.000Z",
          timezone: "Europe/Madrid",
        },
        definitions: [
          {
            kind: "EVENT",
            code: "deposit.completed",
            description: "Успешно завершённый депозит",
          },
        ],
        receiptOrdinals: [1],
        completeness: "PARTIAL",
        actors: {
          createdByCmsUserId: "admin-1",
          costAttributedToCmsUserId: "admin-cost",
        },
        provenance: {
          catalogRevisionId: "catalog-1",
          catalogRevisionDigest: "a".repeat(64),
          queryPolicyRevisionId: "policy-1",
          aiOperationId: "operation-1",
          queryReceipts: [
            {
              id: "receipt-1",
              ordinal: 1,
              queryHash: "b".repeat(64),
              complete: false,
              truncated: true,
            },
          ],
        },
        limitations: [{ code: "PARTIAL", message: "Неполные данные" }],
      }),
    ).toMatchObject({
      answer: "Вчера депозит завершили 12 пользователей.",
      table: {
        columns: [
          { key: "geo", label: "GEO" },
          { key: "users", label: "Пользователи" },
        ],
        rows: [["ES", "12"]],
      },
      limitations: [{ code: "PARTIAL", message: "Неполные данные" }],
      definitions: [
        {
          kind: "EVENT",
          code: "deposit.completed",
          eventCode: null,
          description: "Успешно завершённый депозит",
        },
      ],
      receiptOrdinals: [1],
      completeness: "PARTIAL",
      actors: {
        createdByCmsUserId: "admin-1",
        costAttributedToCmsUserId: "admin-cost",
      },
      provenance: {
        catalogRevisionId: "catalog-1",
        catalogRevisionDigest: "a".repeat(64),
        queryPolicyRevisionId: "policy-1",
        aiOperationId: "operation-1",
        queryReceipts: [
          {
            id: "receipt-1",
            ordinal: 1,
            queryHash: "b".repeat(64),
            complete: false,
            truncated: true,
          },
        ],
      },
    });

    expect(
      presentAnalysisResult({
        answer: "Нельзя доверять таблице",
        table: {
          columns: [{ key: "geo", label: "GEO" }],
          rows: [{ cells: ["ES", "лишняя ячейка"] }],
        },
      }),
    ).toMatchObject({
      answer: "Нельзя доверять таблице",
      table: null,
    });

    expect(
      presentAnalysisResult({
        interpretedTime: {
          from: "not-a-date",
          to: "2026-07-31T00:00:00.000Z",
          timezone: "Europe/Madrid",
        },
      }).time,
    ).toBeNull();
  });

  it("drops malformed or unbounded provenance fields", () => {
    const result = presentAnalysisResult({
      definitions: [
        { kind: "SQL", code: "secret", description: "bad" },
        {
          kind: "EVENT_FIELD",
          code: "amount",
          eventCode: "deposit.completed",
          description: "Сумма",
        },
      ],
      receiptOrdinals: [1, -2, 1.5, "3"],
      completeness: "EVERYTHING",
      actors: { createdByCmsUserId: "", costAttributedToCmsUserId: 42 },
      provenance: {
        catalogRevisionDigest: "not-a-digest",
        queryReceipts: new Array(101).fill({ ordinal: 1 }),
      },
    });

    expect(result.definitions).toEqual([
      {
        kind: "EVENT_FIELD",
        code: "amount",
        eventCode: "deposit.completed",
        description: "Сумма",
      },
    ]);
    expect(result.receiptOrdinals).toEqual([1]);
    expect(result.completeness).toBeNull();
    expect(result.actors).toBeNull();
    expect(result.provenance).toBeNull();
  });
});
