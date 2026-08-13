<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Checkbox from 'primevue/checkbox';
import Dialog from 'primevue/dialog';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Skeleton from 'primevue/skeleton';
import Tag from 'primevue/tag';
import { useAuthStore } from '@/features/auth/auth.store';
import { hasProjectPermission } from '@/features/auth/permission-access';
import { supportExternalWorkSource } from '@/features/support-external-work/api/support-external-work-source';
import { createSupportExternalSettingsController } from '@/features/support-external-work/model/use-support-external-settings';
import { resolveApiOrigin } from '@/shared/api/http/axios-instance';

const auth = useAuthStore();
const router = useRouter();
const accessDenied = ref(false);
const canManage = computed(
  () =>
    !accessDenied.value &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      'project.support.external_work.manage',
    ),
);

function openOAuth(launchPath: string): void {
  if (!launchPath.startsWith('/api/v1/support/external-work/oauth/launch/')) return;
  const target = `${resolveApiOrigin(import.meta.env.VITE_API_BASE_URL)}${launchPath}`;
  window.open(target, '_blank', 'noopener,noreferrer');
}

const controller = createSupportExternalSettingsController(
  {
    actorId: () => auth.user?.id,
    projectId: () => auth.project?.id,
    canManage: () => canManage.value,
    openOAuth,
    async onForbidden() {
      accessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // Protected state is already purged by the controller.
      }
    },
    async onAuthenticationRequired() {
      try {
        await auth.logout();
      } catch {
        // logout clears local authority before the remote request; navigation is mandatory.
      } finally {
        await router.replace({
          path: '/login',
          query: { redirect: '/support/settings/integrations' },
        });
      }
    },
  },
  supportExternalWorkSource,
);

const fallbackDestinationId = ref('');
const fallbackFormId = ref('');
const formRevision = ref('');
const mappingDisplayName = ref('');
const creatingMapping = ref(false);
const requesterRequired = ref(false);
const previewCaseKind = ref('SUPPORT');
const previewPriority = ref<'LOW' | 'MEDIUM' | 'HIGH' | 'URGENT'>('HIGH');
const previewPriorityOptions = [
  { label: 'Низкий', value: 'LOW' },
  { label: 'Средний', value: 'MEDIUM' },
  { label: 'Высокий', value: 'HIGH' },
  { label: 'Срочный', value: 'URGENT' },
];
const confirmAction = ref<'DISABLE' | 'REVOKE' | null>(null);
const rollbackRevisionId = ref<string | null>(null);
const rollbackReason = ref<
  'INCIDENT_RECOVERY' | 'CONFIGURATION_REGRESSION' | 'PROVIDER_SCHEMA_ROLLBACK'
>('CONFIGURATION_REGRESSION');
const rollbackReasonOptions = [
  { label: 'Восстановление после инцидента', value: 'INCIDENT_RECOVERY' },
  { label: 'Ошибка в настройках', value: 'CONFIGURATION_REGRESSION' },
  {
    label: 'Изменилась структура внешней системы',
    value: 'PROVIDER_SCHEMA_ROLLBACK',
  },
];
function capabilityLabel(value: string): string {
  return (
    {
      CATALOG: 'чтение каталога',
      REFRESH: 'обновление каталога',
      CREATE: 'создание внешних задач',
      COMMENT: 'добавление комментариев',
      UNLINK: 'удаление связи',
    }[value] ?? 'дополнительная возможность'
  );
}
const confirmVisible = computed({
  get: () => confirmAction.value !== null,
  set: (value: boolean) => {
    if (!value) confirmAction.value = null;
  },
});
const rollbackVisible = computed({
  get: () => rollbackRevisionId.value !== null,
  set: (value: boolean) => {
    if (!value) rollbackRevisionId.value = null;
  },
});

const connectionCards = computed(() => [
  ...controller.connections.value.map((connection) => ({
    key: connection.id,
    provider: connection.provider,
    connection,
  })),
  ...(['JSM', 'HELPDESK'] as const).map((provider) => ({
    key: `add-${provider}`,
    provider,
    connection: null,
  })),
]);
const destinationOptions = computed(
  () =>
    controller.catalog.value?.catalog?.destinations.map((destination) => ({
      label: destination.label,
      value: destination.id,
    })) ?? [],
);
const formOptions = computed(() => {
  const destination = controller.catalog.value?.catalog?.destinations.find(
    (item) => item.id === fallbackDestinationId.value,
  );
  return (destination?.forms ?? []).map((form) => ({
    label: form.label,
    value: form.id,
  }));
});
const tenantOptions = computed(() =>
  controller.oauthTenants.value.map((tenant) => ({
    label: tenant.siteUrl ? `${tenant.label} · ${tenant.siteUrl}` : tenant.label,
    value: tenant.id,
  })),
);
const selectedTenant = ref('');

watch(
  () =>
    [
      controller.mappingDraft.value,
      controller.conflictDraft.value,
      controller.selectedMappingId.value,
    ] as const,
  ([draft, conflictDraft, selectedMappingId]) => {
    if (conflictDraft?.mappingId === selectedMappingId) {
      fallbackDestinationId.value = conflictDraft.body.definition.fallback.destinationId;
      fallbackFormId.value = conflictDraft.body.definition.fallback.formId ?? '';
      formRevision.value = conflictDraft.body.formRevision;
      requesterRequired.value = conflictDraft.body.definition.fallback.requesterRequired ?? false;
      return;
    }
    if (!draft) {
      fallbackDestinationId.value = '';
      fallbackFormId.value = '';
      formRevision.value = '';
      requesterRequired.value = false;
      return;
    }
    fallbackDestinationId.value = draft.draft.definition.fallback.destinationId;
    fallbackFormId.value = draft.draft.definition.fallback.formId ?? '';
    formRevision.value = draft.draft.formRevision;
    requesterRequired.value = draft.draft.definition.fallback.requesterRequired ?? false;
  },
  { immediate: true },
);

watch(
  () => [
    auth.user?.id ?? '',
    auth.project?.id ?? '',
    [...(auth.project?.effectivePermissionCodes ?? [])].sort().join(','),
  ],
  () => {
    accessDenied.value = false;
    if (!canManage.value) {
      controller.reset();
      return;
    }
    void controller.load();
  },
  { immediate: true, flush: 'sync' },
);

onBeforeUnmount(() => controller.reset());

function lifecycleLabel(value: string): string {
  return (
    {
      ACTIVE: 'Подключено',
      DEGRADED: 'Работает с ограничениями',
      REAUTH_REQUIRED: 'Требуется повторный вход',
      DISABLED: 'Отключено',
      REVOKED: 'Доступ отозван',
    }[value] ?? 'Состояние подключения не распознано'
  );
}

function lifecycleSeverity(value: string) {
  if (value === 'ACTIVE') return 'success';
  if (value === 'DEGRADED' || value === 'REAUTH_REQUIRED') return 'warn';
  if (value === 'REVOKED') return 'danger';
  return 'secondary';
}

async function chooseConnection(connectionId: string): Promise<void> {
  creatingMapping.value = false;
  await controller.selectConnection(connectionId);
}

function formatTime(value: string | null | undefined): string {
  if (!value) return 'Не подтверждена';
  return new Intl.DateTimeFormat('ru', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function publicationKindLabel(value: string): string {
  if (value === 'ROLLBACK') return 'возврат версии';
  if (value === 'PUBLISH') return 'публикация';
  return 'операция не распознана';
}

function matchKindLabel(value: string): string {
  if (value === 'RULE') return 'По правилу';
  if (value === 'FALLBACK') return 'По умолчанию';
  return 'Способ не распознан';
}

async function saveDraft(): Promise<void> {
  const draft = controller.mappingDraft.value;
  if (!draft || !fallbackDestinationId.value || !formRevision.value.trim()) return;
  await controller.saveMapping({
    catalogSnapshotId: controller.catalog.value?.snapshot.id ?? draft.draft.catalogSnapshotId ?? '',
    formRevision: formRevision.value.trim(),
    definition: {
      rules: draft.draft.definition.rules,
      fallback: {
        ...draft.draft.definition.fallback,
        destinationId: fallbackDestinationId.value,
        ...(fallbackFormId.value ? { formId: fallbackFormId.value } : {}),
        requesterRequired: requesterRequired.value,
      },
    },
  });
}

async function createMapping(): Promise<void> {
  const connection = controller.selectedConnection.value;
  const snapshot = controller.catalog.value?.snapshot;
  if (
    !connection ||
    !snapshot ||
    !mappingDisplayName.value.trim() ||
    !fallbackDestinationId.value ||
    !formRevision.value.trim()
  )
    return;
  await controller.createMapping({
    connectionId: connection.id,
    catalogSnapshotId: snapshot.id,
    displayName: mappingDisplayName.value.trim(),
    formRevision: formRevision.value.trim(),
    definition: {
      rules: [],
      fallback: {
        destinationId: fallbackDestinationId.value,
        ...(fallbackFormId.value ? { formId: fallbackFormId.value } : {}),
        fieldValues: {},
        requesterRequired: requesterRequired.value,
      },
    },
  });
  if (!controller.error.value) {
    mappingDisplayName.value = '';
    creatingMapping.value = false;
  }
}

async function selectTenant(): Promise<void> {
  if (!selectedTenant.value) return;
  await controller.selectOAuthTenant(selectedTenant.value);
  selectedTenant.value = '';
}

async function applyConfirmedAction(): Promise<void> {
  const action = confirmAction.value;
  confirmAction.value = null;
  if (action === 'DISABLE') await controller.disableSelectedConnection();
  if (action === 'REVOKE') await controller.revokeSelectedConnection();
}

async function applyRollback(): Promise<void> {
  const revisionId = rollbackRevisionId.value;
  rollbackRevisionId.value = null;
  if (revisionId) await controller.rollbackMapping(revisionId, rollbackReason.value);
}
</script>

<template>
  <main class="external-settings-page">
    <header class="page-heading">
      <div>
        <span class="kicker">Поддержка · Настройки</span>
        <h1>Интеграции с внешними системами</h1>
        <p>
          Данные для входа в JSM и HelpDesk и служебное состояние авторизации через внешнюю систему
          (OAuth) хранятся только на сервере и не попадают в браузер.
        </p>
      </div>
      <Button
        label="Перечитать"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :disabled="controller.loading.value || controller.mutating.value"
        @click="controller.load"
      />
    </header>

    <Message v-if="!canManage" severity="warn" :closable="false">
      В этом проекте у вас нет доступа к настройкам внешних систем.
    </Message>

    <template v-else>
      <Message
        v-if="controller.error.value"
        severity="warn"
        :closable="false"
        aria-live="assertive"
      >
        {{ controller.error.value }}
        <Button
          v-if="controller.recovery.value"
          label="Повторить тот же запрос"
          size="small"
          :loading="controller.mutating.value"
          @click="controller.retryPending"
        />
      </Message>
      <Message
        v-if="controller.success.value"
        severity="success"
        :closable="false"
        aria-live="polite"
      >
        {{ controller.success.value }}
      </Message>

      <section class="connection-section" aria-labelledby="connections-title">
        <div class="section-heading">
          <div>
            <span class="kicker">Состояние подключений</span>
            <h2 id="connections-title">Подключения и авторизация</h2>
          </div>
          <span class="section-note">Проект: {{ auth.project?.name }}</span>
        </div>

        <div
          v-if="controller.loading.value"
          class="connection-grid"
          aria-label="Загрузка подключений"
        >
          <article
            v-for="index in 2"
            :key="index"
            class="connection-card connection-card--skeleton"
          >
            <Skeleton width="5rem" height="0.8rem" />
            <Skeleton width="75%" height="1.15rem" />
            <Skeleton width="45%" height="1.5rem" />
          </article>
        </div>
        <div v-else class="connection-grid">
          <button
            v-for="card in connectionCards"
            :key="card.key"
            type="button"
            class="connection-card"
            :class="{
              'connection-card--selected':
                card.connection?.id === controller.selectedConnectionId.value,
            }"
            :aria-pressed="card.connection?.id === controller.selectedConnectionId.value"
            @click="
              card.connection
                ? chooseConnection(card.connection.id)
                : controller.startOAuth(card.provider)
            "
          >
            <span class="provider-mark" aria-hidden="true">{{
              card.provider === 'JSM' ? 'J' : 'H'
            }}</span>
            <span class="connection-copy">
              <strong>{{ card.connection?.displayName ?? `Добавить ${card.provider}` }}</strong>
              <small>{{
                card.connection ? card.connection.tenantIdentity : 'Новый сайт или учётная запись'
              }}</small>
            </span>
            <Tag
              :value="card.connection ? lifecycleLabel(card.connection.lifecycle) : 'Добавить'"
              :severity="
                card.connection ? lifecycleSeverity(card.connection.lifecycle) : 'secondary'
              "
            />
          </button>
        </div>
      </section>

      <Transition name="detail-enter" mode="out-in">
        <section
          v-if="controller.selectedConnection.value"
          :key="controller.selectedConnection.value.id"
          class="settings-workbench"
        >
          <article class="connection-detail panel-surface">
            <div class="section-heading">
              <div>
                <span class="kicker">Данные подключения с сервера</span>
                <h2>{{ controller.selectedConnection.value.displayName }}</h2>
              </div>
              <Tag
                :value="lifecycleLabel(controller.selectedConnection.value.lifecycle)"
                :severity="lifecycleSeverity(controller.selectedConnection.value.lifecycle)"
              />
            </div>
            <dl class="status-rail">
              <div>
                <dt>Сайт или учётная запись</dt>
                <dd>
                  {{ controller.selectedConnection.value.tenantIdentity }}
                </dd>
              </div>
              <div>
                <dt>Данные для входа</dt>
                <dd>
                  {{
                    controller.selectedConnection.value.credentialConfigured
                      ? 'Настроены'
                      : 'Нужна авторизация'
                  }}
                </dd>
              </div>
              <div>
                <dt>Версия</dt>
                <dd class="tabular">
                  {{ controller.selectedConnection.value.version }}
                </dd>
              </div>
              <div>
                <dt>Подтверждённые возможности</dt>
                <dd>
                  {{
                    controller.selectedConnection.value.capabilities.verified
                      .map(capabilityLabel)
                      .join(', ') || 'Возможности ещё не подтверждены'
                  }}
                </dd>
              </div>
            </dl>
            <div class="action-row">
              <Button
                label="Проверить подключение"
                icon="pi pi-bolt"
                :loading="controller.mutating.value"
                @click="controller.testSelectedConnection"
              />
              <Button
                label="Повторить вход"
                icon="pi pi-external-link"
                severity="secondary"
                outlined
                :disabled="controller.mutating.value"
                @click="controller.reconnectSelectedConnection"
              />
              <Button
                label="Отключить"
                severity="secondary"
                outlined
                :disabled="controller.mutating.value"
                @click="confirmAction = 'DISABLE'"
              />
              <Button
                label="Отозвать доступ"
                severity="danger"
                outlined
                :disabled="controller.mutating.value"
                @click="confirmAction = 'REVOKE'"
              />
            </div>

            <div v-if="controller.oauth.value" class="oauth-tray">
              <span class="oauth-pulse" aria-hidden="true"></span>
              <div>
                <strong>Авторизация открыта</strong>
                <p>
                  После завершения авторизации выберите нужный сайт или учётную запись. Служебные
                  данные здесь не показываются.
                </p>
              </div>
              <Button
                label="Показать сайты"
                severity="secondary"
                outlined
                @click="controller.loadOAuthTenants"
              />
            </div>
            <div v-if="tenantOptions.length" class="tenant-row">
              <label for="external-tenant">Сайт или учётная запись</label>
              <Select
                input-id="external-tenant"
                v-model="selectedTenant"
                :options="tenantOptions"
                option-label="label"
                option-value="value"
                placeholder="Выберите сайт"
              />
              <Button label="Подтвердить" :disabled="!selectedTenant" @click="selectTenant" />
            </div>
          </article>

          <article class="catalog-detail panel-surface">
            <div class="section-heading">
              <div>
                <span class="kicker">Доступные назначения</span>
                <h2>Каталог назначений</h2>
              </div>
              <Tag
                v-if="controller.catalog.value"
                :value="controller.catalog.value.snapshot.stale ? 'Устарел' : 'Актуален'"
                :severity="controller.catalog.value.snapshot.stale ? 'warn' : 'success'"
              />
            </div>
            <template v-if="controller.loadingDetail.value">
              <Skeleton width="100%" height="3.5rem" />
              <Skeleton width="70%" height="1rem" />
            </template>
            <template v-else-if="controller.catalog.value">
              <div class="sync-readout">
                <span>Последняя успешная синхронизация</span>
                <strong>{{ formatTime(controller.catalog.value.snapshot.fetchedAt) }}</strong>
              </div>
              <ul class="destination-list">
                <li
                  v-for="destination in controller.catalog.value.catalog?.destinations ?? []"
                  :key="destination.id"
                >
                  <span>{{ destination.label }}</span
                  ><small>{{ destination.forms.length }} форм</small>
                </li>
              </ul>
              <Button
                label="Обновить назначения"
                icon="pi pi-refresh"
                severity="secondary"
                outlined
                :disabled="controller.mutating.value"
                @click="controller.refreshSelectedCatalog"
              />
            </template>
            <p v-else class="empty-copy">
              Каталог ещё не подтверждён. Сначала восстановите подключение.
            </p>
          </article>
        </section>
      </Transition>

      <section class="mapping-section panel-surface" aria-labelledby="mapping-title">
        <div class="section-heading">
          <div>
            <span class="kicker">Правила с версиями</span>
            <h2 id="mapping-title">Правила сопоставления</h2>
          </div>
          <div class="mapping-heading-actions">
            <Select
              v-if="controller.connectionMappings.value.length"
              v-model="controller.selectedMappingId.value"
              :options="controller.connectionMappings.value"
              option-label="displayName"
              option-value="id"
              aria-label="Выбрать набор правил"
              @change="
                creatingMapping = false;
                controller.selectMapping(String($event.value));
              "
            />
            <Button
              v-if="controller.selectedConnection.value"
              label="Новые правила"
              icon="pi pi-plus"
              severity="secondary"
              outlined
              @click="creatingMapping = true"
            />
          </div>
        </div>
        <div
          v-if="
            (creatingMapping || !controller.connectionMappings.value.length) &&
            !controller.loading.value
          "
          class="mapping-editor mapping-editor--create"
        >
          <p class="empty-copy">
            Опубликованных правил пока нет. Создайте черновик на основе подтверждённого каталога.
          </p>
          <div class="field">
            <label for="mapping-name">Название набора правил</label
            ><InputText id="mapping-name" v-model="mappingDisplayName" />
          </div>
          <div class="field">
            <label for="mapping-create-revision">Версия формы</label
            ><InputText id="mapping-create-revision" v-model="formRevision" />
          </div>
          <div class="field">
            <label for="mapping-create-destination">Назначение по умолчанию</label
            ><Select
              input-id="mapping-create-destination"
              v-model="fallbackDestinationId"
              :options="destinationOptions"
              option-label="label"
              option-value="value"
            />
          </div>
          <div class="field">
            <label for="mapping-create-form">Форма во внешней системе</label
            ><Select
              input-id="mapping-create-form"
              v-model="fallbackFormId"
              :options="formOptions"
              option-label="label"
              option-value="value"
              placeholder="Без отдельной формы"
            />
          </div>
          <label class="checkbox-row"
            ><Checkbox
              v-model="requesterRequired"
              binary
              input-id="mapping-create-requester"
            /><span>Заявитель обязателен</span></label
          >
          <div class="action-row">
            <Button
              label="Создать черновик правил"
              icon="pi pi-plus"
              :disabled="
                !controller.catalog.value ||
                !mappingDisplayName.trim() ||
                !fallbackDestinationId ||
                !formRevision.trim()
              "
              :loading="controller.mutating.value"
              @click="createMapping"
            />
          </div>
        </div>
        <template v-else-if="controller.selectedMapping.value">
          <div class="mapping-summary">
            <div>
              <span>Набор правил</span
              ><strong>{{ controller.selectedMapping.value.displayName }}</strong>
            </div>
            <div>
              <span>Версия на сервере</span
              ><strong class="tabular">{{ controller.selectedMapping.value.version }}</strong>
            </div>
            <div>
              <span>Черновик</span
              ><strong>{{
                controller.mappingDraft.value
                  ? `Черновик №${controller.mappingDraft.value.draft.revisionNumber}`
                  : 'Нет черновика'
              }}</strong>
            </div>
            <div>
              <span>Публикация</span
              ><strong>{{
                controller.selectedMapping.value.publishedRevisionId
                  ? 'Есть опубликованная версия'
                  : 'Не опубликовано'
              }}</strong>
            </div>
          </div>
          <div v-if="controller.mappingDraft.value" class="mapping-editor">
            <Message
              v-if="
                controller.conflictDraft.value?.mappingId === controller.selectedMappingId.value
              "
              severity="warn"
              :closable="false"
            >
              После конфликта восстановлен несохранённый черновик оператора.
              <Button
                label="Отменить восстановление"
                size="small"
                severity="secondary"
                text
                @click="controller.clearConflictDraft"
              />
            </Message>
            <div class="field">
              <label for="mapping-form-revision">Версия формы</label
              ><InputText id="mapping-form-revision" v-model="formRevision" />
            </div>
            <div class="field">
              <label for="mapping-destination">Назначение по умолчанию</label
              ><Select
                input-id="mapping-destination"
                v-model="fallbackDestinationId"
                :options="destinationOptions"
                option-label="label"
                option-value="value"
              />
            </div>
            <div class="field">
              <label for="mapping-form">Форма во внешней системе</label
              ><Select
                input-id="mapping-form"
                v-model="fallbackFormId"
                :options="formOptions"
                option-label="label"
                option-value="value"
                placeholder="Без отдельной формы"
              />
            </div>
            <label class="checkbox-row"
              ><Checkbox v-model="requesterRequired" binary input-id="requester-required" /><span
                >Заявитель обязателен при создании внешней задачи</span
              ></label
            >
            <div class="rule-rail">
              <span>Правила черновика</span>
              <strong>{{ controller.mappingDraft.value.draft.definition.rules.length }}</strong>
              <small
                >Редактор сохраняет защищённые значения полей и меняет только назначение по
                умолчанию.</small
              >
            </div>
            <div class="action-row">
              <Button
                label="Сохранить черновик"
                icon="pi pi-save"
                :disabled="!fallbackDestinationId || !formRevision.trim()"
                :loading="controller.mutating.value"
                @click="saveDraft"
              />
              <Button
                label="Проверить"
                severity="secondary"
                outlined
                @click="controller.validateMapping"
              />
              <Button
                label="Сравнить версии"
                severity="secondary"
                outlined
                @click="controller.diffMapping"
              />
              <Button
                label="Опубликовать"
                severity="success"
                outlined
                :disabled="controller.mutating.value"
                @click="controller.publishMapping"
              />
            </div>
            <div class="preview-row">
              <InputText
                v-model="previewCaseKind"
                aria-label="Тип обращения для предварительного просмотра"
              />
              <Select
                v-model="previewPriority"
                :options="previewPriorityOptions"
                option-label="label"
                option-value="value"
                aria-label="Приоритет для предварительного просмотра"
              />
              <Button
                label="Предварительный просмотр"
                severity="secondary"
                outlined
                @click="
                  controller.previewMapping({
                    caseKind: previewCaseKind,
                    priority: previewPriority,
                  })
                "
              />
            </div>
          </div>
          <Button
            v-else
            label="Начать новый черновик"
            icon="pi pi-plus"
            @click="controller.beginMappingDraft"
          />

          <div
            v-if="controller.validation.value || controller.preview.value || controller.diff.value"
            class="evidence-grid"
            aria-live="polite"
          >
            <article v-if="controller.validation.value">
              <span>Проверка</span
              ><strong>Пройдено · {{ controller.validation.value.ruleCount }} правил</strong
              ><small>{{ formatTime(controller.validation.value.validatedAt) }}</small>
            </article>
            <article v-if="controller.preview.value">
              <span>Предварительный просмотр</span
              ><strong
                >{{ matchKindLabel(controller.preview.value.matchedBy) }} →
                {{ controller.preview.value.destination.destinationId }}</strong
              ><small>Структура и назначение подтверждены сервером</small>
            </article>
            <article v-if="controller.diff.value">
              <span>Сравнение версий</span
              ><strong>{{
                controller.diff.value.changed
                  ? `${controller.diff.value.changes.length} изменений`
                  : 'Без изменений'
              }}</strong
              ><small>Черновик №{{ controller.diff.value.toRevisionNumber }}</small>
            </article>
          </div>

          <div v-if="controller.revisions.value.length" class="revision-list">
            <h3>Опубликованные версии</h3>
            <div
              v-for="revision in controller.revisions.value"
              :key="revision.id"
              class="revision-row"
            >
              <span
                ><strong>Версия {{ revision.revisionNumber }}</strong
                ><small
                  >{{ formatTime(revision.publishedAt) }} ·
                  {{ publicationKindLabel(revision.publicationKind) }}</small
                ></span
              >
              <Button
                label="Вернуть версию"
                size="small"
                severity="danger"
                outlined
                @click="rollbackRevisionId = revision.id"
              />
            </div>
          </div>
        </template>
      </section>
    </template>

    <Dialog
      v-model:visible="confirmVisible"
      modal
      :header="confirmAction === 'REVOKE' ? 'Отозвать доступ?' : 'Отключить подключение?'"
      :style="{ width: 'min(460px, calc(100vw - 32px))' }"
    >
      <p>
        Новые внешние команды остановятся. Обращения Lola и уже сохранённые записи о командах не
        удалятся.
      </p>
      <template #footer
        ><Button label="Отмена" severity="secondary" text @click="confirmAction = null" /><Button
          :label="confirmAction === 'REVOKE' ? 'Отозвать' : 'Отключить'"
          severity="danger"
          @click="applyConfirmedAction"
      /></template>
    </Dialog>
    <Dialog
      v-model:visible="rollbackVisible"
      modal
      header="Вернуть прежние правила"
      :style="{ width: 'min(480px, calc(100vw - 32px))' }"
    >
      <p>Сервер создаст новую опубликованную версию на основе выбранной. История не изменится.</p>
      <Select
        v-model="rollbackReason"
        :options="rollbackReasonOptions"
        option-label="label"
        option-value="value"
        aria-label="Причина возврата"
      />
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="rollbackRevisionId = null" /><Button
          label="Вернуть выбранную версию"
          severity="danger"
          @click="applyRollback"
      /></template>
    </Dialog>
  </main>
</template>

<style scoped>
.external-settings-page :deep(.p-message),
.external-settings-page :deep(.p-tag) {
  color: var(--text);
}
.external-settings-page :deep(.p-button-danger.p-button-outlined),
.external-settings-page :deep(.p-button-success.p-button-outlined) {
  color: var(--text);
}
.external-settings-page {
  display: grid;
  gap: 16px;
  padding: 20px;
  max-width: 1440px;
  margin: 0 auto;
  color: var(--text);
}
.page-heading,
.section-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.page-heading h1 {
  margin: 3px 0 6px;
  font-size: 1.75rem;
  line-height: 1.15;
  letter-spacing: -0.035em;
  text-wrap: balance;
}
.page-heading p,
.empty-copy {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
  text-wrap: pretty;
}
.kicker {
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.connection-section,
.mapping-section {
  display: grid;
  gap: 12px;
}
.section-heading h2 {
  margin: 2px 0 0;
  font-size: 1rem;
  letter-spacing: -0.01em;
}
.section-note {
  font-size: 0.76rem;
  color: var(--muted);
}
.connection-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.connection-card {
  min-height: 76px;
  padding: 12px;
  display: grid;
  grid-template-columns: 40px minmax(0, 1fr) auto;
  align-items: center;
  gap: 12px;
  text-align: left;
  color: inherit;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  cursor: pointer;
  transition:
    border-color 160ms ease,
    background-color 160ms ease,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.connection-card:hover {
  border-color: color-mix(in srgb, var(--brand) 36%, var(--line));
}
.connection-card:active {
  transform: scale(0.985);
}
.connection-card:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--brand) 28%, transparent);
  outline-offset: 2px;
}
.connection-card--selected {
  background: var(--brand-soft);
  border-color: color-mix(in srgb, var(--brand) 42%, var(--line));
}
.connection-card--skeleton {
  cursor: default;
}
.provider-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 11px;
  background: var(--brand-soft);
  color: var(--brand);
  font-weight: 800;
}
.connection-copy {
  display: grid;
  gap: 4px;
  min-width: 0;
}
.connection-copy strong,
.connection-copy small {
  overflow-wrap: anywhere;
}
.connection-copy small {
  color: var(--muted);
}
.settings-workbench {
  display: grid;
  grid-template-columns: minmax(0, 1.25fr) minmax(300px, 0.75fr);
  gap: 12px;
}
.panel-surface {
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: 14px;
  padding: 14px;
}
.connection-detail,
.catalog-detail {
  display: grid;
  gap: 14px;
}
.status-rail {
  display: grid;
  margin: 0;
  border: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
  border-radius: 12px;
  overflow: hidden;
}
.status-rail div {
  display: grid;
  grid-template-columns: minmax(120px, 0.8fr) minmax(0, 1.2fr);
  gap: 12px;
  padding: 9px 12px;
  min-height: 48px;
  align-items: center;
}
.status-rail div + div {
  border-top: 1px solid color-mix(in srgb, var(--line) 78%, transparent);
}
.status-rail dt {
  font-size: 0.72rem;
  font-weight: 700;
  color: var(--muted);
}
.status-rail dd {
  margin: 0;
  font-size: 0.8rem;
  font-weight: 650;
  overflow-wrap: anywhere;
}
.tabular {
  font-variant-numeric: tabular-nums;
}
.action-row {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.action-row :deep(.p-button),
.preview-row :deep(.p-button) {
  min-height: 44px;
}
.oauth-tray {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 12px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--brand-soft);
  border: 1px solid color-mix(in srgb, var(--brand) 30%, var(--line));
}
.oauth-tray p {
  margin: 3px 0 0;
  color: var(--muted);
  font-size: 0.78rem;
}
.oauth-pulse {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 16%, transparent);
}
.tenant-row,
.preview-row {
  display: grid;
  grid-template-columns: minmax(120px, 0.5fr) minmax(0, 1fr) auto;
  gap: 8px;
  align-items: center;
}
.tenant-row label,
.field label {
  font-size: 0.78rem;
  font-weight: 700;
}
.sync-readout {
  display: grid;
  gap: 3px;
  padding: 12px;
  border-radius: 12px;
  background: var(--canvas);
  border: 1px solid var(--line);
}
.sync-readout span,
.mapping-summary span,
.evidence-grid span {
  font-size: 0.72rem;
  color: var(--muted);
  font-weight: 700;
}
.destination-list {
  display: grid;
  gap: 6px;
  list-style: none;
  padding: 0;
  margin: 0;
}
.destination-list li {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  padding: 8px 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
}
.destination-list small {
  color: var(--muted);
}
.mapping-section {
  gap: 14px;
}
.mapping-summary {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 8px;
}
.mapping-summary > div,
.evidence-grid article {
  display: grid;
  gap: 5px;
  padding: 10px 12px;
  border-radius: 11px;
  background: var(--canvas);
  border: 1px solid var(--line);
}
.mapping-editor {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.mapping-editor--create .empty-copy {
  grid-column: 1/-1;
}
.field {
  display: grid;
  gap: 7px;
}
.checkbox-row {
  display: flex;
  align-items: center;
  gap: 9px;
  min-height: 44px;
  font-size: 0.8rem;
}
.rule-rail {
  grid-column: 1/-1;
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 10px 12px;
  border-radius: 11px;
  background: var(--brand-soft);
}
.rule-rail small {
  color: var(--muted);
}
.mapping-editor > .action-row,
.preview-row {
  grid-column: 1/-1;
}
.evidence-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}
.evidence-grid article small {
  color: var(--muted);
}
.revision-list {
  display: grid;
  gap: 8px;
}
.revision-list h3 {
  margin: 0;
  font-size: 0.9rem;
}
.revision-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 48px;
  padding: 8px 0;
  border-top: 1px solid var(--line);
}
.revision-row span {
  display: grid;
  gap: 3px;
}
.revision-row small {
  color: var(--muted);
}
.mapping-heading-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.detail-enter-enter-active,
.detail-enter-leave-active {
  transition:
    opacity 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.detail-enter-enter-from,
.detail-enter-leave-to {
  opacity: 0;
  transform: translateY(4px);
}
@media (max-width: 1100px) {
  .connection-grid,
  .settings-workbench {
    grid-template-columns: 1fr;
  }
  .mapping-summary {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .mapping-editor {
    grid-template-columns: 1fr 1fr;
  }
  .evidence-grid {
    grid-template-columns: 1fr;
  }
  .preview-row {
    grid-template-columns: 1fr 1fr;
  }
  .preview-row :deep(.p-button) {
    grid-column: 1/-1;
  }
}
@media (max-width: 600px) {
  .external-settings-page {
    padding: 12px;
  }
  .page-heading,
  .section-heading {
    align-items: stretch;
    flex-direction: column;
  }
  .connection-grid {
    grid-template-columns: 1fr;
  }
  .connection-card {
    grid-template-columns: 40px minmax(0, 1fr);
  }
  .connection-card :deep(.p-tag) {
    grid-column: 2;
  }
  .status-rail div {
    grid-template-columns: 1fr;
    gap: 3px;
  }
  .action-row {
    display: grid;
    grid-template-columns: 1fr;
  }
  .action-row :deep(.p-button) {
    width: 100%;
  }
  .oauth-tray,
  .tenant-row,
  .preview-row,
  .mapping-editor {
    grid-template-columns: 1fr;
  }
  .mapping-summary {
    grid-template-columns: 1fr;
  }
  .rule-rail {
    grid-template-columns: auto auto;
  }
  .rule-rail small {
    grid-column: 1/-1;
  }
  .preview-row :deep(.p-button) {
    grid-column: auto;
  }
}
@media (prefers-reduced-motion: reduce) {
  .connection-card,
  .detail-enter-enter-active,
  .detail-enter-leave-active {
    transition: none;
  }
  .detail-enter-enter-from,
  .detail-enter-leave-to {
    transform: none;
  }
}
</style>
