<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import { supportMacroSource } from "@/features/support-macros/api/support-macros-source";
import {
  createSupportMacroTranslationScopeFence,
  type SupportMacroTranslationScopeToken,
} from "@/features/support-macros/model/support-macro-translation-scope";
import { createSupportMacroAuthoringController } from "@/features/support-macros/model/use-support-macro-authoring";
import { createTranslationJobController } from "@/features/scenario-localization/model/translation-job-controller";
import type {
  RollbackSupportMacroDtoReasonCode,
  SupportMacroCompiledDraftDto,
  SupportMacroResponseDto,
  SupportMacroRevisionResponseDto,
  SupportMacroVariableDtoName,
} from "@/shared/api/generated/models";

type LibraryFilter = "ALL" | "INCOMPLETE" | "ARCHIVED";
type TranslationState =
  | "READY"
  | "MISSING"
  | "PENDING"
  | "RUNNING"
  | "MACHINE_UNSAVED"
  | "ERROR"
  | "OUTDATED"
  | "STALE_SOURCE"
  | "TARGET_CONFLICT"
  | "CANCELLED";

interface StoredTranslationDraft {
  sourceBody: string;
  translations: Record<string, string>;
  states: Record<string, string>;
}

const auth = useAuthStore();
const accessDenied = ref(false);
const editorVisible = ref(false);
const translationsExpanded = ref(false);
const advancedExpanded = ref(false);
const historyExpanded = ref(false);
const libraryFilter = ref<LibraryFilter>("ALL");
const filterOptions: readonly { value: LibraryFilter; label: string }[] = [
  { value: "ALL", label: "Все" },
  { value: "INCOMPLETE", label: "Нужен перевод" },
  { value: "ARCHIVED", label: "Архив" },
];
const rollbackVisible = ref(false);
const rollbackRevision = ref<SupportMacroRevisionResponseDto | null>(null);
const rollbackReason =
  ref<RollbackSupportMacroDtoReasonCode>("CONTENT_REGRESSION");
let searchTimer: ReturnType<typeof setTimeout> | null = null;

const canManage = computed(
  () =>
    !accessDenied.value &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.support.macros.manage",
    ),
);
const controller = createSupportMacroAuthoringController(
  {
    projectId: () => auth.project?.id,
    canManage: () => canManage.value,
    async onForbidden() {
      accessDenied.value = true;
      editorVisible.value = false;
      try {
        await auth.refreshContext();
      } catch {
        // Protected authoring state has already been purged.
      }
    },
  },
  supportMacroSource,
);

const supportedLocales = computed(() => {
  const values = ["ru", ...(auth.project?.supportedLocales ?? [])];
  return [
    ...new Set(
      values.flatMap((locale) => {
        try {
          return Intl.getCanonicalLocales(locale);
        } catch {
          return [];
        }
      }),
    ),
  ];
});
const sourceBody = computed({
  get: () => controller.form.value.body,
  set: (value: string) => controller.updateSourceBody(value),
});

let translationJobs: ReturnType<typeof createTranslationJobController> | null =
  null;
const translationFence = createSupportMacroTranslationScopeFence();

function translationDraftStorageKey(projectId: string, scope: string): string {
  return `retenive:support-macro-translation-draft:${projectId}:${scope}`;
}

function persistTranslationDraft(
  token: SupportMacroTranslationScopeToken,
): void {
  if (
    !translationFence.isCurrent(token) ||
    typeof sessionStorage === "undefined"
  )
    return;
  const projectId = auth.project?.id;
  if (!projectId) return;
  const draft: StoredTranslationDraft = {
    sourceBody: controller.form.value.body,
    translations: { ...controller.form.value.translations },
    states: { ...controller.translationStates.value },
  };
  sessionStorage.setItem(
    translationDraftStorageKey(projectId, token.scope),
    JSON.stringify(draft),
  );
}

function restoreTranslationDraft(scope: string): void {
  const projectId = auth.project?.id;
  if (!projectId || typeof sessionStorage === "undefined") return;
  const key = translationDraftStorageKey(projectId, scope);
  const raw = sessionStorage.getItem(key);
  if (!raw) return;
  try {
    const draft = JSON.parse(raw) as StoredTranslationDraft;
    if (draft.sourceBody !== controller.form.value.body) {
      sessionStorage.removeItem(key);
      return;
    }
    controller.form.value.translations = {
      ...controller.form.value.translations,
      ...draft.translations,
      ru: controller.form.value.body,
    };
    controller.translationStates.value = { ...draft.states };
  } catch {
    sessionStorage.removeItem(key);
  }
}

function clearTranslationDraft(scope = translationFence.current().scope): void {
  const projectId = auth.project?.id;
  if (!projectId || !scope || typeof sessionStorage === "undefined") return;
  sessionStorage.removeItem(translationDraftStorageKey(projectId, scope));
}

function bindTranslationJobs(scope: string): {
  token: SupportMacroTranslationScopeToken;
  jobs: ReturnType<typeof createTranslationJobController>;
} {
  translationJobs?.dispose();
  const projectId = auth.project?.id ?? "";
  const token = translationFence.activate(scope);
  const jobs = createTranslationJobController({
    context: () => ({ projectId, scenarioId: scope }),
    getValue: () =>
      translationFence.isCurrent(token)
        ? { ...controller.form.value.translations }
        : {},
    apply: (_fieldPath, locale, text, snapshot) => {
      if (!translationFence.isCurrent(token)) return "TARGET_CONFLICT";
      const outcome = controller.applyTranslation(locale, text, snapshot);
      if (outcome === "APPLIED") persistTranslationDraft(token);
      return outcome;
    },
    state: (_fieldPath, locale, state) => {
      if (!translationFence.isCurrent(token)) return;
      controller.setTranslationState(locale, state);
      persistTranslationDraft(token);
    },
  });
  translationJobs = jobs;
  return { token, jobs };
}

const visibilityOptions = [
  { label: "Весь проект", value: "PROJECT" },
  { label: "Только команды", value: "TEAMS" },
];
const rollbackReasons = [
  { label: "Ошибка в содержимом", value: "CONTENT_REGRESSION" },
  { label: "Восстановление после инцидента", value: "INCIDENT_RECOVERY" },
  { label: "Откат политики", value: "POLICY_ROLLBACK" },
];
const variableOptions: { label: string; value: SupportMacroVariableDtoName }[] =
  [
    { label: "Имя пользователя", value: "endUser.displayName" },
    { label: "Идентификатор обращения", value: "case.id" },
    { label: "Тема обращения", value: "case.topicLabel" },
    { label: "Идентификатор диалога", value: "conversation.id" },
    { label: "Имя оператора", value: "operator.displayName" },
  ];

function configurationOf(
  macro: SupportMacroResponseDto,
): SupportMacroCompiledDraftDto | null {
  return (
    macro.draft?.configuration ?? macro.publishedRevision?.configuration ?? null
  );
}

function translationsOf(
  configuration: SupportMacroCompiledDraftDto | null,
): Record<string, string> {
  if (!configuration) return {};
  const translations = (
    configuration as SupportMacroCompiledDraftDto & {
      translations?: Record<string, string>;
    }
  ).translations;
  return translations ?? { [configuration.locale]: configuration.body };
}

function coverageOf(macro: SupportMacroResponseDto) {
  const translated = supportedLocales.value.filter((locale) =>
    Boolean(translationsOf(configurationOf(macro))[locale]?.trim()),
  ).length;
  return {
    translated,
    total: supportedLocales.value.length,
    complete: translated === supportedLocales.value.length,
  };
}

const visibleItems = computed(() =>
  controller.items.value.filter((macro) => {
    if (libraryFilter.value === "ARCHIVED")
      return macro.lifecycle === "ARCHIVED";
    if (libraryFilter.value === "INCOMPLETE")
      return macro.lifecycle !== "ARCHIVED" && !coverageOf(macro).complete;
    return true;
  }),
);
const publishedCount = computed(
  () =>
    controller.items.value.filter((macro) => Boolean(macro.publishedRevision))
      .length,
);
const completeCount = computed(
  () =>
    controller.items.value.filter((macro) => coverageOf(macro).complete).length,
);
const currentCoverage = computed(() => {
  const translated = supportedLocales.value.filter((locale) =>
    Boolean(controller.form.value.translations[locale]?.trim()),
  ).length;
  return { translated, total: supportedLocales.value.length };
});
const legacySourceLocale = computed(() => {
  const configuration = controller.selected.value
    ? configurationOf(controller.selected.value)
    : null;
  if (!configuration || configuration.locale === "ru") return null;
  return controller.form.value.translations.ru?.trim()
    ? null
    : configuration.locale;
});
const translating = computed(() =>
  Object.values(controller.translationStates.value).some(
    (state) => state === "PENDING" || state === "RUNNING",
  ),
);

function addVariable(): void {
  const used = new Set(
    controller.form.value.variables.map((variable) => variable.name),
  );
  const available = variableOptions.find((option) => !used.has(option.value));
  if (available)
    controller.form.value.variables.push({
      name: available.value,
      required: true,
    });
}

function removeVariable(index: number): void {
  controller.form.value.variables.splice(index, 1);
}

function localeLabel(locale: string): string {
  try {
    return (
      new Intl.DisplayNames(["ru"], { type: "language" }).of(locale) ?? locale
    );
  } catch {
    return locale;
  }
}

function translationState(locale: string): TranslationState {
  if (locale === "ru") return "READY";
  return (
    (controller.translationStates.value[locale] as
      TranslationState | undefined) ??
    (controller.form.value.translations[locale]?.trim() ? "READY" : "MISSING")
  );
}

function translationStateLabel(state: TranslationState): string {
  return {
    READY: "Готов",
    MISSING: "Нет перевода",
    PENDING: "В очереди",
    RUNNING: "Переводится",
    MACHINE_UNSAVED: "Новый перевод",
    ERROR: "Ошибка",
    OUTDATED: "Устарел",
    STALE_SOURCE: "Оригинал изменён",
    TARGET_CONFLICT: "Изменён вручную",
    CANCELLED: "Отменён",
  }[state];
}

function translationSeverity(
  state: TranslationState,
): "success" | "secondary" | "warn" | "danger" | "info" {
  if (state === "READY") return "success";
  if (state === "PENDING" || state === "RUNNING" || state === "MACHINE_UNSAVED")
    return "info";
  if (state === "ERROR") return "danger";
  if (
    state === "OUTDATED" ||
    state === "STALE_SOURCE" ||
    state === "TARGET_CONFLICT"
  )
    return "warn";
  return "secondary";
}

function setTranslation(locale: string, value: string): void {
  const translations = { ...controller.form.value.translations };
  if (value.trim()) translations[locale] = value;
  else delete translations[locale];
  controller.form.value.translations = translations;
  controller.setTranslationState(locale, value.trim() ? "READY" : "MISSING");
  const token = translationFence.current();
  if (token.scope) persistTranslationDraft(token);
}

async function translateAll(): Promise<void> {
  const targets = supportedLocales.value.filter((locale) => locale !== "ru");
  if (!controller.form.value.body.trim() || !targets.length) return;
  try {
    if (!controller.selected.value) {
      if (!(await controller.saveDraft())) return;
      const savedMacro = controller.selected
        .value as SupportMacroResponseDto | null;
      if (!savedMacro) return;
      bindTranslationJobs(`support-macro:${savedMacro.id}`);
    }
    await translationJobs?.start({
      fieldPath: "support-macro.body",
      sourceLocale: "ru",
      targets,
    });
  } catch {
    controller.error.value =
      "Не удалось запустить перевод. Попробуйте ещё раз.";
  }
}

function resetEditorSections(): void {
  translationsExpanded.value = false;
  advancedExpanded.value = false;
  historyExpanded.value = false;
}

function openCreate(): void {
  translationJobs?.dispose();
  translationJobs = null;
  translationFence.invalidate();
  controller.createNew();
  resetEditorSections();
  editorVisible.value = true;
}

async function openEdit(macro: SupportMacroResponseDto): Promise<void> {
  const scope = `support-macro:${macro.id}`;
  const session = bindTranslationJobs(scope);
  resetEditorSections();
  editorVisible.value = true;
  await controller.select(macro);
  if (!translationFence.isCurrent(session.token)) return;
  restoreTranslationDraft(scope);
  await session.jobs.recover();
}

async function saveAndClose(): Promise<void> {
  if (await controller.saveDraft()) {
    clearTranslationDraft();
    editorVisible.value = false;
  }
}

async function saveAndPublish(): Promise<void> {
  if (!(await controller.saveDraft())) return;
  if (await controller.publish()) {
    clearTranslationDraft();
    editorVisible.value = false;
  }
}

function publicationKindLabel(value: string): string {
  return value === "ROLLBACK" ? "возврат версии" : "публикация";
}

function openRollback(revision: SupportMacroRevisionResponseDto): void {
  rollbackRevision.value = revision;
  rollbackReason.value = "CONTENT_REGRESSION";
  rollbackVisible.value = true;
}

async function confirmRollback(): Promise<void> {
  if (!rollbackRevision.value) return;
  if (await controller.rollback(rollbackRevision.value, rollbackReason.value)) {
    rollbackVisible.value = false;
    rollbackRevision.value = null;
  }
}

watch(
  () => auth.project?.id,
  () => {
    translationJobs?.dispose();
    translationJobs = null;
    translationFence.invalidate();
    accessDenied.value = false;
    editorVisible.value = false;
    void controller.load();
  },
);
watch(canManage, (allowed) => {
  if (allowed) void controller.load();
  else controller.reset();
});
watch(controller.query, () => {
  if (searchTimer) clearTimeout(searchTimer);
  searchTimer = setTimeout(() => void controller.load(), 250);
});
onMounted(() => void controller.load());
onBeforeUnmount(() => {
  if (searchTimer) clearTimeout(searchTimer);
  translationJobs?.dispose();
  controller.reset();
});
</script>

<template>
  <section class="page macro-library-page">
    <header class="library-header">
      <div class="library-heading">
        <div class="eyebrow">
          <i class="pi pi-comments" /> Материалы поддержки
        </div>
        <h1>Библиотека ответов</h1>
        <p>
          Один ответ для всех языков проекта. Операторы получают вариант на
          языке текущего диалога и могут отредактировать его перед отправкой.
        </p>
      </div>
      <Button
        label="Новый шаблон"
        icon="pi pi-plus"
        :disabled="!canManage"
        @click="openCreate"
      />
    </header>

    <Message v-if="!canManage" severity="warn" :closable="false">
      Управление шаблонами недоступно для текущего проекта или роли.
    </Message>
    <Message v-if="controller.error.value" severity="error" :closable="false">
      {{ controller.error.value }}
    </Message>
    <Message v-if="controller.conflict.value" severity="warn" :closable="false">
      {{ controller.conflict.value }}
    </Message>

    <template v-if="canManage">
      <section class="library-summary" aria-label="Сводка библиотеки">
        <div>
          <span>Загружено</span>
          <strong>{{ controller.items.value.length }}</strong>
        </div>
        <div>
          <span>Опубликовано</span>
          <strong>{{ publishedCount }}</strong>
        </div>
        <div>
          <span>Все языки готовы</span>
          <strong>{{ completeCount }}</strong>
        </div>
        <div class="library-summary__note">
          <i class="pi pi-language" />
          <span
            >{{ supportedLocales.length }} языка проекта · сводка по
            списку</span
          >
        </div>
      </section>

      <section class="library-index">
        <header class="library-toolbar">
          <label class="library-search">
            <i class="pi pi-search" aria-hidden="true" />
            <InputText
              v-model="controller.query.value"
              aria-label="Поиск шаблонов"
              placeholder="Название, текст или код"
            />
          </label>
          <div class="library-filters" aria-label="Фильтр шаблонов">
            <button
              v-for="item in filterOptions"
              :key="item.value"
              type="button"
              :class="{ active: libraryFilter === item.value }"
              @click="libraryFilter = item.value"
            >
              {{ item.label }}
            </button>
          </div>
          <Button
            icon="pi pi-refresh"
            aria-label="Обновить библиотеку"
            severity="secondary"
            text
            :loading="controller.loading.value"
            @click="controller.load()"
          />
        </header>

        <div
          v-if="controller.loading.value && !controller.items.value.length"
          class="library-loading"
        >
          <Skeleton
            v-for="index in 5"
            :key="index"
            height="112px"
            border-radius="14px"
          />
        </div>
        <div v-else-if="!visibleItems.length" class="library-empty">
          <span class="library-empty__icon"><i class="pi pi-comments" /></span>
          <h2>
            {{
              controller.query.value
                ? "Ничего не найдено"
                : "Библиотека пока пуста"
            }}
          </h2>
          <p>
            {{
              controller.query.value
                ? "Попробуйте другой запрос или сбросьте фильтр."
                : "Создайте первый русский ответ — переводы добавятся в тот же шаблон."
            }}
          </p>
          <Button
            v-if="!controller.query.value"
            label="Создать шаблон"
            icon="pi pi-plus"
            @click="openCreate"
          />
        </div>
        <div v-else class="resource-list">
          <article
            v-for="macro in visibleItems"
            :key="macro.id"
            class="resource-row"
            role="button"
            tabindex="0"
            :aria-label="`Открыть шаблон «${configurationOf(macro)?.title ?? macro.stableCode}»`"
            @click="openEdit(macro)"
            @keydown.enter.prevent="openEdit(macro)"
            @keydown.space.prevent="openEdit(macro)"
          >
            <div class="resource-copy">
              <div class="resource-title-line">
                <h2>{{ configurationOf(macro)?.title ?? macro.stableCode }}</h2>
                <Tag
                  :value="
                    macro.lifecycle === 'ARCHIVED'
                      ? 'Архив'
                      : macro.publishedRevision
                        ? `Версия ${macro.publishedRevision.revisionNumber}`
                        : 'Черновик'
                  "
                  :severity="
                    macro.lifecycle === 'ARCHIVED'
                      ? 'secondary'
                      : macro.publishedRevision
                        ? 'success'
                        : 'info'
                  "
                />
              </div>
              <p>{{ configurationOf(macro)?.body }}</p>
              <div class="resource-meta">
                <code>{{ macro.stableCode }}</code>
                <span
                  v-for="topic in configurationOf(
                    macro,
                  )?.visibility.topicCodes.slice(0, 2)"
                  :key="topic"
                  >{{ topic }}</span
                >
                <span
                  v-for="shortcut in configurationOf(macro)?.shortcuts.slice(
                    0,
                    2,
                  )"
                  :key="shortcut"
                  >/{{ shortcut }}</span
                >
              </div>
            </div>
            <div class="coverage-cell">
              <div>
                <span>Переводы</span>
                <strong
                  >{{ coverageOf(macro).translated }} /
                  {{ coverageOf(macro).total }}</strong
                >
              </div>
              <div
                class="coverage-rail"
                :class="{ complete: coverageOf(macro).complete }"
              >
                <span
                  v-for="locale in supportedLocales"
                  :key="locale"
                  :class="{
                    ready: Boolean(
                      translationsOf(configurationOf(macro))[locale]?.trim(),
                    ),
                  }"
                />
              </div>
              <small>{{
                coverageOf(macro).complete
                  ? "Все языки готовы"
                  : "Нужен перевод"
              }}</small>
            </div>
            <span class="resource-open" aria-hidden="true">
              Открыть <i class="pi pi-chevron-right" />
            </span>
          </article>
        </div>
        <footer v-if="controller.nextCursor.value" class="library-more">
          <Button
            label="Показать ещё"
            severity="secondary"
            outlined
            :loading="controller.loading.value"
            @click="controller.load(controller.nextCursor.value ?? undefined)"
          />
        </footer>
      </section>
    </template>

    <Dialog
      v-model:visible="editorVisible"
      modal
      dismissable-mask
      class="macro-editor-dialog"
      :style="{ width: 'min(920px, calc(100vw - 32px))' }"
      :breakpoints="{ '640px': '100vw' }"
    >
      <template #header>
        <div class="editor-heading">
          <span>{{
            controller.selected.value ? "Шаблон ответа" : "Новый шаблон"
          }}</span>
          <h2>{{ controller.form.value.title || "Без названия" }}</h2>
          <div>
            <Tag
              v-if="controller.selected.value"
              :value="
                controller.selected.value.lifecycle === 'ACTIVE'
                  ? 'Активен'
                  : 'Архивирован'
              "
              :severity="
                controller.selected.value.lifecycle === 'ACTIVE'
                  ? 'success'
                  : 'secondary'
              "
            />
            <span v-if="controller.selected.value?.draft"
              >Есть неопубликованные изменения</span
            >
          </div>
        </div>
      </template>

      <div
        v-if="controller.loading.value && editorVisible"
        class="editor-loading"
      >
        <Skeleton height="48px" />
        <Skeleton height="180px" />
        <Skeleton height="92px" />
      </div>
      <form v-else class="macro-form" @submit.prevent="saveAndClose">
        <section class="form-section source-section">
          <header>
            <div>
              <span class="section-kicker">Оригинал</span>
              <h3>Ответ на русском</h3>
            </div>
            <Tag value="RU · источник" severity="secondary" />
          </header>
          <Message v-if="legacySourceLocale" severity="warn" :closable="false">
            Это старый шаблон с источником
            {{ localeLabel(legacySourceLocale) }}. Его текст сохранён в
            переводах. Добавьте русский оригинал перед сохранением —
            существующий перевод не будет перезаписан.
          </Message>
          <div class="form-grid">
            <label>
              <span>Название</span>
              <InputText
                v-model="controller.form.value.title"
                maxlength="160"
                placeholder="Например, Проверка платежа"
              />
            </label>
            <label>
              <span>Код</span>
              <InputText
                v-model="controller.form.value.stableCode"
                placeholder="payment-check"
                :disabled="Boolean(controller.selected.value)"
              />
            </label>
          </div>
          <label>
            <span>Текст ответа</span>
            <Textarea
              v-model="sourceBody"
              class="source-body-textarea"
              rows="2"
              maxlength="10240"
              placeholder="Текст, который оператор сможет отредактировать перед отправкой"
            />
            <small
              >{{ controller.form.value.body.length }} / 10 240 · русский текст
              — источник всех переводов</small
            >
          </label>
        </section>

        <section class="form-section translation-section">
          <button
            type="button"
            class="section-disclosure"
            :aria-expanded="translationsExpanded"
            @click="translationsExpanded = !translationsExpanded"
          >
            <span class="disclosure-icon"><i class="pi pi-language" /></span>
            <span>
              <strong>Переводы</strong>
              <small
                >{{ currentCoverage.translated }} из
                {{ currentCoverage.total }} языков готовы</small
              >
            </span>
            <span class="coverage-rail coverage-rail--editor">
              <i
                v-for="locale in supportedLocales"
                :key="locale"
                :class="{
                  ready: Boolean(
                    controller.form.value.translations[locale]?.trim(),
                  ),
                }"
              />
            </span>
            <i class="pi pi-chevron-down disclosure-chevron" />
          </button>
          <div class="translation-action">
            <p>
              Переводы сохраняются внутри этого шаблона и подбираются по языку
              текущего чата.
            </p>
            <Button
              type="button"
              :label="
                controller.selected.value
                  ? 'Перевести на все языки'
                  : 'Сохранить и перевести'
              "
              icon="pi pi-sparkles"
              severity="secondary"
              outlined
              :loading="translating"
              :disabled="
                !controller.form.value.body.trim() ||
                supportedLocales.length < 2 ||
                (!controller.selected.value && !controller.canSubmit.value)
              "
              @click="translateAll"
            />
          </div>
          <Transition name="section-expand">
            <div v-if="translationsExpanded" class="translation-list">
              <article v-for="locale in supportedLocales" :key="locale">
                <header>
                  <div>
                    <strong>{{ localeLabel(locale) }}</strong>
                    <code>{{ locale }}</code>
                  </div>
                  <Tag
                    :value="translationStateLabel(translationState(locale))"
                    :severity="translationSeverity(translationState(locale))"
                  />
                </header>
                <Textarea
                  :model-value="
                    controller.form.value.translations[locale] ?? ''
                  "
                  :disabled="locale === 'ru'"
                  :aria-label="`Перевод: ${localeLabel(locale)} (${locale})`"
                  rows="4"
                  auto-resize
                  :placeholder="
                    locale === 'ru'
                      ? 'Русский оригинал редактируется выше'
                      : 'Перевод ещё не готов'
                  "
                  @update:model-value="setTranslation(locale, String($event))"
                />
                <small
                  v-if="
                    translationState(locale) === 'OUTDATED' ||
                    translationState(locale) === 'STALE_SOURCE'
                  "
                >
                  Русский оригинал изменился. Переведите этот язык заново или
                  обновите вручную.
                </small>
              </article>
            </div>
          </Transition>
        </section>

        <section class="form-section compact-section">
          <button
            type="button"
            class="section-disclosure"
            :aria-expanded="advancedExpanded"
            @click="advancedExpanded = !advancedExpanded"
          >
            <span class="disclosure-icon"><i class="pi pi-sliders-h" /></span>
            <span>
              <strong>Доступ и подстановки</strong>
              <small>Теги, команды, темы и безопасные переменные</small>
            </span>
            <i class="pi pi-chevron-down disclosure-chevron" />
          </button>
          <Transition name="section-expand">
            <div v-if="advancedExpanded" class="advanced-content">
              <div class="form-grid">
                <label>
                  <span class="field-label">
                    Быстрые вызовы
                    <i
                      class="pi pi-info-circle"
                      aria-label="Что такое быстрые вызовы"
                      title="Короткие команды поиска: оператор вводит /слово, чтобы быстро найти этот шаблон."
                    />
                  </span>
                  <Textarea
                    v-model="controller.form.value.shortcutsText"
                    rows="3"
                    placeholder="платёж&#10;deposit"
                  />
                  <small>До 10 команд поиска, по одной на строку.</small>
                </label>
                <label>
                  <span class="field-label">
                    Темы обращения
                    <i
                      class="pi pi-info-circle"
                      aria-label="Что такое темы обращения"
                      title="Ограничивают шаблон обращениями с указанными кодами тем. Без кодов шаблон доступен в любом обращении."
                    />
                  </span>
                  <Textarea
                    v-model="controller.form.value.topicCodesText"
                    rows="3"
                    placeholder="PAYMENTS"
                  />
                  <small
                    >Коды тем по одному на строку; пусто — любая тема.</small
                  >
                </label>
              </div>
              <div class="form-grid">
                <label>
                  <span class="field-label">
                    Область видимости
                    <i
                      class="pi pi-info-circle"
                      aria-label="Что такое область видимости"
                      title="Определяет, кто увидит шаблон: весь проект или только выбранные команды поддержки."
                    />
                  </span>
                  <Select
                    v-model="controller.form.value.visibility"
                    :options="visibilityOptions"
                    option-label="label"
                    option-value="value"
                  />
                </label>
                <label v-if="controller.form.value.visibility === 'TEAMS'">
                  <span>Идентификаторы команд</span>
                  <Textarea
                    v-model="controller.form.value.teamIdsText"
                    rows="3"
                  />
                </label>
              </div>
              <div class="variable-editor">
                <header>
                  <div>
                    <strong class="field-label">
                      Переменные
                      <i
                        class="pi pi-info-circle"
                        aria-label="Что такое переменные"
                        title="Безопасные поля контекста, которые сервер подставляет при вставке шаблона. Если значения нет, используется запасной текст."
                      />
                    </strong>
                    <small
                      >Сервер подставит разрешённые данные пользователя или
                      обращения при вставке шаблона.</small
                    >
                  </div>
                  <Button
                    type="button"
                    label="Добавить"
                    icon="pi pi-plus"
                    severity="secondary"
                    text
                    :disabled="
                      controller.form.value.variables.length >=
                      variableOptions.length
                    "
                    @click="addVariable"
                  />
                </header>
                <p v-if="!controller.form.value.variables.length">
                  Динамических значений нет.
                </p>
                <div
                  v-for="(variable, index) in controller.form.value.variables"
                  :key="`${variable.name}-${index}`"
                  class="variable-row"
                >
                  <Select
                    v-model="variable.name"
                    :options="variableOptions"
                    option-label="label"
                    option-value="value"
                  />
                  <InputText
                    v-model="variable.fallback"
                    placeholder="Запасной текст"
                  />
                  <label class="variable-required">
                    <ToggleSwitch v-model="variable.required" />
                    <span>Обязательно</span>
                  </label>
                  <Button
                    type="button"
                    icon="pi pi-trash"
                    aria-label="Удалить переменную"
                    severity="danger"
                    text
                    @click="removeVariable(index)"
                  />
                </div>
              </div>
            </div>
          </Transition>
        </section>

        <section
          v-if="controller.preview.value"
          class="macro-preview"
          aria-live="polite"
        >
          <header>
            <strong>Проверено сервером</strong
            ><Tag value="Готово" severity="success" />
          </header>
          <p>{{ controller.preview.value.draft.body }}</p>
          <small
            >Compiler {{ controller.preview.value.compilerRevision }} · без
            предупреждений</small
          >
        </section>

        <section
          v-if="controller.selected.value && controller.revisions.value.length"
          class="form-section compact-section history-section"
        >
          <button
            type="button"
            class="section-disclosure"
            :aria-expanded="historyExpanded"
            @click="historyExpanded = !historyExpanded"
          >
            <span class="disclosure-icon"><i class="pi pi-history" /></span>
            <span
              ><strong>История</strong
              ><small
                >{{ controller.revisions.value.length }} публикаций</small
              ></span
            >
            <i class="pi pi-chevron-down disclosure-chevron" />
          </button>
          <Transition name="section-expand">
            <div v-if="historyExpanded" class="history-list">
              <article
                v-for="revision in controller.revisions.value"
                :key="revision.id"
              >
                <div>
                  <strong
                    >Версия {{ revision.revisionNumber }} ·
                    {{ revision.configuration.title }}</strong
                  >
                  <small
                    >{{
                      new Date(revision.publishedAt).toLocaleString("ru-RU")
                    }}
                    ·
                    {{ publicationKindLabel(revision.publicationKind) }}</small
                  >
                </div>
                <Button
                  type="button"
                  label="Вернуть"
                  severity="secondary"
                  text
                  :disabled="controller.saving.value"
                  @click="openRollback(revision)"
                />
              </article>
              <Button
                v-if="controller.revisionsNextCursor.value"
                type="button"
                label="Более ранние версии"
                severity="secondary"
                text
                @click="controller.loadMoreRevisions"
              />
            </div>
          </Transition>
        </section>
      </form>

      <template #footer>
        <div class="editor-footer">
          <div>
            <Button
              v-if="controller.selected.value?.lifecycle === 'ACTIVE'"
              label="Архивировать"
              severity="danger"
              text
              :disabled="controller.saving.value"
              @click="controller.archive"
            />
          </div>
          <div>
            <Button
              label="Проверить"
              icon="pi pi-eye"
              severity="secondary"
              outlined
              :disabled="!controller.canSubmit.value"
              @click="controller.validatePreview"
            />
            <Button
              label="Сохранить"
              severity="secondary"
              :loading="controller.saving.value"
              :disabled="!controller.canSubmit.value"
              @click="saveAndClose"
            />
            <Button
              label="Сохранить и опубликовать"
              icon="pi pi-send"
              :loading="controller.saving.value"
              :disabled="!controller.canSubmit.value"
              @click="saveAndPublish"
            />
          </div>
        </div>
      </template>
    </Dialog>

    <Dialog
      v-model:visible="rollbackVisible"
      modal
      header="Вернуть прежнюю версию"
      :style="{ width: 'min(460px, calc(100vw - 32px))' }"
    >
      <div class="rollback-dialog">
        <p>
          Старая версия останется неизменной. Сервер создаст на её основе новую
          публикацию.
        </p>
        <label>
          <span>Причина</span>
          <Select
            v-model="rollbackReason"
            :options="rollbackReasons"
            option-label="label"
            option-value="value"
          />
        </label>
      </div>
      <template #footer>
        <Button
          label="Отмена"
          severity="secondary"
          text
          @click="rollbackVisible = false"
        />
        <Button
          label="Вернуть версию"
          :loading="controller.saving.value"
          @click="confirmRollback"
        />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.macro-library-page {
  display: grid;
  gap: 16px;
  padding-bottom: 40px;
}
.library-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
}
.library-heading {
  max-width: 720px;
}
.library-heading h1 {
  margin: 8px 0 6px;
  font-size: clamp(1.75rem, 3vw, 2.35rem);
  letter-spacing: -0.035em;
}
.library-heading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.88rem;
  line-height: 1.55;
}
.library-summary {
  display: grid;
  grid-template-columns: repeat(3, minmax(120px, 180px)) minmax(180px, 1fr);
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-card);
}
.library-summary > div {
  display: grid;
  gap: 3px;
  padding: 14px 16px;
  border-right: 1px solid var(--border-subtle);
}
.library-summary span {
  color: var(--text-tertiary);
  font-size: 0.7rem;
  font-weight: 700;
}
.library-summary strong {
  font-size: 1.2rem;
  font-variant-numeric: tabular-nums;
}
.library-summary .library-summary__note {
  display: flex;
  flex-direction: row;
  align-items: center;
  justify-content: flex-end;
  border-right: 0;
  color: var(--text-secondary);
}
.library-summary__note i {
  color: var(--brand);
}
.library-index {
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-card);
}
.library-toolbar {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-bottom: 1px solid var(--border-subtle);
}
.library-search {
  position: relative;
  flex: 1;
  min-width: 220px;
}
.library-search > i {
  position: absolute;
  z-index: 1;
  top: 50%;
  left: 13px;
  color: var(--text-tertiary);
  transform: translateY(-50%);
}
.library-search :deep(.p-inputtext) {
  width: 100%;
  padding-left: 38px;
}
.library-filters {
  display: flex;
  padding: 3px;
  border: 1px solid var(--border-subtle);
  border-radius: 11px;
  background: var(--surface-subtle);
}
.library-filters button {
  min-height: 34px;
  padding: 0 12px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 700;
  cursor: pointer;
}
.library-filters button.active {
  background: var(--surface-card);
  color: var(--text-primary);
  box-shadow: 0 0 0 1px var(--border-subtle);
}
.resource-list {
  display: grid;
}
.resource-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(150px, 190px) auto;
  align-items: center;
  gap: 20px;
  min-height: 112px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--border-subtle);
  cursor: pointer;
  transition: background 120ms ease;
}
.resource-row:last-child {
  border-bottom: 0;
}
.resource-row:hover,
.resource-row:focus-visible {
  background: var(--surface-subtle);
}
.resource-row:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}
.resource-open {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 0.8rem;
  font-weight: 700;
}
.resource-copy {
  display: grid;
  min-width: 0;
  gap: 6px;
}
.resource-title-line {
  display: flex;
  align-items: center;
  gap: 8px;
}
.resource-title-line h2 {
  overflow: hidden;
  margin: 0;
  font-size: 0.9rem;
  font-weight: 760;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.resource-copy > p {
  display: -webkit-box;
  overflow: hidden;
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
  line-height: 1.45;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
}
.resource-meta {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 5px;
}
.resource-meta code,
.resource-meta span {
  padding: 2px 6px;
  border-radius: 6px;
  background: var(--surface-subtle);
  color: var(--text-tertiary);
  font-size: 0.62rem;
}
.coverage-cell {
  display: grid;
  gap: 5px;
}
.coverage-cell > div:first-child {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.coverage-cell span,
.coverage-cell small {
  color: var(--text-tertiary);
  font-size: 0.66rem;
}
.coverage-cell strong {
  font-size: 0.74rem;
  font-variant-numeric: tabular-nums;
}
.coverage-rail {
  display: flex;
  gap: 3px;
  height: 5px;
}
.coverage-rail > span,
.coverage-rail > i {
  flex: 1;
  min-width: 10px;
  border-radius: 999px;
  background: var(--border-subtle);
}
.coverage-rail > .ready,
.coverage-rail > i.ready {
  background: var(--status-success);
}
.library-loading {
  display: grid;
  gap: 8px;
  padding: 12px;
}
.library-empty {
  display: grid;
  justify-items: center;
  padding: 64px 24px;
  text-align: center;
}
.library-empty__icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 14px;
  background: var(--brand-soft);
  color: var(--brand);
}
.library-empty h2 {
  margin: 14px 0 4px;
  font-size: 1rem;
}
.library-empty p {
  max-width: 420px;
  margin: 0 0 18px;
  color: var(--text-tertiary);
  font-size: 0.78rem;
  line-height: 1.5;
}
.library-more {
  display: flex;
  justify-content: center;
  padding: 12px;
  border-top: 1px solid var(--border-subtle);
}
.editor-heading {
  display: grid;
  gap: 3px;
}
.editor-heading > span,
.section-kicker {
  color: var(--text-tertiary);
  font-size: 0.66rem;
  font-weight: 760;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.editor-heading h2 {
  margin: 0;
  font-size: 1.15rem;
  letter-spacing: -0.02em;
}
.editor-heading > div {
  display: flex;
  align-items: center;
  gap: 8px;
  color: var(--text-tertiary);
  font-size: 0.68rem;
}
.editor-loading,
.macro-form {
  display: grid;
  gap: 12px;
}
.form-section {
  overflow: hidden;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-card);
}
.source-section {
  display: grid;
  gap: 14px;
  padding: 16px;
}
.source-section > header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
}
.source-section h3 {
  margin: 2px 0 0;
  font-size: 0.95rem;
}
.macro-form label,
.rollback-dialog label {
  display: grid;
  min-width: 0;
  gap: 6px;
}
.macro-form label > span,
.rollback-dialog label > span {
  color: var(--text-secondary);
  font-size: 0.74rem;
  font-weight: 720;
}
.macro-form label > small {
  color: var(--text-tertiary);
  font-size: 0.66rem;
  line-height: 1.4;
}
.macro-form :deep(.p-inputtext),
.macro-form :deep(.p-select),
.macro-form :deep(.p-textarea),
.rollback-dialog :deep(.p-select) {
  width: 100%;
}
.source-body-textarea {
  min-height: 76px;
  resize: vertical;
}
.field-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}
.field-label > .pi-info-circle {
  color: var(--text-tertiary);
  cursor: help;
  font-size: 0.72rem;
  font-weight: 400;
}
.form-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.section-disclosure {
  display: flex;
  width: 100%;
  min-height: 64px;
  align-items: center;
  gap: 10px;
  padding: 10px 14px;
  border: 0;
  background: transparent;
  color: var(--text-primary);
  text-align: left;
  cursor: pointer;
}
.section-disclosure > span:nth-child(2) {
  display: grid;
  min-width: 0;
  flex: 1;
  gap: 2px;
}
.section-disclosure strong {
  font-size: 0.8rem;
}
.section-disclosure small {
  color: var(--text-tertiary);
  font-size: 0.68rem;
}
.disclosure-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 10px;
  background: var(--brand-soft);
  color: var(--brand);
}
.disclosure-chevron {
  color: var(--text-tertiary);
  transition: transform 150ms ease;
}
.section-disclosure[aria-expanded="true"] .disclosure-chevron {
  transform: rotate(180deg);
}
.coverage-rail--editor {
  width: clamp(100px, 22%, 180px);
  flex: 0 0 auto;
}
.translation-action {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 0 14px 14px 60px;
}
.translation-action p {
  max-width: 480px;
  margin: 0;
  color: var(--text-tertiary);
  font-size: 0.7rem;
  line-height: 1.45;
}
.translation-list,
.advanced-content,
.history-list {
  display: grid;
  border-top: 1px solid var(--border-subtle);
  background: var(--surface-subtle);
}
.translation-list {
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 12px;
}
.translation-list article {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--surface-card);
}
.translation-list article > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.translation-list article header > div {
  display: flex;
  align-items: baseline;
  gap: 6px;
}
.translation-list article strong {
  text-transform: capitalize;
}
.translation-list article code {
  color: var(--text-tertiary);
  font-size: 0.64rem;
}
.translation-list article > small {
  color: var(--status-warning-text);
  font-size: 0.65rem;
  line-height: 1.4;
}
.advanced-content {
  gap: 14px;
  padding: 14px;
}
.variable-editor {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--surface-card);
}
.variable-editor > header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.variable-editor > header > div {
  display: grid;
  gap: 2px;
}
.variable-editor small,
.variable-editor > p {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 0.68rem;
}
.variable-row {
  display: grid;
  grid-template-columns: minmax(160px, 0.8fr) minmax(170px, 1fr) auto 36px;
  align-items: center;
  gap: 8px;
}
.variable-required {
  display: flex !important;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
}
.macro-preview {
  display: grid;
  gap: 7px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--brand-soft);
}
.macro-preview header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.macro-preview p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
  line-height: 1.5;
  white-space: pre-wrap;
}
.macro-preview small {
  color: var(--text-tertiary);
  font-size: 0.66rem;
}
.history-list article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 14px;
  border-bottom: 1px solid var(--border-subtle);
}
.history-list article > div {
  display: grid;
  gap: 3px;
}
.history-list article strong {
  font-size: 0.74rem;
}
.history-list article small {
  color: var(--text-tertiary);
  font-size: 0.64rem;
}
.editor-footer {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.editor-footer > div {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.rollback-dialog {
  display: grid;
  gap: 14px;
}
.rollback-dialog p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
  line-height: 1.5;
}
.section-expand-enter-active,
.section-expand-leave-active {
  overflow: hidden;
  transition:
    opacity 150ms ease,
    transform 150ms ease;
}
.section-expand-enter-from,
.section-expand-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}

@media (max-width: 760px) {
  .library-summary {
    grid-template-columns: repeat(3, 1fr);
  }
  .library-summary .library-summary__note {
    display: none;
  }
  .library-summary > div:nth-child(3) {
    border-right: 0;
  }
  .library-toolbar {
    flex-wrap: wrap;
  }
  .library-search {
    flex-basis: calc(100% - 48px);
  }
  .library-filters {
    order: 3;
    width: 100%;
  }
  .library-filters button {
    flex: 1;
  }
  .resource-row {
    grid-template-columns: minmax(0, 1fr) 150px;
  }
  .resource-open {
    font-size: 0;
  }
  .translation-list {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 640px) {
  .macro-library-page {
    gap: 12px;
  }
  .library-header {
    display: grid;
    gap: 14px;
  }
  .library-header :deep(.p-button) {
    width: 100%;
  }
  .library-summary span {
    font-size: 0.62rem;
  }
  .library-summary strong {
    font-size: 1rem;
  }
  .library-summary > div {
    padding: 10px;
  }
  .resource-row {
    grid-template-columns: 1fr;
    gap: 12px;
    padding: 14px;
  }
  .coverage-cell {
    max-width: none;
  }
  .form-grid {
    grid-template-columns: 1fr;
  }
  .section-disclosure {
    display: flex;
  }
  .section-disclosure .coverage-rail--editor {
    display: none;
  }
  .translation-action {
    align-items: stretch;
    flex-direction: column;
    padding: 0 12px 12px;
  }
  .translation-action :deep(.p-button) {
    width: 100%;
  }
  .variable-row {
    grid-template-columns: 1fr auto;
  }
  .variable-row > :deep(.p-select),
  .variable-row > :deep(.p-inputtext) {
    grid-column: 1 / -1;
  }
  .editor-footer {
    align-items: stretch;
    flex-direction: column;
  }
  .editor-footer > div,
  .editor-footer :deep(.p-button) {
    width: 100%;
  }
  :deep(.macro-editor-dialog) {
    width: 100vw !important;
    height: 100dvh;
    max-height: 100dvh;
    margin: 0;
    border-radius: 0;
  }
  :deep(.macro-editor-dialog .p-dialog-content) {
    flex: 1;
    padding: 12px;
  }
  :deep(.macro-editor-dialog .p-dialog-header),
  :deep(.macro-editor-dialog .p-dialog-footer) {
    padding: 12px;
  }
}

@media (prefers-reduced-motion: reduce) {
  .resource-row,
  .disclosure-chevron,
  .section-expand-enter-active,
  .section-expand-leave-active {
    transition: none;
  }
}
</style>
