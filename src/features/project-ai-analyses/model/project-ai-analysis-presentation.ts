import { aiLimitationMessage } from "@/features/ai-errors/model/ai-error-message";

export interface PresentedAnalysisResult {
  clarification: {
    question: string;
    candidates: string[];
  } | null;
  title: string | null;
  answer: string | null;
  scope: string | null;
  time: { from: string; to: string; timezone: string } | null;
  table: {
    columns: Array<{ key: string; label: string }>;
    rows: Array<Array<string | null>>;
  } | null;
  definitions: Array<{
    kind: "EVENT" | "EVENT_FIELD" | "USER_ATTRIBUTE";
    code: string;
    eventCode: string | null;
    description: string;
  }>;
  receiptOrdinals: number[];
  completeness: "COMPLETE" | "PARTIAL" | "UNKNOWN" | null;
  limitations: Array<{ code: string; message: string }>;
  actors: {
    createdByCmsUserId: string | null;
    costAttributedToCmsUserId: string | null;
  } | null;
  provenance: {
    catalogRevisionId: string | null;
    catalogRevisionDigest: string | null;
    queryPolicyRevisionId: string | null;
    aiOperationId: string | null;
    queryReceipts: Array<{
      id: string;
      ordinal: number;
      queryHash: string;
      complete: boolean;
      truncated: boolean;
    }>;
  } | null;
}

export type AnalysisStatusSeverity =
  "success" | "info" | "warn" | "danger" | "secondary";

const STATUS_PRESENTATION: Record<
  string,
  { label: string; severity: AnalysisStatusSeverity }
> = {
  SCHEDULED: { label: "Запланирован", severity: "info" },
  QUEUED: { label: "В очереди", severity: "info" },
  RUNNING: { label: "Выполняется", severity: "info" },
  NEEDS_CLARIFICATION: { label: "Нужно уточнение", severity: "warn" },
  SUCCEEDED: { label: "Готов", severity: "success" },
  COMPLETED: { label: "Готов", severity: "success" },
  ACTIVE: { label: "Активен", severity: "info" },
  FAILED: { label: "Ошибка", severity: "danger" },
  PAUSED: { label: "Приостановлен", severity: "warn" },
  CANCELLED: { label: "Отменён", severity: "secondary" },
  EXPIRED: { label: "Истёк", severity: "secondary" },
  OUTCOME_UNKNOWN: { label: "Исход неизвестен", severity: "warn" },
};

export function presentAnalysisStatus(status: string) {
  return (
    STATUS_PRESENTATION[status] ?? {
      label: status,
      severity: "secondary" as const,
    }
  );
}

const COST_STATUS_LABELS: Record<string, string> = {
  UNKNOWN: "Стоимость неизвестна",
  ESTIMATED: "Предварительная оценка",
  PROVIDER_REPORTED_USAGE: "Usage подтверждён провайдером",
  INCOMPLETE_USAGE: "Usage учтён не полностью",
  UNPRICED_MODEL: "Для модели нет тарифа",
  UNPRICED_SERVICE_TIER: "Для уровня сервиса нет тарифа",
};

export function presentAnalysisCostStatus(status?: string): string | null {
  return status ? (COST_STATUS_LABELS[status] ?? status) : null;
}

export function formatUsdTicks(value: string): string {
  const ticks = BigInt(value);
  const scale = 10_000_000_000n;
  const whole = ticks / scale;
  const fraction = (ticks % scale)
    .toString()
    .padStart(10, "0")
    .replace(/0+$/u, "");
  return `$${whole.toString()}${fraction ? `.${fraction}` : ""}`;
}

export function presentAnalysisResult(value: unknown): PresentedAnalysisResult {
  const source = record(value);
  const interpretedScope = record(source.interpretedScope);
  const interpretedTime = record(source.interpretedTime);
  const limitations = presentLimitations(source.limitations);
  return {
    clarification: presentClarification(source.kind, source.clarification),
    title: text(source.title, 500),
    answer: presentAnswer(text(source.answer, 20_000), limitations),
    scope: text(interpretedScope.description, 1_000),
    time:
      typeof interpretedTime.from === "string" &&
      typeof interpretedTime.to === "string" &&
      typeof interpretedTime.timezone === "string" &&
      validDate(interpretedTime.from) &&
      validDate(interpretedTime.to)
        ? {
            from: interpretedTime.from,
            to: interpretedTime.to,
            timezone: interpretedTime.timezone,
          }
        : null,
    table: presentTable(source.table),
    definitions: presentDefinitions(source.definitions),
    receiptOrdinals: presentReceiptOrdinals(source.receiptOrdinals),
    completeness: presentCompleteness(source.completeness),
    limitations,
    actors: presentActors(source.actors),
    provenance: presentProvenance(source.provenance),
  };
}

function presentClarification(
  kind: unknown,
  value: unknown,
): PresentedAnalysisResult["clarification"] {
  if (kind !== "CLARIFICATION_REQUIRED") return null;
  const source = record(value);
  const question = text(source.question, 2_000);
  if (!question || !Array.isArray(source.candidates)) return null;
  const candidates = [
    ...new Set(
      source.candidates.slice(0, 20).flatMap((candidate) => {
        const value = text(candidate, 500);
        return value ? [value] : [];
      }),
    ),
  ];
  return candidates.length ? { question, candidates } : null;
}

function presentAnswer(
  answer: string | null,
  limitations: PresentedAnalysisResult["limitations"],
): string | null {
  if (!answer) return null;
  return limitations.reduce((current, limitation) => {
    const occurrence = new RegExp(
      `${limitation.code}(?:[.!?](?=\\s|$))?`,
      "gu",
    );
    return current.replace(occurrence, limitation.message);
  }, answer);
}

function presentTable(value: unknown): PresentedAnalysisResult["table"] {
  const source = record(value);
  if (!Array.isArray(source.columns) || !Array.isArray(source.rows))
    return null;
  if (source.columns.length > 50 || source.rows.length > 1_000) return null;
  const columns = source.columns.map((item) => {
    const column = record(item);
    const key = text(column.key, 200);
    const label = text(column.label, 500);
    return key && label ? { key, label } : null;
  });
  if (columns.some((item) => item === null)) return null;
  const rows = source.rows.map((item) => {
    const row = record(item);
    if (!Array.isArray(row.cells) || row.cells.length !== columns.length)
      return null;
    const sourceCells = row.cells;
    const cells = sourceCells.map((cell) =>
      cell === null ? null : text(cell, 5_000),
    );
    return cells.some((cell, index) => sourceCells[index] !== null && !cell)
      ? null
      : cells;
  });
  if (rows.some((item) => item === null)) return null;
  return {
    columns: columns as Array<{ key: string; label: string }>,
    rows: rows as Array<Array<string | null>>,
  };
}

function presentLimitations(
  value: unknown,
): PresentedAnalysisResult["limitations"] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((item) => {
    const limitation = record(item);
    const code = text(limitation.code, 200);
    const message = text(limitation.message, 2_000);
    return code && message
      ? [{ code, message: aiLimitationMessage(code, message) }]
      : [];
  });
}

function presentDefinitions(
  value: unknown,
): PresentedAnalysisResult["definitions"] {
  if (!Array.isArray(value)) return [];
  return value.slice(0, 100).flatMap((item) => {
    const definition = record(item);
    const kind = definition.kind;
    const code = text(definition.code, 200);
    const eventCode = text(definition.eventCode, 200);
    const description = text(definition.description, 2_000);
    return ["EVENT", "EVENT_FIELD", "USER_ATTRIBUTE"].includes(String(kind)) &&
      code &&
      description
      ? [
          {
            kind: kind as "EVENT" | "EVENT_FIELD" | "USER_ATTRIBUTE",
            code,
            eventCode,
            description,
          },
        ]
      : [];
  });
}

function presentReceiptOrdinals(value: unknown): number[] {
  if (!Array.isArray(value)) return [];
  return [
    ...new Set(
      value
        .slice(0, 100)
        .filter(
          (ordinal): ordinal is number =>
            Number.isSafeInteger(ordinal) && Number(ordinal) > 0,
        ),
    ),
  ];
}

function presentCompleteness(
  value: unknown,
): PresentedAnalysisResult["completeness"] {
  return ["COMPLETE", "PARTIAL", "UNKNOWN"].includes(String(value))
    ? (value as "COMPLETE" | "PARTIAL" | "UNKNOWN")
    : null;
}

function presentActors(value: unknown): PresentedAnalysisResult["actors"] {
  const source = record(value);
  const createdByCmsUserId = text(source.createdByCmsUserId, 200);
  const costAttributedToCmsUserId = text(source.costAttributedToCmsUserId, 200);
  return createdByCmsUserId || costAttributedToCmsUserId
    ? { createdByCmsUserId, costAttributedToCmsUserId }
    : null;
}

function presentProvenance(
  value: unknown,
): PresentedAnalysisResult["provenance"] {
  const source = record(value);
  const rawReceipts = source.queryReceipts;
  if (Array.isArray(rawReceipts) && rawReceipts.length > 100) return null;
  const catalogRevisionId = text(source.catalogRevisionId, 200);
  const catalogRevisionDigest = digest(source.catalogRevisionDigest);
  const queryPolicyRevisionId = text(source.queryPolicyRevisionId, 200);
  const aiOperationId = text(source.aiOperationId, 200);
  const queryReceipts = Array.isArray(rawReceipts)
    ? rawReceipts.flatMap((item) => {
        const receipt = record(item);
        const id = text(receipt.id, 200);
        const queryHash = digest(receipt.queryHash);
        return id &&
          queryHash &&
          Number.isSafeInteger(receipt.ordinal) &&
          Number(receipt.ordinal) > 0 &&
          typeof receipt.complete === "boolean" &&
          typeof receipt.truncated === "boolean"
          ? [
              {
                id,
                ordinal: Number(receipt.ordinal),
                queryHash,
                complete: receipt.complete,
                truncated: receipt.truncated,
              },
            ]
          : [];
      })
    : [];
  if (
    !catalogRevisionId &&
    !catalogRevisionDigest &&
    !queryPolicyRevisionId &&
    !aiOperationId &&
    queryReceipts.length === 0
  )
    return null;
  return {
    catalogRevisionId,
    catalogRevisionDigest,
    queryPolicyRevisionId,
    aiOperationId,
    queryReceipts,
  };
}

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, maxLength: number): string | null {
  return typeof value === "string" && value.length > 0
    ? value.slice(0, maxLength)
    : null;
}

function validDate(value: string): boolean {
  return !Number.isNaN(new Date(value).getTime());
}

function digest(value: unknown): string | null {
  return typeof value === "string" && /^[0-9a-f]{64}$/u.test(value)
    ? value
    : null;
}
