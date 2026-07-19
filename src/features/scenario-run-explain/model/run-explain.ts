import type { ScenarioRunExplainResponseDto } from "@/shared/api/repository/scenario-authoring";

export interface ExplainRuleRow {
  id: string;
  depth: number;
  kind: string;
  matched: boolean;
  state: "matched" | "not-matched" | "unavailable";
  actual?: string;
  expected?: string;
  matchedCount?: string;
  window?: string;
  definitionId?: string;
  segmentId?: string;
  segmentRevisionId?: string;
  truth?: string;
  unknownReason?: string;
}

export type ExplainRevisionView =
  | {
      pinned: true;
      id: string;
      scenarioId: string;
      number: number;
      catalogRevision: string;
      contentHash: string;
      publishedAt: string;
      label: string;
    }
  | { pinned: false; unavailable: true; label: string };

export interface RunExplainView {
  run: ScenarioRunExplainResponseDto["run"];
  revision: ExplainRevisionView;
  trigger: ScenarioRunExplainResponseDto["trigger"];
  eligibility: {
    decision: string;
    fidelity: string;
    evaluatedAt?: string | null;
    rows: ExplainRuleRow[];
    lastRecheck: null | {
      decision: string;
      fidelity: string;
      evaluatedAt?: string | null;
    };
  };
  audience: {
    decision: string;
    fidelity: string;
    evaluatedAt?: string | null;
    rows: ExplainRuleRow[];
    segmentRevisionIds: string[];
    attributeRevisionIds: string[];
    profileVersion?: string | null;
    contractRevision?: number | null;
    observedAt?: string | null;
    ageSeconds?: number | null;
    freshness?: ScenarioRunExplainResponseDto["audience"]["freshness"];
    source?: ScenarioRunExplainResponseDto["audience"]["source"];
    truth?: ScenarioRunExplainResponseDto["audience"]["truth"];
    lastRecheck: null | {
      decision: string;
      fidelity: string;
      evaluatedAt?: string | null;
      profileVersion?: string | null;
      contractRevision?: number | null;
      observedAt?: string | null;
      ageSeconds?: number | null;
      freshness?: NonNullable<
        ScenarioRunExplainResponseDto["audience"]["lastRecheck"]
      >["freshness"];
      source?: NonNullable<
        ScenarioRunExplainResponseDto["audience"]["lastRecheck"]
      >["source"];
      truth?: NonNullable<
        ScenarioRunExplainResponseDto["audience"]["lastRecheck"]
      >["truth"];
      rows: ExplainRuleRow[];
    };
  };
  goals: Array<
    ScenarioRunExplainResponseDto["goalResolutions"][number] & {
      winnerLabel: string;
    }
  >;
  delivery: ScenarioRunExplainResponseDto["delivery"] & { summary: string };
  actions: ScenarioRunExplainResponseDto["actions"];
  continuations: ScenarioRunExplainResponseDto["continuations"];
  timeline: ScenarioRunExplainResponseDto["timeline"];
}

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

function explainValue(value: unknown): string | undefined {
  const source = record(value);
  if (!source) return undefined;
  if (source.visibility === "REDACTED") return "Скрыто: чувствительные данные";
  if (source.visibility === "UNAVAILABLE") return "Недоступно";
  if (source.visibility !== "VISIBLE" || !("value" in source))
    return "Неизвестно";
  if (source.value === null) return "null";
  if (
    typeof source.value === "string" ||
    typeof source.value === "number" ||
    typeof source.value === "boolean"
  )
    return String(source.value);
  if (
    Array.isArray(source.value) &&
    source.value.every(
      (item) =>
        item === null || ["string", "number", "boolean"].includes(typeof item),
    )
  ) {
    const items = source.value
      .slice(0, 20)
      .map((item) =>
        item === true
          ? "Да"
          : item === false
            ? "Нет"
            : item === null
              ? "null"
              : String(item),
      );
    return `${items.join(", ")}${source.value.length > 20 ? ", …" : ""}`;
  }
  return "Составное значение";
}

function flattenRule(node: unknown, depth = 0, id = "root"): ExplainRuleRow[] {
  const source = record(node);
  if (!source) return [];
  const row: ExplainRuleRow = {
    id,
    depth,
    kind: typeof source.kind === "string" ? source.kind : "unknown",
    matched: source.matched === true,
    state:
      source.kind === "unavailable" || source.truth === "UNKNOWN"
        ? "unavailable"
        : source.matched === true
          ? "matched"
          : "not-matched",
    ...(explainValue(source.actual)
      ? { actual: explainValue(source.actual) }
      : {}),
    ...(explainValue(source.expected)
      ? { expected: explainValue(source.expected) }
      : {}),
    ...(typeof source.matchedCount === "string"
      ? { matchedCount: source.matchedCount }
      : {}),
    ...(typeof source.definitionId === "string"
      ? { definitionId: source.definitionId }
      : {}),
    ...(typeof source.segmentId === "string"
      ? { segmentId: source.segmentId }
      : {}),
    ...(typeof source.segmentRevisionId === "string"
      ? { segmentRevisionId: source.segmentRevisionId }
      : {}),
    ...(typeof source.truth === "string" ? { truth: source.truth } : {}),
    ...(typeof source.unknownReason === "string"
      ? { unknownReason: source.unknownReason }
      : {}),
    ...(record(source.window) &&
    typeof record(source.window)?.from === "string" &&
    typeof record(source.window)?.to === "string"
      ? {
          window: `${String(record(source.window)?.from)} — ${String(record(source.window)?.to)}`,
        }
      : {}),
  };
  if (Array.isArray(source.children))
    return [
      row,
      ...source.children.flatMap((child, index) =>
        flattenRule(child, depth + 1, `${id}.${index}`),
      ),
    ];
  if (source.child)
    return [row, ...flattenRule(source.child, depth + 1, `${id}.child`)];
  return [row];
}

const runtimeLabels: Record<string, string> = {
  MATCHED: "Условия выполнены",
  NOT_MATCHED: "Условия не выполнены",
  UNAVAILABLE: "Данные недоступны",
  SNAPSHOT: "Сохранённый снимок",
  LEGACY: "Legacy-данные",
  V2: "Current Profile V2",
  LEGACY_V1: "Legacy Audience V1",
  TRUE: "Совпадение",
  FALSE: "Не совпало",
  UNKNOWN: "Неизвестно",
  WAITING: "Ожидает",
  GOAL_MATCHED: "Цель достигнута",
  TIMED_OUT: "Срок истёк",
  CANCELLED: "Отменено",
  FAILED: "Ошибка",
  GOAL_TIMED_OUT: "Срок цели истёк",
  RUN_STARTED: "Run запущен",
  RUN_COMPLETED: "Run завершён",
  RUN_CANCELLED: "Run отменён",
  WAITING_INPUT: "Ожидает ответ пользователя",
  WAITING_DELIVERY: "Ожидает доставку",
  WAITING_TIME: "Ожидает заданное время",
  WAITING_ACK: "Ожидает подтверждение клиента",
  DELIVERY_READY: "Пользователь в сети",
  DELIVERY_TIMED_OUT: "Срок ожидания появления в сети истёк",
  SUCCEEDED: "Выполнено",
  SKIPPED: "Пропущено",
  COMPLETED: "Завершено",
  PENDING: "Ожидает",
  PROCESSING: "Обрабатывается",
  RUNNING: "Выполняется",
  EXPIRED: "Срок действия истёк",
  EVENT: "Событие",
  DEADLINE: "Deadline",
  SERVER: "Backend",
  CLIENT: "Frontend",
  FRONTEND: "Frontend",
  onGoal: "Ветка цели",
  onTimeout: "Ветка истечения срока",
  IMMEDIATE: "Выполнить сразу",
  SKIP_IF_OFFLINE: "Пропустить, если не в сети",
  FAIL_IF_OFFLINE: "Ошибка, если не в сети",
  WAIT_UNTIL_ONLINE: "Ждать появления в сети",
  WAIT_FOR_GOAL: "Ожидание цели",
  SAY: "Сообщение",
  ASK_CHOICE: "Вопрос с вариантами",
  CONDITION: "Условие",
  WAIT_FOR: "Ожидание времени",
  OPEN_CHAT: "Открыть чат",
  SPEAK_TEXT: "Озвучить текст",
  HIGHLIGHT_ELEMENT: "Подсветить элемент",
  PLAY_ANIMATION: "Проиграть анимацию",
  SHOW_CTA: "Показать CTA-кнопку",
};

export function runtimeExplainLabel(value: string | null | undefined): string {
  if (!value) return "—";
  return runtimeLabels[value] ?? value.toLowerCase().replaceAll("_", " ");
}

function winnerLabel(winner: string | null | undefined): string {
  if (winner === "EVENT") return "Победило событие";
  if (winner === "DEADLINE") return "Победил Deadline";
  return "Результат ещё не определён";
}

function deliverySummary(
  policy: ScenarioRunExplainResponseDto["delivery"]["policy"],
): string {
  if (policy.kind === "IMMEDIATE") return "Действия выполняются сразу";
  if (policy.kind === "SKIP_IF_OFFLINE")
    return "Действия пропускаются, когда пользователь не в сети";
  if (policy.kind === "FAIL_IF_OFFLINE")
    return "Отсутствие пользователя в сети завершает доставку ошибкой";
  if (policy.kind === "WAIT_UNTIL_ONLINE")
    return `Ожидание появления в сети до ${Math.round(policy.expiryMs / 1_000)} сек.${policy.recheckEligibility ? " с повторной проверкой условий" : ""}`;
  return "Политика доставки недоступна для этого Run";
}

export function adaptRunExplain(
  response: ScenarioRunExplainResponseDto,
): RunExplainView {
  const revision: ExplainRevisionView = response.scenarioRevision
    ? {
        pinned: true,
        id: response.scenarioRevision.revisionId,
        scenarioId: response.scenarioRevision.scenarioId,
        number: response.scenarioRevision.revisionNumber,
        catalogRevision: response.scenarioRevision.catalogRevision,
        contentHash: response.scenarioRevision.contentHash,
        publishedAt: response.scenarioRevision.publishedAt,
        label: `Зафиксированная версия №${response.scenarioRevision.revisionNumber}`,
      }
    : {
        pinned: false,
        unavailable: true,
        label: "Зафиксированная версия недоступна",
      };

  return {
    run: response.run,
    revision,
    trigger: response.trigger,
    eligibility: {
      decision: response.eligibility.decision,
      fidelity: response.eligibility.fidelity,
      evaluatedAt: response.eligibility.evaluatedAt,
      rows: flattenRule(response.eligibility.root),
      lastRecheck: response.eligibility.lastRecheck
        ? {
            decision: response.eligibility.lastRecheck.decision,
            fidelity: response.eligibility.lastRecheck.fidelity,
            evaluatedAt: response.eligibility.lastRecheck.evaluatedAt,
          }
        : null,
    },
    audience: {
      decision: response.audience.decision,
      fidelity: response.audience.fidelity,
      evaluatedAt: response.audience.evaluatedAt,
      rows: flattenRule(response.audience.root),
      segmentRevisionIds: response.audience.segmentRevisionIds,
      attributeRevisionIds: response.audience.attributeRevisionIds,
      profileVersion: response.audience.profileVersion,
      contractRevision: response.audience.contractRevision,
      observedAt: response.audience.observedAt,
      ageSeconds: response.audience.ageSeconds,
      freshness: response.audience.freshness,
      source: response.audience.source,
      truth: response.audience.truth,
      lastRecheck: response.audience.lastRecheck
        ? {
            decision: response.audience.lastRecheck.decision,
            fidelity: response.audience.lastRecheck.fidelity,
            evaluatedAt: response.audience.lastRecheck.evaluatedAt,
            profileVersion: response.audience.lastRecheck.profileVersion,
            contractRevision: response.audience.lastRecheck.contractRevision,
            observedAt: response.audience.lastRecheck.observedAt,
            ageSeconds: response.audience.lastRecheck.ageSeconds,
            freshness: response.audience.lastRecheck.freshness,
            source: response.audience.lastRecheck.source,
            truth: response.audience.lastRecheck.truth,
            rows: flattenRule(response.audience.lastRecheck.root),
          }
        : null,
    },
    goals: response.goalResolutions.map((goal) => ({
      ...goal,
      winnerLabel: winnerLabel(goal.winner),
    })),
    delivery: {
      ...response.delivery,
      summary: deliverySummary(response.delivery.policy),
    },
    actions: response.actions,
    continuations: response.continuations,
    timeline: response.timeline,
  };
}
