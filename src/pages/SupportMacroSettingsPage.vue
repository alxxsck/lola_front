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
import { createSupportMacroAuthoringController } from "@/features/support-macros/model/use-support-macro-authoring";
import type {
  RollbackSupportMacroDtoReasonCode,
  SupportMacroRevisionResponseDto,
  SupportMacroVariableDtoName,
} from "@/shared/api/generated/models";

const auth = useAuthStore();
const accessDenied = ref(false);
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
      try {
        await auth.refreshContext();
      } catch {
        // Authoring projection has already been purged.
      }
    },
  },
  supportMacroSource,
);

const rollbackVisible = ref(false);
const rollbackRevision = ref<SupportMacroRevisionResponseDto | null>(null);
const rollbackReason = ref<RollbackSupportMacroDtoReasonCode>("CONTENT_REGRESSION");
const visibilityOptions = [
  { label: "Весь проект", value: "PROJECT" },
  { label: "Только команды", value: "TEAMS" },
];
const rollbackReasons = [
  { label: "Ошибка в содержимом", value: "CONTENT_REGRESSION" },
  { label: "Восстановление после инцидента", value: "INCIDENT_RECOVERY" },
  { label: "Откат политики", value: "POLICY_ROLLBACK" },
];
const variableOptions: { label: string; value: SupportMacroVariableDtoName }[] = [
  { label: "Имя пользователя", value: "endUser.displayName" },
  { label: "Идентификатор обращения", value: "case.id" },
  { label: "Тема обращения", value: "case.topicLabel" },
  { label: "Идентификатор диалога", value: "conversation.id" },
  { label: "Имя оператора", value: "operator.displayName" },
];

function addVariable(): void {
  const used = new Set(controller.form.value.variables.map((variable) => variable.name));
  const available = variableOptions.find((option) => !used.has(option.value));
  if (available) controller.form.value.variables.push({ name: available.value, required: true });
}

function removeVariable(index: number): void {
  controller.form.value.variables.splice(index, 1);
}

function macroTitle(index: number): string {
  const macro = controller.items.value[index];
  return macro?.draft?.configuration.title ?? macro?.publishedRevision?.configuration.title ?? macro?.stableCode ?? "Шаблон";
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
    accessDenied.value = false;
    void controller.load();
  },
);
watch(canManage, (allowed) => {
  if (allowed) void controller.load();
  else controller.reset();
});
onMounted(() => void controller.load());
onBeforeUnmount(controller.reset);
</script>

<template>
  <section class="page macro-settings-page">
    <header class="page-header macro-settings-header">
      <div>
        <div class="eyebrow"><i class="pi pi-file-edit" /> Материалы поддержки</div>
        <h1>Шаблоны ответов</h1>
        <p class="subtitle">
          Готовые ответы для операторов с историей публикаций. В диалог шаблон
          вставляется как обычный редактируемый текст.
        </p>
      </div>
      <Button
        label="Новый шаблон"
        icon="pi pi-plus"
        :disabled="!canManage"
        @click="controller.createNew"
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

    <div v-if="canManage" class="macro-authoring-shell">
      <aside class="macro-catalog" aria-label="Шаблоны проекта">
        <header>
          <div>
            <span>Каталог</span>
            <strong>{{ controller.items.value.length }}</strong>
          </div>
          <Button
            icon="pi pi-refresh"
            aria-label="Обновить шаблоны"
            severity="secondary"
            text
            :loading="controller.loading.value"
            @click="controller.load()"
          />
        </header>
        <div v-if="controller.loading.value && !controller.items.value.length" class="macro-catalog__loading">
          <Skeleton v-for="index in 4" :key="index" height="72px" border-radius="12px" />
        </div>
        <p v-else-if="!controller.items.value.length" class="macro-catalog__empty">
          Опубликованных шаблонов и черновиков пока нет.
        </p>
        <button
          v-for="(macro, index) in controller.items.value"
          :key="macro.id"
          type="button"
          class="macro-catalog__row"
          :class="{ selected: controller.selected.value?.id === macro.id }"
          @click="controller.select(macro)"
        >
          <span>
            <strong>{{ macroTitle(index) }}</strong>
            <small>{{ macro.stableCode }}</small>
          </span>
          <Tag
            :value="macro.lifecycle === 'ACTIVE' ? `Версия ${macro.publishedRevision?.revisionNumber ?? 'черновик'}` : 'Архив'"
            :severity="macro.lifecycle === 'ACTIVE' ? 'secondary' : 'contrast'"
          />
        </button>
        <Button
          v-if="controller.nextCursor.value"
          label="Показать ещё"
          severity="secondary"
          text
          :loading="controller.loading.value"
          @click="controller.load(controller.nextCursor.value ?? undefined)"
        />
      </aside>

      <main class="macro-editor card">
        <header class="macro-editor__header">
          <div>
            <span>{{ controller.selected.value ? "Редактирование" : "Новый шаблон" }}</span>
            <h2>{{ controller.form.value.title || "Без названия" }}</h2>
          </div>
          <div class="macro-editor__state">
            <Tag
              v-if="controller.selected.value"
              :value="controller.selected.value.lifecycle === 'ACTIVE' ? 'Активен' : 'Архивирован'"
              :severity="controller.selected.value.lifecycle === 'ACTIVE' ? 'success' : 'secondary'"
            />
            <span v-if="controller.selected.value?.draft">Есть неопубликованный черновик</span>
          </div>
        </header>

        <form class="macro-form" @submit.prevent="controller.saveDraft">
          <div class="macro-form__row">
            <label>
              <span>Стабильный код</span>
              <InputText
                v-model="controller.form.value.stableCode"
                placeholder="payment-check"
                :disabled="Boolean(controller.selected.value)"
              />
              <small>Не меняется после создания и используется для поиска.</small>
            </label>
            <label>
              <span>Язык</span>
              <InputText v-model="controller.form.value.locale" placeholder="ru" />
              <small>Код языка исходного текста по BCP 47.</small>
            </label>
          </div>
          <label>
            <span>Название</span>
            <InputText v-model="controller.form.value.title" maxlength="160" />
          </label>
          <label>
            <span>Текст ответа</span>
            <Textarea
              v-model="controller.form.value.body"
              rows="8"
              maxlength="10240"
              auto-resize
              placeholder="Текст, который оператор сможет отредактировать перед отправкой"
            />
            <small>{{ controller.form.value.body.length }} / 10 240 · переменные проверяет сервер</small>
          </label>
          <div class="macro-form__row">
            <label>
              <span>Быстрые вызовы</span>
              <Textarea v-model="controller.form.value.shortcutsText" rows="4" placeholder="deposit&#10;payment" />
              <small>До 10 значений, по одному на строку.</small>
            </label>
            <label>
              <span>Темы обращения</span>
              <Textarea v-model="controller.form.value.topicCodesText" rows="4" placeholder="PAYMENTS" />
              <small>Оставьте пустым, чтобы шаблон был доступен для любой темы.</small>
            </label>
          </div>
          <div class="macro-form__row">
            <label>
              <span>Область видимости</span>
              <Select
                v-model="controller.form.value.visibility"
                :options="visibilityOptions"
                option-label="label"
                option-value="value"
              />
            </label>
            <label v-if="controller.form.value.visibility === 'TEAMS'">
              <span>Идентификаторы команд</span>
              <Textarea v-model="controller.form.value.teamIdsText" rows="3" />
              <small>Точные идентификаторы команд с сервера, по одному на строку.</small>
            </label>
          </div>

          <section class="macro-variables" aria-labelledby="macro-variables-title">
            <header>
              <div>
                <span id="macro-variables-title">Переменные</span>
                <small>Только поля, разрешённые сервером. Скрытые данные не подставляются.</small>
              </div>
              <Button
                type="button"
                label="Добавить"
                icon="pi pi-plus"
                severity="secondary"
                text
                :disabled="controller.form.value.variables.length >= variableOptions.length"
                @click="addVariable"
              />
            </header>
            <p v-if="!controller.form.value.variables.length">
              В этом шаблоне нет динамических значений.
            </p>
            <div
              v-for="(variable, index) in controller.form.value.variables"
              :key="`${variable.name}-${index}`"
              class="macro-variable-row"
            >
              <Select
                v-model="variable.name"
                :options="variableOptions"
                option-label="label"
                option-value="value"
                aria-label="Поле переменной"
              />
              <InputText
                v-model="variable.fallback"
                :aria-label="`Запасной текст для ${variable.name}`"
                placeholder="Текст, если значения нет"
              />
              <label class="macro-variable-required">
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
          </section>

          <section v-if="controller.preview.value" class="macro-preview" aria-live="polite">
            <header>
              <span>Проверенный просмотр</span>
              <Tag value="Проверено" severity="success" />
            </header>
            <strong>{{ controller.preview.value.draft.title }}</strong>
            <p>{{ controller.preview.value.draft.body }}</p>
            <small>
              Проверка сервера, версия {{ controller.preview.value.compilerRevision }} ·
              {{ controller.preview.value.warningCodes.length ? `предупреждений: ${controller.preview.value.warningCodes.length}` : "без предупреждений" }}
            </small>
          </section>

          <footer class="macro-form__actions">
            <div>
              <Button
                type="button"
                label="Проверить"
                icon="pi pi-eye"
                severity="secondary"
                outlined
                :disabled="!controller.canSubmit.value"
                @click="controller.validatePreview"
              />
              <Button
                type="submit"
                label="Сохранить черновик"
                icon="pi pi-save"
                :loading="controller.saving.value"
                :disabled="!controller.canSubmit.value"
              />
            </div>
            <div v-if="controller.selected.value">
              <Button
                v-if="controller.selected.value.lifecycle === 'ACTIVE'"
                type="button"
                label="Архивировать"
                severity="danger"
                outlined
                :disabled="controller.saving.value"
                @click="controller.archive"
              />
              <Button
                type="button"
                label="Опубликовать"
                icon="pi pi-send"
                :disabled="!controller.selected.value.draft || controller.saving.value"
                @click="controller.publish"
              />
            </div>
          </footer>
        </form>

        <section v-if="controller.revisions.value.length" class="macro-history">
          <header>
            <span>История публикаций</span>
            <strong>{{ controller.revisions.value.length }}</strong>
          </header>
          <article v-for="revision in controller.revisions.value" :key="revision.id">
            <div>
              <strong>Версия {{ revision.revisionNumber }} · {{ revision.configuration.title }}</strong>
              <small>{{ new Date(revision.publishedAt).toLocaleString('ru-RU') }} · {{ publicationKindLabel(revision.publicationKind) }}</small>
            </div>
            <Button
              label="Откатить"
              severity="secondary"
              text
              :disabled="controller.saving.value"
              @click="openRollback(revision)"
            />
          </article>
          <Button
            v-if="controller.revisionsNextCursor.value"
            label="Показать более ранние версии"
            severity="secondary"
            text
            :loading="controller.loading.value"
            @click="controller.loadMoreRevisions"
          />
        </section>
      </main>
    </div>

    <Dialog
      v-model:visible="rollbackVisible"
      modal
      header="Вернуть прежнюю версию"
      :style="{ width: 'min(460px, calc(100vw - 32px))' }"
    >
      <div class="rollback-dialog">
        <p>Старая версия не изменится. Сервер создаст на её основе новую публикацию.</p>
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
        <Button label="Отмена" severity="secondary" text @click="rollbackVisible = false" />
        <Button label="Вернуть эту версию" :loading="controller.saving.value" @click="confirmRollback" />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.macro-settings-page { display: grid; gap: 16px; }
.macro-settings-header { align-items: flex-start; }
.macro-authoring-shell { display: grid; grid-template-columns: minmax(240px, 300px) minmax(0, 1fr); align-items: start; gap: 16px; }
.macro-catalog,
.macro-editor { border: 1px solid var(--border-subtle); border-radius: 14px; background: var(--surface-card); }
.macro-catalog { position: sticky; top: 16px; display: grid; max-height: calc(100dvh - 130px); overflow-y: auto; padding: 8px; }
.macro-catalog > header { display: flex; min-height: 46px; align-items: center; justify-content: space-between; padding: 4px 6px 8px; }
.macro-catalog > header div { display: flex; align-items: baseline; gap: 8px; }
.macro-catalog > header span { color: var(--text-tertiary); font-size: 0.72rem; font-weight: 720; }
.macro-catalog > header strong { font-variant-numeric: tabular-nums; }
.macro-catalog__loading { display: grid; gap: 6px; }
.macro-catalog__empty { padding: 28px 12px; color: var(--text-tertiary); font-size: 0.76rem; line-height: 1.5; text-align: center; }
.macro-catalog__row { display: flex; min-height: 68px; align-items: center; justify-content: space-between; gap: 8px; padding: 9px 10px; border: 0; border-radius: 11px; background: transparent; color: var(--text-primary); text-align: left; cursor: pointer; }
.macro-catalog__row:hover,
.macro-catalog__row:focus-visible { background: var(--surface-subtle); outline: none; }
.macro-catalog__row.selected { background: var(--brand-soft); box-shadow: inset 3px 0 0 var(--brand); }
.macro-catalog__row > span { display: grid; min-width: 0; gap: 3px; }
.macro-catalog__row strong { overflow: hidden; font-size: 0.8rem; text-overflow: ellipsis; white-space: nowrap; }
.macro-catalog__row small { color: var(--text-tertiary); font-family: ui-monospace, monospace; font-size: 0.64rem; }
.macro-editor { overflow: hidden; }
.macro-editor__header { display: flex; min-height: 74px; align-items: center; justify-content: space-between; gap: 16px; padding: 14px 16px; border-bottom: 1px solid var(--border-subtle); }
.macro-editor__header > div:first-child { display: grid; gap: 3px; }
.macro-editor__header span { color: var(--text-tertiary); font-size: 0.7rem; font-weight: 700; }
.macro-editor__header h2 { margin: 0; font-size: 1rem; font-weight: 770; letter-spacing: -0.01em; }
.macro-editor__state { display: flex; flex-wrap: wrap; align-items: center; justify-content: flex-end; gap: 8px; }
.macro-form { display: grid; gap: 14px; padding: 16px; }
.macro-form label,
.rollback-dialog label { display: grid; min-width: 0; gap: 6px; }
.macro-form label > span,
.rollback-dialog label > span { color: var(--text-secondary); font-size: 0.76rem; font-weight: 700; }
.macro-form label > small { color: var(--text-tertiary); font-size: 0.68rem; line-height: 1.4; }
.macro-form__row { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.macro-form :deep(.p-inputtext),
.macro-form :deep(.p-select),
.macro-form :deep(.p-textarea),
.rollback-dialog :deep(.p-select) { width: 100%; }
.macro-preview { display: grid; gap: 7px; padding: 12px; border: 1px solid var(--border-subtle); border-radius: 14px; background: var(--brand-soft); }
.macro-variables { display: grid; gap: 8px; padding: 12px; border: 1px solid var(--border-subtle); border-radius: 14px; background: var(--surface-subtle); }
.macro-variables > header { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.macro-variables > header > div { display: grid; gap: 2px; }
.macro-variables > header span { font-size: 0.78rem; font-weight: 740; }
.macro-variables small,
.macro-variables > p { margin: 0; color: var(--text-tertiary); font-size: 0.7rem; }
.macro-variable-row { display: grid; grid-template-columns: minmax(150px, 0.8fr) minmax(180px, 1fr) auto 36px; align-items: center; gap: 8px; }
.macro-variable-required { display: flex !important; grid-template-columns: none !important; align-items: center; gap: 7px; white-space: nowrap; }
.macro-preview header { display: flex; align-items: center; justify-content: space-between; }
.macro-preview header span { color: var(--text-tertiary); font-size: 0.68rem; font-weight: 750; letter-spacing: 0.08em; text-transform: uppercase; }
.macro-preview p { margin: 0; color: var(--text-secondary); font-size: 0.82rem; line-height: 1.5; white-space: pre-wrap; }
.macro-preview small { color: var(--text-tertiary); }
.macro-form__actions { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding-top: 14px; border-top: 1px solid var(--border-subtle); }
.macro-form__actions > div { display: flex; flex-wrap: wrap; gap: 8px; }
.macro-history { border-top: 1px solid var(--border-subtle); }
.macro-history > header,
.macro-history article { display: flex; align-items: center; justify-content: space-between; gap: 12px; padding: 11px 16px; }
.macro-history > header span { color: var(--text-tertiary); font-size: 0.72rem; font-weight: 730; }
.macro-history article { border-top: 1px solid var(--border-subtle); }
.macro-history article > div { display: grid; gap: 3px; }
.macro-history article strong { font-size: 0.78rem; }
.macro-history article small { color: var(--text-tertiary); font-size: 0.67rem; }
.rollback-dialog { display: grid; gap: 14px; }
.rollback-dialog p { margin: 0; color: var(--text-secondary); font-size: 0.82rem; line-height: 1.5; }

@media (max-width: 860px) {
  .macro-authoring-shell { grid-template-columns: 1fr; }
  .macro-catalog { position: static; max-height: 260px; }
}
@media (max-width: 600px) {
  .macro-settings-header :deep(.p-button) { width: 100%; }
  .macro-form__row { grid-template-columns: 1fr; }
  .macro-variable-row { grid-template-columns: 1fr auto; }
  .macro-variable-row > :deep(.p-select),
  .macro-variable-row > :deep(.p-inputtext) { grid-column: 1 / -1; width: 100%; }
  .macro-editor__header,
  .macro-form__actions { align-items: stretch; flex-direction: column; }
  .macro-form__actions > div,
  .macro-form__actions :deep(.p-button) { width: 100%; }
  .macro-history article { align-items: flex-start; }
}
</style>
