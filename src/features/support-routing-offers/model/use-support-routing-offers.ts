import { computed, ref } from "vue";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportRoutingOffer,
  SupportRoutingOfferAction,
  SupportRoutingOfferActionKind,
  SupportRoutingOfferSource,
} from "@/features/support-routing-offers/api/support-routing-offer-source";

export interface SupportRoutingOffersContext {
  projectId(): string | undefined;
  canManage(): boolean;
  onForbidden?(): void | Promise<void>;
  onChanged?(): void | Promise<void>;
  createIdempotencyKey?(): string;
}

/** Owns private, actor-bound routing offers and one replay-safe action intent. */
export function createSupportRoutingOffersController(
  context: SupportRoutingOffersContext,
  source: SupportRoutingOfferSource,
) {
  const offers = ref<SupportRoutingOffer[]>([]);
  const loading = ref(false);
  const changingOfferId = ref<string | null>(null);
  const error = ref("");
  const unknownOutcome = ref(false);
  const lastOutcome = ref<SupportRoutingOfferActionKind | null>(null);
  const pendingAction = ref<SupportRoutingOfferAction | null>(null);
  const canRetry = computed(
    () => unknownOutcome.value && pendingAction.value !== null,
  );
  let readGeneration = 0;
  let actionGeneration = 0;
  let readAbort: AbortController | null = null;
  let actionAbort: AbortController | null = null;

  function reset(): void {
    readGeneration += 1;
    actionGeneration += 1;
    readAbort?.abort();
    actionAbort?.abort();
    readAbort = null;
    actionAbort = null;
    offers.value = [];
    loading.value = false;
    changingOfferId.value = null;
    error.value = "";
    unknownOutcome.value = false;
    lastOutcome.value = null;
    pendingAction.value = null;
  }

  function isCurrent(projectId: string, generation: number): boolean {
    return (
      generation === readGeneration &&
      context.canManage() &&
      context.projectId() === projectId
    );
  }

  function isCurrentAction(projectId: string, generation: number): boolean {
    return (
      generation === actionGeneration &&
      context.canManage() &&
      context.projectId() === projectId
    );
  }

  function isAccessLost(cause: unknown): boolean {
    return (
      cause instanceof ApiError && (cause.status === 403 || cause.status === 404)
    );
  }

  function removeOffer(assignmentId: string): void {
    offers.value = offers.value.filter(
      (offer) => offer.assignmentId !== assignmentId,
    );
  }

  function invalidateRead(): void {
    readGeneration += 1;
    readAbort?.abort();
    readAbort = null;
    loading.value = false;
  }

  async function load(
    options: { allowDuringAction?: boolean } = {},
  ): Promise<void> {
    if (changingOfferId.value && !options.allowDuringAction) return;
    const projectId = context.projectId();
    readAbort?.abort();
    const requestGeneration = ++readGeneration;
    const abort = new AbortController();
    readAbort = abort;
    error.value = "";
    if (!projectId || !context.canManage()) {
      loading.value = false;
      readAbort = null;
      return;
    }

    loading.value = true;
    try {
      const result = await source.list(projectId, abort.signal);
      if (!isCurrent(projectId, requestGeneration)) return;
      offers.value = result;
    } catch (cause) {
      if (!isCurrent(projectId, requestGeneration)) return;
      if (isAccessLost(cause)) {
        reset();
        await context.onForbidden?.();
        return;
      }
      error.value = "Не удалось загрузить предложения назначений";
    } finally {
      if (requestGeneration === readGeneration) {
        loading.value = false;
        readAbort = null;
      }
    }
  }

  function createAction(
    offer: SupportRoutingOffer,
    kind: SupportRoutingOfferActionKind,
  ): SupportRoutingOfferAction {
    return {
      offer,
      kind,
      idempotencyKey:
        context.createIdempotencyKey?.() ?? globalThis.crypto.randomUUID(),
    };
  }

  async function submit(action: SupportRoutingOfferAction): Promise<void> {
    const projectId = context.projectId();
    if (!projectId || !context.canManage()) return;
    actionAbort?.abort();
    invalidateRead();
    const requestGeneration = ++actionGeneration;
    const abort = new AbortController();
    actionAbort = abort;
    changingOfferId.value = action.offer.assignmentId;
    error.value = "";
    lastOutcome.value = null;
    let isKnownOutcome = false;
    try {
      const receipt = await source.act(projectId, action, abort.signal);
      if (!isCurrentAction(projectId, requestGeneration)) return;
      if (
        receipt.assignmentId !== action.offer.assignmentId ||
        receipt.outcome !== (action.kind === "ACCEPT" ? "ACCEPTED" : "DECLINED")
      ) {
        error.value = "Предложение вернуло ответ другой операции. Обновите список.";
        return;
      }
      removeOffer(action.offer.assignmentId);
      pendingAction.value = null;
      unknownOutcome.value = false;
      lastOutcome.value = action.kind;
      isKnownOutcome = true;
    } catch (cause) {
      if (!isCurrentAction(projectId, requestGeneration)) return;
      if (isAccessLost(cause)) {
        removeOffer(action.offer.assignmentId);
        pendingAction.value = null;
        unknownOutcome.value = false;
        await load({ allowDuringAction: true });
        if (isCurrentAction(projectId, requestGeneration))
          error.value = "Предложение больше не актуально. Список обновлён по серверному снимку.";
        return;
      }
      if (cause instanceof ApiError && cause.status === 409) {
        pendingAction.value = null;
        unknownOutcome.value = false;
        await load({ allowDuringAction: true });
        if (isCurrentAction(projectId, requestGeneration))
          error.value = "Предложение уже изменилось. Список обновлён по серверному снимку.";
        return;
      }
      if (
        cause instanceof ApiError &&
        (cause.status === 400 || cause.status === 422)
      ) {
        pendingAction.value = null;
        unknownOutcome.value = false;
        error.value = "Сервер не принял действие по предложению. Обновите список.";
        return;
      }
      pendingAction.value = action;
      unknownOutcome.value = true;
      error.value = "Результат действия неизвестен. Повтор отправит тот же запрос.";
    } finally {
      if (requestGeneration === actionGeneration) {
        changingOfferId.value = null;
        actionAbort = null;
      }
    }
    if (isKnownOutcome && isCurrentAction(projectId, requestGeneration))
      await reconcileKnownOutcome(projectId, requestGeneration);
  }

  async function reconcileKnownOutcome(
    projectId: string,
    requestGeneration: number,
  ): Promise<void> {
    await load({ allowDuringAction: true });
    if (!isCurrentAction(projectId, requestGeneration)) return;
    if (error.value) {
      error.value = "Действие уже выполнено, но не удалось обновить список предложений.";
      return;
    }
    try {
      await context.onChanged?.();
    } catch {
      if (isCurrentAction(projectId, requestGeneration))
        error.value = "Действие уже выполнено, но не удалось обновить контекст диалога.";
    }
  }

  async function act(
    assignmentId: string,
    kind: SupportRoutingOfferActionKind,
  ): Promise<void> {
    if (
      changingOfferId.value ||
      loading.value ||
      unknownOutcome.value ||
      !context.canManage()
    )
      return;
    const offer = offers.value.find((item) => item.assignmentId === assignmentId);
    if (!offer) return;
    await submit(createAction(offer, kind));
  }

  async function retryUnknownOutcome(): Promise<void> {
    if (!pendingAction.value || changingOfferId.value || !unknownOutcome.value)
      return;
    await submit(pendingAction.value);
  }

  return {
    offers,
    loading,
    changingOfferId,
    error,
    unknownOutcome,
    lastOutcome,
    canRetry,
    load,
    act,
    retryUnknownOutcome,
    reset,
  };
}
