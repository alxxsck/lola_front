import { computed, ref } from 'vue';
import { ApiError } from '@/shared/api/http/api-error';
import type { SupportMacroSource } from '@/features/support-macros/api/support-macros-source';
import type {
  RollbackSupportMacroDtoReasonCode,
  SupportMacroDraftDto,
  SupportMacroPreviewResponseDto,
  SupportMacroResponseDto,
  SupportMacroRevisionResponseDto,
  SupportMacroVariableDto,
} from '@/shared/api/generated/models';

export interface SupportMacroAuthoringContext {
  projectId(): string | undefined;
  canManage(): boolean;
  onForbidden?(): void | Promise<void>;
}

export interface SupportMacroAuthoringForm {
  stableCode: string;
  title: string;
  body: string;
  translations: Record<string, string>;
  shortcutsText: string;
  visibility: 'PROJECT' | 'TEAMS';
  teamIdsText: string;
  topicCodesText: string;
  variables: SupportMacroVariableDto[];
}

function emptyForm(): SupportMacroAuthoringForm {
  return {
    stableCode: '',
    title: '',
    body: '',
    translations: { ru: '' },
    shortcutsText: '',
    visibility: 'PROJECT',
    teamIdsText: '',
    topicCodesText: '',
    variables: [],
  };
}

function lines(value: string, limit: number): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, limit);
}

function toDraft(form: SupportMacroAuthoringForm): SupportMacroDraftDto {
  const translations = Object.fromEntries(
    Object.entries(form.translations).filter(([, value]) => value.trim()),
  );
  return {
    title: form.title.trim(),
    locale: 'ru',
    body: form.body,
    translations: { ...translations, ru: form.body },
    shortcuts: lines(form.shortcutsText, 10),
    visibility: {
      mode: form.visibility,
      ...(form.visibility === 'TEAMS' ? { teamIds: lines(form.teamIdsText, 50) } : {}),
      topicCodes: lines(form.topicCodesText, 50),
    },
    variables: form.variables.map((variable) => ({ ...variable })),
  };
}

function fromMacro(value: SupportMacroResponseDto): SupportMacroAuthoringForm {
  const configuration = value.draft?.configuration ?? value.publishedRevision?.configuration;
  return configuration
    ? {
        stableCode: value.stableCode,
        title: configuration.title,
        body: configuration.locale === 'ru' ? configuration.body : '',
        translations: {
          ...((
            configuration as typeof configuration & {
              translations?: Record<string, string>;
            }
          ).translations ?? { [configuration.locale]: configuration.body }),
          ru: configuration.locale === 'ru' ? configuration.body : '',
        },
        shortcutsText: configuration.shortcuts.join('\n'),
        visibility: configuration.visibility.mode,
        teamIdsText: configuration.visibility.teamIds.join('\n'),
        topicCodesText: configuration.visibility.topicCodes.join('\n'),
        variables: configuration.variables.map((variable) => ({
          name: variable.name,
          required: variable.required,
          ...(variable.fallback === null || variable.fallback === undefined
            ? {}
            : { fallback: variable.fallback }),
        })),
      }
    : { ...emptyForm(), stableCode: value.stableCode };
}

function valid(form: SupportMacroAuthoringForm): boolean {
  return Boolean(
    form.stableCode.trim().length >= 2 &&
    form.title.trim() &&
    form.body.trim() &&
    (form.visibility === 'PROJECT' || lines(form.teamIdsText, 50).length),
  );
}

function cloneForm(form: SupportMacroAuthoringForm): SupportMacroAuthoringForm {
  return {
    ...form,
    translations: { ...form.translations },
    variables: form.variables.map((variable) => ({ ...variable })),
  };
}

/** Owns the versioned Macro authoring lifecycle and preserves local edits across OCC conflicts. */
export function createSupportMacroAuthoringController(
  context: SupportMacroAuthoringContext,
  source: SupportMacroSource,
) {
  const items = ref<SupportMacroResponseDto[]>([]);
  const selected = ref<SupportMacroResponseDto | null>(null);
  const revisions = ref<SupportMacroRevisionResponseDto[]>([]);
  const nextCursor = ref<string | null>(null);
  const revisionsNextCursor = ref<string | null>(null);
  const form = ref<SupportMacroAuthoringForm>(emptyForm());
  const preview = ref<SupportMacroPreviewResponseDto | null>(null);
  const loading = ref(false);
  const saving = ref(false);
  const error = ref('');
  const conflict = ref('');
  const query = ref('');
  const translationStates = ref<Record<string, string>>({});
  let generation = 0;
  let abort: AbortController | null = null;
  let scopeProjectId: string | null = null;
  let mutationToken: symbol | null = null;
  const commandKeys = new Map<string, string>();

  const canSubmit = computed(() => context.canManage() && valid(form.value) && !saving.value);

  function commandKey(identity: string): string {
    const existing = commandKeys.get(identity);
    if (existing) return existing;
    const key = globalThis.crypto.randomUUID();
    commandKeys.set(identity, key);
    return key;
  }

  function assertIdentity(
    value: SupportMacroResponseDto,
    expected: { id?: string; stableCode?: string },
  ): void {
    if (
      (expected.id && value.id !== expected.id) ||
      (expected.stableCode && value.stableCode !== expected.stableCode) ||
      !value.actionEtag
    )
      throw new Error('Support Macro command receipt failed integrity validation');
  }

  function reset(): void {
    generation += 1;
    abort?.abort();
    abort = null;
    items.value = [];
    selected.value = null;
    revisions.value = [];
    nextCursor.value = null;
    revisionsNextCursor.value = null;
    form.value = emptyForm();
    preview.value = null;
    loading.value = false;
    saving.value = false;
    error.value = '';
    conflict.value = '';
    query.value = '';
    translationStates.value = {};
    commandKeys.clear();
    mutationToken = null;
    scopeProjectId = null;
  }

  function isCurrent(
    projectId: string,
    requestGeneration: number,
    macroId?: string | null,
  ): boolean {
    return Boolean(
      requestGeneration === generation &&
      context.canManage() &&
      context.projectId() === projectId &&
      (macroId === undefined || (selected.value?.id ?? null) === macroId),
    );
  }

  function formMatches(snapshot: SupportMacroAuthoringForm): boolean {
    return JSON.stringify(form.value) === JSON.stringify(snapshot);
  }

  async function forbidden(): Promise<void> {
    reset();
    await context.onForbidden?.();
  }

  async function load(cursor?: string): Promise<void> {
    const projectId = context.projectId();
    if (!projectId || !context.canManage()) {
      reset();
      return;
    }
    if (scopeProjectId !== projectId) {
      reset();
      scopeProjectId = projectId;
    }
    abort?.abort();
    const requestGeneration = ++generation;
    const requestAbort = new AbortController();
    abort = requestAbort;
    loading.value = true;
    error.value = '';
    try {
      const page = await source.authoringCatalog(
        projectId,
        {
          limit: 100,
          ...(query.value.trim() ? { query: query.value.trim() } : {}),
          ...(cursor ? { cursor } : {}),
        },
        requestAbort.signal,
      );
      if (!isCurrent(projectId, requestGeneration)) return;
      items.value = cursor ? [...items.value, ...page.items] : page.items;
      nextCursor.value = page.nextCursor;
      if (selected.value) {
        const current = page.items.find((item) => item.id === selected.value?.id);
        if (current) selected.value = current;
      }
    } catch (cause) {
      if (!isCurrent(projectId, requestGeneration)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return;
      }
      if (cause instanceof ApiError && cause.status === 409 && cursor) {
        await load();
        if (context.projectId() === projectId)
          conflict.value = 'Каталог изменился. Список обновлён с первой страницы.';
        return;
      }
      error.value = 'Не удалось загрузить настройки шаблонов.';
    } finally {
      if (requestGeneration === generation) {
        loading.value = false;
        abort = null;
      }
    }
  }

  function createNew(): void {
    generation += 1;
    abort?.abort();
    abort = null;
    selected.value = null;
    revisions.value = [];
    revisionsNextCursor.value = null;
    form.value = emptyForm();
    preview.value = null;
    error.value = '';
    conflict.value = '';
    translationStates.value = {};
  }

  async function select(macro: SupportMacroResponseDto): Promise<void> {
    const projectId = context.projectId();
    if (!projectId || !context.canManage()) return;
    if (scopeProjectId && scopeProjectId !== projectId) reset();
    scopeProjectId = projectId;
    abort?.abort();
    const requestGeneration = ++generation;
    const requestAbort = new AbortController();
    abort = requestAbort;
    loading.value = true;
    error.value = '';
    try {
      const [detail, history] = await Promise.all([
        source.readAuthoring(projectId, macro.id, requestAbort.signal),
        source.revisions(projectId, macro.id, undefined, requestAbort.signal),
      ]);
      if (!isCurrent(projectId, requestGeneration)) return;
      selected.value = detail;
      revisions.value = history.items;
      revisionsNextCursor.value = history.nextCursor;
      form.value = fromMacro(detail);
      translationStates.value = Object.fromEntries(
        Object.keys(form.value.translations).map((locale) => [locale, 'READY']),
      );
      preview.value = null;
      error.value = '';
      conflict.value = '';
    } catch (cause) {
      if (!isCurrent(projectId, requestGeneration)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return;
      }
      error.value = 'Не удалось открыть шаблон.';
    } finally {
      if (requestGeneration === generation) {
        loading.value = false;
        abort = null;
      }
    }
  }

  async function loadMoreRevisions(): Promise<void> {
    const projectId = context.projectId();
    const macroId = selected.value?.id;
    const cursor = revisionsNextCursor.value;
    if (!projectId || !macroId || !cursor || loading.value) return;
    const requestGeneration = generation;
    loading.value = true;
    try {
      const page = await source.revisions(projectId, macroId, cursor);
      if (
        requestGeneration !== generation ||
        context.projectId() !== projectId ||
        selected.value?.id !== macroId
      )
        return;
      revisions.value = [...revisions.value, ...page.items];
      revisionsNextCursor.value = page.nextCursor;
    } catch (cause) {
      if (!isCurrent(projectId, requestGeneration, macroId)) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return;
      }
      if (cause instanceof ApiError && cause.status === 409) {
        try {
          const page = await source.revisions(projectId, macroId);
          if (!isCurrent(projectId, requestGeneration, macroId)) return;
          revisions.value = page.items;
          revisionsNextCursor.value = page.nextCursor;
          conflict.value = 'История изменилась. Версии обновлены с первой страницы.';
        } catch (recoveryCause) {
          if (
            recoveryCause instanceof ApiError &&
            (recoveryCause.status === 403 || recoveryCause.status === 404)
          )
            await forbidden();
          else error.value = 'Не удалось обновить историю. Ваш текст остаётся в форме.';
        }
        return;
      }
      error.value = 'Не удалось загрузить следующую страницу версий.';
    } finally {
      if (requestGeneration === generation) loading.value = false;
    }
  }

  async function validatePreview(): Promise<boolean> {
    const projectId = context.projectId();
    if (!projectId || !canSubmit.value) return false;
    if (scopeProjectId && scopeProjectId !== projectId) {
      reset();
      return false;
    }
    scopeProjectId = projectId;
    const requestGeneration = generation;
    const macroId = selected.value?.id ?? null;
    const token = Symbol('macro-preview');
    mutationToken = token;
    saving.value = true;
    error.value = '';
    try {
      const next = await source.preview(projectId, toDraft(form.value));
      if (!isCurrent(projectId, requestGeneration, macroId) || mutationToken !== token)
        return false;
      preview.value = next;
      return true;
    } catch (cause) {
      if (!isCurrent(projectId, requestGeneration, macroId) || mutationToken !== token)
        return false;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return false;
      }
      error.value =
        'Шаблон не прошёл проверку сервера. Проверьте текст, переводы и область видимости.';
      return false;
    } finally {
      if (mutationToken === token) {
        mutationToken = null;
        saving.value = false;
      }
    }
  }

  async function refreshConflict(
    local: SupportMacroAuthoringForm,
    projectId: string,
    macroId: string,
    requestGeneration: number,
    token: symbol,
  ): Promise<void> {
    try {
      const next = await source.readAuthoring(projectId, macroId);
      if (!isCurrent(projectId, requestGeneration, macroId) || mutationToken !== token) return;
      selected.value = next;
      form.value = local;
      conflict.value =
        'Шаблон изменился на сервере. Ваш текст сохранён — проверьте новую версию и повторите.';
    } catch (cause) {
      if (!isCurrent(projectId, requestGeneration, macroId) || mutationToken !== token) return;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return;
      }
      error.value = 'Не удалось сверить конфликт. Ваш текст остаётся в форме.';
    }
  }

  async function saveDraft(): Promise<boolean> {
    const projectId = context.projectId();
    if (!projectId || !canSubmit.value) return false;
    if (scopeProjectId && scopeProjectId !== projectId) {
      reset();
      return false;
    }
    scopeProjectId = projectId;
    const local = cloneForm(form.value);
    const current = selected.value;
    const requestGeneration = generation;
    const token = Symbol('macro-save');
    mutationToken = token;
    saving.value = true;
    error.value = '';
    conflict.value = '';
    try {
      const draft = toDraft(local);
      const identity = current
        ? `REPLACE\u001f${current.id}\u001f${current.actionEtag}\u001f${JSON.stringify(draft)}`
        : `CREATE\u001f${local.stableCode.trim()}\u001f${JSON.stringify(draft)}`;
      const next = current
        ? await source.replaceDraft(
            projectId,
            current.id,
            draft,
            current.actionEtag,
            commandKey(identity),
          )
        : await source.create(projectId, local.stableCode.trim(), draft, commandKey(identity));
      if (!isCurrent(projectId, requestGeneration, current?.id ?? null) || mutationToken !== token)
        return false;
      assertIdentity(next, current ? { id: current.id } : { stableCode: local.stableCode.trim() });
      commandKeys.delete(identity);
      selected.value = next;
      if (formMatches(local)) form.value = fromMacro(next);
      else
        conflict.value = 'Шаблон сохранён, а новые правки остались в форме. Сохраните их отдельно.';
      preview.value = null;
      await load();
      return true;
    } catch (cause) {
      if (!isCurrent(projectId, requestGeneration, current?.id ?? null) || mutationToken !== token)
        return false;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return false;
      }
      if (cause instanceof ApiError && cause.status === 409 && current)
        await refreshConflict(local, projectId, current.id, requestGeneration, token);
      else error.value = 'Не удалось сохранить черновик шаблона.';
      return false;
    } finally {
      if (mutationToken === token) {
        mutationToken = null;
        saving.value = false;
      }
    }
  }

  async function execute(kind: 'PUBLISH' | 'ARCHIVE'): Promise<boolean> {
    const projectId = context.projectId();
    const current = selected.value;
    if (!projectId || !current || !context.canManage() || saving.value) return false;
    if (scopeProjectId !== projectId) {
      reset();
      return false;
    }
    const requestGeneration = generation;
    const token = Symbol(`macro-${kind.toLowerCase()}`);
    mutationToken = token;
    saving.value = true;
    error.value = '';
    const local = cloneForm(form.value);
    const identity = `${kind}\u001f${current.id}\u001f${current.actionEtag}`;
    try {
      const next =
        kind === 'PUBLISH'
          ? await source.publish(projectId, current.id, current.actionEtag, commandKey(identity))
          : await source.archive(projectId, current.id, current.actionEtag, commandKey(identity));
      if (!isCurrent(projectId, requestGeneration, current.id) || mutationToken !== token)
        return false;
      assertIdentity(next, { id: current.id });
      commandKeys.delete(identity);
      selected.value = next;
      if (formMatches(local)) form.value = fromMacro(next);
      else conflict.value = 'Статус шаблона обновлён, а новые правки остались в форме.';
      await load();
      return true;
    } catch (cause) {
      if (!isCurrent(projectId, requestGeneration, current.id) || mutationToken !== token)
        return false;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return false;
      }
      if (cause instanceof ApiError && cause.status === 409)
        await refreshConflict(local, projectId, current.id, requestGeneration, token);
      else
        error.value =
          kind === 'PUBLISH'
            ? 'Не удалось опубликовать шаблон.'
            : 'Не удалось архивировать шаблон.';
      return false;
    } finally {
      if (mutationToken === token) {
        mutationToken = null;
        saving.value = false;
      }
    }
  }

  async function rollback(
    revision: SupportMacroRevisionResponseDto,
    reason: RollbackSupportMacroDtoReasonCode,
  ): Promise<boolean> {
    const projectId = context.projectId();
    const current = selected.value;
    if (!projectId || !current || !context.canManage() || saving.value) return false;
    if (scopeProjectId !== projectId) {
      reset();
      return false;
    }
    const requestGeneration = generation;
    const token = Symbol('macro-rollback');
    mutationToken = token;
    saving.value = true;
    const local = cloneForm(form.value);
    const identity = `ROLLBACK\u001f${current.id}\u001f${revision.id}\u001f${reason}\u001f${current.actionEtag}`;
    try {
      const next = await source.rollback(
        projectId,
        current.id,
        revision.id,
        reason,
        current.actionEtag,
        commandKey(identity),
      );
      if (!isCurrent(projectId, requestGeneration, current.id) || mutationToken !== token)
        return false;
      assertIdentity(next, { id: current.id });
      commandKeys.delete(identity);
      selected.value = next;
      if (formMatches(local)) form.value = fromMacro(next);
      else conflict.value = 'Прежняя версия возвращена, а новые правки остались в форме.';
      const history = await source.revisions(projectId, current.id);
      if (!isCurrent(projectId, requestGeneration, current.id) || mutationToken !== token)
        return false;
      revisions.value = history.items;
      revisionsNextCursor.value = history.nextCursor;
      await load();
      return true;
    } catch (cause) {
      if (!isCurrent(projectId, requestGeneration, current.id) || mutationToken !== token)
        return false;
      if (cause instanceof ApiError && (cause.status === 403 || cause.status === 404)) {
        await forbidden();
        return false;
      }
      if (cause instanceof ApiError && cause.status === 409)
        await refreshConflict(local, projectId, current.id, requestGeneration, token);
      else error.value = 'Не удалось вернуть прежнюю версию шаблона.';
      return false;
    } finally {
      if (mutationToken === token) {
        mutationToken = null;
        saving.value = false;
      }
    }
  }

  function updateSourceBody(body: string): void {
    if (form.value.body === body) return;
    form.value.body = body;
    form.value.translations = { ...form.value.translations, ru: body };
    translationStates.value = Object.fromEntries(
      Object.entries(translationStates.value).map(([locale, state]) => [
        locale,
        locale === 'ru' || !form.value.translations[locale] ? state : 'OUTDATED',
      ]),
    );
  }

  function applyTranslation(
    locale: string,
    text: string,
    snapshot: Readonly<{ sourceText: string; targetText: string }>,
  ): 'APPLIED' | 'STALE_SOURCE' | 'TARGET_CONFLICT' {
    if (form.value.body !== snapshot.sourceText) return 'STALE_SOURCE';
    if ((form.value.translations[locale] ?? '') !== snapshot.targetText) return 'TARGET_CONFLICT';
    form.value.translations = { ...form.value.translations, [locale]: text };
    return 'APPLIED';
  }

  function setTranslationState(locale: string, state: string): void {
    translationStates.value = { ...translationStates.value, [locale]: state };
  }

  return {
    items,
    selected,
    revisions,
    nextCursor,
    revisionsNextCursor,
    form,
    preview,
    loading,
    saving,
    error,
    conflict,
    query,
    translationStates,
    canSubmit,
    load,
    createNew,
    select,
    loadMoreRevisions,
    validatePreview,
    saveDraft,
    publish: () => execute('PUBLISH'),
    archive: () => execute('ARCHIVE'),
    rollback,
    updateSourceBody,
    applyTranslation,
    setTranslationState,
    reset,
  };
}
