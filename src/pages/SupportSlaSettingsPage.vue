<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import { onBeforeRouteLeave } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import Tag from 'primevue/tag';
import { useAuthStore } from '@/features/auth/auth.store';
import { hasProjectPermission } from '@/features/auth/permission-access';
import { supportSlaConfigurationSource } from '@/features/support-sla/api/support-sla-configuration-source';
import { createSupportSlaConfigurationController } from '@/features/support-sla/model/use-support-sla-configuration';
import SupportBusinessCalendarEditor from '@/features/support-sla/ui/SupportBusinessCalendarEditor.vue';
import SupportSlaLifecycleRail from '@/features/support-sla/ui/SupportSlaLifecycleRail.vue';
import SupportSlaRulesEditor from '@/features/support-sla/ui/SupportSlaRulesEditor.vue';

const auth = useAuthStore();
const accessDenied = ref(false);
const editorStarted = ref(false);
const discardVisible = ref(false);
const publishVisible = ref(false);

const permissionCodes = computed(() => auth.project?.effectivePermissionCodes ?? []);
const permissionSignature = computed(() => [...permissionCodes.value].sort().join(','));
const canRead = computed(
  () =>
    !accessDenied.value &&
    (hasProjectPermission(permissionCodes.value, 'project.support.sla.read') ||
      hasProjectPermission(permissionCodes.value, 'project.support.sla.manage')),
);
const canManage = computed(
  () => canRead.value && hasProjectPermission(permissionCodes.value, 'project.support.sla.manage'),
);

const controller = createSupportSlaConfigurationController(
  {
    actorId: () => auth.user?.id,
    projectId: () => auth.project?.id,
    canRead: () => canRead.value,
    canManage: () => canManage.value,
    async onForbidden() {
      accessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // Protected SLA state is already purged by the controller.
      }
    },
  },
  supportSlaConfigurationSource,
);

const hasConfiguration = computed(
  () =>
    Boolean(controller.snapshot.value?.draft?.configuration) ||
    Boolean(
      controller.snapshot.value?.publishedConfiguration?.calendarRevision.calendar &&
      controller.snapshot.value?.publishedConfiguration?.policyRevision.policy,
    ),
);
const showEditor = computed(() => hasConfiguration.value || editorStarted.value);
const openWeekdays = computed(
  () => controller.form.value.weekly.filter((day) => day.intervals.length).length,
);
const issueCount = computed(() => controller.validationIssues.value.length);
const readOnly = computed(() => !canManage.value);

async function load(): Promise<void> {
  await controller.load();
  editorStarted.value = hasConfiguration.value;
}

function startConfiguration(): void {
  controller.beginDraft();
  editorStarted.value = true;
}

async function confirmDiscard(): Promise<void> {
  discardVisible.value = false;
  await controller.discardDraft();
  editorStarted.value = hasConfiguration.value;
}

async function confirmPublish(): Promise<void> {
  publishVisible.value = false;
  await controller.publish();
}

function beforeUnload(event: BeforeUnloadEvent): void {
  if (!controller.dirty.value && !controller.recovery.value) return;
  event.preventDefault();
  event.returnValue = '';
}

onBeforeRouteLeave(() => {
  if (!controller.dirty.value && !controller.recovery.value) return true;
  return window.confirm(
    controller.recovery.value
      ? 'Есть команда с неизвестным результатом. Покинуть страницу и прервать восстановление?'
      : 'Есть несохранённые изменения SLA. Покинуть страницу?',
  );
});

watch(
  () => [auth.user?.id, auth.project?.id, permissionSignature.value] as const,
  () => {
    accessDenied.value = false;
    editorStarted.value = false;
    discardVisible.value = false;
    publishVisible.value = false;
    controller.reset();
    if (canRead.value) void load();
  },
  { flush: 'sync' },
);
onMounted(() => {
  window.addEventListener('beforeunload', beforeUnload);
  if (canRead.value) void load();
});
onBeforeUnmount(() => {
  window.removeEventListener('beforeunload', beforeUnload);
  controller.reset();
});
</script>

<template>
  <section class="page sla-settings-page" aria-labelledby="sla-settings-title">
    <header class="page-header sla-settings-header">
      <div>
        <div class="eyebrow"><i class="pi pi-clock" /> Настройки поддержки</div>
        <h1 id="sla-settings-title">Календарь и правила SLA</h1>
        <p class="subtitle">
          Определите рабочее время и сроки ответа для обращений. Публикация создаёт неизменяемые
          редакции, но не включает расчёт SLA автоматически.
        </p>
      </div>
      <div class="sla-settings-header__actions">
        <Tag v-if="readOnly && canRead" value="Только просмотр" severity="secondary" />
        <Button
          v-if="canRead"
          label="Перечитать"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="controller.loading.value"
          :disabled="controller.mutating.value || Boolean(controller.recovery.value)"
          @click="load"
        />
      </div>
    </header>

    <Message v-if="!canRead" severity="warn" :closable="false">
      Настройка SLA недоступна для текущего проекта или роли.
    </Message>

    <template v-if="canRead">
      <div class="sla-live-region" aria-live="polite" aria-atomic="true">
        <Message v-if="controller.error.value" severity="error" :closable="false">
          {{ controller.error.value }}
        </Message>
        <Message v-if="controller.success.value" severity="success" :closable="false">
          {{ controller.success.value }}
        </Message>
      </div>

      <template v-if="controller.loading.value && !controller.snapshot.value">
        <Skeleton height="94px" border-radius="14px" />
        <div class="sla-editor-skeletons">
          <Skeleton height="520px" border-radius="14px" />
          <Skeleton height="520px" border-radius="14px" />
        </div>
      </template>

      <template v-else-if="controller.snapshot.value">
        <SupportSlaLifecycleRail
          :snapshot="controller.snapshot.value"
          :dirty="controller.dirty.value"
          :can-manage="canManage"
        />

        <section v-if="!showEditor" class="sla-empty-state">
          <span class="sla-empty-state__icon"><i class="pi pi-calendar-plus" /></span>
          <div>
            <h2>Соберите первую SLA-конфигурацию</h2>
            <p>
              Часовой пояс, рабочее расписание и три цели не заполняются за вас: их нужно
              подтвердить перед сохранением.
            </p>
          </div>
          <Button
            v-if="canManage"
            label="Создать конфигурацию"
            icon="pi pi-plus"
            @click="startConfiguration"
          />
        </section>

        <template v-else>
          <section class="sla-review-strip" aria-label="Проверка формы">
            <div>
              <small>Часовой пояс</small>
              <strong>{{ controller.form.value.timeZone || 'Не выбран' }}</strong>
            </div>
            <div>
              <small>Рабочие дни</small>
              <strong>{{ openWeekdays }} из 7</strong>
            </div>
            <div>
              <small>Исключения</small>
              <strong>{{ controller.form.value.exceptions.length }}</strong>
            </div>
            <div>
              <small>Правила</small>
              <strong>{{ controller.form.value.rules.length }}</strong>
            </div>
            <div :class="{ 'has-issues': issueCount }">
              <small>Проверка формы</small>
              <strong>{{
                issueCount ? `${issueCount} замечаний` : 'Готова к проверке сервером'
              }}</strong>
            </div>
          </section>

          <Message v-if="controller.conflict.value" severity="warn" :closable="false">
            <div class="sla-conflict-message">
              <span>
                Серверное состояние уже перечитано. Можно вручную перенести изменения или заменить
                локальную форму актуальной версией.
              </span>
              <Button
                label="Взять версию сервера"
                severity="secondary"
                outlined
                @click="controller.resetLocal"
              />
            </div>
          </Message>

          <div class="sla-editor-stack">
            <SupportBusinessCalendarEditor
              v-model="controller.form.value"
              :readonly="readOnly"
              :issues="controller.validationIssues.value"
            />
            <SupportSlaRulesEditor
              v-model="controller.form.value"
              :readonly="readOnly"
              :issues="controller.validationIssues.value"
            />
          </div>

          <footer v-if="canManage" class="sla-action-bar">
            <div class="sla-action-bar__state">
              <span class="sla-action-bar__dot" :class="{ 'is-dirty': controller.dirty.value }" />
              <div>
                <strong>{{
                  controller.dirty.value
                    ? 'Изменения только на этом устройстве'
                    : 'Форма синхронизирована'
                }}</strong>
                <small v-if="controller.snapshot.value.draft">
                  Сохранённый черновик: поколение
                  {{ controller.snapshot.value.draft.generation }}, изменение
                  {{ controller.snapshot.value.draft.version }}
                </small>
                <small v-else>Сохранённого черновика пока нет</small>
              </div>
            </div>
            <div v-if="controller.recovery.value" class="sla-action-bar__recovery">
              <Button
                label="Повторить тот же запрос"
                icon="pi pi-replay"
                severity="warn"
                :loading="controller.mutating.value"
                @click="controller.retryPending"
              />
            </div>
            <div v-else class="sla-action-bar__buttons">
              <Button
                v-if="controller.dirty.value"
                label="Отменить изменения"
                severity="secondary"
                text
                :disabled="controller.mutating.value"
                @click="controller.resetLocal"
              />
              <Button
                v-if="controller.snapshot.value.draft"
                label="Удалить черновик"
                icon="pi pi-trash"
                severity="danger"
                outlined
                :disabled="controller.dirty.value || controller.mutating.value"
                @click="discardVisible = true"
              />
              <Button
                label="Сохранить черновик"
                icon="pi pi-save"
                :loading="controller.mutating.value"
                :disabled="!controller.dirty.value || controller.mutating.value"
                @click="controller.saveDraft"
              />
              <Button
                label="Опубликовать"
                icon="pi pi-send"
                severity="contrast"
                :disabled="!controller.canPublish.value"
                @click="publishVisible = true"
              />
            </div>
          </footer>
        </template>
      </template>
    </template>

    <Dialog
      v-model:visible="discardVisible"
      modal
      header="Удалить сохранённый черновик?"
      :style="{ width: 'min(460px, calc(100vw - 32px))' }"
    >
      <p class="dialog-copy">
        Восстановить этот черновик через текущий API нельзя. Опубликованная конфигурация не
        изменится.
      </p>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="discardVisible = false" />
        <Button
          label="Удалить черновик"
          severity="danger"
          :loading="controller.mutating.value"
          @click="confirmDiscard"
        />
      </template>
    </Dialog>

    <Dialog
      v-model:visible="publishVisible"
      modal
      header="Опубликовать SLA-конфигурацию?"
      :style="{ width: 'min(500px, calc(100vw - 32px))' }"
    >
      <div class="publish-confirmation">
        <p class="dialog-copy">
          Сервер создаст новые неизменяемые редакции календаря и правил, затем удалит сохранённый
          черновик.
        </p>
      </div>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="publishVisible = false" />
        <Button
          label="Опубликовать конфигурацию"
          icon="pi pi-send"
          :loading="controller.mutating.value"
          @click="confirmPublish"
        />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.sla-settings-page {
  display: grid;
  gap: 16px;
}
.sla-settings-header {
  margin-bottom: 4px;
}
.sla-settings-header__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.sla-live-region:empty {
  display: none;
}
.sla-settings-page :deep(.p-message-info .p-message-text) {
  color: var(--text-primary);
}
.sla-settings-page :deep(.p-message-info) {
  opacity: 1 !important;
  transition: none !important;
}
.sla-editor-skeletons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.sla-empty-state {
  display: grid;
  grid-template-columns: 48px minmax(0, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 20px;
  border: 1px dashed var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.sla-empty-state__icon {
  display: grid;
  place-items: center;
  width: 48px;
  height: 48px;
  color: var(--status-accent-text);
  background: var(--status-accent-soft);
  border-radius: 14px;
}
.sla-empty-state h2 {
  font-size: 1rem;
}
.sla-empty-state p {
  margin: 5px 0 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
}
.sla-review-strip {
  display: grid;
  grid-template-columns: 1.2fr repeat(4, minmax(100px, 0.7fr));
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-subtle);
}
.sla-review-strip > div {
  min-width: 0;
  padding: 10px 12px;
  border-right: 1px solid var(--line);
}
.sla-review-strip > div:last-child {
  border-right: 0;
}
.sla-review-strip small,
.sla-review-strip strong {
  display: block;
}
.sla-review-strip small {
  color: var(--text-tertiary);
  font-size: 0.66rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  text-transform: uppercase;
}
.sla-review-strip strong {
  margin-top: 4px;
  overflow-wrap: anywhere;
  font-size: 0.76rem;
  font-variant-numeric: tabular-nums;
}
.sla-review-strip .has-issues {
  color: var(--status-danger-text);
  background: var(--status-danger-soft);
}
.sla-conflict-message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  width: 100%;
}
.sla-editor-stack {
  display: grid;
  gap: 16px;
}
.sla-action-bar {
  position: sticky;
  z-index: 5;
  bottom: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.sla-action-bar__state {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}
.sla-action-bar__state strong,
.sla-action-bar__state small {
  display: block;
}
.sla-action-bar__state strong {
  font-size: 0.76rem;
}
.sla-action-bar__state small {
  margin-top: 3px;
  color: var(--text-tertiary);
  font-size: 0.66rem;
}
.sla-action-bar__dot {
  width: 9px;
  height: 9px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--status-success);
  box-shadow: 0 0 0 4px var(--status-success-soft);
}
.sla-action-bar__dot.is-dirty {
  background: var(--status-warning);
  box-shadow: 0 0 0 4px var(--status-warning-soft);
}
.sla-action-bar__buttons {
  display: flex;
  flex-wrap: wrap;
  justify-content: flex-end;
  gap: 8px;
}
.dialog-copy {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.8rem;
  line-height: 1.55;
}
.publish-confirmation {
  display: grid;
  gap: 12px;
}
@media (max-width: 960px) {
  .sla-editor-skeletons {
    grid-template-columns: 1fr;
  }
  .sla-review-strip {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .sla-review-strip > div {
    border-bottom: 1px solid var(--line);
  }
  .sla-review-strip > div:nth-child(2n) {
    border-right: 0;
  }
  .sla-review-strip > div:last-child {
    grid-column: 1 / -1;
    border-bottom: 0;
  }
  .sla-action-bar {
    align-items: flex-start;
    flex-direction: column;
  }
  .sla-action-bar__buttons {
    width: 100%;
  }
}
@media (max-width: 600px) {
  .sla-settings-header__actions {
    width: 100%;
    justify-content: space-between;
  }
  .sla-empty-state {
    grid-template-columns: 44px minmax(0, 1fr);
  }
  .sla-empty-state > :deep(.p-button) {
    grid-column: 1 / -1;
    width: 100%;
  }
  .sla-conflict-message {
    align-items: flex-start;
    flex-direction: column;
  }
  .sla-action-bar {
    position: static;
    padding: 10px;
  }
  .sla-action-bar__buttons :deep(.p-button),
  .sla-action-bar__recovery :deep(.p-button) {
    width: 100%;
    min-height: 44px;
  }
  .sla-action-bar__buttons,
  .sla-action-bar__recovery {
    width: 100%;
  }
}
</style>
