import { computed, ref, watchEffect } from "vue";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  ReleaseSupportCaseAssignmentDtoReasonCode,
  TransferSupportCaseAssignmentDtoReasonCode,
} from "@/shared/api/generated/models";
import type { SupportWorkspaceSelection } from "@/features/support-workspace/api/support-workspace-source";
import {
  SupportAssignmentIntegrityError,
  type SupportAssignmentIntent,
  type SupportAssignmentOffer,
  type SupportAssignmentOfferIntent,
  type SupportAssignmentSnapshot,
  type SupportAssignmentSource,
} from "@/features/support-case-assignment/api/support-assignment-source";
export type SupportAssignmentDraft =
  | { kind: "CLAIM"; teamId: string }
  | {
      kind: "RELEASE";
      reasonCode: ReleaseSupportCaseAssignmentDtoReasonCode;
      reasonNote?: string;
    }
  | {
      kind: "TRANSFER";
      teamId: string;
      operatorId: string;
      reasonCode: TransferSupportCaseAssignmentDtoReasonCode;
      reasonNote?: string;
    };

interface SupportAssignmentAction {
  projectId: string;
  intent: SupportAssignmentIntent;
  idempotencyKey: string;
}

interface SupportAssignmentOfferAction {
  projectId: string;
  intent: SupportAssignmentOfferIntent;
  idempotencyKey: string;
}

export interface SupportAssignmentContext {
  projectId(): string | undefined;
  selection(): SupportWorkspaceSelection | null;
  canManageOwn(): boolean;
  canOverride(): boolean;
  canReceiveOffers(): boolean;
  onForbidden?(): void | Promise<void>;
  onChanged?(): void | Promise<void>;
  createIdempotencyKey?(): string;
}

export function createSupportAssignmentController(
  source: SupportAssignmentSource,
  context: SupportAssignmentContext,
) {
  const caseSnapshot = ref<SupportAssignmentSnapshot | null>(null);
  const caseLoading = ref(false);
  const mutating = ref(false);
  const error = ref("");
  const unknownOutcome = ref(false);
  const draft = ref<SupportAssignmentDraft | null>(null);
  const pendingAction = ref<SupportAssignmentAction | null>(null);
  let caseGeneration = 0;
  let mutationGeneration = 0;
  const offers = ref<SupportAssignmentOffer[]>([]);
  const offerLoading = ref(false);
  const offerChangingId = ref<string | null>(null);
  const offerError = ref("");
  const offerUnknownOutcome = ref(false);
  const pendingOfferAction = ref<SupportAssignmentOfferAction | null>(null);
  let offerReadGeneration = 0;
  let offerActionGeneration = 0;
  let caseAbort: AbortController | null = null;
  let mutationAbort: AbortController | null = null;
  let offerReadAbort: AbortController | null = null;
  let offerActionAbort: AbortController | null = null;

  const currentCaseId = computed(() => context.selection()?.case?.id ?? null);
  const canClaim = computed(() => {
    const selection = context.selection();
    const snapshot = caseSnapshot.value;
    return Boolean(
      context.canManageOwn() &&
        selection?.capabilities.claimAssignment &&
        snapshot &&
        selection.case?.id === snapshot.caseId &&
        snapshot.assignmentState === "UNASSIGNED" &&
        snapshot.currentAssignment === null &&
        snapshot.actions.claim &&
        snapshot.teams.some((team) => team.actions.claim),
    );
  });
  const currentAssignmentMatches = computed(() => {
    const selected = context.selection()?.case?.assignment;
    const current = caseSnapshot.value?.currentAssignment;
    return Boolean(
      selected &&
        current &&
        selected.id === current.id &&
        selected.version === current.version &&
        selected.actionEtag === current.actionEtag,
    );
  });
  const canRelease = computed(() => {
    const selection = context.selection();
    const snapshot = caseSnapshot.value;
    return Boolean(
      (context.canManageOwn() || context.canOverride()) &&
        selection?.capabilities.releaseAssignment &&
        snapshot?.assignmentState === "ASSIGNED" &&
        snapshot.actions.release &&
        currentAssignmentMatches.value,
    );
  });
  const canTransfer = computed(() => {
    const selection = context.selection();
    const snapshot = caseSnapshot.value;
    return Boolean(
      context.canOverride() &&
        selection?.capabilities.transferAssignment &&
        snapshot?.assignmentState === "ASSIGNED" &&
        snapshot.actions.transfer &&
        currentAssignmentMatches.value &&
        snapshot.teams.some(
          (team) =>
            team.actions.transfer &&
            team.operators.some((operator) => operator.actions.transfer),
        ),
    );
  });

  async function loadCase(): Promise<void> {
    const projectId = context.projectId();
    const caseId = currentCaseId.value;
    caseAbort?.abort();
    const requestGeneration = ++caseGeneration;
    caseSnapshot.value = null;
    error.value = "";
    if (!projectId || !caseId || (!context.canManageOwn() && !context.canOverride())) {
      caseLoading.value = false;
      caseAbort = null;
      return;
    }
    const controller = new AbortController();
    caseAbort = controller;
    caseLoading.value = true;
    try {
      const value = await source.readCase(projectId, caseId, controller.signal);
      if (
        requestGeneration === caseGeneration &&
        context.projectId() === projectId &&
        currentCaseId.value === caseId
      )
        caseSnapshot.value = value;
    } catch (cause) {
      if (requestGeneration !== caseGeneration) return;
      caseSnapshot.value = null;
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        draft.value = null;
        pendingAction.value = null;
        unknownOutcome.value = false;
        error.value = "";
        await context.onForbidden?.();
        return;
      }
      error.value = "Не удалось загрузить доступные действия с назначением";
    } finally {
      if (requestGeneration === caseGeneration) {
        caseLoading.value = false;
        caseAbort = null;
      }
    }
  }

  function setDraft(value: SupportAssignmentDraft | null): void {
    if (mutating.value || unknownOutcome.value) return;
    draft.value = value;
    error.value = "";
  }

  function captureAction(): SupportAssignmentAction | null {
    const projectId = context.projectId();
    const value = draft.value;
    const snapshot = caseSnapshot.value;
    if (!projectId || !value || !snapshot) return null;
    let intent: SupportAssignmentIntent;
    if (value.kind === "CLAIM") {
      if (!canClaim.value) return null;
      const team = snapshot.teams.find(
        (candidate) =>
          candidate.id === value.teamId && candidate.actions.claim,
      );
      if (!team) return null;
      intent = { kind: "CLAIM", snapshot, teamId: team.id };
    } else if (value.kind === "RELEASE") {
      if (!canRelease.value) return null;
      intent = {
        kind: "RELEASE",
        snapshot,
        reasonCode: value.reasonCode,
        ...(value.reasonNote?.trim()
          ? { reasonNote: value.reasonNote.trim() }
          : {}),
      };
    } else {
      if (!canTransfer.value) return null;
      const team = snapshot.teams.find(
        (candidate) =>
          candidate.id === value.teamId && candidate.actions.transfer,
      );
      const operator = team?.operators.find(
        (candidate) =>
          candidate.id === value.operatorId && candidate.actions.transfer,
      );
      if (!team || !operator) return null;
      intent = {
        kind: "TRANSFER",
        snapshot,
        teamId: team.id,
        operatorId: operator.id,
        reasonCode: value.reasonCode,
        ...(value.reasonNote?.trim()
          ? { reasonNote: value.reasonNote.trim() }
          : {}),
      };
    }
    return {
      projectId,
      intent,
      idempotencyKey:
        context.createIdempotencyKey?.() ?? globalThis.crypto.randomUUID(),
    };
  }

  function currentActionScopeStillAllowed(action: SupportAssignmentAction): boolean {
    const hasPermission =
      action.intent.kind === "CLAIM"
        ? context.canManageOwn()
        : action.intent.kind === "TRANSFER"
          ? context.canOverride()
          : context.canManageOwn() || context.canOverride();
    return (
      context.projectId() === action.projectId &&
      context.selection()?.case?.id === action.intent.snapshot.caseId &&
      hasPermission
    );
  }

  function capturedActionStillCurrent(action: SupportAssignmentAction): boolean {
    if (!currentActionScopeStillAllowed(action)) return false;
    const intent = action.intent;
    const selection = context.selection();
    const selectedCase = selection?.case;
    const snapshot = caseSnapshot.value;
    if (
      !selection ||
      !selectedCase ||
      !snapshot ||
      snapshot.caseId !== intent.snapshot.caseId ||
      snapshot.caseVersion !== intent.snapshot.caseVersion
    )
      return false;
    if (intent.kind === "CLAIM") {
      const team = snapshot.teams.find(
        (candidate) => candidate.id === intent.teamId,
      );
      return (
        selection.capabilities.claimAssignment &&
        selectedCase.version === intent.snapshot.caseVersion &&
        selectedCase.assignment === null &&
        snapshot.assignmentState === "UNASSIGNED" &&
        snapshot.currentAssignment === null &&
        snapshot.actions.claim &&
        team?.actions.claim === true
      );
    }
    const captured = intent.snapshot.currentAssignment;
    const current = selectedCase.assignment;
    const currentSnapshotAssignment = snapshot.currentAssignment;
    const capability =
      intent.kind === "RELEASE"
        ? selection.capabilities.releaseAssignment
        : selection.capabilities.transferAssignment;
    const assignmentStillCurrent = Boolean(
      capability &&
        captured &&
        current &&
        currentSnapshotAssignment &&
        current.id === captured.id &&
        current.version === captured.version &&
        current.actionEtag === captured.actionEtag &&
        currentSnapshotAssignment.id === captured.id &&
        currentSnapshotAssignment.version === captured.version &&
        currentSnapshotAssignment.actionEtag === captured.actionEtag,
    );
    if (!assignmentStillCurrent) return false;
    if (intent.kind === "RELEASE") return snapshot.actions.release;
    const team = snapshot.teams.find(
      (candidate) => candidate.id === intent.teamId,
    );
    const operator = team?.operators.find(
      (candidate) => candidate.id === intent.operatorId,
    );
    return Boolean(
      snapshot.actions.transfer &&
        team?.actions.transfer &&
        operator?.actions.transfer,
    );
  }

  const canRetry = computed(() => {
    const action = pendingAction.value;
    return Boolean(
      unknownOutcome.value && action && capturedActionStillCurrent(action),
    );
  });

  watchEffect(() => {
    const action = pendingAction.value;
    if (!unknownOutcome.value || !action || capturedActionStillCurrent(action))
      return;
    pendingAction.value = null;
    unknownOutcome.value = false;
    error.value = "Полномочия назначения изменились. Повтор запроса заблокирован.";
  });

  function currentOfferStillCurrent(
    action: SupportAssignmentOfferAction,
    at = Date.now(),
  ): boolean {
    if (
      context.projectId() !== action.projectId ||
      !context.canReceiveOffers()
    )
      return false;
    const currentOffer = offers.value.find(
      (offer) => offer.assignmentId === action.intent.offer.assignmentId,
    );
    return Boolean(
      currentOffer &&
        currentOffer.assignmentVersion === action.intent.offer.assignmentVersion &&
        currentOffer.actionEtag === action.intent.offer.actionEtag &&
        currentOffer.offerToken === action.intent.offer.offerToken &&
        Date.parse(currentOffer.expiresAt) > at,
    );
  }

  const offerCanRetry = computed(() => {
    const action = pendingOfferAction.value;
    return Boolean(
      offerUnknownOutcome.value && action && currentOfferStillCurrent(action),
    );
  });

  watchEffect(() => {
    const action = pendingOfferAction.value;
    if (
      !offerUnknownOutcome.value ||
      !action ||
      currentOfferStillCurrent(action)
    )
      return;
    pendingOfferAction.value = null;
    offerUnknownOutcome.value = false;
    offerError.value =
      "Предложение или полномочия изменились. Повтор запроса заблокирован.";
  });

  function expireOffers(at = Date.now()): void {
    const activeOffers = offers.value.filter(
      (offer) => Date.parse(offer.expiresAt) > at,
    );
    if (activeOffers.length !== offers.value.length) offers.value = activeOffers;
    const action = pendingOfferAction.value;
    if (
      offerUnknownOutcome.value &&
      action &&
      !currentOfferStillCurrent(action, at)
    ) {
      pendingOfferAction.value = null;
      offerUnknownOutcome.value = false;
      offerError.value = "Срок предложения истёк. Повтор запроса заблокирован.";
    }
  }

  async function execute(action: SupportAssignmentAction): Promise<void> {
    const projectId = action.projectId;
    if (!capturedActionStillCurrent(action)) return;
    mutationAbort?.abort();
    const requestGeneration = ++mutationGeneration;
    const controller = new AbortController();
    mutationAbort = controller;
    mutating.value = true;
    error.value = "";
    let commandKnown = false;
    try {
      const receipt = await source.execute(
        projectId,
        action.intent,
        action.idempotencyKey,
        controller.signal,
      );
      if (
        requestGeneration !== mutationGeneration ||
        !currentActionScopeStillAllowed(action)
      )
        return;
      const expectedIntent =
        action.intent.kind === "CLAIM"
          ? "CLAIM_CASE_ASSIGNMENT"
          : action.intent.kind === "RELEASE"
            ? "RELEASE_CASE_ASSIGNMENT"
            : "TRANSFER_CASE_ASSIGNMENT";
      if (
        receipt.caseId !== action.intent.snapshot.caseId ||
        receipt.intent !== expectedIntent
      ) {
        error.value = "Сервер вернул результат другого действия. Обновите Case.";
        return;
      }
      commandKnown = true;
      pendingAction.value = null;
      unknownOutcome.value = false;
      draft.value = null;
      await context.onChanged?.();
    } catch (cause) {
      if (
        requestGeneration !== mutationGeneration ||
        !currentActionScopeStillAllowed(action)
      )
        return;
      if (commandKnown) {
        pendingAction.value = null;
        unknownOutcome.value = false;
        draft.value = null;
        error.value =
          "Назначение выполнено, но обновить рабочее место не удалось. Обновите данные.";
        return;
      }
      if (cause instanceof SupportAssignmentIntegrityError) {
        pendingAction.value = null;
        unknownOutcome.value = false;
        await Promise.resolve(context.onChanged?.()).catch(() => undefined);
        await loadCase().catch(() => undefined);
        if (currentActionScopeStillAllowed(action))
          error.value =
            "Ответ сервера не прошёл проверку. Данные обновлены; повтор заблокирован.";
        return;
      }
      if (cause instanceof ApiError && cause.status === 409) {
        const preservedDraft = draft.value;
        pendingAction.value = null;
        unknownOutcome.value = false;
        await Promise.resolve(context.onChanged?.()).catch(() => undefined);
        await loadCase().catch(() => undefined);
        const scopeStillCurrent = currentActionScopeStillAllowed(action);
        if (scopeStillCurrent && preservedDraft)
          draft.value = preservedDraft;
        if (scopeStillCurrent)
          error.value = "Назначение уже изменилось. Данные обновлены по серверному снимку.";
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        resetCase();
        await Promise.resolve(context.onForbidden?.()).catch(() => undefined);
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 400 || cause.status === 422)
      ) {
        pendingAction.value = null;
        unknownOutcome.value = false;
        error.value = "Сервер не принял действие с назначением.";
        return;
      }
      pendingAction.value = action;
      unknownOutcome.value = true;
      error.value = "Результат назначения неизвестен. Повтор отправит тот же запрос.";
    } finally {
      if (requestGeneration === mutationGeneration) {
        mutating.value = false;
        mutationAbort = null;
      }
    }
  }

  async function submit(): Promise<void> {
    if (mutating.value || unknownOutcome.value) return;
    const action = captureAction();
    if (action) await execute(action);
  }

  async function retryUnknownOutcome(): Promise<void> {
    if (!pendingAction.value || mutating.value || !unknownOutcome.value) return;
    if (!capturedActionStillCurrent(pendingAction.value)) {
      pendingAction.value = null;
      unknownOutcome.value = false;
      error.value =
        "Назначение изменилось. Повтор старого запроса заблокирован.";
      return;
    }
    await execute(pendingAction.value);
  }

  async function loadOffers(
    options: { allowDuringAction?: boolean } = {},
  ): Promise<void> {
    if (offerChangingId.value && !options.allowDuringAction) return;
    const projectId = context.projectId();
    offerReadAbort?.abort();
    const requestGeneration = ++offerReadGeneration;
    offerError.value = "";
    if (!projectId || !context.canReceiveOffers()) {
      offers.value = [];
      offerLoading.value = false;
      offerReadAbort = null;
      return;
    }
    const controller = new AbortController();
    offerReadAbort = controller;
    offerLoading.value = true;
    try {
      const value = await source.listOffers(projectId, controller.signal);
      if (
        requestGeneration === offerReadGeneration &&
        context.projectId() === projectId &&
        context.canReceiveOffers()
      )
        offers.value = value;
    } catch (cause) {
      if (requestGeneration !== offerReadGeneration) return;
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        offers.value = [];
        pendingOfferAction.value = null;
        offerUnknownOutcome.value = false;
        await context.onForbidden?.();
        return;
      }
      offerError.value = "Не удалось загрузить предложения назначений";
    } finally {
      if (requestGeneration === offerReadGeneration) {
        offerLoading.value = false;
        offerReadAbort = null;
      }
    }
  }

  async function executeOffer(action: SupportAssignmentOfferAction): Promise<void> {
    const projectId = action.projectId;
    if (context.projectId() !== projectId || !context.canReceiveOffers()) return;
    offerActionAbort?.abort();
    const requestGeneration = ++offerActionGeneration;
    const controller = new AbortController();
    offerActionAbort = controller;
    offerChangingId.value = action.intent.offer.assignmentId;
    offerError.value = "";
    let commandKnown = false;
    try {
      await source.actOnOffer(
        projectId,
        action.intent,
        action.idempotencyKey,
        controller.signal,
      );
      if (
        requestGeneration !== offerActionGeneration ||
        context.projectId() !== projectId ||
        !context.canReceiveOffers()
      )
        return;
      commandKnown = true;
      pendingOfferAction.value = null;
      offerUnknownOutcome.value = false;
      offers.value = offers.value.filter(
        (offer) => offer.assignmentId !== action.intent.offer.assignmentId,
      );
      await loadOffers({ allowDuringAction: true });
      await context.onChanged?.();
    } catch (cause) {
      if (
        requestGeneration !== offerActionGeneration ||
        context.projectId() !== projectId
      )
        return;
      if (commandKnown) {
        pendingOfferAction.value = null;
        offerUnknownOutcome.value = false;
        offerError.value =
          "Действие выполнено, но обновить рабочее место не удалось. Обновите данные.";
        return;
      }
      if (cause instanceof SupportAssignmentIntegrityError) {
        pendingOfferAction.value = null;
        offerUnknownOutcome.value = false;
        offers.value = offers.value.filter(
          (offer) => offer.assignmentId !== action.intent.offer.assignmentId,
        );
        await loadOffers({ allowDuringAction: true });
        await Promise.resolve(context.onChanged?.()).catch(() => undefined);
        offerError.value =
          "Ответ сервера не прошёл проверку. Повтор действия заблокирован.";
        return;
      }
      if (cause instanceof ApiError && cause.status === 409) {
        pendingOfferAction.value = null;
        offerUnknownOutcome.value = false;
        offers.value = offers.value.filter(
          (offer) => offer.assignmentId !== action.intent.offer.assignmentId,
        );
        await loadOffers({ allowDuringAction: true });
        offerError.value = "Предложение больше не актуально. Список обновлён.";
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 403 || cause.status === 404)
      ) {
        offers.value = [];
        pendingOfferAction.value = null;
        offerUnknownOutcome.value = false;
        await context.onForbidden?.();
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 400 || cause.status === 422)
      ) {
        pendingOfferAction.value = null;
        offerUnknownOutcome.value = false;
        offerError.value = "Сервер не принял действие по предложению.";
        return;
      }
      pendingOfferAction.value = action;
      offerUnknownOutcome.value = true;
      offerError.value = "Результат действия неизвестен. Повтор отправит тот же запрос.";
    } finally {
      if (requestGeneration === offerActionGeneration) {
        offerChangingId.value = null;
        offerActionAbort = null;
      }
    }
  }

  async function actOnOffer(
    assignmentId: string,
    kind: SupportAssignmentOfferIntent["kind"],
  ): Promise<void> {
    if (
      offerLoading.value ||
      offerChangingId.value ||
      offerUnknownOutcome.value ||
      !context.canReceiveOffers()
    )
      return;
    const offer = offers.value.find((item) => item.assignmentId === assignmentId);
    if (!offer) return;
    const projectId = context.projectId();
    if (!projectId) return;
    await executeOffer({
      projectId,
      intent: { kind, offer },
      idempotencyKey:
        context.createIdempotencyKey?.() ?? globalThis.crypto.randomUUID(),
    });
  }

  async function retryUnknownOfferOutcome(): Promise<void> {
    if (
      !pendingOfferAction.value ||
      offerChangingId.value ||
      !offerUnknownOutcome.value
    )
      return;
    const action = pendingOfferAction.value;
    if (!currentOfferStillCurrent(action)) {
      pendingOfferAction.value = null;
      offerUnknownOutcome.value = false;
      offerError.value =
        "Предложение изменилось. Повтор старого запроса заблокирован.";
      return;
    }
    await executeOffer(action);
  }

  function resetCase(): void {
    caseGeneration += 1;
    mutationGeneration += 1;
    caseAbort?.abort();
    mutationAbort?.abort();
    caseAbort = null;
    mutationAbort = null;
    caseSnapshot.value = null;
    caseLoading.value = false;
    mutating.value = false;
    error.value = "";
    unknownOutcome.value = false;
    draft.value = null;
    pendingAction.value = null;
  }

  function resetOffers(): void {
    offerReadGeneration += 1;
    offerActionGeneration += 1;
    offerReadAbort?.abort();
    offerActionAbort?.abort();
    offerReadAbort = null;
    offerActionAbort = null;
    offers.value = [];
    offerLoading.value = false;
    offerChangingId.value = null;
    offerError.value = "";
    offerUnknownOutcome.value = false;
    pendingOfferAction.value = null;
  }

  function reset(): void {
    resetCase();
    resetOffers();
  }

  return {
    caseSnapshot,
    caseLoading,
    mutating,
    error,
    unknownOutcome,
    draft,
    canRetry,
    canClaim,
    canRelease,
    canTransfer,
    loadCase,
    setDraft,
    submit,
    retryUnknownOutcome,
    offers,
    offerLoading,
    offerChangingId,
    offerError,
    offerUnknownOutcome,
    offerCanRetry,
    expireOffers,
    loadOffers,
    actOnOffer,
    retryUnknownOfferOutcome,
    resetCase,
    resetOffers,
    reset,
  };
}
