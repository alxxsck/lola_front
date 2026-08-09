import { computed, ref } from "vue";
import type {
  CreateSupportExternalMappingDto,
  PreviewSupportExternalMappingDto,
  RollbackSupportExternalMappingDto,
  SupportExternalCatalogResponseDto,
  SupportExternalConnectionResponseDto,
  SupportExternalMappingDiffResponseDto,
  SupportExternalMappingDraftResponseDto,
  SupportExternalMappingPreviewResponseDto,
  SupportExternalMappingPublishedRevisionResponseDto,
  SupportExternalMappingRootResponseDto,
  SupportExternalMappingValidationResponseDto,
  SupportExternalOAuthStartResponseDto,
  SupportExternalOAuthTenantResponseDto,
  UpdateSupportExternalMappingDraftDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import type {
  SupportExternalMutation,
  SupportExternalProvider,
  SupportExternalWorkSource,
} from "../api/support-external-work-source";

export type SupportExternalSettingsRecovery =
  | "UNKNOWN_OUTCOME"
  | "RETRYABLE_FAILURE";

type SettingsAttempt =
  | {
      kind: "TEST_CONNECTION";
      connectionId: string;
      idempotencyKey: string;
    }
  | {
      kind: "START_OAUTH";
      provider: SupportExternalProvider;
      idempotencyKey: string;
    }
  | {
      kind: "SELECT_OAUTH_TENANT";
      sessionId: string;
      tenantIdentity: string;
      idempotencyKey: string;
    }
  | {
      kind: "RECONNECT_CONNECTION";
      connectionId: string;
      expectedVersion: number;
      idempotencyKey: string;
    }
  | {
      kind: "DISABLE_CONNECTION" | "REVOKE_CONNECTION";
      connectionId: string;
      expectedVersion: number;
      idempotencyKey: string;
    }
  | {
      kind: "REFRESH_CATALOG";
      connectionId: string;
      idempotencyKey: string;
    }
  | {
      kind: "CREATE_MAPPING";
      body: CreateSupportExternalMappingDto;
      idempotencyKey: string;
    }
  | {
      kind: "SAVE_MAPPING";
      mappingId: string;
      expectedVersion: number;
      body: UpdateSupportExternalMappingDraftDto;
      idempotencyKey: string;
    }
  | {
      kind: "BEGIN_MAPPING_DRAFT" | "PUBLISH_MAPPING";
      mappingId: string;
      expectedVersion: number;
      idempotencyKey: string;
    }
  | {
      kind: "ROLLBACK_MAPPING";
      mappingId: string;
      revisionId: string;
      expectedVersion: number;
      body: RollbackSupportExternalMappingDto;
      idempotencyKey: string;
    };

interface RetainedAttempt {
  attempt: SettingsAttempt;
  state: SupportExternalSettingsRecovery;
  receiptId?: string;
}

const retainedAttempts = new Map<string, RetainedAttempt>();

export interface SupportExternalSettingsContext {
  actorId(): string | undefined;
  projectId(): string | undefined;
  canManage(): boolean;
  createIdempotencyKey?(): string;
  openOAuth?(launchPath: string): void;
  onForbidden?(): void | Promise<void>;
  onAuthenticationRequired?(): void | Promise<void>;
}

function retainedScope(context: SupportExternalSettingsContext): string | null {
  const actorId = context.actorId();
  const projectId = context.projectId();
  return actorId && projectId ? `${actorId}\u0000${projectId}` : null;
}

function attemptLabel(attempt: SettingsAttempt): string {
  switch (attempt.kind) {
    case "TEST_CONNECTION":
      return "Проверка connection";
    case "START_OAUTH":
    case "RECONNECT_CONNECTION":
      return "OAuth-подключение";
    case "SELECT_OAUTH_TENANT":
      return "Выбор site/account";
    case "DISABLE_CONNECTION":
      return "Отключение connection";
    case "REVOKE_CONNECTION":
      return "Отзыв connection";
    case "REFRESH_CATALOG":
      return "Обновление destinations";
    case "CREATE_MAPPING":
      return "Создание mapping draft";
    case "SAVE_MAPPING":
      return "Сохранение mapping draft";
    case "BEGIN_MAPPING_DRAFT":
      return "Новый mapping draft";
    case "PUBLISH_MAPPING":
      return "Публикация mapping";
    case "ROLLBACK_MAPPING":
      return "Rollback mapping";
  }
}

function receiptIdFrom(cause: unknown): string | null {
  const details = normalizeApiError(cause).details;
  if (!details || typeof details !== "object" || !("receiptId" in details))
    return null;
  const value = details.receiptId;
  return typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu.test(
      value,
    )
    ? value.toLowerCase()
    : null;
}

function attemptOperation(attempt: SettingsAttempt): string {
  return {
    TEST_CONNECTION: "TEST_CONNECTION",
    START_OAUTH: "START_OAUTH",
    SELECT_OAUTH_TENANT: "SELECT_OAUTH_TENANT",
    RECONNECT_CONNECTION: "RECONNECT_OAUTH",
    DISABLE_CONNECTION: "DISABLE_CONNECTION",
    REVOKE_CONNECTION: "REVOKE_CONNECTION",
    REFRESH_CATALOG: "REFRESH_CATALOG",
    CREATE_MAPPING: "MAPPING_CREATE",
    SAVE_MAPPING: "MAPPING_REPLACE_DRAFT",
    BEGIN_MAPPING_DRAFT: "MAPPING_BEGIN_DRAFT",
    PUBLISH_MAPPING: "MAPPING_PUBLISH",
    ROLLBACK_MAPPING: "MAPPING_ROLLBACK",
  }[attempt.kind];
}

/** Owns one actor + Project settings scope and one exact audited attempt. */
export function createSupportExternalSettingsController(
  context: SupportExternalSettingsContext,
  source: SupportExternalWorkSource,
) {
  const connections = ref<SupportExternalConnectionResponseDto[]>([]);
  const mappings = ref<SupportExternalMappingRootResponseDto[]>([]);
  const selectedConnectionId = ref<string | null>(null);
  const selectedMappingId = ref<string | null>(null);
  const catalog = ref<SupportExternalCatalogResponseDto | null>(null);
  const mappingDraft = ref<SupportExternalMappingDraftResponseDto | null>(null);
  const validation = ref<SupportExternalMappingValidationResponseDto | null>(null);
  const preview = ref<SupportExternalMappingPreviewResponseDto | null>(null);
  const diff = ref<SupportExternalMappingDiffResponseDto | null>(null);
  const revisions = ref<SupportExternalMappingPublishedRevisionResponseDto[]>([]);
  const oauth = ref<SupportExternalOAuthStartResponseDto | null>(null);
  const oauthTenants = ref<SupportExternalOAuthTenantResponseDto[]>([]);
  const loading = ref(false);
  const loadingDetail = ref(false);
  const mutating = ref(false);
  const error = ref("");
  const success = ref("");
  const conflict = ref(false);
  const conflictDraft = ref<{
    mappingId: string;
    body: UpdateSupportExternalMappingDraftDto;
  } | null>(null);
  const recovery = ref<SupportExternalSettingsRecovery | null>(null);
  let generation = 0;
  let detailGeneration = 0;
  let loadAbort: AbortController | null = null;
  let detailAbort: AbortController | null = null;
  let auxiliaryAbort: AbortController | null = null;
  let mutationAbort: AbortController | null = null;
  let pendingAttempt: SettingsAttempt | null = null;
  let pendingAttemptScope: string | null = null;
  let pendingReceiptId: string | null = null;

  const selectedConnection = computed(
    () =>
      connections.value.find((item) => item.id === selectedConnectionId.value) ??
      null,
  );
  const selectedMapping = computed(
    () => mappings.value.find((item) => item.id === selectedMappingId.value) ?? null,
  );
  const connectionMappings = computed(() =>
    mappings.value.filter(
      (item) => item.connectionId === selectedConnectionId.value,
    ),
  );

  function scopeKey(): string | null {
    const scope = retainedScope(context);
    return scope && context.canManage() ? scope : null;
  }

  function current(scope: string, requestGeneration: number): boolean {
    return generation === requestGeneration && scopeKey() === scope;
  }

  function purge(): void {
    connections.value = [];
    mappings.value = [];
    selectedConnectionId.value = null;
    selectedMappingId.value = null;
    catalog.value = null;
    mappingDraft.value = null;
    validation.value = null;
    preview.value = null;
    diff.value = null;
    revisions.value = [];
    oauth.value = null;
    oauthTenants.value = [];
    loading.value = false;
    loadingDetail.value = false;
    mutating.value = false;
    recovery.value = null;
    conflictDraft.value = null;
  }

  function reset(): void {
    if (pendingAttemptScope && pendingAttempt && mutating.value)
      retainedAttempts.set(pendingAttemptScope, {
        attempt: pendingAttempt,
        state: "UNKNOWN_OUTCOME",
        ...(pendingReceiptId ? { receiptId: pendingReceiptId } : {}),
      });
    generation += 1;
    detailGeneration += 1;
    loadAbort?.abort();
    detailAbort?.abort();
    auxiliaryAbort?.abort();
    mutationAbort?.abort();
    loadAbort = null;
    detailAbort = null;
    auxiliaryAbort = null;
    mutationAbort = null;
    pendingAttempt = null;
    pendingAttemptScope = null;
    pendingReceiptId = null;
    purge();
    error.value = "";
    success.value = "";
    conflict.value = false;
  }

  function restoreAttempt(scope: string): void {
    const retained = retainedAttempts.get(scope);
    if (!retained) return;
    pendingAttempt = retained.attempt;
    pendingAttemptScope = scope;
    pendingReceiptId = retained.receiptId ?? null;
    recovery.value = retained.state;
    error.value = retained.receiptId
      ? `${attemptLabel(retained.attempt)} ожидает authoritative receipt. Разрешена только проверка статуса.`
      : `${attemptLabel(retained.attempt)} не подтверждена. Разрешён только точный повтор.`;
  }

  function isDefiniteAccessFailure(cause: unknown): boolean {
    const value = normalizeApiError(cause);
    return (
      value.status === 401 ||
      value.status === 403 ||
      value.status === 404 ||
      value.status === 428 ||
      value.code === "MFA_REQUIRED" ||
      value.code === "MFA_ENROLLMENT_REQUIRED"
    );
  }

  async function handleAccessFailure(
    cause: unknown,
    attemptScope = retainedScope(context),
  ): Promise<boolean> {
    const value = normalizeApiError(cause);
    if (value.status === 403 || value.status === 404) {
      if (attemptScope) retainedAttempts.delete(attemptScope);
      purge();
      error.value = "External Work недоступен для текущего Project или роли.";
      await context.onForbidden?.();
      return true;
    }
    if (
      value.status === 401 ||
      value.status === 428 ||
      value.code === "MFA_REQUIRED" ||
      value.code === "MFA_ENROLLMENT_REQUIRED"
    ) {
      if (attemptScope) retainedAttempts.delete(attemptScope);
      purge();
      error.value = "Нужна свежая аутентификация. Команда не будет повторена.";
      await context.onAuthenticationRequired?.();
      return true;
    }
    return false;
  }

  async function selectConnection(
    connectionId: string,
    preferredMappingId?: string | null,
  ): Promise<void> {
    const scope = scopeKey();
    if (!scope) return;
    detailAbort?.abort();
    const requestGeneration = ++detailGeneration;
    const abort = new AbortController();
    detailAbort = abort;
    selectedConnectionId.value = connectionId;
    catalog.value = null;
    loadingDetail.value = true;
    try {
      const next = await source.readCatalog(
        context.projectId()!,
        connectionId,
        undefined,
        abort.signal,
      );
      if (
        requestGeneration !== detailGeneration ||
        scopeKey() !== scope ||
        selectedConnectionId.value !== connectionId
      )
        return;
      catalog.value = next;
      const mapping =
        mappings.value.find(
          (item) =>
            item.id === preferredMappingId && item.connectionId === connectionId,
        ) ??
        mappings.value.find((item) => item.connectionId === connectionId);
      if (mapping) await selectMapping(mapping.id);
      else {
        selectedMappingId.value = null;
        mappingDraft.value = null;
        revisions.value = [];
      }
    } catch (cause) {
      if (requestGeneration !== detailGeneration || scopeKey() !== scope) return;
      if (normalizeApiError(cause).name === "AbortError") return;
      if (await handleAccessFailure(cause)) return;
      error.value = "Catalog пока недоступен. Connection state сохранён.";
    } finally {
      if (requestGeneration === detailGeneration) {
        loadingDetail.value = false;
        detailAbort = null;
      }
    }
  }

  async function selectMapping(mappingId: string): Promise<void> {
    const scope = scopeKey();
    const projectId = context.projectId();
    if (!scope || !projectId) return;
    const root = mappings.value.find((item) => item.id === mappingId);
    if (!root || root.connectionId !== selectedConnectionId.value) return;
    if (conflictDraft.value?.mappingId !== mappingId)
      conflictDraft.value = null;
    detailAbort?.abort();
    const requestGeneration = ++detailGeneration;
    const abort = new AbortController();
    detailAbort = abort;
    selectedMappingId.value = mappingId;
    mappingDraft.value = null;
    validation.value = null;
    preview.value = null;
    diff.value = null;
    revisions.value = [];
    loadingDetail.value = true;
    try {
      const [nextDraft, nextRevisions] = await Promise.all([
        root?.draftRevisionId
          ? source.readMappingDraft(projectId, mappingId, abort.signal)
          : Promise.resolve(null),
        source.listMappingRevisions(projectId, mappingId, { limit: 20 }, abort.signal),
      ]);
      if (
        requestGeneration !== detailGeneration ||
        scopeKey() !== scope ||
        selectedMappingId.value !== mappingId
      )
        return;
      mappingDraft.value = nextDraft;
      revisions.value = nextRevisions.items;
    } catch (cause) {
      if (requestGeneration !== detailGeneration || scopeKey() !== scope) return;
      if (normalizeApiError(cause).name === "AbortError") return;
      if (await handleAccessFailure(cause)) return;
      error.value = "Не удалось загрузить mapping evidence.";
    } finally {
      if (requestGeneration === detailGeneration) {
        loadingDetail.value = false;
        detailAbort = null;
      }
    }
  }

  async function loadAuthoritative(allowDuringMutation: boolean): Promise<boolean> {
    if (mutating.value && !allowDuringMutation) return false;
    loadAbort?.abort();
    const scope = scopeKey();
    const projectId = context.projectId();
    if (!scope || !projectId) {
      reset();
      return false;
    }
    const preferredConnectionId = selectedConnectionId.value;
    const preferredMappingId = selectedMappingId.value;
    const requestGeneration = ++generation;
    const abort = new AbortController();
    loadAbort = abort;
    loading.value = true;
    error.value = "";
    success.value = "";
    conflict.value = false;
    try {
      const [nextConnections, nextMappings] = await Promise.all([
        readAllConnections(projectId, abort.signal),
        readAllMappings(projectId, abort.signal),
      ]);
      if (!current(scope, requestGeneration)) return false;
      connections.value = nextConnections;
      mappings.value = nextMappings;
      selectedConnectionId.value = nextConnections.some(
        (item) => item.id === preferredConnectionId,
      )
        ? preferredConnectionId
        : (nextConnections[0]?.id ?? null);
      selectedMappingId.value = null;
      if (selectedConnectionId.value)
        await selectConnection(selectedConnectionId.value, preferredMappingId);
      if (current(scope, requestGeneration)) restoreAttempt(scope);
      return true;
    } catch (cause) {
      if (!current(scope, requestGeneration)) return false;
      if (normalizeApiError(cause).name === "AbortError") return false;
      if (await handleAccessFailure(cause)) return false;
      purge();
      error.value = "Не удалось загрузить authoritative External Work settings.";
      return false;
    } finally {
      if (current(scope, requestGeneration)) {
        loading.value = false;
        loadAbort = null;
      }
    }
  }

  async function load(): Promise<void> {
    await loadAuthoritative(false);
  }

  async function readAllConnections(
    projectId: string,
    signal: AbortSignal,
  ): Promise<SupportExternalConnectionResponseDto[]> {
    const all: SupportExternalConnectionResponseDto[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await source.listConnections(projectId, cursor, signal);
      all.push(...page.items);
      if (!page.nextCursor) break;
      if (seen.has(page.nextCursor)) throw new Error("Connection cursor repeated");
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    } while (cursor);
    return all;
  }

  async function readAllMappings(
    projectId: string,
    signal: AbortSignal,
  ): Promise<SupportExternalMappingRootResponseDto[]> {
    const all: SupportExternalMappingRootResponseDto[] = [];
    const seen = new Set<string>();
    let cursor: string | undefined;
    do {
      const page = await source.listMappings(
        projectId,
        { limit: 50, ...(cursor ? { cursor } : {}) },
        signal,
      );
      all.push(...page.items);
      if (!page.nextCursor) break;
      if (seen.has(page.nextCursor)) throw new Error("Mapping cursor repeated");
      seen.add(page.nextCursor);
      cursor = page.nextCursor;
    } while (cursor);
    return all;
  }

  async function executeAttempt(
    projectId: string,
    attempt: SettingsAttempt,
    signal: AbortSignal,
  ): Promise<SupportExternalMutation<unknown>> {
    switch (attempt.kind) {
      case "TEST_CONNECTION":
        return source.testConnection(
          projectId,
          attempt.connectionId,
          attempt.idempotencyKey,
          signal,
        );
      case "START_OAUTH":
        return source.startOAuth(
          projectId,
          attempt.provider,
          attempt.idempotencyKey,
          signal,
        );
      case "RECONNECT_CONNECTION":
        return source.reconnectConnection(
          projectId,
          attempt.connectionId,
          attempt.expectedVersion,
          attempt.idempotencyKey,
          signal,
        );
      case "SELECT_OAUTH_TENANT":
        return source.selectOAuthTenant(
          projectId,
          attempt.sessionId,
          { tenantIdentity: attempt.tenantIdentity },
          attempt.idempotencyKey,
          signal,
        );
      case "DISABLE_CONNECTION":
        return source.disableConnection(
          projectId,
          attempt.connectionId,
          attempt.expectedVersion,
          attempt.idempotencyKey,
          signal,
        );
      case "REVOKE_CONNECTION":
        return source.revokeConnection(
          projectId,
          attempt.connectionId,
          attempt.expectedVersion,
          attempt.idempotencyKey,
          signal,
        );
      case "REFRESH_CATALOG":
        return source.refreshCatalog(
          projectId,
          attempt.connectionId,
          attempt.idempotencyKey,
          signal,
        );
      case "CREATE_MAPPING":
        return source.createMapping(
          projectId,
          attempt.body,
          attempt.idempotencyKey,
          signal,
        );
      case "SAVE_MAPPING":
        return source.replaceMappingDraft(
          projectId,
          attempt.mappingId,
          attempt.expectedVersion,
          attempt.body,
          attempt.idempotencyKey,
          signal,
        );
      case "BEGIN_MAPPING_DRAFT":
        return source.beginMappingDraft(
          projectId,
          attempt.mappingId,
          attempt.expectedVersion,
          attempt.idempotencyKey,
          signal,
        );
      case "PUBLISH_MAPPING":
        return source.publishMapping(
          projectId,
          attempt.mappingId,
          attempt.expectedVersion,
          attempt.idempotencyKey,
          signal,
        );
      case "ROLLBACK_MAPPING":
        return source.rollbackMapping(
          projectId,
          attempt.mappingId,
          attempt.revisionId,
          attempt.expectedVersion,
          attempt.body,
          attempt.idempotencyKey,
          signal,
        );
    }
  }

  async function run(attempt: SettingsAttempt): Promise<void> {
    if (mutating.value) return;
    const scope = scopeKey();
    const projectId = context.projectId();
    if (!scope || !projectId) return;
    const requestGeneration = generation;
    const abort = new AbortController();
    mutationAbort = abort;
    pendingAttempt = attempt;
    pendingAttemptScope = scope;
    pendingReceiptId = null;
    retainedAttempts.set(scope, { attempt, state: "UNKNOWN_OUTCOME" });
    mutating.value = true;
    error.value = "";
    success.value = "";
    conflict.value = false;
    try {
      const result = await executeAttempt(projectId, attempt, abort.signal);
      if (!current(scope, requestGeneration)) return;
      if (
        attempt.kind === "START_OAUTH" ||
        attempt.kind === "RECONNECT_CONNECTION"
      ) {
        oauth.value = result.value as SupportExternalOAuthStartResponseDto;
        context.openOAuth?.(oauth.value.launchPath);
      }
      if (attempt.kind === "SELECT_OAUTH_TENANT") {
        oauth.value = null;
        oauthTenants.value = [];
      }
      if (
        attempt.kind === "SAVE_MAPPING" &&
        conflictDraft.value?.mappingId === attempt.mappingId
      )
        conflictDraft.value = null;
      pendingReceiptId = result.metadata.receiptId;
      retainedAttempts.delete(scope);
      recovery.value = null;
      const reconciled = await loadAuthoritative(true);
      if (!reconciled && scopeKey() === scope) {
        retainedAttempts.set(scope, {
          attempt,
          state: "RETRYABLE_FAILURE",
          ...(pendingReceiptId ? { receiptId: pendingReceiptId } : {}),
        });
        pendingAttempt = attempt;
        pendingAttemptScope = scope;
        recovery.value = "RETRYABLE_FAILURE";
        error.value = `${attemptLabel(attempt)} получила receipt, но authoritative state не перечитан. Разрешён только точный повтор.`;
        return;
      }
      pendingAttempt = null;
      pendingAttemptScope = null;
      pendingReceiptId = null;
      if (scopeKey() === scope)
        success.value = `${attemptLabel(attempt)} подтверждена сервером и перечитана.`;
    } catch (cause) {
      const value = normalizeApiError(cause);
      if (isDefiniteAccessFailure(value)) retainedAttempts.delete(scope);
      if (!current(scope, requestGeneration)) return;
      if (await handleAccessFailure(value, scope)) return;
      if (
        value.status === 409 &&
        (value.code === "SUPPORT_EXTERNAL_MUTATION_OUTCOME_PENDING" ||
          value.code === "SUPPORT_EXTERNAL_MUTATION_OUTCOME_UNKNOWN")
      ) {
        const receiptId = receiptIdFrom(value);
        if (!receiptId) {
          recovery.value = "UNKNOWN_OUTCOME";
          error.value = "Mutation receipt повреждён. Новые intent заблокированы до ручной сверки.";
          return;
        }
        pendingReceiptId = receiptId;
        retainedAttempts.set(scope, {
          attempt,
          state: "UNKNOWN_OUTCOME",
          receiptId,
        });
        await reconcileReceipt(scope, projectId, attempt, receiptId, abort.signal);
        return;
      }
      if (value.status === 409 && value.code === "VERSION_CONFLICT") {
        retainedAttempts.delete(scope);
        pendingAttempt = null;
        pendingAttemptScope = null;
        pendingReceiptId = null;
        recovery.value = null;
        conflictDraft.value =
          attempt.kind === "SAVE_MAPPING"
            ? { mappingId: attempt.mappingId, body: attempt.body }
            : null;
        await loadAuthoritative(true);
        conflict.value = true;
        error.value = "Состояние изменилось на сервере. Draft сохранён; подтвердите действие заново.";
        return;
      }
      if (value.status === 0) {
        retainedAttempts.set(scope, { attempt, state: "UNKNOWN_OUTCOME" });
        recovery.value = "UNKNOWN_OUTCOME";
        error.value = `${attemptLabel(attempt)} имеет неизвестный результат. Разрешён только точный повтор.`;
        return;
      }
      if (value.status === 503 || value.status === 429) {
        retainedAttempts.set(scope, { attempt, state: "RETRYABLE_FAILURE" });
        recovery.value = "RETRYABLE_FAILURE";
        error.value = `${attemptLabel(attempt)} временно недоступна. Повтор сохранит тот же intent.`;
        return;
      }
      retainedAttempts.delete(scope);
      pendingAttempt = null;
      pendingAttemptScope = null;
      pendingReceiptId = null;
      recovery.value = null;
      error.value = `${attemptLabel(attempt)} отклонена. Проверьте authoritative state.`;
    } finally {
      if (mutationAbort === abort) {
        mutationAbort = null;
        mutating.value = false;
      }
    }
  }

  async function reconcileReceipt(
    scope: string,
    projectId: string,
    attempt: SettingsAttempt,
    receiptId: string,
    signal: AbortSignal,
  ): Promise<void> {
    try {
      const outcome = await source.readSettingsMutation(projectId, receiptId, signal);
      if (scopeKey() !== scope) return;
      if (
        outcome.receiptId !== receiptId ||
        outcome.operation !== attemptOperation(attempt)
      ) {
        recovery.value = "UNKNOWN_OUTCOME";
        error.value = "Mutation receipt не соответствует сохранённому intent. Нужна ручная сверка.";
        return;
      }
      if (outcome.status !== "SUCCEEDED") {
        retainedAttempts.set(scope, {
          attempt,
          state: "UNKNOWN_OUTCOME",
          receiptId,
        });
        recovery.value = "UNKNOWN_OUTCOME";
        error.value =
          outcome.status === "PENDING"
            ? "Mutation ещё выполняется. Новые intent заблокированы; проверьте статус позже."
            : "Backend не может доказать outcome. Новые intent заблокированы до ручной сверки.";
        return;
      }
      retainedAttempts.delete(scope);
      recovery.value = null;
      const reconciled = await loadAuthoritative(true);
      if (!reconciled && scopeKey() === scope) {
        retainedAttempts.set(scope, {
          attempt,
          state: "RETRYABLE_FAILURE",
          receiptId,
        });
        recovery.value = "RETRYABLE_FAILURE";
        error.value = "Receipt подтверждён, но authoritative state не перечитан. Проверьте статус снова.";
        return;
      }
      pendingAttempt = null;
      pendingAttemptScope = null;
      pendingReceiptId = null;
      success.value = `${attemptLabel(attempt)} подтверждена receipt и authoritative state.`;
    } catch (cause) {
      if (scopeKey() !== scope) return;
      if (normalizeApiError(cause).name === "AbortError") return;
      if (await handleAccessFailure(cause, scope)) return;
      retainedAttempts.set(scope, {
        attempt,
        state: "RETRYABLE_FAILURE",
        receiptId,
      });
      recovery.value = "RETRYABLE_FAILURE";
      error.value = "Mutation receipt пока недоступен. Новые intent остаются заблокированы.";
    }
  }

  function key(): string {
    return context.createIdempotencyKey?.() ?? crypto.randomUUID();
  }

  async function testSelectedConnection(): Promise<void> {
    const connection = selectedConnection.value;
    if (!connection || recovery.value) return;
    await run({
      kind: "TEST_CONNECTION",
      connectionId: connection.id,
      idempotencyKey: key(),
    });
  }

  async function createMapping(body: CreateSupportExternalMappingDto): Promise<void> {
    if (recovery.value) return;
    await run({ kind: "CREATE_MAPPING", body, idempotencyKey: key() });
  }

  async function startOAuth(provider: SupportExternalProvider): Promise<void> {
    if (recovery.value) return;
    await run({ kind: "START_OAUTH", provider, idempotencyKey: key() });
  }

  async function reconnectSelectedConnection(): Promise<void> {
    const connection = selectedConnection.value;
    if (!connection || recovery.value) return;
    await run({
      kind: "RECONNECT_CONNECTION",
      connectionId: connection.id,
      expectedVersion: connection.version,
      idempotencyKey: key(),
    });
  }

  async function disableSelectedConnection(): Promise<void> {
    const connection = selectedConnection.value;
    if (!connection || recovery.value) return;
    await run({
      kind: "DISABLE_CONNECTION",
      connectionId: connection.id,
      expectedVersion: connection.version,
      idempotencyKey: key(),
    });
  }

  async function revokeSelectedConnection(): Promise<void> {
    const connection = selectedConnection.value;
    if (!connection || recovery.value) return;
    await run({
      kind: "REVOKE_CONNECTION",
      connectionId: connection.id,
      expectedVersion: connection.version,
      idempotencyKey: key(),
    });
  }

  async function refreshSelectedCatalog(): Promise<void> {
    const connection = selectedConnection.value;
    if (!connection || recovery.value) return;
    await run({
      kind: "REFRESH_CATALOG",
      connectionId: connection.id,
      idempotencyKey: key(),
    });
  }

  async function saveMapping(body: UpdateSupportExternalMappingDraftDto): Promise<void> {
    const mapping = selectedMapping.value;
    if (!mapping || recovery.value) return;
    await run({
      kind: "SAVE_MAPPING",
      mappingId: mapping.id,
      expectedVersion: mapping.version,
      body,
      idempotencyKey: key(),
    });
  }

  async function beginMappingDraft(): Promise<void> {
    const mapping = selectedMapping.value;
    if (!mapping || recovery.value) return;
    await run({
      kind: "BEGIN_MAPPING_DRAFT",
      mappingId: mapping.id,
      expectedVersion: mapping.version,
      idempotencyKey: key(),
    });
  }

  async function runAuxiliary<T>(
    read: (projectId: string, signal: AbortSignal) => Promise<T>,
    commit: (value: T) => void,
    failureCopy: string,
  ): Promise<void> {
    auxiliaryAbort?.abort();
    const scope = scopeKey();
    const projectId = context.projectId();
    if (!scope || !projectId || mutating.value) return;
    const requestGeneration = generation;
    const selectedConnection = selectedConnectionId.value;
    const selectedMapping = selectedMappingId.value;
    const sessionId = oauth.value?.sessionId ?? null;
    const abort = new AbortController();
    auxiliaryAbort = abort;
    try {
      const value = await read(projectId, abort.signal);
      if (
        !current(scope, requestGeneration) ||
        selectedConnectionId.value !== selectedConnection ||
        selectedMappingId.value !== selectedMapping ||
        (sessionId !== null && oauth.value?.sessionId !== sessionId)
      )
        return;
      commit(value);
    } catch (cause) {
      if (!current(scope, requestGeneration)) return;
      if (normalizeApiError(cause).name === "AbortError") return;
      if (await handleAccessFailure(cause)) return;
      error.value = failureCopy;
    } finally {
      if (auxiliaryAbort === abort) auxiliaryAbort = null;
    }
  }

  async function validateMapping(): Promise<void> {
    const mappingId = selectedMappingId.value;
    if (!mappingId) return;
    await runAuxiliary(
      (projectId, signal) => source.validateMapping(projectId, mappingId, signal),
      (value) => {
        validation.value = value;
      },
      "Не удалось проверить mapping draft.",
    );
  }

  async function previewMapping(body: PreviewSupportExternalMappingDto): Promise<void> {
    const mappingId = selectedMappingId.value;
    if (!mappingId) return;
    await runAuxiliary(
      (projectId, signal) => source.previewMapping(projectId, mappingId, body, signal),
      (value) => {
        preview.value = value;
      },
      "Не удалось построить безопасный preview.",
    );
  }

  async function diffMapping(): Promise<void> {
    const mappingId = selectedMappingId.value;
    if (!mappingId) return;
    await runAuxiliary(
      (projectId, signal) => source.diffMapping(projectId, mappingId, signal),
      (value) => {
        diff.value = value;
      },
      "Не удалось перечитать version diff.",
    );
  }

  async function publishMapping(): Promise<void> {
    const mapping = selectedMapping.value;
    if (!mapping || !mappingDraft.value || recovery.value) return;
    await run({
      kind: "PUBLISH_MAPPING",
      mappingId: mapping.id,
      expectedVersion: mapping.version,
      idempotencyKey: key(),
    });
  }

  async function rollbackMapping(
    revisionId: string,
    reasonCode: RollbackSupportExternalMappingDto["reasonCode"],
  ): Promise<void> {
    const mapping = selectedMapping.value;
    if (!mapping || recovery.value) return;
    await run({
      kind: "ROLLBACK_MAPPING",
      mappingId: mapping.id,
      revisionId,
      expectedVersion: mapping.version,
      body: { reasonCode },
      idempotencyKey: key(),
    });
  }

  async function loadOAuthTenants(): Promise<void> {
    const sessionId = oauth.value?.sessionId;
    if (!sessionId) return;
    await runAuxiliary(
      (projectId, signal) => source.listOAuthTenants(projectId, sessionId, signal),
      (value) => {
        oauthTenants.value = value.items;
      },
      "Не удалось перечитать доступные site/account.",
    );
  }

  async function selectOAuthTenant(tenantIdentity: string): Promise<void> {
    const sessionId = oauth.value?.sessionId;
    if (!sessionId || !tenantIdentity || recovery.value) return;
    await run({
      kind: "SELECT_OAUTH_TENANT",
      sessionId,
      tenantIdentity,
      idempotencyKey: key(),
    });
  }

  async function retryPending(): Promise<void> {
    if (!pendingAttempt || mutating.value) return;
    if (pendingReceiptId) {
      const scope = scopeKey();
      const projectId = context.projectId();
      if (!scope || !projectId) return;
      const abort = new AbortController();
      mutationAbort = abort;
      mutating.value = true;
      try {
        await reconcileReceipt(
          scope,
          projectId,
          pendingAttempt,
          pendingReceiptId,
          abort.signal,
        );
      } finally {
        if (mutationAbort === abort) {
          mutationAbort = null;
          mutating.value = false;
        }
      }
      return;
    }
    await run(pendingAttempt);
  }

  function clearConflictDraft(): void {
    conflictDraft.value = null;
  }

  return {
    connections,
    mappings,
    selectedConnectionId,
    selectedMappingId,
    selectedConnection,
    selectedMapping,
    connectionMappings,
    catalog,
    mappingDraft,
    validation,
    preview,
    diff,
    revisions,
    oauth,
    oauthTenants,
    loading,
    loadingDetail,
    mutating,
    error,
    success,
    conflict,
    conflictDraft,
    recovery,
    load,
    reset,
    selectConnection,
    selectMapping,
    testSelectedConnection,
    createMapping,
    startOAuth,
    reconnectSelectedConnection,
    disableSelectedConnection,
    revokeSelectedConnection,
    refreshSelectedCatalog,
    saveMapping,
    beginMappingDraft,
    validateMapping,
    previewMapping,
    diffMapping,
    publishMapping,
    rollbackMapping,
    loadOAuthTenants,
    selectOAuthTenant,
    retryPending,
    clearConflictDraft,
  };
}
