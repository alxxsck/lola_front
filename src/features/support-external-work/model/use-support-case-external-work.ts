import { computed, ref, shallowRef, watch } from "vue";
import type {
  LinkHelpDeskCompatibilityTicketDto,
  ResolveSupportExternalWorkCommandDto,
  SupportExternalCommandStatusResponseDto,
  SupportExternalCommandSubmitBody,
  SupportExternalCommandRefreshEvidenceBody,
  SupportExternalCreateOptionResponseDto,
  SupportExternalLinkResponseDto,
  SupportExternalProjectItemResponseDto,
  SupportExternalTimelineMessageResponseDto,
} from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import type { SupportExternalWorkSource } from "../api/support-external-work-source";

export interface SupportCaseExternalWorkPermissions {
  read: boolean;
  create: boolean;
  commentInternal: boolean;
  commentPublic: boolean;
  readInternal: boolean;
  retry: boolean;
  resolveUnknown: boolean;
  inboxRead: boolean;
}

export interface SupportCaseExternalWorkContext {
  projectId(): string | undefined;
  actorId(): string | undefined;
  caseId(): string | undefined;
  caseTitle(): string;
  caseSummary(): string;
  permissions(): SupportCaseExternalWorkPermissions;
  onForbidden?(): void | Promise<void>;
  onAuthenticationRequired?(): void | Promise<void>;
}

export interface SupportExternalCreateDraft {
  optionId: string;
  title: string;
  body: string;
  audience: "INTERNAL" | "PUBLIC";
  includeCaseTitle: boolean;
  includeCaseSummary: boolean;
  requesterEmail: string;
  requesterName: string;
  fieldValues: Record<string, { type: string; value: unknown }>;
}

export interface SupportExternalCommentDraft {
  body: string;
  audience: "INTERNAL" | "PUBLIC";
  publicConfirmed: boolean;
}

export interface SupportExternalCommandFeedback {
  commandId: string;
  status: string;
  terminal: boolean;
  replayed: boolean;
}

type Scope = Readonly<{ projectId: string; actorId: string; caseId: string }>;
type RetainedAttempt = Readonly<
  | {
      scope: Scope;
      kind: "SUBMIT";
      body: SupportExternalCommandSubmitBody;
      expectedVersion?: number;
      key: string;
    }
  | {
      scope: Scope;
      kind: "RETRY";
      commandId: string;
      expectedVersion: number;
      key: string;
    }
  | {
      scope: Scope;
      kind: "EVIDENCE";
      commandId: string;
      body: SupportExternalCommandRefreshEvidenceBody;
      expectedVersion: number;
      key: string;
    }
  | {
      scope: Scope;
      kind: "RESOLVE";
      commandId: string;
      body: ResolveSupportExternalWorkCommandDto;
      expectedVersion: number;
      key: string;
    }
  | {
      scope: Scope;
      kind: "LINK_EXISTING";
      remoteItemId: string;
      body: LinkHelpDeskCompatibilityTicketDto;
      expectedVersion: number;
      key: string;
    }
>;

const retainedAttempts = new Map<string, RetainedAttempt>();
const acceptedReceipts = new Map<
  string,
  { commandId: string; status: string }
>();
const forgottenAcceptedReceiptKeys = new Set<string>();
const acceptedReceiptStoragePrefix =
  "support-external-work:case-receipt:v1:";

function scopeKey(scope: Scope): string {
  return [scope.actorId, scope.projectId, scope.caseId].join("\u0000");
}

function receiptStorageKey(scope: Scope): string {
  return `${acceptedReceiptStoragePrefix}${[
    scope.actorId,
    scope.projectId,
    scope.caseId,
  ]
    .map(encodeURIComponent)
    .join(":")}`;
}

function readAcceptedReceipt(scope: Scope): {
  commandId: string;
  status: string;
} | null {
  const key = scopeKey(scope);
  if (forgottenAcceptedReceiptKeys.has(key)) return null;
  const cached = acceptedReceipts.get(key);
  if (cached) return cached;
  if (typeof sessionStorage === "undefined") return null;
  try {
    const parsed = JSON.parse(
      sessionStorage.getItem(receiptStorageKey(scope)) ?? "null",
    ) as unknown;
    if (
      !parsed ||
      typeof parsed !== "object" ||
      !("commandId" in parsed) ||
      typeof parsed.commandId !== "string" ||
      !("status" in parsed) ||
      typeof parsed.status !== "string"
    )
      return null;
    const receipt = { commandId: parsed.commandId, status: parsed.status };
    acceptedReceipts.set(key, receipt);
    return receipt;
  } catch {
    try {
      sessionStorage.removeItem(receiptStorageKey(scope));
    } catch {
      // Browser storage is best-effort; the scoped in-memory receipt remains safe.
    }
    return null;
  }
}

function retainAcceptedReceipt(
  scope: Scope,
  receipt: { commandId: string; status: string },
): void {
  const key = scopeKey(scope);
  forgottenAcceptedReceiptKeys.delete(key);
  acceptedReceipts.set(key, receipt);
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(receiptStorageKey(scope), JSON.stringify(receipt));
    } catch {
      // A storage policy/quota must not unlock a command accepted by the server.
    }
  }
}

function forgetAcceptedReceipt(scope: Scope): void {
  const key = scopeKey(scope);
  forgottenAcceptedReceiptKeys.add(key);
  acceptedReceipts.delete(key);
  if (typeof sessionStorage !== "undefined") {
    try {
      sessionStorage.setItem(receiptStorageKey(scope), "null");
      sessionStorage.removeItem(receiptStorageKey(scope));
    } catch {
      // Terminal/auth cleanup remains authoritative even without browser storage.
    }
  }
}

function emptyCreateDraft(): SupportExternalCreateDraft {
  return {
    optionId: "",
    title: "",
    body: "",
    audience: "INTERNAL",
    includeCaseTitle: false,
    includeCaseSummary: false,
    requesterEmail: "",
    requesterName: "",
    fieldValues: {},
  };
}

function emptyCommentDraft(): SupportExternalCommentDraft {
  return { body: "", audience: "INTERNAL", publicConfirmed: false };
}

function isTerminal(status: string): boolean {
  return ["SUCCEEDED", "FAILED", "UNKNOWN", "CANCELLED"].includes(status);
}

function friendlyError(cause: unknown): string {
  if (cause instanceof ApiError && cause.status === 409)
    return "Данные изменились на сервере. Контекст перечитан; подтвердите действие снова.";
  if (cause instanceof ApiError && cause.status === 429)
    return "Слишком много запросов. Подождите и повторите.";
  return "Не удалось обновить внешнюю работу. Повторите после проверки соединения.";
}

export function createSupportCaseExternalWorkController(
  context: SupportCaseExternalWorkContext,
  source: SupportExternalWorkSource,
  options: { idempotencyKey?: () => string } = {},
) {
  const idempotencyKey = options.idempotencyKey ?? (() => crypto.randomUUID());
  const links = shallowRef<SupportExternalLinkResponseDto[]>([]);
  const commands = shallowRef<SupportExternalCommandStatusResponseDto[]>([]);
  const createOptions = shallowRef<SupportExternalCreateOptionResponseDto[]>(
    [],
  );
  const inboxItems = shallowRef<SupportExternalProjectItemResponseDto[]>([]);
  const timeline = shallowRef<SupportExternalTimelineMessageResponseDto[]>([]);
  const linksNextCursor = ref<string | null>(null);
  const commandsNextCursor = ref<string | null>(null);
  const timelineNextCursor = ref<string | null>(null);
  const selectedLinkId = ref<string | null>(null);
  const loading = ref(false);
  const loadingTimeline = ref(false);
  const mutating = ref(false);
  const error = ref("");
  const validationError = ref("");
  const feedback = shallowRef<SupportExternalCommandFeedback | null>(null);
  const createDraft = ref<SupportExternalCreateDraft>(emptyCreateDraft());
  const commentDraft = ref<SupportExternalCommentDraft>(emptyCommentDraft());
  const pendingAttempt = shallowRef<RetainedAttempt | null>(null);
  const acceptedReceipt = shallowRef<{
    commandId: string;
    status: string;
  } | null>(null);
  const scopeRevision = ref(0);
  let generation = 0;
  let loadAbort: AbortController | null = null;
  let timelineAbort: AbortController | null = null;
  let mutationAbort: AbortController | null = null;
  let copyDraft: ((text: string) => void) | null = null;

  const selectedLink = computed(
    () =>
      links.value.find((item) => item.linkId === selectedLinkId.value) ?? null,
  );
  const unknownAttempt = computed(() => Boolean(pendingAttempt.value));
  const hasPendingCommand = computed(() => Boolean(acceptedReceipt.value));
  const newIntentBlocked = computed(
    () => unknownAttempt.value || hasPendingCommand.value,
  );

  function currentScope(): Scope | null {
    const projectId = context.projectId();
    const actorId = context.actorId();
    const caseId = context.caseId();
    return projectId && actorId && caseId
      ? { projectId, actorId, caseId }
      : null;
  }

  function sameScope(scope: Scope, requestGeneration = generation): boolean {
    const current = currentScope();
    return (
      requestGeneration === generation &&
      current?.projectId === scope.projectId &&
      current.actorId === scope.actorId &&
      current.caseId === scope.caseId
    );
  }

  function attemptAllowed(attempt: RetainedAttempt): boolean {
    const permissions = context.permissions();
    if (attempt.kind === "LINK_EXISTING")
      return (
        permissions.inboxRead &&
        inboxItems.value.some(
          (item) =>
            item.remoteItemId === attempt.remoteItemId &&
            item.allowedActions.includes("LINK_TO_CASE"),
        )
      );
    if (attempt.kind === "RETRY")
      return (
        permissions.retry &&
        commands.value.some(
          (command) =>
            command.commandId === attempt.commandId &&
            command.allowedActions.includes("RETRY"),
        )
      );
    if (attempt.kind === "EVIDENCE")
      return (
        permissions.resolveUnknown &&
        commands.value.some(
          (command) =>
            command.commandId === attempt.commandId &&
            command.allowedActions.includes("REFRESH_EVIDENCE"),
        )
      );
    if (attempt.kind === "RESOLVE")
      return (
        permissions.resolveUnknown &&
        commands.value.some(
          (command) =>
            command.commandId === attempt.commandId &&
            command.allowedActions.includes("RESOLVE_UNKNOWN"),
        )
      );
    if (attempt.body.intent === "CREATE" && "optionId" in attempt.body) {
      const optionId = attempt.body.optionId;
      return (
        permissions.create &&
        permissions.read &&
        createOptions.value.some(
          (option) =>
            option.optionId === optionId &&
            option.allowedActions.includes("CREATE"),
        )
      );
    }
    if (!("linkId" in attempt.body)) return false;
    const linkId = attempt.body.linkId;
    const link = links.value.find((candidate) => candidate.linkId === linkId);
    if (!link) return false;
    if (attempt.body.intent === "COMMENT")
      return attempt.body.audience === "PUBLIC"
        ? permissions.commentPublic &&
            link.item.allowedActions.includes("COMMENT_PUBLIC")
        : permissions.commentInternal &&
            link.item.allowedActions.includes("COMMENT_INTERNAL");
    return (
      permissions.read && link.item.allowedActions.includes(attempt.body.intent)
    );
  }

  function purge(): void {
    generation += 1;
    scopeRevision.value += 1;
    loadAbort?.abort();
    timelineAbort?.abort();
    mutationAbort?.abort();
    loadAbort = null;
    timelineAbort = null;
    mutationAbort = null;
    links.value = [];
    commands.value = [];
    createOptions.value = [];
    inboxItems.value = [];
    timeline.value = [];
    linksNextCursor.value = null;
    commandsNextCursor.value = null;
    timelineNextCursor.value = null;
    selectedLinkId.value = null;
    loading.value = false;
    loadingTimeline.value = false;
    mutating.value = false;
    error.value = "";
    validationError.value = "";
    feedback.value = null;
    createDraft.value = emptyCreateDraft();
    commentDraft.value = emptyCommentDraft();
    pendingAttempt.value = null;
    acceptedReceipt.value = null;
  }

  async function handleFailure(cause: unknown, scope: Scope): Promise<void> {
    if (cause instanceof ApiError && [401, 428].includes(cause.status)) {
      retainedAttempts.delete(scopeKey(scope));
      forgetAcceptedReceipt(scope);
      purge();
      await context.onAuthenticationRequired?.();
      return;
    }
    if (cause instanceof ApiError && [403, 404].includes(cause.status)) {
      retainedAttempts.delete(scopeKey(scope));
      forgetAcceptedReceipt(scope);
      purge();
      await context.onForbidden?.();
      return;
    }
    error.value = friendlyError(cause);
  }

  async function load(): Promise<void> {
    const scope = currentScope();
    const permissions = context.permissions();
    if (!scope || !permissions.read) {
      purge();
      return;
    }
    loadAbort?.abort();
    const abort = new AbortController();
    loadAbort = abort;
    const requestGeneration = ++generation;
    loading.value = true;
    error.value = "";
    acceptedReceipt.value = readAcceptedReceipt(scope);
    try {
      const [linkPage, commandPage, optionPage, inboxPage] = await Promise.all([
        permissions.read
          ? source.listCaseLinks(
              scope.projectId,
              scope.caseId,
              undefined,
              abort.signal,
            )
          : Promise.resolve({ items: [], nextCursor: null }),
        permissions.read
          ? source.listCaseCommands(
              scope.projectId,
              scope.caseId,
              { limit: 50 },
              abort.signal,
            )
          : Promise.resolve({ items: [], nextCursor: null }),
        permissions.create && permissions.read
          ? source.readCaseCreateOptions(
              scope.projectId,
              scope.caseId,
              abort.signal,
            ).catch((cause: unknown) => {
              if (
                cause instanceof ApiError &&
                cause.status === 409 &&
                cause.code === "SUPPORT_EXTERNAL_MAPPING_STALE"
              )
                return { items: [] };
              throw cause;
            })
          : Promise.resolve({ items: [] }),
        permissions.inboxRead
          ? source.listInbox(scope.projectId, { limit: 50 }, abort.signal)
          : Promise.resolve({ items: [], nextCursor: null }),
      ]);
      if (!sameScope(scope, requestGeneration) || abort.signal.aborted) return;
      links.value = linkPage.items;
      linksNextCursor.value = linkPage.nextCursor;
      commands.value = commandPage.items;
      commandsNextCursor.value = commandPage.nextCursor;
      createOptions.value = optionPage.items;
      inboxItems.value = inboxPage.items.filter((item) =>
        item.allowedActions.includes("LINK_TO_CASE"),
      );
      if (
        selectedLinkId.value &&
        !links.value.some((item) => item.linkId === selectedLinkId.value)
      ) {
        selectedLinkId.value = null;
        timeline.value = [];
      }
      const retained = retainedAttempts.get(scopeKey(scope));
      pendingAttempt.value =
        retained && attemptAllowed(retained) ? retained : null;
      const accepted = acceptedReceipt.value;
      if (accepted) {
        const authoritative = commands.value.find(
          (command) => command.commandId === accepted.commandId,
        );
        if (
          authoritative &&
          authoritative.status !== "UNKNOWN" &&
          isTerminal(authoritative.status)
        ) {
          forgetAcceptedReceipt(scope);
          acceptedReceipt.value = null;
        } else if (authoritative) {
          const receipt = {
            commandId: authoritative.commandId,
            status: authoritative.status,
          };
          retainAcceptedReceipt(scope, receipt);
          acceptedReceipt.value = receipt;
        }
      }
    } catch (cause) {
      if (!sameScope(scope, requestGeneration) || abort.signal.aborted) return;
      await handleFailure(cause, scope);
    } finally {
      if (requestGeneration === generation) {
        loading.value = false;
        if (loadAbort === abort) loadAbort = null;
      }
    }
  }

  async function selectLink(linkId: string): Promise<void> {
    const scope = currentScope();
    if (!scope || !context.permissions().read) return;
    const link = links.value.find((item) => item.linkId === linkId);
    if (!link) return;
    selectedLinkId.value = linkId;
    timelineAbort?.abort();
    const abort = new AbortController();
    timelineAbort = abort;
    const requestGeneration = generation;
    loadingTimeline.value = true;
    error.value = "";
    try {
      const page = await source.readLinkedTimeline(
        scope.projectId,
        scope.caseId,
        linkId,
        { limit: 50 },
        abort.signal,
      );
      if (
        !sameScope(scope, requestGeneration) ||
        selectedLinkId.value !== linkId
      )
        return;
      timeline.value = page.items;
      timelineNextCursor.value = page.nextCursor;
    } catch (cause) {
      if (!sameScope(scope, requestGeneration) || abort.signal.aborted) return;
      await handleFailure(cause, scope);
    } finally {
      if (sameScope(scope, requestGeneration) && timelineAbort === abort) {
        loadingTimeline.value = false;
        timelineAbort = null;
      }
    }
  }

  function createBody(): SupportExternalCommandSubmitBody | null {
    const draft = createDraft.value;
    const option = createOptions.value.find(
      (item) => item.optionId === draft.optionId,
    );
    if (!option) {
      validationError.value = "Выберите доступное назначение.";
      return null;
    }
    if (!option.allowedActions.includes("CREATE")) {
      validationError.value = "Сервер больше не разрешает создание.";
      return null;
    }
    const title = draft.title.trim();
    const contextParts = [
      draft.includeCaseTitle ? `Обращение: ${context.caseTitle().trim()}` : "",
      draft.includeCaseSummary ? context.caseSummary().trim() : "",
      draft.body.trim(),
    ].filter(Boolean);
    if (!title || !contextParts.length) {
      validationError.value =
        "Заполните заголовок и редактируемый безопасный контекст.";
      return null;
    }
    const requesterEmail = draft.requesterEmail.trim();
    const requesterName = draft.requesterName.trim();
    if (option.requester?.emailRequired && !requesterEmail) {
      validationError.value = "Укажите эл. почту заявителя для выбранной формы.";
      return null;
    }
    if (option.requester?.nameRequired && !requesterName) {
      validationError.value = "Укажите имя заявителя для выбранной формы.";
      return null;
    }
    const missingField = option.fields.find((field) => {
      if (!field.required) return false;
      const value = draft.fieldValues[field.id]?.value;
      return (
        value === undefined ||
        value === null ||
        value === "" ||
        (Array.isArray(value) && value.length === 0)
      );
    });
    if (missingField) {
      validationError.value = `Заполните обязательное поле ${missingField.id}.`;
      return null;
    }
    const body = {
      intent: "CREATE" as const,
      optionId: option.optionId,
      mappingRevisionId: option.mappingRevisionId,
      formRevision: option.formRevision,
      title,
      body: contextParts.join("\n\n"),
      audience: draft.audience,
      ...(requesterEmail
        ? {
            requester: {
              email: requesterEmail,
              ...(requesterName ? { name: requesterName } : {}),
            },
          }
        : {}),
      ...(Object.keys(draft.fieldValues).length
        ? { fieldValues: draft.fieldValues }
        : {}),
    };
    validationError.value = "";
    return body as SupportExternalCommandSubmitBody;
  }

  async function reconcileCommand(commandId: string): Promise<void> {
    const scope = currentScope();
    if (!scope || !context.permissions().read) return;
    const requestGeneration = generation;
    try {
      const result = await source.readCommand(
        scope.projectId,
        scope.caseId,
        commandId,
      );
      if (!sameScope(scope, requestGeneration)) return;
      commands.value = [
        result,
        ...commands.value.filter((item) => item.commandId !== commandId),
      ];
      feedback.value = {
        commandId,
        status: result.status,
        terminal: isTerminal(result.status),
        replayed: feedback.value?.replayed ?? false,
      };
      if (result.status !== "UNKNOWN" && isTerminal(result.status)) {
        forgetAcceptedReceipt(scope);
        acceptedReceipt.value = null;
      } else {
        const receipt = { commandId: result.commandId, status: result.status };
        retainAcceptedReceipt(scope, receipt);
        acceptedReceipt.value = receipt;
      }
      if (result.status === "SUCCEEDED") await load();
    } catch (cause) {
      if (!sameScope(scope, requestGeneration)) return;
      await handleFailure(cause, scope);
    }
  }

  async function runAttempt(attempt: RetainedAttempt): Promise<void> {
    if (mutating.value || !sameScope(attempt.scope) || !attemptAllowed(attempt))
      return;
    mutationAbort?.abort();
    const abort = new AbortController();
    mutationAbort = abort;
    const requestGeneration = generation;
    const key = scopeKey(attempt.scope);
    let commandToReconcile: string | null = null;
    retainedAttempts.set(key, attempt);
    pendingAttempt.value = attempt;
    mutating.value = true;
    error.value = "";
    try {
      const result =
        attempt.kind === "SUBMIT"
          ? {
              kind: "COMMAND" as const,
              receipt: await source.submitCaseCommand(
                attempt.scope.projectId,
                attempt.scope.caseId,
                attempt.body,
                attempt.expectedVersion,
                attempt.key,
                abort.signal,
              ),
            }
          : attempt.kind === "RETRY"
            ? {
                kind: "COMMAND" as const,
                receipt: await source.retryCommand(
                  attempt.scope.projectId,
                  attempt.scope.caseId,
                  attempt.commandId,
                  attempt.expectedVersion,
                  attempt.key,
                  abort.signal,
                ),
              }
            : attempt.kind === "EVIDENCE"
              ? {
                  kind: "COMMAND" as const,
                  receipt: await source.refreshCommandEvidence(
                    attempt.scope.projectId,
                    attempt.scope.caseId,
                    attempt.commandId,
                    attempt.body,
                    attempt.expectedVersion,
                    attempt.key,
                    abort.signal,
                  ),
                }
              : attempt.kind === "RESOLVE"
                ? {
                    kind: "COMMAND" as const,
                    receipt: await source.resolveCommand(
                      attempt.scope.projectId,
                      attempt.scope.caseId,
                      attempt.commandId,
                      attempt.body,
                      attempt.expectedVersion,
                      attempt.key,
                      abort.signal,
                    ),
                  }
                : {
                    kind: "LINK" as const,
                    receipt: await source.linkInboxItemToCase(
                      attempt.scope.projectId,
                      attempt.remoteItemId,
                      attempt.body,
                      attempt.expectedVersion,
                      attempt.key,
                      abort.signal,
                    ),
                  };
      if (!sameScope(attempt.scope, requestGeneration)) return;
      retainedAttempts.delete(key);
      pendingAttempt.value = null;
      if (result.kind === "LINK") {
        await load();
        return;
      }
      const accepted = {
        commandId: result.receipt.commandId,
        status: result.receipt.status,
      };
      retainAcceptedReceipt(attempt.scope, accepted);
      acceptedReceipt.value = accepted;
      feedback.value = {
        commandId: result.receipt.commandId,
        status: result.receipt.status,
        terminal: isTerminal(result.receipt.status),
        replayed: result.receipt.replayed,
      };
      if (attempt.kind === "SUBMIT" && attempt.body.intent === "CREATE")
        createDraft.value = emptyCreateDraft();
      if (attempt.kind === "SUBMIT" && attempt.body.intent === "COMMENT")
        commentDraft.value = emptyCommentDraft();
      commandToReconcile = result.receipt.commandId;
    } catch (cause) {
      if (
        cause instanceof ApiError &&
        [401, 403, 404, 428].includes(cause.status)
      )
        retainedAttempts.delete(key);
      if (
        cause instanceof ApiError &&
        [401, 403, 404, 428].includes(cause.status)
      )
        forgetAcceptedReceipt(attempt.scope);
      if (!sameScope(attempt.scope, requestGeneration)) return;
      if (
        cause instanceof ApiError &&
        [0, 429, 502, 503, 504].includes(cause.status)
      ) {
        error.value =
          "Результат команды неизвестен. Доступен только точный повтор с тем же ключом и данными.";
        pendingAttempt.value = attempt;
        return;
      }
      retainedAttempts.delete(key);
      pendingAttempt.value = null;
      if (cause instanceof ApiError && cause.status === 409) {
        await load();
        if (sameScope(attempt.scope)) error.value = friendlyError(cause);
        return;
      }
      await handleFailure(cause, attempt.scope);
    } finally {
      if (mutationAbort === abort) {
        mutating.value = false;
        mutationAbort = null;
      }
    }
    if (commandToReconcile && sameScope(attempt.scope))
      await reconcileCommand(commandToReconcile);
  }

  async function submit(
    body: SupportExternalCommandSubmitBody,
    version?: number,
  ): Promise<void> {
    const scope = currentScope();
    if (!scope || mutating.value || newIntentBlocked.value) return;
    await runAttempt({
      scope,
      kind: "SUBMIT",
      body,
      expectedVersion: version,
      key: idempotencyKey(),
    });
  }

  async function create(): Promise<void> {
    if (!context.permissions().create) {
      validationError.value = "Создание внешней заявки недоступно.";
      return;
    }
    const body = createBody();
    if (body) await submit(body);
  }

  async function comment(linkId: string): Promise<void> {
    const link = links.value.find((item) => item.linkId === linkId);
    if (!link) return;
    const draft = commentDraft.value;
    if (!draft.body.trim()) {
      validationError.value = "Введите комментарий.";
      return;
    }
    if (draft.audience === "PUBLIC") {
      if (!context.permissions().commentPublic) {
        validationError.value = "Публичный внешний комментарий недоступен.";
        return;
      }
      if (!draft.publicConfirmed) {
        validationError.value = "Подтвердите публичный внешний комментарий.";
        return;
      }
    } else if (!context.permissions().commentInternal) {
      validationError.value = "Внутренний внешний комментарий недоступен.";
      return;
    }
    const action =
      draft.audience === "PUBLIC" ? "COMMENT_PUBLIC" : "COMMENT_INTERNAL";
    if (!link.item.allowedActions.includes(action)) {
      validationError.value = "Сервер больше не разрешает этот комментарий.";
      return;
    }
    validationError.value = "";
    await submit(
      {
        intent: "COMMENT",
        linkId,
        body: draft.body.trim(),
        audience: draft.audience,
      },
      link.version,
    );
  }

  async function runLinkCommand(
    linkId: string,
    intent: "REFRESH" | "UNLINK",
  ): Promise<void> {
    const link = links.value.find((item) => item.linkId === linkId);
    if (!link || !link.item.allowedActions.includes(intent)) return;
    await submit({ intent, linkId }, link.version);
  }

  async function replayUnknownAttempt(): Promise<void> {
    const attempt = pendingAttempt.value;
    if (!attempt || mutating.value) return;
    await runAttempt(attempt);
  }

  async function retryCommand(commandId: string): Promise<void> {
    const scope = currentScope();
    const command = commands.value.find((item) => item.commandId === commandId);
    if (
      !scope ||
      !command ||
      !context.permissions().retry ||
      !command.allowedActions.includes("RETRY")
    )
      return;
    await runAttempt({
      scope,
      kind: "RETRY",
      commandId,
      expectedVersion: command.version,
      key: idempotencyKey(),
    });
  }

  async function refreshEvidence(
    commandId: string,
    remoteItemId: string,
  ): Promise<void> {
    const scope = currentScope();
    const command = commands.value.find((item) => item.commandId === commandId);
    if (
      !scope ||
      !command ||
      !context.permissions().resolveUnknown ||
      !command.allowedActions.includes("REFRESH_EVIDENCE") ||
      !remoteItemId.trim()
    )
      return;
    await runAttempt({
      scope,
      kind: "EVIDENCE",
      commandId,
      body: { remoteItemId: remoteItemId.trim() },
      expectedVersion: command.version,
      key: idempotencyKey(),
    });
  }

  async function resolveCommand(
    commandId: string,
    resolution: ResolveSupportExternalWorkCommandDto,
  ): Promise<void> {
    const scope = currentScope();
    const command = commands.value.find((item) => item.commandId === commandId);
    if (
      !scope ||
      !command ||
      !context.permissions().resolveUnknown ||
      !command.allowedActions.includes("RESOLVE_UNKNOWN")
    )
      return;
    const allowedDecisions: Record<string, readonly string[]> = {
      CREATE: ["LINK_EXISTING", "CONFIRM_NOT_DELIVERED", "CANCEL"],
      COMMENT: ["CONFIRM_DELIVERED", "CONFIRM_NOT_DELIVERED", "CANCEL"],
      REFRESH: ["RETRY_SAFE", "CANCEL"],
      UNLINK: [],
    };
    if (
      !(allowedDecisions[command.intent] ?? []).includes(resolution.decision)
    ) {
      validationError.value = "Это решение недоступно для текущей команды.";
      return;
    }
    if (
      resolution.decision === "LINK_EXISTING" &&
      !resolution.remoteItemId?.trim()
    ) {
      validationError.value = "Укажите идентификатор внешней задачи из подтверждённых данных сервера.";
      return;
    }
    if (
      resolution.decision === "CONFIRM_DELIVERED" &&
      !resolution.providerCorrelation?.trim()
    ) {
      validationError.value =
        "Укажите идентификатор подтверждения из данных внешней системы.";
      return;
    }
    validationError.value = "";
    await runAttempt({
      scope,
      kind: "RESOLVE",
      commandId,
      body: resolution,
      expectedVersion: command.version,
      key: idempotencyKey(),
    });
  }

  async function linkExisting(itemId: string, optionId: string): Promise<void> {
    const scope = currentScope();
    const item = inboxItems.value.find(
      (candidate) => candidate.itemId === itemId,
    );
    const option = createOptions.value.find(
      (candidate) => candidate.optionId === optionId,
    );
    if (
      !scope ||
      !item ||
      !option ||
      newIntentBlocked.value ||
      !context.permissions().inboxRead ||
      !item.allowedActions.includes("LINK_TO_CASE") ||
      !option.allowedActions.includes("CREATE")
    )
      return;
    const body: LinkHelpDeskCompatibilityTicketDto = {
      caseId: scope.caseId,
      mappingRevisionId: option.mappingRevisionId,
    };
    await runAttempt({
      scope,
      kind: "LINK_EXISTING",
      remoteItemId: item.remoteItemId,
      body,
      expectedVersion: item.version,
      key: idempotencyKey(),
    });
  }

  function setDraftCopyHandler(handler: (text: string) => void): void {
    copyDraft = handler;
  }

  function copyTimelineMessage(messageId: string): void {
    const message = timeline.value.find((item) => item.messageId === messageId);
    if (message?.body) copyDraft?.(message.body);
  }

  const authorityKey = computed(() => {
    const permissions = context.permissions();
    return [
      context.projectId() ?? "",
      context.actorId() ?? "",
      context.caseId() ?? "",
      ...Object.values(permissions).map((value) => (value ? "1" : "0")),
    ].join("\u0000");
  });
  watch(
    authorityKey,
    () => {
      purge();
      const permissions = context.permissions();
      if (currentScope() && permissions.read) void load();
    },
    { flush: "sync", immediate: true },
  );

  return {
    links,
    commands,
    createOptions,
    inboxItems,
    timeline,
    linksNextCursor,
    commandsNextCursor,
    timelineNextCursor,
    selectedLinkId,
    selectedLink,
    loading,
    loadingTimeline,
    mutating,
    error,
    validationError,
    feedback,
    createDraft,
    commentDraft,
    unknownAttempt,
    acceptedReceipt,
    scopeRevision,
    hasPendingCommand,
    newIntentBlocked,
    load,
    selectLink,
    create,
    comment,
    refresh: (linkId: string) => runLinkCommand(linkId, "REFRESH"),
    unlink: (linkId: string) => runLinkCommand(linkId, "UNLINK"),
    replayUnknownAttempt,
    reconcileCommand,
    retryCommand,
    refreshEvidence,
    resolveCommand,
    linkExisting,
    setDraftCopyHandler,
    copyTimelineMessage,
    reset: purge,
  };
}
