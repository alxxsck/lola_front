import { computed, ref, shallowRef, type Ref } from 'vue';
import type {
  DisableSupportCaseNotificationPolicyDto,
  PublishSupportCaseNotificationPolicyDto,
  RestoreSupportCaseNotificationPolicyDto,
  SaveSupportCaseNotificationDraftDto,
  SupportCaseNotificationAvailableTeamDto,
  SupportCaseNotificationMetricsResponseDto,
  SupportCaseNotificationPolicyCurrentResponseDto,
  SupportCaseNotificationPolicyPreviewResponseDto,
} from '@/shared/api/generated/models';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  NotificationPolicyCommandBody,
  NotificationPolicyOperation,
  SupportCaseNotificationPolicySource,
} from '../api/support-case-notification-policy-source';
import {
  clonePolicyForm,
  createDefaultNotificationPolicy,
  policyFromRevision,
  policyFingerprint,
  revisionFingerprint,
  validatePolicyForm,
  type SupportCaseNotificationPolicyForm,
} from './support-case-notification-policy';

export interface SupportCaseNotificationPolicyContext {
  actorId(): string | undefined;
  projectId(): string | undefined;
  canManage(): boolean;
  createIdempotencyKey?(): string;
  onForbidden?(): void | Promise<void>;
  onAuthenticationRequired?(): void | Promise<void>;
}

interface Scope {
  actorId: string;
  projectId: string;
}
interface PendingCommand {
  scope: Scope;
  operation: NotificationPolicyOperation;
  key: string;
  body: NotificationPolicyCommandBody;
}

const memory = new Map<string, PendingCommand>();
const storagePrefix = 'support-case-notification-policy-command-v1:';
const scopeKey = (scope: Scope) => `${scope.actorId}:${scope.projectId}`;
const sameScope = (left: Scope | null, right: Scope | null) =>
  Boolean(left && right && left.actorId === right.actorId && left.projectId === right.projectId);
const operations = new Set<NotificationPolicyOperation>([
  'SAVE_DRAFT',
  'PUBLISH',
  'DISABLE',
  'RESTORE',
]);
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/iu;

function isPendingCommand(value: unknown, scope: Scope): value is PendingCommand {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<PendingCommand>;
  return (
    sameScope(candidate.scope as Scope | null, scope) &&
    typeof candidate.operation === 'string' &&
    operations.has(candidate.operation as NotificationPolicyOperation) &&
    typeof candidate.key === 'string' &&
    candidate.key.length >= 8 &&
    candidate.key.length <= 200 &&
    /^[\x21-\x7e]+$/u.test(candidate.key) &&
    Boolean(candidate.body && typeof candidate.body === 'object')
  );
}

function storageWrite(scope: Scope, command: PendingCommand | null): void {
  const key = scopeKey(scope);
  if (command) memory.set(key, structuredClone(command));
  else memory.delete(key);
  try {
    const storageKey = `${storagePrefix}${key}`;
    if (command) sessionStorage.setItem(storageKey, JSON.stringify(command));
    else sessionStorage.removeItem(storageKey);
  } catch {
    /* in-memory recovery remains authoritative for this tab */
  }
}

function storageRead(scope: Scope): PendingCommand | null {
  const cached = memory.get(scopeKey(scope));
  if (cached && isPendingCommand(cached, scope)) return structuredClone(cached);
  try {
    const raw = sessionStorage.getItem(`${storagePrefix}${scopeKey(scope)}`);
    if (!raw) return null;
    const value = JSON.parse(raw) as unknown;
    if (!isPendingCommand(value, scope)) return null;
    memory.set(scopeKey(scope), value);
    return structuredClone(value);
  } catch {
    return null;
  }
}

export function createSupportCaseNotificationPolicyController(
  context: SupportCaseNotificationPolicyContext,
  source: SupportCaseNotificationPolicySource,
) {
  const current = ref<SupportCaseNotificationPolicyCurrentResponseDto | null>(null);
  const metrics = ref<SupportCaseNotificationMetricsResponseDto | null>(null);
  const teams = ref<readonly SupportCaseNotificationAvailableTeamDto[]>([]);
  const form: Ref<SupportCaseNotificationPolicyForm> = ref(createDefaultNotificationPolicy());
  const preview = ref<SupportCaseNotificationPolicyPreviewResponseDto | null>(null);
  const previewFingerprint = ref<string | null>(null);
  const previewStale = ref(false);
  const pending = shallowRef<PendingCommand | null>(null);
  const loading = ref(false);
  const previewing = ref(false);
  const mutating = ref(false);
  const error = ref<string | null>(null);
  const success = ref<string | null>(null);
  let generation = 0;
  let readAbort: AbortController | null = null;
  let reconcileAbort: AbortController | null = null;
  let previewAbort: AbortController | null = null;
  let mutationAbort: AbortController | null = null;
  let activeScope: Scope | null = null;

  const formIssues = computed(() =>
    validatePolicyForm(form.value, current.value?.allowedTopicCodes ?? []),
  );
  const canSubmit = computed(
    () =>
      context.canManage() &&
      !loading.value &&
      !mutating.value &&
      !pending.value &&
      formIssues.value.length === 0,
  );
  const hasPublishedPolicy = computed(() => Boolean(current.value?.current));
  const draftMatchesForm = computed(
    () =>
      Boolean(current.value?.draft) &&
      revisionFingerprint(current.value!.draft!) === policyFingerprint(form.value),
  );
  const previewMatchesDraft = computed(
    () =>
      draftMatchesForm.value &&
      previewFingerprint.value === revisionFingerprint(current.value!.draft!),
  );

  function resolveScope(): Scope | null {
    const actorId = context.actorId();
    const projectId = context.projectId();
    return actorId && projectId && context.canManage() ? { actorId, projectId } : null;
  }

  function isCurrent(scope: Scope, run: number): boolean {
    return generation === run && sameScope(resolveScope(), scope);
  }

  function clearProtected(): void {
    current.value = null;
    metrics.value = null;
    teams.value = [];
    preview.value = null;
    previewFingerprint.value = null;
    previewStale.value = false;
    form.value = createDefaultNotificationPolicy();
  }

  function reset(options: { forgetPending?: boolean } = {}): void {
    generation += 1;
    readAbort?.abort();
    reconcileAbort?.abort();
    previewAbort?.abort();
    mutationAbort?.abort();
    if (options.forgetPending && activeScope) storageWrite(activeScope, null);
    pending.value = null;
    activeScope = null;
    loading.value = false;
    previewing.value = false;
    mutating.value = false;
    error.value = null;
    success.value = null;
    clearProtected();
  }

  async function handleAccess(errorValue: ApiError, scope?: Scope): Promise<boolean> {
    if ([401, 428].includes(errorValue.status)) {
      if (scope) storageWrite(scope, null);
      reset();
      await context.onAuthenticationRequired?.();
      return true;
    }
    if ([403, 404].includes(errorValue.status)) {
      if (scope) storageWrite(scope, null);
      reset();
      await context.onForbidden?.();
      return true;
    }
    return false;
  }

  function initializeForm(snapshot: SupportCaseNotificationPolicyCurrentResponseDto): void {
    const base = snapshot.draft ?? snapshot.current;
    form.value = base ? policyFromRevision(base) : createDefaultNotificationPolicy();
    preview.value = null;
    previewFingerprint.value = null;
    previewStale.value = false;
  }

  async function reconcile(
    scope: Scope,
    command: PendingCommand,
    run: number,
    signal?: AbortSignal,
  ): Promise<boolean> {
    try {
      const result = await source.lookup(scope.projectId, command.operation, command.key, signal);
      if (signal?.aborted || !isCurrent(scope, run)) return false;
      if (
        result.found &&
        result.operation === command.operation &&
        typeof result.receiptId === 'string' &&
        uuidPattern.test(result.receiptId) &&
        result.policy
      ) {
        const snapshot = await source.read(scope.projectId, signal);
        if (signal?.aborted || !isCurrent(scope, run)) return false;
        current.value = snapshot;
        initializeForm(snapshot);
        storageWrite(scope, null);
        pending.value = null;
        success.value = 'Сервер подтвердил результат предыдущей команды.';
        return true;
      }
      pending.value = command;
      return false;
    } catch (cause) {
      if (signal?.aborted || !isCurrent(scope, run)) return false;
      const apiError =
        cause instanceof ApiError
          ? cause
          : new ApiError(0, 'Не удалось проверить результат команды');
      if (await handleAccess(apiError, scope)) return false;
      pending.value = command;
      error.value =
        'Результат команды пока неизвестен. Новые изменения заблокированы до сверки с сервером.';
      return false;
    }
  }

  async function load(): Promise<void> {
    const scope = resolveScope();
    if (!scope) {
      reset({ forgetPending: true });
      return;
    }
    const previous = activeScope;
    if (previous && !sameScope(previous, scope)) reset();
    activeScope = scope;
    const run = ++generation;
    readAbort?.abort();
    const abort = new AbortController();
    readAbort = abort;
    loading.value = true;
    error.value = null;
    try {
      const snapshot = await source.read(scope.projectId, abort.signal);
      if (!isCurrent(scope, run)) return;
      current.value = snapshot;
      initializeForm(snapshot);
      const [metricsResult, teamsResult] = await Promise.allSettled([
        source.readMetrics(scope.projectId, abort.signal),
        source.listTeams(scope.projectId, abort.signal),
      ]);
      if (!isCurrent(scope, run)) return;
      metrics.value = metricsResult.status === 'fulfilled' ? metricsResult.value : null;
      teams.value = teamsResult.status === 'fulfilled' ? teamsResult.value : [];
      const retained = storageRead(scope);
      pending.value = retained;
      if (retained) await reconcile(scope, retained, run, abort.signal);
    } catch (cause) {
      if (abort.signal.aborted || !isCurrent(scope, run)) return;
      const apiError =
        cause instanceof ApiError
          ? cause
          : new ApiError(0, 'Не удалось загрузить политику уведомлений');
      if (!(await handleAccess(apiError, scope)))
        error.value = 'Не удалось загрузить политику. Проверьте соединение и повторите.';
    } finally {
      if (isCurrent(scope, run)) loading.value = false;
    }
  }

  function markPreviewStale(): void {
    if (preview.value) previewStale.value = true;
  }

  async function runPreview(): Promise<void> {
    const scope = resolveScope();
    if (!scope || formIssues.value.length) return;
    previewAbort?.abort();
    const abort = new AbortController();
    previewAbort = abort;
    const run = generation;
    previewing.value = true;
    error.value = null;
    try {
      const value = await source.preview(
        scope.projectId,
        clonePolicyForm(form.value),
        abort.signal,
      );
      if (!isCurrent(scope, run)) return;
      preview.value = value;
      previewFingerprint.value = policyFingerprint(form.value);
      previewStale.value = false;
    } catch (cause) {
      if (abort.signal.aborted || !isCurrent(scope, run)) return;
      const apiError =
        cause instanceof ApiError ? cause : new ApiError(0, 'Не удалось выполнить проверку');
      if (!(await handleAccess(apiError, scope)))
        error.value = 'Не удалось рассчитать влияние политики.';
    } finally {
      if (isCurrent(scope, run)) previewing.value = false;
    }
  }

  async function execute(
    operation: NotificationPolicyOperation,
    body: NotificationPolicyCommandBody,
    retainedCommand?: PendingCommand,
  ): Promise<void> {
    const scope = resolveScope();
    if (
      !scope ||
      mutating.value ||
      (!retainedCommand && pending.value) ||
      (retainedCommand && !sameScope(retainedCommand.scope, scope))
    )
      return;
    const command: PendingCommand = retainedCommand ?? {
      scope,
      operation,
      key: context.createIdempotencyKey?.() ?? crypto.randomUUID(),
      body: structuredClone(body),
    };
    storageWrite(scope, command);
    pending.value = command;
    mutationAbort = new AbortController();
    const run = generation;
    mutating.value = true;
    error.value = null;
    success.value = null;
    try {
      const result =
        operation === 'SAVE_DRAFT'
          ? await source.saveDraft(
              scope.projectId,
              body as SaveSupportCaseNotificationDraftDto,
              command.key,
              mutationAbort.signal,
            )
          : operation === 'PUBLISH'
            ? await source.publish(
                scope.projectId,
                body as PublishSupportCaseNotificationPolicyDto,
                command.key,
                mutationAbort.signal,
              )
            : operation === 'DISABLE'
              ? await source.disable(
                  scope.projectId,
                  body as DisableSupportCaseNotificationPolicyDto,
                  command.key,
                  mutationAbort.signal,
                )
              : await source.restore(
                  scope.projectId,
                  body as RestoreSupportCaseNotificationPolicyDto,
                  command.key,
                  mutationAbort.signal,
                );
      if (!isCurrent(scope, run)) return;
      if (!uuidPattern.test(result.receiptId) || !result.policy)
        throw new ApiError(0, 'Сервер вернул неполное подтверждение');
      current.value = result.policy;
      initializeForm(result.policy);
      storageWrite(scope, null);
      pending.value = null;
      success.value =
        operation === 'SAVE_DRAFT'
          ? 'Черновик сохранён.'
          : operation === 'PUBLISH'
            ? 'Политика опубликована.'
            : operation === 'DISABLE'
              ? 'Политика выключена.'
              : 'Версия восстановлена.';
    } catch (cause) {
      if (mutationAbort.signal.aborted || !isCurrent(scope, run)) return;
      const apiError = cause instanceof ApiError ? cause : new ApiError(0, 'Команда не завершена');
      if ([401, 403, 404, 428].includes(apiError.status)) {
        storageWrite(scope, null);
        pending.value = null;
        await handleAccess(apiError, scope);
      } else if (apiError.status === 409) {
        const localForm = clonePolicyForm(form.value);
        storageWrite(scope, null);
        pending.value = null;
        if (isCurrent(scope, run)) {
          mutating.value = false;
          await load();
          if (sameScope(resolveScope(), scope)) {
            form.value = localForm;
            preview.value = null;
            previewFingerprint.value = null;
            previewStale.value = false;
            error.value =
              'Политика изменилась на сервере. Ваши поля сохранены локально — проверьте их, снова сохраните черновик и выполните проверку.';
          }
        }
      } else if (
        apiError.status === 0 ||
        apiError.status === 408 ||
        apiError.status === 429 ||
        apiError.status >= 500
      ) {
        pending.value = command;
        await reconcile(scope, command, run, mutationAbort.signal);
        if (pending.value)
          error.value =
            'Результат команды пока неизвестен. Проверьте его, не создавая новую команду.';
      } else {
        storageWrite(scope, null);
        pending.value = null;
        error.value = 'Сервер отклонил изменение. Проверьте заполненные поля.';
      }
    } finally {
      if (isCurrent(scope, run)) mutating.value = false;
    }
  }

  const saveDraft = () =>
    current.value &&
    execute('SAVE_DRAFT', {
      ...clonePolicyForm(form.value),
      expectedVersion: current.value.version,
    });
  const publish = () => {
    const snapshot = current.value;
    if (
      !snapshot?.draft ||
      !draftMatchesForm.value ||
      !previewMatchesDraft.value ||
      previewStale.value ||
      !preview.value?.publishable
    )
      return;
    return execute('PUBLISH', {
      revisionId: snapshot.draft.id,
      expectedVersion: snapshot.version,
    });
  };
  const disable = () =>
    current.value &&
    execute('DISABLE', {
      expectedVersion: current.value.version,
      reason: form.value.reason.trim(),
    });
  const restore = (revisionId: string) =>
    current.value &&
    execute('RESTORE', {
      revisionId,
      expectedVersion: current.value.version,
      reason: form.value.reason.trim(),
    });
  const retryReconciliation = async () => {
    const scope = resolveScope();
    const command = pending.value;
    if (!scope || !command) return;
    reconcileAbort?.abort();
    const abort = new AbortController();
    reconcileAbort = abort;
    await reconcile(scope, command, generation, abort.signal);
  };
  const replayPendingCommand = async () => {
    const command = pending.value;
    if (!command) return;
    await execute(command.operation, command.body, command);
  };

  return {
    current,
    metrics,
    teams,
    form,
    preview,
    previewFingerprint,
    previewStale,
    pending,
    loading,
    previewing,
    mutating,
    error,
    success,
    formIssues,
    canSubmit,
    hasPublishedPolicy,
    draftMatchesForm,
    previewMatchesDraft,
    load,
    reset,
    markPreviewStale,
    runPreview,
    saveDraft,
    publish,
    disable,
    restore,
    retryReconciliation,
    replayPendingCommand,
  };
}
