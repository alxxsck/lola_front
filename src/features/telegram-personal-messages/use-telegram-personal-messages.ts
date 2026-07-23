import { ref } from "vue";
import type {
  TelegramPersonalMessageDetailResponseDto,
  TelegramPersonalMessageListResponseDto,
  TelegramPersonalMessageResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import {
  telegramPersonalCreateErrorLabel,
  telegramPersonalSafeErrorPolicy,
  terminalTelegramPersonalStatus,
  type TelegramPersonalDraft,
  type TelegramPersonalLinkStatus,
} from "./telegram-personal-message.model";

export interface TelegramPersonalMessageRequestOptions {
  signal: AbortSignal;
  onUploadProgress?: (progress: number) => void;
}

export interface TelegramPersonalMessagesApi {
  list(
    projectId: string,
    endUserId: string,
    options: { signal: AbortSignal; limit?: number; cursor?: string },
  ): Promise<TelegramPersonalMessageListResponseDto>;
  create(
    projectId: string,
    endUserId: string,
    draft: TelegramPersonalDraft,
    idempotencyKey: string,
    options: TelegramPersonalMessageRequestOptions,
  ): Promise<TelegramPersonalMessageResponseDto>;
  get(
    projectId: string,
    endUserId: string,
    messageId: string,
    options: { signal: AbortSignal },
  ): Promise<TelegramPersonalMessageDetailResponseDto>;
}

export interface TelegramPersonalMessagesContext {
  visible: boolean;
  projectId: string;
  endUserId: string | null;
  canSend: boolean;
  linkStatus: TelegramPersonalLinkStatus;
}

interface Intent {
  key: string;
  draft: TelegramPersonalDraft;
}

const EMPTY_CONTEXT: TelegramPersonalMessagesContext = {
  visible: false,
  projectId: "",
  endUserId: null,
  canSend: false,
  linkStatus: "UNLINKED",
};

const POLL_DELAYS = [500, 1_000, 2_000, 3_000, 5_000] as const;
const MAX_POLLS = 20;
const STATUS_PRECEDENCE: Record<
  TelegramPersonalMessageResponseDto["status"],
  number
> = {
  QUEUED: 0,
  SENDING: 1,
  RETRY_WAIT: 2,
  SENT: 3,
  FAILED_PERMANENT: 3,
  OUTCOME_UNKNOWN: 3,
  CANCELLED: 3,
};

export function createTelegramPersonalMessagesController(options: {
  api: TelegramPersonalMessagesApi;
  idempotencyKey?: () => string;
  onLinkStateStale?: () => void;
}) {
  const history = ref<TelegramPersonalMessageResponseDto[]>([]);
  const activeMessage = ref<TelegramPersonalMessageResponseDto | null>(null);
  const historyLoading = ref(false);
  const submitting = ref(false);
  const polling = ref(false);
  const uploadProgress = ref(0);
  const error = ref("");
  const feedback = ref("");
  const transportRetryAvailable = ref(false);
  let context = EMPTY_CONTEXT;
  let generation = 0;
  let disposed = false;
  let retryIntent: Intent | null = null;
  let pollToken = 0;
  let getMutex: Promise<void> = Promise.resolve();
  const pollTasks = new Map<string, number>();
  const reportedStaleMessages = new Set<string>();
  const controllers = new Set<AbortController>();
  const waits = new Set<{ timer: number; resolve: () => void }>();

  function readable(
    snapshot = context,
  ): snapshot is TelegramPersonalMessagesContext & {
    endUserId: string;
  } {
    return (
      snapshot.visible &&
      Boolean(snapshot.projectId) &&
      Boolean(snapshot.endUserId) &&
      snapshot.canSend
    );
  }

  function sendable(
    snapshot = context,
  ): snapshot is TelegramPersonalMessagesContext & {
    endUserId: string;
  } {
    return (
      readable(snapshot) &&
      (snapshot.linkStatus === "ACTIVE" || snapshot.linkStatus === "UNKNOWN")
    );
  }

  function current(
    snapshot: TelegramPersonalMessagesContext,
    operationGeneration: number,
  ): boolean {
    return (
      !disposed &&
      operationGeneration === generation &&
      snapshot.visible === context.visible &&
      snapshot.projectId === context.projectId &&
      snapshot.endUserId === context.endUserId &&
      snapshot.canSend === context.canSend &&
      snapshot.linkStatus === context.linkStatus &&
      readable(snapshot)
    );
  }

  function owns(
    snapshot: TelegramPersonalMessagesContext & { endUserId: string },
    message: TelegramPersonalMessageResponseDto,
  ): boolean {
    return (
      message.projectId === snapshot.projectId &&
      message.endUserId === snapshot.endUserId
    );
  }

  function requestController(): AbortController {
    const controller = new AbortController();
    controllers.add(controller);
    controller.signal.addEventListener(
      "abort",
      () => controllers.delete(controller),
      { once: true },
    );
    return controller;
  }

  function finishController(controller: AbortController): void {
    controllers.delete(controller);
  }

  function wait(delay: number): Promise<void> {
    return new Promise((resolve) => {
      const pending = {
        timer: window.setTimeout(() => {
          waits.delete(pending);
          resolve();
        }, delay),
        resolve,
      };
      waits.add(pending);
    });
  }

  function cancelWork(): void {
    pollToken += 1;
    pollTasks.clear();
    for (const controller of controllers) controller.abort();
    controllers.clear();
    for (const pending of waits) {
      window.clearTimeout(pending.timer);
      pending.resolve();
    }
    waits.clear();
    polling.value = false;
  }

  function resetState(): void {
    history.value = [];
    activeMessage.value = null;
    historyLoading.value = false;
    submitting.value = false;
    polling.value = false;
    uploadProgress.value = 0;
    error.value = "";
    feedback.value = "";
    transportRetryAvailable.value = false;
    retryIntent = null;
    reportedStaleMessages.clear();
  }

  function setContext(next: TelegramPersonalMessagesContext): void {
    generation += 1;
    cancelWork();
    context = { ...next };
    resetState();
  }

  function timestamp(value: string): number {
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
  }

  function newest(
    existing: TelegramPersonalMessageResponseDto | undefined,
    incoming: TelegramPersonalMessageResponseDto,
  ): TelegramPersonalMessageResponseDto {
    if (!existing) return incoming;
    const existingTime = timestamp(existing.updatedAt);
    const incomingTime = timestamp(incoming.updatedAt);
    if (incomingTime < existingTime) return existing;
    if (incomingTime === existingTime) {
      const existingTerminal = terminalTelegramPersonalStatus(existing.status);
      const incomingTerminal = terminalTelegramPersonalStatus(incoming.status);
      if (existingTerminal !== incomingTerminal)
        return incomingTerminal ? incoming : existing;
      if (incoming.attemptCount !== existing.attemptCount)
        return incoming.attemptCount > existing.attemptCount
          ? incoming
          : existing;
      const incomingPrecedence = STATUS_PRECEDENCE[incoming.status];
      const existingPrecedence = STATUS_PRECEDENCE[existing.status];
      if (incomingPrecedence !== existingPrecedence)
        return incomingPrecedence > existingPrecedence ? incoming : existing;
      return existing;
    }
    return incoming;
  }

  function reportStaleMessage(
    message: TelegramPersonalMessageResponseDto,
  ): void {
    if (
      telegramPersonalSafeErrorPolicy(message.errorCode).staleLinkState &&
      !reportedStaleMessages.has(`${message.id}:${message.errorCode}`)
    ) {
      reportedStaleMessages.add(`${message.id}:${message.errorCode}`);
      options.onLinkStateStale?.();
    }
  }

  function merge(
    message: TelegramPersonalMessageResponseDto,
    activate = true,
  ): TelegramPersonalMessageResponseDto {
    const index = history.value.findIndex((item) => item.id === message.id);
    const selected = newest(
      index < 0 ? undefined : history.value[index],
      message,
    );
    history.value =
      index < 0
        ? [selected, ...history.value]
        : history.value.map((item, itemIndex) =>
            itemIndex === index ? selected : item,
          );
    if (activate) {
      activeMessage.value =
        activeMessage.value?.id === selected.id
          ? newest(activeMessage.value, selected)
          : selected;
    }
    if (
      terminalTelegramPersonalStatus(selected.status) &&
      pollTasks.has(selected.id)
    ) {
      pollTasks.delete(selected.id);
      polling.value = pollTasks.size > 0;
    }
    reportStaleMessage(selected);
    return selected;
  }

  async function withGetMutex<T>(operation: () => Promise<T>): Promise<T> {
    const previous = getMutex;
    let release!: () => void;
    getMutex = new Promise<void>((resolve) => {
      release = resolve;
    });
    await previous;
    try {
      return await operation();
    } finally {
      release();
    }
  }

  async function poll(
    snapshot: TelegramPersonalMessagesContext & { endUserId: string },
    operationGeneration: number,
    messageId: string,
    token: number,
  ): Promise<void> {
    let exhausted = true;
    for (let attempt = 0; attempt < MAX_POLLS; attempt += 1) {
      const currentMessage = history.value.find(
        (message) => message.id === messageId,
      );
      if (
        pollTasks.get(messageId) !== token ||
        !current(snapshot, operationGeneration) ||
        !currentMessage ||
        terminalTelegramPersonalStatus(currentMessage.status)
      ) {
        exhausted = false;
        break;
      }
      const configuredDelay =
        POLL_DELAYS[Math.min(attempt, POLL_DELAYS.length - 1)]!;
      const parsedNextAttempt = currentMessage.nextAttemptAt
        ? Date.parse(currentMessage.nextAttemptAt)
        : Number.NaN;
      const retryDelay =
        currentMessage.status === "RETRY_WAIT" &&
        Number.isFinite(parsedNextAttempt)
          ? Math.max(
              configuredDelay,
              Math.min(10_000, parsedNextAttempt - Date.now()),
            )
          : configuredDelay;
      await wait(Math.max(0, retryDelay));
      if (
        pollTasks.get(messageId) !== token ||
        !current(snapshot, operationGeneration)
      ) {
        exhausted = false;
        break;
      }
      await withGetMutex(async () => {
        if (
          pollTasks.get(messageId) !== token ||
          !current(snapshot, operationGeneration)
        )
          return;
        const controller = requestController();
        try {
          const loaded = await options.api.get(
            snapshot.projectId,
            snapshot.endUserId,
            messageId,
            { signal: controller.signal },
          );
          if (
            current(snapshot, operationGeneration) &&
            owns(snapshot, loaded) &&
            loaded.id === messageId
          )
            merge(loaded, activeMessage.value?.id === messageId);
        } catch (cause) {
          if (
            current(snapshot, operationGeneration) &&
            !controller.signal.aborted
          ) {
            const apiError = normalizeApiError(cause);
            if (apiError.status === 403) {
              error.value = "Недостаточно прав для просмотра отправки.";
              pollTasks.delete(messageId);
              polling.value = pollTasks.size > 0;
            }
          }
        } finally {
          finishController(controller);
        }
      });
    }
    if (
      current(snapshot, operationGeneration) &&
      pollTasks.get(messageId) === token &&
      exhausted &&
      history.value.some(
        (message) =>
          message.id === messageId &&
          !terminalTelegramPersonalStatus(message.status),
      )
    )
      feedback.value =
        "Отправка продолжается в фоне. Статус восстановится из истории.";
    if (pollTasks.get(messageId) === token) {
      pollTasks.delete(messageId);
      polling.value = pollTasks.size > 0;
    }
  }

  function startPoll(
    snapshot: TelegramPersonalMessagesContext & { endUserId: string },
    operationGeneration: number,
    messageId: string,
  ): void {
    if (pollTasks.has(messageId)) return;
    const token = ++pollToken;
    pollTasks.set(messageId, token);
    polling.value = true;
    void poll(snapshot, operationGeneration, messageId, token);
  }

  async function submitIntent(intent: Intent): Promise<boolean> {
    const snapshot = { ...context };
    const operationGeneration = generation;
    if (!sendable(snapshot) || submitting.value) return false;
    submitting.value = true;
    uploadProgress.value = 0;
    error.value = "";
    feedback.value = "";
    const controller = requestController();
    try {
      const created = await options.api.create(
        snapshot.projectId,
        snapshot.endUserId,
        intent.draft,
        intent.key,
        {
          signal: controller.signal,
          onUploadProgress: (progress) => {
            if (current(snapshot, operationGeneration))
              uploadProgress.value = progress;
          },
        },
      );
      if (!current(snapshot, operationGeneration) || !owns(snapshot, created))
        return false;
      retryIntent = null;
      transportRetryAvailable.value = false;
      merge(created);
      feedback.value = "Сообщение принято и поставлено в очередь.";
      if (!terminalTelegramPersonalStatus(created.status))
        startPoll(snapshot, operationGeneration, created.id);
      return true;
    } catch (cause) {
      if (!current(snapshot, operationGeneration) || controller.signal.aborted)
        return false;
      const apiError = normalizeApiError(cause);
      if (apiError.status === 0) {
        retryIntent = intent;
        transportRetryAvailable.value = true;
        error.value =
          "Сервер не подтвердил приём. Проверьте историю или повторите тот же запрос.";
      } else {
        retryIntent = null;
        transportRetryAvailable.value = false;
        error.value = telegramPersonalCreateErrorLabel(
          apiError.status,
          apiError.code,
        );
        if (telegramPersonalSafeErrorPolicy(apiError.code).staleLinkState)
          options.onLinkStateStale?.();
      }
      return false;
    } finally {
      finishController(controller);
      if (current(snapshot, operationGeneration)) submitting.value = false;
    }
  }

  async function send(draft: TelegramPersonalDraft): Promise<boolean> {
    retryIntent = {
      key: options.idempotencyKey?.() ?? crypto.randomUUID(),
      draft: { text: draft.text, file: draft.file },
    };
    transportRetryAvailable.value = false;
    return submitIntent(retryIntent);
  }

  async function retryTransport(): Promise<boolean> {
    if (!retryIntent || !transportRetryAvailable.value) return false;
    return submitIntent(retryIntent);
  }

  function discardTransportRetry(): void {
    retryIntent = null;
    transportRetryAvailable.value = false;
    error.value = "";
  }

  async function loadHistory(): Promise<void> {
    const snapshot = { ...context };
    const operationGeneration = generation;
    if (!readable(snapshot) || historyLoading.value) return;
    historyLoading.value = true;
    error.value = "";
    const controller = requestController();
    try {
      const loaded = await options.api.list(
        snapshot.projectId,
        snapshot.endUserId,
        { signal: controller.signal, limit: 20 },
      );
      if (!current(snapshot, operationGeneration)) return;
      const safeItems = loaded.items.filter((item) => owns(snapshot, item));
      for (const item of safeItems) merge(item, false);
      const safeIds = new Set(safeItems.map((item) => item.id));
      history.value = history.value
        .filter(
          (item) =>
            safeIds.has(item.id) ||
            pollTasks.has(item.id) ||
            item.id === activeMessage.value?.id,
        )
        .sort(
          (left, right) =>
            timestamp(right.createdAt) - timestamp(left.createdAt),
        );
      const recoverable = history.value.filter(
        (item) => !terminalTelegramPersonalStatus(item.status),
      );
      if (!activeMessage.value)
        activeMessage.value = recoverable[0] ?? history.value[0] ?? null;
      for (const item of recoverable)
        startPoll(snapshot, operationGeneration, item.id);
    } catch (cause) {
      if (
        current(snapshot, operationGeneration) &&
        !controller.signal.aborted
      ) {
        const apiError = normalizeApiError(cause);
        error.value =
          apiError.status === 403
            ? "Недостаточно прав для истории Telegram."
            : "Не удалось загрузить историю Telegram.";
      }
    } finally {
      finishController(controller);
      if (current(snapshot, operationGeneration)) historyLoading.value = false;
    }
  }

  function dispose(): void {
    disposed = true;
    generation += 1;
    cancelWork();
    resetState();
  }

  return {
    history,
    activeMessage,
    historyLoading,
    submitting,
    polling,
    uploadProgress,
    error,
    feedback,
    transportRetryAvailable,
    setContext,
    send,
    retryTransport,
    discardTransportRetry,
    loadHistory,
    dispose,
  };
}
