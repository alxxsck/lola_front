import { computed, ref } from "vue";
import type {
  SupportCaseAssignmentBatchItemRequestDto,
  SupportCaseAssignmentBatchResponseDto,
} from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportLeadAssignmentSource,
} from "@/features/support-lead-assignment/api/support-lead-assignment-source";

export interface SupportLeadAssignmentBatchRow {
  caseId: string;
  snapshot: Awaited<ReturnType<SupportLeadAssignmentSource["readCase"]>> | null;
  teamId: string;
  operatorId: string;
  error: string;
}

interface PendingBatch {
  generation: number;
  projectId: string;
  items: SupportCaseAssignmentBatchItemRequestDto[];
  idempotencyKey: string;
}

export interface SupportLeadAssignmentBatchContext {
  projectId(): string | undefined;
  canOverride(): boolean;
  canForce(): boolean;
  onForbidden?(): void | Promise<void>;
  onChanged?(): void | Promise<void>;
  createIdempotencyKey?(): string;
}

function eligibleOperators(row: SupportLeadAssignmentBatchRow) {
  const snapshot = row.snapshot;
  if (!snapshot) return [];
  return snapshot.teams.flatMap((team) =>
    team.operators
      .filter(
        (operator) =>
          operator.actions.assign || operator.actions.assignWithOverride,
      )
      .map((operator) => ({ team, operator })),
  );
}

export function createSupportLeadAssignmentBatchController(
  source: SupportLeadAssignmentSource,
  context: SupportLeadAssignmentBatchContext,
) {
  const rows = ref<SupportLeadAssignmentBatchRow[]>([]);
  const preparing = ref(false);
  const mutating = ref(false);
  const reconciling = ref(false);
  const error = ref("");
  const reasonNote = ref("");
  const result = ref<SupportCaseAssignmentBatchResponseDto | null>(null);
  const unknownOutcome = ref(false);
  const pending = ref<PendingBatch | null>(null);
  let generation = 0;
  let abort: AbortController | null = null;

  const hasAuthority = computed(
    () => Boolean(context.projectId()) && context.canOverride(),
  );
  const hasForceAuthority = computed(
    () => hasAuthority.value && context.canForce(),
  );
  const readyCount = computed(
    () => rows.value.filter((row) => row.snapshot && !row.error).length,
  );

  function scopeIsCurrent(projectId: string): boolean {
    return context.projectId() === projectId && context.canOverride();
  }

  function actionScopeIsCurrent(action: PendingBatch): boolean {
    return generation === action.generation && scopeIsCurrent(action.projectId);
  }

  function selectInitialTarget(row: SupportLeadAssignmentBatchRow): void {
    const first = eligibleOperators(row).find(
      ({ operator }) =>
        operator.actions.assign ||
        (context.canForce() && operator.actions.assignWithOverride),
    );
    row.teamId = first?.team.id ?? "";
    row.operatorId = first?.operator.id ?? "";
    row.error = first ? "" : "Нет доступного оператора для назначения";
  }

  async function prepare(caseIds: string[]): Promise<void> {
    const projectId = context.projectId();
    abort?.abort();
    const requestGeneration = ++generation;
    rows.value = [];
    result.value = null;
    error.value = "";
    reasonNote.value = "";
    unknownOutcome.value = false;
    pending.value = null;
    if (!projectId || !context.canOverride() || caseIds.length < 1) return;
    const uniqueCaseIds = [...new Set(caseIds)].slice(0, 50);
    const controller = new AbortController();
    abort = controller;
    preparing.value = true;
    try {
      const loaded = await Promise.all(
        uniqueCaseIds.map(async (caseId) => {
          try {
            const snapshot = await source.readCase(
              projectId,
              caseId,
              controller.signal,
            );
            const row: SupportLeadAssignmentBatchRow = {
              caseId,
              snapshot,
              teamId: "",
              operatorId: "",
              error:
                snapshot.assignmentState === "UNASSIGNED"
                  ? ""
                  : "Case уже назначен или зарезервирован",
            };
            if (!row.error) selectInitialTarget(row);
            return row;
          } catch (cause) {
            if (
              cause instanceof ApiError &&
              (cause.status === 403 || cause.status === 404)
            )
              return {
                caseId,
                snapshot: null,
                teamId: "",
                operatorId: "",
                error: "Case недоступен или скрыт",
              } satisfies SupportLeadAssignmentBatchRow;
            return {
              caseId,
              snapshot: null,
              teamId: "",
              operatorId: "",
              error: "Не удалось проверить Case",
            } satisfies SupportLeadAssignmentBatchRow;
          }
        }),
      );
      if (requestGeneration === generation && scopeIsCurrent(projectId))
        rows.value = loaded;
    } finally {
      if (requestGeneration === generation) {
        preparing.value = false;
        abort = null;
      }
    }
  }

  function setTarget(caseId: string, teamId: string, operatorId = ""): void {
    const row = rows.value.find((item) => item.caseId === caseId);
    if (!row?.snapshot || mutating.value || unknownOutcome.value) return;
    row.teamId = teamId;
    const candidates = eligibleOperators(row).filter(
      ({ team, operator }) =>
        team.id === teamId &&
        (operator.actions.assign ||
          (context.canForce() && operator.actions.assignWithOverride)),
    );
    row.operatorId = candidates.some(({ operator }) => operator.id === operatorId)
      ? operatorId
      : candidates[0]?.operator.id ?? "";
    row.error = row.operatorId ? "" : "Нет доступного оператора в команде";
  }

  function setReasonNote(value: string): void {
    if (mutating.value || unknownOutcome.value) return;
    reasonNote.value = value.slice(0, 500);
    error.value = "";
  }

  function buildItems(): SupportCaseAssignmentBatchItemRequestDto[] | null {
    if (!reasonNote.value.trim()) {
      error.value = "Добавьте общее обоснование пакетного назначения";
      return null;
    }
    if (!rows.value.length || rows.value.some((row) => !row.snapshot || row.error)) {
      error.value = "Разрешите ошибки по каждому Case перед отправкой пакета";
      return null;
    }
    const items = rows.value.map((row, index) => {
      const snapshot = row.snapshot!;
      const target = eligibleOperators(row).find(
        ({ team, operator }) =>
          team.id === row.teamId && operator.id === row.operatorId,
      );
      if (!target) return null;
      const force = !target.operator.actions.assign;
      if (force && (!context.canForce() || !target.operator.actions.assignWithOverride))
        return null;
      const required = new Set(target.operator.requiredOverrides);
      return {
        clientItemId: `item-${index + 1}`,
        caseId: row.caseId,
        teamId: target.team.id,
        operatorCmsUserId: target.operator.id,
        expectedCaseVersion: snapshot.caseVersion,
        caseReadToken: snapshot.caseReadToken,
        force,
        bypassAvailability: force && required.has("AVAILABILITY"),
        bypassCapacity: force && required.has("CAPACITY"),
        reasonCode: force ? "INCIDENT_RESPONSE" : "LEAD_INTERVENTION",
        reasonNote: reasonNote.value.trim(),
      } satisfies SupportCaseAssignmentBatchItemRequestDto;
    });
    if (items.some((item) => item === null)) {
      error.value = "Серверный catalog назначения изменился. Обновите пакет.";
      return null;
    }
    return items as SupportCaseAssignmentBatchItemRequestDto[];
  }

  async function applyResult(
    action: PendingBatch,
    value: SupportCaseAssignmentBatchResponseDto,
  ) {
    if (!actionScopeIsCurrent(action)) return;
    result.value = value;
    if (value.status === "PROCESSING" || value.outcome === "PENDING") {
      pending.value = action;
      unknownOutcome.value = true;
      return;
    }
    pending.value = null;
    unknownOutcome.value = false;
    await context.onChanged?.();
  }

  async function reconcileUnknownOutcome(
    action = pending.value,
  ): Promise<void> {
    if (!action || reconciling.value || !actionScopeIsCurrent(action)) return;
    reconciling.value = true;
    error.value = "";
    const controller = new AbortController();
    try {
      await applyResult(
        action,
        await source.lookupBatchOutcome(
          action.projectId,
          action.idempotencyKey,
          action.items,
          controller.signal,
        ),
      );
    } catch (cause) {
      if (!actionScopeIsCurrent(action)) return;
      if (
        cause instanceof ApiError &&
        cause.status === 404 &&
        cause.code === "ASSIGNMENT_BATCH_OUTCOME_NOT_FOUND"
      ) {
        error.value = "Результат пакета пока не найден. Проверьте ещё раз.";
      } else if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        reset();
        await context.onForbidden?.();
        return;
      } else {
        error.value = "Не удалось проверить пакет. Исходная команда не повторена.";
      }
      unknownOutcome.value = true;
    } finally {
      reconciling.value = false;
    }
  }

  async function submit(): Promise<void> {
    if (mutating.value || unknownOutcome.value) return;
    const projectId = context.projectId();
    const items = buildItems();
    if (!projectId || !items || !context.canOverride()) return;
    const action: PendingBatch = {
      generation,
      projectId,
      items,
      idempotencyKey:
        context.createIdempotencyKey?.() ?? globalThis.crypto.randomUUID(),
    };
    const controller = new AbortController();
    abort = controller;
    mutating.value = true;
    result.value = null;
    error.value = "";
    try {
      await applyResult(
        action,
        await source.executeBatch(
          projectId,
          items,
          action.idempotencyKey,
          controller.signal,
        ),
      );
    } catch (cause) {
      if (!actionScopeIsCurrent(action)) return;
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        reset();
        await context.onForbidden?.();
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 400 || cause.status === 409 || cause.status === 422)
      ) {
        error.value = "Сервер не принял пакет. Состав пакета сохранён.";
        return;
      }
      pending.value = action;
      unknownOutcome.value = true;
      error.value = "Результат пакета неизвестен. Проверяем серверный журнал…";
      await reconcileUnknownOutcome(action);
    } finally {
      mutating.value = false;
      abort = null;
    }
  }

  function reset(): void {
    generation += 1;
    abort?.abort();
    abort = null;
    rows.value = [];
    preparing.value = false;
    mutating.value = false;
    reconciling.value = false;
    error.value = "";
    reasonNote.value = "";
    result.value = null;
    unknownOutcome.value = false;
    pending.value = null;
  }

  return {
    rows,
    preparing,
    mutating,
    reconciling,
    error,
    reasonNote,
    result,
    unknownOutcome,
    hasAuthority,
    hasForceAuthority,
    readyCount,
    prepare,
    setTarget,
    setReasonNote,
    submit,
    reconcileUnknownOutcome,
    reset,
  };
}
