<script setup lang="ts">
import Skeleton from "primevue/skeleton";
import type {
  SupportInboxItem,
  SupportInboxMode,
} from "@/features/support-workspace/api/support-workspace-source";
import type { SupportInboxFailure } from "@/features/support-inbox/model/use-support-inbox";
import type {
  SupportSearchFreshness,
  SupportSearchResult,
} from "@/features/support-search/api/support-search-source";
import type { SupportSearchRouteState } from "@/features/support-search/model/support-search-route";
import type { SupportSearchFailure } from "@/features/support-search/model/use-support-search";
import SupportSearchToolbar from "@/features/support-search/ui/SupportSearchToolbar.vue";
import type { SavedSupportViewResponseDto, SupportViewPresetResponseDto } from "@/shared/api/generated/models";
import type { SupportViewSelection } from "@/features/support-views/api/support-views-source";
import SupportViewsRail from "@/features/support-views/ui/SupportViewsRail.vue";
import { relativeTime } from "@/shared/lib/format";

defineProps<{
  mode: SupportInboxMode;
  items: readonly SupportInboxItem[];
  selectedKey?: string;
  loading: boolean;
  error: string;
  failure: SupportInboxFailure;
  hasMore: boolean;
  canReadCases: boolean;
  canReadConversations: boolean;
  canSearch: boolean;
  searchState: SupportSearchRouteState;
  searchActive: boolean;
  searchItems: readonly SupportSearchResult[];
  searchLoading: boolean;
  searchError: string;
  searchFailure: SupportSearchFailure;
  searchFreshness: SupportSearchFreshness | null;
  searchHasMore: boolean;
  viewSystem: readonly SupportViewPresetResponseDto[];
  viewSaved: readonly SavedSupportViewResponseDto[];
  viewSelection: SupportViewSelection | null;
  viewCanCreate: boolean;
  viewCanManageAll: boolean;
  viewMutating: boolean;
  viewConflict: string;
  viewActive: boolean;
}>();

const emit = defineEmits<{
  select: [item: SupportInboxItem];
  changeMode: [mode: SupportInboxMode];
  loadMore: [];
  retry: [];
  changeSearch: [state: SupportSearchRouteState];
  submitSearch: [state: SupportSearchRouteState];
  closeSearch: [];
  selectSearch: [item: SupportSearchResult];
  loadMoreSearch: [];
  selectView: [selection: SupportViewSelection];
  createView: [value: { name: string; code: string; scope: "PERSONAL" | "TEAM" | "PROJECT"; teamId: string }];
  replaceView: [value: { view: SavedSupportViewResponseDto; displayName: string }];
  publishView: [view: SavedSupportViewResponseDto];
  archiveView: [view: SavedSupportViewResponseDto];
  defaultView: [selection: SupportViewSelection];
  customSearch: [];
}>();

function searchKind(value: SupportSearchResult["kind"]): string {
  return {
    CASE: "Обращение",
    CONVERSATION: "Диалог",
    MESSAGE: "Сообщение",
    END_USER: "Пользователь",
  }[value];
}

function matchReason(value?: SupportSearchResult["matchProvenance"]): string {
  return value === "TRANSLATION"
    ? "Совпадение в переводе"
    : value === "ORIGINAL"
      ? "Совпадение в оригинале"
      : "Точное совпадение";
}

function itemKey(item: SupportInboxItem): string {
  return `${item.kind}:${item.id}`;
}

function caseStatus(value: string): string {
  return (
    {
      OPEN: "Открыто",
      IN_PROGRESS: "В работе",
      WAITING_END_USER: "Ждём пользователя",
      WAITING_SYSTEM: "Ждём систему",
      WAITING_ADMIN: "Нужен оператор",
      RESOLVED: "Решено",
      UNRESOLVED: "Не решено",
      CANCELLED: "Отменено",
    }[value] ?? value
  );
}

function casePriority(value: string): string {
  return (
    {
      LOW: "Низкий",
      NORMAL: "Обычный",
      HIGH: "Высокий",
      URGENT: "Срочный",
      CRITICAL: "Критический",
    }[value] ?? value
  );
}

function initials(value: string): string {
  return value
    .split(/\s+/u)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}

function inboxTime(value: string): string {
  const relative = relativeTime(value);
  if (relative.length <= 13) return relative;
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return relative;
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
  }).format(parsed);
}

function unreadLabel(item: Extract<SupportInboxItem, { kind: "CONVERSATION" }>): string {
  const total = item.readState.unreadMessageCount;
  const customer = item.readState.unreadCustomerMessageCount;
  return `${total} непрочитанных сообщения, ${customer} от пользователя`;
}
</script>

<template>
  <aside class="support-inbox-pane" aria-label="Диалоги проекта">
    <header class="support-inbox-heading">
      <div>
        <h2>Входящие</h2>
        <p v-if="items.length">Загружено: {{ items.length }}</p>
      </div>
      <span class="keyboard-hint" aria-hidden="true">J / K</span>
    </header>

    <div class="inbox-modes" role="group" aria-label="Режим входящих">
      <button
        v-if="canReadCases"
        type="button"
        :aria-pressed="mode === 'CASES'"
        :class="{ active: mode === 'CASES' }"
        @click="emit('changeMode', 'CASES')"
      >
        <i class="pi pi-briefcase" aria-hidden="true" />
        Обращения
      </button>
      <button
        v-if="canReadConversations"
        type="button"
        :aria-pressed="mode === 'ALL_CONVERSATIONS'"
        :class="{ active: mode === 'ALL_CONVERSATIONS' }"
        @click="emit('changeMode', 'ALL_CONVERSATIONS')"
      >
        <i class="pi pi-comments" aria-hidden="true" />
        Все чаты
      </button>
    </div>

    <SupportViewsRail
      v-if="canSearch"
      :system="viewSystem"
      :saved="viewSaved"
      :selection="viewSelection"
      :search-scope="searchState.scope"
      :can-create="viewCanCreate"
      :can-manage-all="viewCanManageAll"
      :mutating="viewMutating"
      :conflict="viewConflict"
      @select="emit('selectView', $event)"
      @create="emit('createView', $event)"
      @replace="emit('replaceView', $event)"
      @publish="emit('publishView', $event)"
      @archive="emit('archiveView', $event)"
      @set-default="emit('defaultView', $event)"
      @custom-search="emit('customSearch')"
    />

    <SupportSearchToolbar
      v-if="canSearch"
      :model-value="searchState"
      :active="searchActive"
      :loading="searchLoading"
      :locked="viewActive"
      @update:model-value="emit('changeSearch', $event)"
      @submit="emit('submitSearch', $event)"
      @close="emit('closeSearch')"
    />

    <div v-if="searchActive || viewActive" class="search-results" aria-live="polite">
      <div
        v-if="searchFreshness && searchFreshness.state !== 'READY'"
        :class="['freshness-notice', searchFreshness.state.toLowerCase()]"
        role="status"
      >
        <i class="pi pi-clock" aria-hidden="true" />
        <span>
          {{
            searchFreshness.state === "BUILDING"
              ? "Индекс обновляется"
              : `Индекс отстаёт на ${searchFreshness.lagSeconds} сек.`
          }}
        </span>
      </div>

      <div v-if="searchLoading && !searchItems.length" class="inbox-skeletons" aria-busy="true">
        <div v-for="index in 5" :key="index" class="inbox-skeleton-row"><Skeleton shape="circle" size="32px" /><div><Skeleton width="72%" height="14px" /><Skeleton width="52%" height="12px" /></div></div>
      </div>
      <div v-else-if="searchFailure === 'FORBIDDEN'" class="inbox-state" role="alert">
        <i class="pi pi-lock" aria-hidden="true" /><strong>Поиск больше недоступен</strong><p>Права обновлены; скрытые результаты удалены.</p>
      </div>
      <div v-else-if="searchFailure === 'VALIDATION'" class="inbox-state" role="alert">
        <i class="pi pi-info-circle" aria-hidden="true" /><strong>Не удалось применить запрос</strong><p>{{ searchError }}</p>
      </div>
      <div v-else-if="searchError && !searchItems.length" class="inbox-state" role="alert">
        <i class="pi pi-exclamation-circle" aria-hidden="true" /><strong>Поиск временно недоступен</strong><p>{{ searchError }}</p>
      </div>
      <div v-else-if="!searchItems.length && searchFreshness" class="inbox-state">
        <i class="pi pi-search" aria-hidden="true" /><strong>Ничего не найдено</strong><p>Измените запрос или снимите часть фильтров.</p>
      </div>
      <div v-else-if="!searchItems.length" class="inbox-state">
        <i class="pi pi-search" aria-hidden="true" /><strong>Введите запрос</strong><p>Минимум два символа или выберите фильтр обращений.</p>
      </div>
      <div v-else class="search-result-list">
        <button
          v-for="item in searchItems"
          :key="`${item.kind}:${item.id}`"
          type="button"
          class="search-result-row"
          @click="emit('selectSearch', item)"
        >
          <span class="search-result-icon"><i :class="item.kind === 'CASE' ? 'pi pi-briefcase' : item.kind === 'CONVERSATION' ? 'pi pi-comments' : item.kind === 'MESSAGE' ? 'pi pi-comment' : 'pi pi-user'" aria-hidden="true" /></span>
          <span class="search-result-copy">
            <span class="search-result-meta"><strong>{{ searchKind(item.kind) }}</strong><span>{{ matchReason(item.matchProvenance) }}<template v-if="item.locale"> · {{ item.locale.toUpperCase() }}</template></span><time :datetime="item.activityAt">{{ inboxTime(item.activityAt) }}</time></span>
            <span class="search-result-snippet">{{ item.snippet }}</span>
          </span>
        </button>
        <div v-if="searchError" class="pagination-error" role="alert"><span>{{ searchError }}</span><button type="button" @click="emit('submitSearch', searchState)">Повторить</button></div>
        <button v-if="searchHasMore" type="button" class="load-more" :disabled="searchLoading" @click="emit('loadMoreSearch')"><i class="pi pi-chevron-down" aria-hidden="true" /> {{ searchLoading ? "Загружаем…" : "Показать ещё" }}</button>
      </div>
    </div>

    <div
      v-else-if="loading && !items.length"
      class="inbox-skeletons"
      aria-busy="true"
    >
      <div v-for="index in 6" :key="index" class="inbox-skeleton-row">
        <Skeleton shape="circle" size="32px" />
        <div>
          <Skeleton width="72%" height="14px" /><Skeleton
            width="52%"
            height="12px"
          />
        </div>
      </div>
    </div>

    <div
      v-else-if="!items.length && failure === 'FORBIDDEN'"
      class="inbox-state"
      role="alert"
    >
      <i class="pi pi-lock" aria-hidden="true" />
      <strong>Входящие больше недоступны</strong>
      <p>Права доступа обновлены. Скрытые данные удалены из рабочего места.</p>
    </div>

    <div v-else-if="!items.length && error" class="inbox-state" role="alert">
      <i class="pi pi-exclamation-circle" aria-hidden="true" />
      <strong>Не удалось загрузить входящие</strong>
      <p>{{ error }}</p>
      <button type="button" @click="emit('retry')">Повторить</button>
    </div>

    <div v-else-if="!items.length" class="inbox-state">
      <i
        :class="mode === 'CASES' ? 'pi pi-briefcase' : 'pi pi-comments'"
        aria-hidden="true"
      />
      <strong>{{
        mode === "CASES" ? "Обращений пока нет" : "Чатов пока нет"
      }}</strong>
      <p>Новые элементы появятся здесь автоматически.</p>
    </div>

    <div v-else class="inbox-list conversation-list">
      <button
        v-for="item in items"
        :key="itemKey(item)"
        type="button"
        class="inbox-row"
        :data-selection-key="itemKey(item)"
        :class="{
          selected: selectedKey === itemKey(item),
          'conversation-row': item.kind === 'CONVERSATION',
          'case-row': item.kind === 'CASE',
        }"
        :aria-current="selectedKey === itemKey(item) ? 'true' : undefined"
        @click="emit('select', item)"
      >
        <span
          class="inbox-row__avatar"
          :class="{ attention: item.kind === 'CASE' && item.attentionRequired }"
        >
          {{
            item.kind === "CASE"
              ? item.projectSequence.slice(-2)
              : initials(item.title)
          }}
        </span>
        <span class="inbox-row__body">
          <span class="inbox-row__headline">
            <strong :title="item.title">{{ item.title }}</strong>
            <time
              :datetime="
                item.kind === 'CASE'
                  ? item.lastActivityAt
                  : (item.lastMessageAt ?? item.updatedAt)
              "
            >
              {{
                inboxTime(
                  item.kind === "CASE"
                    ? item.lastActivityAt
                    : (item.lastMessageAt ?? item.updatedAt),
                )
              }}
            </time>
            <span
              v-if="item.kind === 'CONVERSATION' && item.readState.unreadMessageCount"
              class="unread-count"
              :data-unread-conversation="item.id"
              :aria-label="unreadLabel(item)"
              :title="unreadLabel(item)"
            >{{ item.readState.unreadMessageCount }}</span>
          </span>
          <span v-if="item.kind === 'CASE'" class="inbox-row__meta">
            <span class="state-chip">{{ caseStatus(item.status) }}</span>
            <span
              :class="[
                'priority-chip',
                `priority-${item.priority.toLowerCase()}`,
              ]"
              >{{ casePriority(item.priority) }}</span
            >
            <span class="truncate">{{ item.groupCode }}</span>
            <span v-if="item.attentionRequired" class="attention-copy"
              ><i class="pi pi-bell" /> Нужна реакция</span
            >
          </span>
          <span v-else class="inbox-row__meta">
            <span class="state-chip">{{
              item.status === "OPEN" ? "Открыт" : "Закрыт"
            }}</span>
            <span>{{ item.messageCount }} сообщ.</span>
          </span>
        </span>
      </button>

      <div v-if="error" class="pagination-error" role="alert">
        <span>{{ error }}</span>
        <button type="button" @click="emit('retry')">Повторить</button>
      </div>
      <button
        v-if="hasMore"
        type="button"
        class="load-more"
        :disabled="loading"
        @click="emit('loadMore')"
      >
        <i class="pi pi-chevron-down" aria-hidden="true" />
        {{ loading ? "Загружаем…" : "Показать ещё" }}
      </button>
    </div>
  </aside>
</template>

<style scoped>
.support-inbox-pane {
  position: relative;
  min-height: 0;
  padding: 12px 0;
  display: flex;
  flex-direction: column;
  overflow: visible;
  z-index: 3;
  background: var(--surface-card);
  border-right: 1px solid var(--line);
}
.support-inbox-heading {
  min-height: 48px;
  padding: 0 16px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.support-inbox-heading h2 {
  margin: 0;
  font-size: 1.05rem;
  font-weight: 650;
}
.support-inbox-heading p {
  margin: 3px 0 0;
  color: var(--text-muted);
  font-size: 0.75rem;
}
.keyboard-hint {
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 700;
}
.inbox-modes {
  margin: 0 12px 10px;
  padding: 3px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 3px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-muted);
}
.inbox-modes button {
  min-width: 0;
  min-height: 40px;
  padding: 0 8px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
  cursor: pointer;
}
.inbox-modes button.active {
  background: var(--surface-card);
  color: var(--text-primary);
  box-shadow: var(--shadow-subtle);
}
.inbox-modes i {
  margin-right: 5px;
}
.inbox-list {
  min-height: 0;
  flex: 1;
  display: grid;
  align-content: start;
  overflow: auto;
  overscroll-behavior: contain;
}
.search-results {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.freshness-notice {
  margin: 0 12px 8px;
  padding: 7px 9px;
  display: flex;
  align-items: center;
  gap: 7px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: .72rem;
}
.freshness-notice.degraded { border-color: color-mix(in srgb, var(--status-warning-text) 30%, var(--line)); background: var(--status-warning-soft); color: var(--status-warning-text); }
.search-result-list { min-height: 0; flex: 1; overflow: auto; overscroll-behavior: contain; }
.search-result-row { width: 100%; min-height: 72px; padding: 11px 14px; display: flex; align-items: flex-start; gap: 10px; border: 0; border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent); background: transparent; color: inherit; text-align: left; cursor: pointer; }
.search-result-row:hover { background: var(--surface-muted); }
.search-result-row:focus-visible { outline: 3px solid var(--focus-ring); outline-offset: -3px; }
.search-result-icon { width: 30px; height: 30px; flex: 0 0 auto; display: grid; place-items: center; border-radius: 8px; background: var(--brand-soft); color: var(--brand); }
.search-result-copy { min-width: 0; flex: 1; display: grid; gap: 6px; }
.search-result-meta { min-width: 0; display: flex; align-items: center; gap: 6px; color: var(--text-muted); font-size: .68rem; }
.search-result-meta strong { color: var(--text-primary); font-size: .72rem; }
.search-result-meta span { min-width: 0; flex: 1; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.search-result-meta time { flex: 0 0 auto; }
.search-result-snippet { display: -webkit-box; overflow: hidden; -webkit-box-orient: vertical; -webkit-line-clamp: 2; color: var(--text-secondary); font-size: .78rem; line-height: 1.4; }
.inbox-row {
  position: relative;
  width: 100%;
  min-height: 72px;
  padding: 12px 14px;
  display: flex;
  align-items: flex-start;
  gap: 10px;
  border: 0;
  border-bottom: 1px solid color-mix(in srgb, var(--line) 70%, transparent);
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.inbox-row::before {
  content: "";
  position: absolute;
  inset: 6px auto 6px 0;
  width: 2px;
  border-radius: 2px;
  background: transparent;
}
.inbox-row:hover {
  background: var(--surface-muted);
}
.inbox-row.selected {
  background: var(--brand-soft);
}
.inbox-row.selected::before {
  background: var(--brand);
}
.inbox-row:focus-visible,
.inbox-modes button:focus-visible,
.load-more:focus-visible,
.inbox-state button:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: -3px;
}
.inbox-row__avatar {
  width: 32px;
  height: 32px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 9px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-weight: 800;
}
.inbox-row__avatar.attention {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.inbox-row__body {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 5px;
}
.inbox-row__headline,
.inbox-row__meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
}
.inbox-row__headline strong {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 0.875rem;
  font-weight: 650;
}
.inbox-row__headline time {
  flex: 0 0 auto;
  color: var(--text-muted);
  font-size: 0.72rem;
  white-space: nowrap;
}
.unread-count {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  color: var(--surface-card);
  background: var(--brand);
  font-size: 0.68rem;
  font-weight: 800;
  font-variant-numeric: tabular-nums;
  line-height: 1;
}
.inbox-row__meta {
  color: var(--text-muted);
  font-size: 0.74rem;
  flex-wrap: wrap;
  row-gap: 4px;
  overflow: hidden;
}
.state-chip,
.priority-chip {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--surface-muted);
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-weight: 650;
}
.priority-chip {
  background: var(--surface-muted);
  color: var(--text-secondary);
}
.priority-chip.priority-high,
.priority-chip.priority-urgent {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.priority-chip.priority-critical {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.attention-copy {
  color: var(--status-warning-text);
}
.truncate {
  overflow: hidden;
  text-overflow: ellipsis;
}
.inbox-skeletons {
  min-height: 0;
  flex: 1;
  display: grid;
  align-content: start;
  overflow: hidden;
}
.inbox-skeleton-row {
  min-height: 72px;
  padding: 12px 14px;
  display: flex;
  gap: 10px;
  border-bottom: 1px solid var(--line);
}
.inbox-skeleton-row > div {
  flex: 1;
  display: grid;
  gap: 8px;
}
.inbox-state {
  min-height: 0;
  flex: 1;
  min-height: 220px;
  padding: 32px 20px;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 8px;
  color: var(--text-secondary);
  text-align: center;
}
.inbox-state i {
  font-size: 1.4rem;
  color: var(--brand);
}
.inbox-state strong {
  color: var(--text-primary);
}
.inbox-state p {
  margin: 0;
  font-size: 0.82rem;
}
.inbox-state button,
.pagination-error button,
.load-more {
  min-height: 40px;
  border: 0;
  background: transparent;
  color: var(--brand);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
}
.pagination-error {
  margin: 8px 12px;
  padding: 8px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  border-radius: 8px;
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
  font-size: 0.75rem;
}
.load-more {
  margin: 6px 12px;
  justify-self: stretch;
  border-radius: 8px;
}
.load-more:hover {
  background: var(--surface-muted);
}
@media (max-width: 767px) {
  .support-inbox-pane {
    border-right: 0;
  }
  .inbox-modes button {
    min-height: 44px;
    font-size: 0.82rem;
  }
}
</style>
