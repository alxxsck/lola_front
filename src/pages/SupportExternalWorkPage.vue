<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRoute, useRouter } from 'vue-router';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Skeleton from 'primevue/skeleton';
import Tag from 'primevue/tag';
import { useAuthStore } from '@/features/auth/auth.store';
import { hasProjectPermission } from '@/features/auth/permission-access';
import { supportExternalWorkSource } from '@/features/support-external-work/api/support-external-work-source';
import { createSupportExternalInboxController } from '@/features/support-external-work/model/use-support-external-inbox';

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const accessDenied = ref(false);
const permissions = computed(() => auth.project?.effectivePermissionCodes ?? []);
const canReadInbox = computed(
  () =>
    !accessDenied.value &&
    hasProjectPermission(permissions.value, 'project.support.external_work.inbox_read'),
);
const canReadLinked = computed(
  () =>
    !accessDenied.value &&
    hasProjectPermission(permissions.value, 'project.support.external_work.read_linked'),
);
const canRetry = computed(() =>
  hasProjectPermission(permissions.value, 'project.support.external_work.retry'),
);
const canResolveUnknown = computed(() =>
  hasProjectPermission(permissions.value, 'project.support.external_work.resolve_unknown'),
);

const controller = createSupportExternalInboxController(
  {
    actorId: () => auth.user?.id,
    projectId: () => auth.project?.id,
    canReadInbox: () => canReadInbox.value,
    canReadLinked: () => canReadLinked.value,
    canRetry: () => canRetry.value,
    canResolveUnknown: () => canResolveUnknown.value,
    async onForbidden() {
      accessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // The controller already removed protected objects and timelines.
      }
    },
  },
  supportExternalWorkSource,
);

let reconciliationGeneration = 0;
let loadedScope = '';
let openedFromQueue = false;
let disposed = false;

function ownsCurrentRoute(): boolean {
  return !disposed && route.name === 'support-external-work';
}

function scalarQuery(value: unknown): string | null {
  return typeof value === 'string' && value.length > 0 ? value : null;
}

function requestedMode(): 'ATTENTION' | 'LINKED' {
  const requested = scalarQuery(route.query.mode)?.toLowerCase();
  if (requested === 'linked' && canReadLinked.value) return 'LINKED';
  if (requested === 'attention' && canReadInbox.value) return 'ATTENTION';
  return canReadInbox.value ? 'ATTENTION' : 'LINKED';
}

function canonicalQuery(itemId = scalarQuery(route.query.itemId)) {
  const projectId = scalarQuery(route.query.projectId);
  return {
    ...(projectId ? { projectId } : {}),
    mode: requestedMode().toLowerCase(),
    ...(itemId ? { itemId } : {}),
  };
}

async function reconcileRoute(forceList = false): Promise<void> {
  const run = ++reconciliationGeneration;
  if (!ownsCurrentRoute()) return;
  if (!canReadInbox.value && !canReadLinked.value) {
    controller.reset();
    return;
  }
  const expected = canonicalQuery();
  if (JSON.stringify(route.query) !== JSON.stringify(expected)) {
    await router.replace({ name: 'support-external-work', query: expected });
    if (run !== reconciliationGeneration || !ownsCurrentRoute()) return;
  }
  const nextMode = requestedMode();
  const scope = `${auth.user?.id ?? ''}\u0000${auth.project?.id ?? ''}\u0000${nextMode}`;
  if (forceList || loadedScope !== scope || controller.mode.value !== nextMode) {
    controller.mode.value = nextMode;
    await controller.load();
    if (run !== reconciliationGeneration || !ownsCurrentRoute()) return;
    loadedScope = scope;
  }
  const itemId = scalarQuery(route.query.itemId);
  if (itemId) await controller.selectItem(itemId);
  else controller.closeDetail();
}

async function changeMode(mode: 'ATTENTION' | 'LINKED'): Promise<void> {
  openedFromQueue = false;
  await router.push({
    name: 'support-external-work',
    query: { ...canonicalQuery(null), mode: mode.toLowerCase() },
  });
}

async function openItem(itemId: string): Promise<void> {
  openedFromQueue = true;
  await router.push({
    name: 'support-external-work',
    query: { ...canonicalQuery(null), itemId },
  });
}

async function closeRoutedDetail(): Promise<void> {
  if (openedFromQueue) {
    openedFromQueue = false;
    router.back();
    return;
  }
  await router.replace({
    name: 'support-external-work',
    query: canonicalQuery(null),
  });
}

async function applyFilters(): Promise<void> {
  openedFromQueue = false;
  if (route.query.itemId)
    await router.replace({
      name: 'support-external-work',
      query: canonicalQuery(null),
    });
  await reconcileRoute(true);
}

async function changePage(direction: 'previous' | 'next'): Promise<void> {
  openedFromQueue = false;
  if (route.query.itemId)
    await router.replace({
      name: 'support-external-work',
      query: canonicalQuery(null),
    });
  if (direction === 'previous') await controller.loadPrevious();
  else await controller.loadMore();
}

watch(
  () => [auth.user?.id ?? '', auth.project?.id ?? '', [...permissions.value].sort().join(',')],
  () => {
    accessDenied.value = false;
    if (!canReadInbox.value && !canReadLinked.value) {
      controller.reset();
      return;
    }
    void reconcileRoute(true);
  },
  { immediate: true, flush: 'sync' },
);

watch(
  () => [route.name, route.query.mode, route.query.itemId, route.query.projectId],
  () => {
    if (ownsCurrentRoute()) void reconcileRoute(false);
  },
  { flush: 'sync' },
);

onBeforeUnmount(() => {
  disposed = true;
  reconciliationGeneration += 1;
  controller.reset();
});

const providerOptions = [
  { label: 'Все внешние системы', value: 'ALL' },
  { label: 'JSM', value: 'JSM' },
  { label: 'HelpDesk', value: 'HELPDESK' },
];
const freshnessOptions = [
  { label: 'Любая актуальность', value: 'ALL' },
  { label: 'Актуальные', value: 'FRESH' },
  { label: 'Устаревшие', value: 'STALE' },
  { label: 'Удалены во внешней системе', value: 'TOMBSTONED' },
];
const ageOptions = [
  { label: 'Любой возраст', value: 'ALL' },
  { label: 'Последние 24 часа', value: '24H' },
  { label: 'Последние 7 дней', value: '7D' },
];

function providerLabel(value: string): string {
  if (value === 'JSM') return 'JSM';
  if (value === 'HELPDESK') return 'HelpDesk';
  return 'Внешняя система';
}

function freshnessLabel(value: string): string {
  return (
    {
      FRESH: 'Актуально',
      STALE: 'Требует сверки',
      TOMBSTONED: 'Удалено во внешней системе',
    }[value] ?? 'Состояние не распознано'
  );
}

function freshnessSeverity(value: string) {
  if (value === 'FRESH') return 'success';
  if (value === 'STALE') return 'warn';
  return 'danger';
}

function commandStatus(value: string): string {
  return (
    {
      QUEUED: 'В очереди',
      CLAIMED: 'Отправляется',
      RETRYING: 'Повтор',
      SUCCEEDED: 'Создано',
      FAILED: 'Требует внимания',
      UNKNOWN: 'Результат неизвестен',
      CANCELLED: 'Отменено',
    }[value] ?? 'Состояние команды не распознано'
  );
}

function commandSeverity(value: string) {
  if (value === 'SUCCEEDED') return 'success';
  if (value === 'UNKNOWN' || value === 'FAILED') return 'warn';
  if (value === 'CANCELLED') return 'danger';
  return 'info';
}

function commandIntent(value: string): string {
  return (
    {
      CREATE: 'Создание',
      COMMENT: 'Комментарий',
      REFRESH: 'Сверка данных',
      UNLINK: 'Удаление связи',
    }[value] ?? 'Команда'
  );
}

function formatTime(value: string | null | undefined): string {
  if (!value) return 'Не подтверждено';
  return new Intl.DateTimeFormat('ru', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function safeRemoteUrl(value: string | null): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    return url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}
</script>

<template>
  <main
    class="external-work-page"
    :class="{ 'external-work-page--detail': controller.detail.value }"
  >
    <header class="page-heading">
      <div>
        <span class="kicker">Поддержка · Восстановление</span>
        <h1>Внешние задачи</h1>
        <p>
          Очередь JSM и HelpDesk. Данные внешней системы помогают восстановить работу, но не
          изменяют само обращение в Lola.
        </p>
      </div>
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :disabled="controller.loading.value || controller.mutating.value"
        @click="reconcileRoute(true)"
      />
    </header>

    <Message v-if="!canReadInbox && !canReadLinked" severity="warn" :closable="false">
      В этом проекте у вас нет доступа к внешним задачам.
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
        >{{ controller.success.value }}</Message
      >

      <div class="mode-switch" role="group" aria-label="Раздел внешних задач">
        <button
          v-if="canReadInbox"
          data-testid="mode-attention"
          type="button"
          :aria-pressed="controller.mode.value === 'ATTENTION'"
          @click="changeMode('ATTENTION')"
        >
          <i class="pi pi-inbox" aria-hidden="true"></i><span>Требует внимания</span>
        </button>
        <button
          v-if="canReadLinked"
          data-testid="mode-linked"
          type="button"
          :aria-pressed="controller.mode.value === 'LINKED'"
          @click="changeMode('LINKED')"
        >
          <i class="pi pi-link" aria-hidden="true"></i><span>Связанные объекты</span>
        </button>
      </div>

      <section class="filters" aria-label="Фильтры внешних задач">
        <Select
          v-if="controller.mode.value === 'LINKED'"
          v-model="controller.provider.value"
          :options="providerOptions"
          option-label="label"
          option-value="value"
          aria-label="Внешняя система"
        />
        <Select
          v-model="controller.freshness.value"
          :options="freshnessOptions"
          option-label="label"
          option-value="value"
          aria-label="Актуальность"
        />
        <InputText
          v-if="controller.mode.value === 'LINKED'"
          v-model="controller.status.value"
          placeholder="Статус во внешней системе"
          aria-label="Статус во внешней системе"
        />
        <Select
          v-if="controller.mode.value === 'LINKED'"
          v-model="controller.age.value"
          :options="ageOptions"
          option-label="label"
          option-value="value"
          aria-label="Возраст объекта"
        />
        <Button label="Применить" severity="secondary" outlined @click="applyFilters" />
      </section>

      <section class="recovery-workbench">
        <div class="master-pane" aria-label="Очередь внешних задач">
          <div class="pane-heading">
            <span>{{
              controller.mode.value === 'ATTENTION' ? 'Очередь на проверку' : 'Связанные задачи'
            }}</span
            ><strong class="tabular">{{ controller.items.value.length }}</strong>
          </div>
          <div
            v-if="controller.loading.value"
            class="item-list item-list--loading"
            aria-label="Загрузка внешних задач"
          >
            <article v-for="index in 4" :key="index" class="work-item work-item--skeleton">
              <Skeleton width="4.5rem" height=".75rem" /><Skeleton
                width="88%"
                height="1rem"
              /><Skeleton width="62%" height=".8rem" />
            </article>
          </div>
          <div v-else-if="controller.items.value.length" class="item-list">
            <button
              v-for="item in controller.items.value"
              :key="item.itemId"
              data-testid="external-item"
              type="button"
              class="work-item"
              :class="{
                'work-item--selected': controller.selectedItemId.value === item.itemId,
              }"
              :aria-pressed="controller.selectedItemId.value === item.itemId"
              @click="openItem(item.itemId)"
            >
              <span class="item-meta"
                ><strong>{{ providerLabel(item.provider) }}</strong
                ><small>{{ item.remoteKey ?? item.remoteItemId }}</small
                ><Tag
                  :value="freshnessLabel(item.freshness)"
                  :severity="freshnessSeverity(item.freshness)"
              /></span>
              <span class="item-summary">{{ item.summary ?? 'Без описания' }}</span>
              <span class="item-foot"
                ><small>{{ item.status ?? 'Статус не указан' }}</small
                ><small>{{ formatTime(item.lastRefreshedAt) }}</small></span
              >
            </button>
            <div
              v-if="controller.pageIndex.value > 0 || controller.nextCursor.value"
              class="pagination-row"
              aria-label="Страницы внешних задач"
            >
              <Button
                label="Назад"
                severity="secondary"
                outlined
                :disabled="controller.loading.value || controller.pageIndex.value === 0"
                @click="changePage('previous')"
              />
              <span>Страница {{ controller.pageIndex.value + 1 }}</span>
              <Button
                label="Дальше"
                severity="secondary"
                outlined
                :disabled="controller.loading.value || !controller.nextCursor.value"
                @click="changePage('next')"
              />
            </div>
          </div>
          <div v-else class="empty-state">
            <i class="pi pi-check-circle" aria-hidden="true"></i><strong>Очередь пуста</strong>
            <p>Нет задач, подходящих под выбранные фильтры.</p>
          </div>
        </div>

        <Transition name="detail-enter" mode="out-in">
          <div
            v-if="controller.loadingDetail.value"
            key="loading"
            class="detail-pane detail-pane--loading"
            aria-label="Загрузка подробностей"
          >
            <Skeleton width="7rem" height=".8rem" /><Skeleton
              width="80%"
              height="1.4rem"
            /><Skeleton width="100%" height="7rem" /><Skeleton width="100%" height="10rem" />
          </div>
          <article
            v-else-if="controller.detail.value"
            :key="controller.detail.value.itemId"
            class="detail-pane"
          >
            <button class="mobile-back" type="button" @click="closeRoutedDetail">
              ← К очереди
            </button>
            <header class="detail-heading">
              <div>
                <span class="kicker"
                  >{{ providerLabel(controller.detail.value.provider) }} ·
                  {{
                    controller.detail.value.remoteKey ?? controller.detail.value.remoteItemId
                  }}</span
                >
                <h2>
                  {{ controller.detail.value.summary ?? 'Внешняя задача' }}
                </h2>
              </div>
              <Tag
                :value="freshnessLabel(controller.detail.value.freshness)"
                :severity="freshnessSeverity(controller.detail.value.freshness)"
              />
            </header>
            <div class="correlation-rail">
              <div>
                <span>Идентификатор во внешней системе</span
                ><strong>{{ controller.detail.value.remoteItemId }}</strong>
              </div>
              <div>
                <span>Статус во внешней системе</span
                ><strong>{{ controller.detail.value.status ?? 'Не указан' }}</strong>
              </div>
              <div>
                <span>Последняя сверка</span
                ><strong>{{ formatTime(controller.detail.value.lastRefreshedAt) }}</strong>
              </div>
              <div>
                <span>Следующее действие</span
                ><strong>{{
                  controller.detail.value.allowedActions.includes('REFRESH')
                    ? 'Сверить с внешней системой'
                    : controller.commands.value.some((command) => command.status === 'UNKNOWN')
                      ? 'Проверить результат'
                      : 'Наблюдать'
                }}</strong>
              </div>
            </div>
            <div class="detail-actions">
              <a
                v-if="safeRemoteUrl(controller.detail.value.remoteUrl)"
                :href="safeRemoteUrl(controller.detail.value.remoteUrl)!"
                target="_blank"
                rel="noopener noreferrer"
                class="remote-link"
                ><i class="pi pi-external-link" aria-hidden="true"></i>Открыть во внешней системе</a
              >
              <span v-if="controller.detail.value.link" class="case-link"
                ><i class="pi pi-link" aria-hidden="true"></i>Связано с обращением</span
              >
            </div>

            <section
              v-if="controller.commands.value.length"
              class="command-section"
              aria-labelledby="commands-title"
            >
              <div class="section-heading">
                <div>
                  <span class="kicker">Команды по обращению</span>
                  <h3 id="commands-title">Последние команды</h3>
                </div>
                <small>Статус команды и внешний статус показаны отдельно</small>
              </div>
              <article
                v-for="command in controller.commands.value"
                :key="command.commandId"
                class="command-card"
              >
                <div>
                  <Tag
                    :value="commandStatus(command.status)"
                    :severity="commandSeverity(command.status)"
                  /><strong>{{ commandIntent(command.intent) }}</strong
                  ><code>{{ command.commandId }}</code>
                </div>
                <dl>
                  <div>
                    <dt>Причина сбоя</dt>
                    <dd>{{ command.errorCategory ?? 'Нет ошибки' }}</dd>
                  </div>
                  <div>
                    <dt>Следующая попытка</dt>
                    <dd>{{ formatTime(command.nextAttemptAt) }}</dd>
                  </div>
                </dl>
                <div class="command-actions">
                  <Button
                    v-if="command.allowedActions.includes('RETRY') && canRetry"
                    label="Повторить безопасно"
                    size="small"
                    :loading="controller.mutating.value"
                    @click="controller.retryCommand(command.commandId)"
                  />
                  <Button
                    v-if="command.allowedActions.includes('REFRESH_EVIDENCE') && canResolveUnknown"
                    label="Проверить результат"
                    size="small"
                    severity="secondary"
                    outlined
                    :loading="controller.mutating.value"
                    @click="controller.refreshCommandEvidence(command.commandId)"
                  />
                  <span
                    v-if="command.allowedActions.includes('RESOLVE_UNKNOWN')"
                    class="manual-note"
                    >Ручное решение требует отдельного подтверждения во вкладке «Интеграции»
                    обращения.</span
                  >
                </div>
              </article>
              <Button
                v-if="controller.commandNextCursor.value"
                label="Ещё команды"
                severity="secondary"
                outlined
                :disabled="controller.loadingDetail.value"
                @click="controller.loadMoreCommands"
              />
            </section>

            <section class="timeline-section" aria-labelledby="timeline-title">
              <div class="section-heading">
                <div>
                  <span class="kicker">Данные внешней системы</span>
                  <h3 id="timeline-title">История событий</h3>
                </div>
                <small>{{ controller.timeline.value.length }} событий</small>
              </div>
              <ol class="timeline-list">
                <li v-for="message in controller.timeline.value" :key="message.messageId">
                  <span class="timeline-marker" aria-hidden="true"></span>
                  <div>
                    <span class="timeline-meta"
                      ><Tag
                        :value="message.audience === 'INTERNAL' ? 'Для команды' : 'Для клиента'"
                        :severity="message.audience === 'INTERNAL' ? 'warn' : 'info'"
                      /><time>{{ formatTime(message.remoteCreatedAt) }}</time></span
                    >
                    <p v-if="message.body">{{ message.body }}</p>
                    <p v-else class="unavailable">
                      Содержимое недоступно. Сохранены только безопасные технические сведения о
                      событии.
                    </p>
                  </div>
                </li>
              </ol>
              <Button
                v-if="controller.timelineNextCursor.value"
                label="Ещё события"
                severity="secondary"
                outlined
                :disabled="controller.loadingDetail.value"
                @click="controller.loadMoreTimeline"
              />
            </section>
          </article>
          <div v-else key="empty" class="detail-empty">
            <span class="detail-symbol" aria-hidden="true"
              ><i class="pi pi-directions-alt"></i></span
            ><strong>Выберите внешнюю задачу</strong>
            <p>Здесь появятся её статус, история событий и доступные действия.</p>
          </div>
        </Transition>
      </section>
    </template>
  </main>
</template>

<style scoped>
.external-work-page :deep(.p-message),
.external-work-page :deep(.p-tag) {
  color: var(--text);
}
.external-work-page {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  height: calc(100vh - 40px);
  min-height: 620px;
  color: var(--text);
}
.page-heading,
.section-heading,
.detail-heading {
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
}
.page-heading p,
.detail-empty p,
.empty-state p {
  margin: 0;
  color: var(--muted);
  line-height: 1.5;
}
.kicker {
  font-size: 0.72rem;
  font-weight: 750;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: var(--muted);
}
.mode-switch {
  display: flex;
  gap: 4px;
  padding: 4px;
  align-self: flex-start;
  width: max-content;
  border-radius: 12px;
  background: var(--canvas);
  border: 1px solid var(--line);
}
.mode-switch button {
  min-height: 40px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--muted);
  font-weight: 700;
  cursor: pointer;
}
.mode-switch button[aria-pressed='true'] {
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 0 0 1px color-mix(in srgb, var(--line) 70%, transparent);
}
.mode-switch button:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--brand) 28%, transparent);
  outline-offset: 1px;
}
.filters {
  display: flex;
  align-items: stretch;
  flex-wrap: wrap;
  gap: 8px;
}
.filters :deep(.p-select),
.filters :deep(.p-inputtext) {
  flex: 1 1 160px;
  width: auto;
  min-width: 160px;
  max-width: 240px;
}
.filters :deep(.p-button) {
  flex: 0 0 auto;
  min-height: 44px;
}
.recovery-workbench {
  flex: 1 1 0;
  display: grid;
  grid-template-columns: minmax(280px, 360px) minmax(0, 1fr);
  min-height: 0;
  border: 1px solid var(--line);
  border-radius: 14px;
  overflow: hidden;
  background: var(--surface);
}
.master-pane {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
  background: var(--canvas);
  border-right: 1px solid var(--line);
}
.pane-heading {
  min-height: 45px;
  padding: 10px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  font-size: 0.76rem;
  font-weight: 750;
  color: var(--muted);
  border-bottom: 1px solid var(--line);
}
.tabular {
  font-variant-numeric: tabular-nums;
}
.item-list {
  overflow: auto;
  overscroll-behavior: contain;
  padding: 6px;
}
.work-item {
  width: 100%;
  min-height: 102px;
  padding: 11px;
  display: grid;
  gap: 8px;
  text-align: left;
  border: 1px solid transparent;
  border-radius: 11px;
  background: transparent;
  color: inherit;
  cursor: pointer;
  transition:
    background-color 160ms ease,
    border-color 160ms ease,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.work-item:hover {
  background: var(--surface);
}
.work-item:active {
  transform: scale(0.985);
}
.work-item:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--brand) 28%, transparent);
  outline-offset: -1px;
}
.work-item--selected {
  background: var(--brand-soft);
  border-color: color-mix(in srgb, var(--brand) 32%, var(--line));
}
.work-item--skeleton {
  cursor: default;
  background: var(--surface);
  margin-bottom: 6px;
}
.item-meta,
.item-foot {
  display: flex;
  align-items: center;
  gap: 8px;
}
.item-meta small,
.item-foot small {
  color: var(--muted);
}
.item-meta :deep(.p-tag) {
  margin-left: auto;
}
.item-summary {
  font-size: 0.86rem;
  font-weight: 700;
  line-height: 1.35;
  overflow-wrap: anywhere;
}
.item-foot {
  justify-content: space-between;
  font-size: 0.72rem;
}
.empty-state,
.detail-empty {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 8px;
  text-align: center;
  padding: 28px;
}
.empty-state i,
.detail-symbol {
  font-size: 1.25rem;
  color: var(--brand);
}
.detail-pane {
  min-width: 0;
  overflow: auto;
  padding: 16px;
  display: grid;
  align-content: start;
  gap: 16px;
}
.detail-pane--loading {
  overflow: hidden;
}
.detail-heading h2 {
  margin: 3px 0 0;
  font-size: 1.1rem;
  letter-spacing: -0.015em;
  text-wrap: balance;
}
.correlation-rail {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  border: 1px solid var(--line);
  border-radius: 12px;
  overflow: hidden;
}
.correlation-rail > div {
  display: grid;
  gap: 4px;
  min-height: 64px;
  padding: 10px 12px;
}
.correlation-rail > div + div {
  border-left: 1px solid var(--line);
}
.correlation-rail span,
.command-card dt {
  font-size: 0.7rem;
  font-weight: 700;
  color: var(--muted);
}
.correlation-rail strong {
  font-size: 0.79rem;
  overflow-wrap: anywhere;
}
.detail-actions {
  display: flex;
  align-items: center;
  gap: 10px;
  flex-wrap: wrap;
}
.remote-link,
.case-link {
  min-height: 44px;
  padding: 8px 12px;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  border-radius: 10px;
  font-weight: 700;
  text-decoration: none;
}
.remote-link {
  background: var(--brand);
  color: var(--brand-contrast);
}
.case-link {
  background: var(--brand-soft);
  color: var(--text);
}
.section-heading h3 {
  margin: 2px 0 0;
  font-size: 0.94rem;
}
.section-heading > small {
  color: var(--muted);
}
.command-section,
.timeline-section {
  display: grid;
  gap: 10px;
}
.command-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) minmax(220px, 0.65fr);
  gap: 12px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--canvas);
}
.command-card > div:first-child {
  display: grid;
  grid-template-columns: auto auto minmax(0, 1fr);
  align-items: center;
  gap: 8px;
}
.command-card code {
  font-size: 0.72rem;
  color: var(--muted);
  overflow-wrap: anywhere;
}
.command-card dl {
  display: grid;
  gap: 6px;
  margin: 0;
}
.command-card dl div {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.command-card dd {
  margin: 0;
  font-size: 0.76rem;
  font-weight: 650;
}
.command-actions {
  grid-column: 1/-1;
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.command-actions :deep(.p-button) {
  min-height: 40px;
}
.manual-note {
  font-size: 0.72rem;
  color: var(--muted);
}
.timeline-list {
  display: grid;
  gap: 0;
  list-style: none;
  margin: 0;
  padding: 0;
}
.timeline-list li {
  display: grid;
  grid-template-columns: 16px minmax(0, 1fr);
  gap: 10px;
  min-height: 72px;
}
.timeline-marker {
  width: 8px;
  height: 8px;
  margin: 10px 0 0 4px;
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 0 4px var(--brand-soft);
  position: relative;
}
.timeline-marker:after {
  content: '';
  position: absolute;
  top: 12px;
  left: 3px;
  width: 1px;
  height: calc(100% + 48px);
  background: var(--line);
}
.timeline-list li:last-child .timeline-marker:after {
  display: none;
}
.timeline-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.timeline-meta time {
  font-size: 0.72rem;
  color: var(--muted);
}
.timeline-list p {
  margin: 7px 0 14px;
  line-height: 1.5;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.timeline-list .unavailable {
  color: var(--muted);
  font-style: italic;
}
.mobile-back {
  display: none;
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
.pagination-row {
  display: grid;
  grid-template-columns: 1fr auto 1fr;
  align-items: center;
  gap: 8px;
  padding: 8px;
}
.pagination-row span {
  text-align: center;
  font-size: 0.72rem;
  color: var(--muted);
}
@media (max-width: 1050px) {
  .correlation-rail {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .correlation-rail > div:nth-child(3) {
    border-left: 0;
    border-top: 1px solid var(--line);
  }
  .correlation-rail > div:nth-child(4) {
    border-top: 1px solid var(--line);
  }
}
@media (max-width: 720px) {
  .external-work-page {
    height: auto;
    min-height: calc(100vh - 24px);
    padding: 12px;
  }
  .page-heading {
    flex-direction: column;
  }
  .mode-switch {
    width: 100%;
  }
  .mode-switch button {
    flex: 1;
    justify-content: center;
    min-height: 44px;
  }
  .filters {
    display: grid;
    grid-template-columns: 1fr;
  }
  .filters :deep(.p-select),
  .filters :deep(.p-inputtext),
  .filters :deep(.p-button) {
    width: 100%;
    max-width: none;
  }
  .recovery-workbench {
    flex: initial;
    display: block;
    min-height: 520px;
  }
  .master-pane {
    min-height: 520px;
    border-right: 0;
  }
  .external-work-page--detail .master-pane {
    display: none;
  }
  .detail-pane {
    min-height: 520px;
    padding: 12px;
  }
  .detail-empty {
    display: none;
  }
  .mobile-back {
    display: block;
    min-height: 44px;
    border: 0;
    background: transparent;
    color: var(--brand);
    font-weight: 700;
    text-align: left;
  }
  .correlation-rail {
    grid-template-columns: 1fr;
  }
  .correlation-rail > div + div {
    border-left: 0;
    border-top: 1px solid var(--line);
  }
  .command-card {
    grid-template-columns: 1fr;
  }
  .command-card > div:first-child {
    grid-template-columns: auto auto;
  }
  .command-card code {
    grid-column: 1/-1;
  }
  .remote-link,
  .case-link {
    width: 100%;
    justify-content: center;
  }
  .detail-heading {
    flex-direction: column;
  }
}
@media (max-width: 720px) {
  .mobile-back {
    color: var(--text);
    text-decoration: underline;
  }
}
@media (prefers-reduced-motion: reduce) {
  .work-item,
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
