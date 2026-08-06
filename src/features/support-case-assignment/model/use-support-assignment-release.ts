import { computed, ref } from "vue";
import type { ReleaseSupportCaseAssignmentDtoReasonCode } from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import type { SupportWorkspaceSelection } from "@/features/support-workspace/api/support-workspace-source";
import { SupportAssignmentReleaseReceiptError } from "@/features/support-case-assignment/api/support-assignment-release-source";
import type {
  SupportAssignmentReleaseIntent,
  SupportAssignmentReleaseSource,
} from "@/features/support-case-assignment/api/support-assignment-release-source";

export interface SupportAssignmentReleaseContext {
  projectId(): string | undefined;
  selection(): SupportWorkspaceSelection | null;
  canRelease(): boolean;
  onForbidden?(): void | Promise<void>;
  onChanged?(): void | Promise<void>;
  createIdempotencyKey?(): string;
}

export interface SupportAssignmentReleaseInput {
  reasonCode: ReleaseSupportCaseAssignmentDtoReasonCode;
  reasonNote?: string;
}

interface SupportAssignmentReleaseAction {
  intent: SupportAssignmentReleaseIntent;
  idempotencyKey: string;
}

function isReleaseAllowed(
  selection: SupportWorkspaceSelection | null,
): selection is SupportWorkspaceSelection & {
  case: NonNullable<SupportWorkspaceSelection["case"]> & {
    assignment: NonNullable<NonNullable<SupportWorkspaceSelection["case"]>["assignment"]>;
  };
} {
  return Boolean(
    selection?.capabilities.releaseAssignment && selection.case?.assignment,
  );
}

/**
 * Releases exactly the assignment authorized by the current selection. It
 * never derives authority from an inbox row, a historic selection or UI state.
 */
export function createSupportAssignmentReleaseController(
  context: SupportAssignmentReleaseContext,
  source: SupportAssignmentReleaseSource,
) {
  const releasing = ref(false);
  const error = ref("");
  const unknownOutcome = ref(false);
  const completed = ref(false);
  const pendingAction = ref<SupportAssignmentReleaseAction | null>(null);
  const canRetry = computed(
    () => unknownOutcome.value && pendingAction.value !== null,
  );
  let generation = 0;
  let abort: AbortController | null = null;

  function reset(): void {
    generation += 1;
    abort?.abort();
    abort = null;
    releasing.value = false;
    error.value = "";
    unknownOutcome.value = false;
    completed.value = false;
    pendingAction.value = null;
  }

  function currentIntent(
    input: SupportAssignmentReleaseInput,
  ): SupportAssignmentReleaseIntent | null {
    const selection = context.selection();
    if (!context.canRelease() || !isReleaseAllowed(selection)) return null;
    const { case: supportCase } = selection;
    const { assignment } = supportCase;
    const reasonNote = input.reasonNote?.trim();
    return {
      caseId: supportCase.id,
      assignmentId: assignment.id,
      expectedAssignmentVersion: assignment.version,
      actionEtag: assignment.actionEtag,
      reasonCode: input.reasonCode,
      ...(reasonNote ? { reasonNote } : {}),
    };
  }

  function stillAuthorized(
    projectId: string,
    action: SupportAssignmentReleaseAction,
    requestGeneration: number,
  ): boolean {
    const selection = context.selection();
    if (!context.canRelease() || !isReleaseAllowed(selection)) return false;
    const { case: supportCase } = selection;
    const { assignment } = supportCase;
    return (
      requestGeneration === generation &&
      context.projectId() === projectId &&
      supportCase.id === action.intent.caseId &&
      assignment.id === action.intent.assignmentId &&
      assignment.version === action.intent.expectedAssignmentVersion &&
      assignment.actionEtag === action.intent.actionEtag
    );
  }

  async function reconcileStale(
    projectId: string,
    action: SupportAssignmentReleaseAction,
    requestGeneration: number,
  ): Promise<void> {
    try {
      await context.onChanged?.();
      if (stillAuthorized(projectId, action, requestGeneration))
        error.value = "Назначение уже изменилось. Контекст обновлён по серверному снимку.";
    } catch {
      if (stillAuthorized(projectId, action, requestGeneration))
        error.value = "Назначение уже изменилось. Не удалось обновить контекст диалога.";
    }
  }

  async function reconcileUnexpectedResult(
    projectId: string,
    action: SupportAssignmentReleaseAction,
    requestGeneration: number,
  ): Promise<void> {
    let refreshed = true;
    try {
      await context.onChanged?.();
    } catch {
      // The command is intentionally not replayed from an invalid receipt.
      refreshed = false;
    }
    if (stillAuthorized(projectId, action, requestGeneration))
      error.value = refreshed
        ? "Сервер вернул некорректный результат. Контекст Case обновлён."
        : "Сервер вернул некорректный результат. Не удалось обновить контекст Case.";
  }

  async function submit(action: SupportAssignmentReleaseAction): Promise<void> {
    const projectId = context.projectId();
    if (!projectId || !stillAuthorized(projectId, action, generation)) return;
    abort?.abort();
    const requestGeneration = ++generation;
    const controller = new AbortController();
    abort = controller;
    releasing.value = true;
    error.value = "";
    completed.value = false;
    try {
      const receipt = await source.release(
        projectId,
        action.intent,
        action.idempotencyKey,
        controller.signal,
      );
      if (!stillAuthorized(projectId, action, requestGeneration)) return;
      if (
        receipt.assignmentId !== action.intent.assignmentId ||
        receipt.caseId !== action.intent.caseId
      ) {
        pendingAction.value = null;
        unknownOutcome.value = false;
        await reconcileUnexpectedResult(projectId, action, requestGeneration);
        return;
      }
      pendingAction.value = null;
      unknownOutcome.value = false;
      completed.value = true;
      try {
        await context.onChanged?.();
      } catch {
        if (stillAuthorized(projectId, action, requestGeneration))
          error.value = "Назначение уже снято, но не удалось обновить контекст диалога.";
      }
    } catch (cause) {
      if (!stillAuthorized(projectId, action, requestGeneration)) return;
      if (
        cause instanceof ApiError && (cause.status === 403 || cause.status === 404)
      ) {
        // A concealed or denied command makes the old target capability unsafe.
        // Do not leave it mounted while a background selection reconcile might fail.
        reset();
        await context.onForbidden?.();
        return;
      }
      if (cause instanceof SupportAssignmentReleaseReceiptError) {
        pendingAction.value = null;
        unknownOutcome.value = false;
        await reconcileUnexpectedResult(projectId, action, requestGeneration);
        return;
      }
      if (cause instanceof ApiError && cause.status === 409) {
        pendingAction.value = null;
        unknownOutcome.value = false;
        await reconcileStale(projectId, action, requestGeneration);
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 400 || cause.status === 422)
      ) {
        pendingAction.value = null;
        unknownOutcome.value = false;
        error.value = "Сервер не принял снятие назначения. Проверьте причину и обновите Case.";
        return;
      }
      pendingAction.value = action;
      unknownOutcome.value = true;
      error.value = "Результат снятия назначения неизвестен. Повтор отправит тот же запрос.";
    } finally {
      if (requestGeneration === generation) {
        releasing.value = false;
        abort = null;
      }
    }
  }

  async function release(input: SupportAssignmentReleaseInput): Promise<void> {
    if (releasing.value || unknownOutcome.value || completed.value) return;
    const intent = currentIntent(input);
    if (!intent) return;
    await submit({
      intent,
      idempotencyKey:
        context.createIdempotencyKey?.() ?? globalThis.crypto.randomUUID(),
    });
  }

  async function retryUnknownOutcome(): Promise<void> {
    if (!pendingAction.value || releasing.value || !unknownOutcome.value) return;
    await submit(pendingAction.value);
  }

  return {
    releasing,
    error,
    unknownOutcome,
    completed,
    canRetry,
    release,
    retryUnknownOutcome,
    reset,
  };
}
