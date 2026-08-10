<script setup lang="ts">
import { computed, nextTick, ref, watch } from "vue";
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
import SupportInboxSkeletonRows from "@/features/support-inbox/ui/SupportInboxSkeletonRows.vue";
import SupportSearchToolbar from "@/features/support-search/ui/SupportSearchToolbar.vue";
import type {
  SavedSupportViewResponseDto,
  SupportViewPresetResponseDto,
} from "@/shared/api/generated/models";
import type { SupportViewSelection } from "@/features/support-views/api/support-views-source";
import SupportViewsRail from "@/features/support-views/ui/SupportViewsRail.vue";
import { formatDate, relativeTime } from "@/shared/lib/format";
import { slaSignalCompactLabel } from "@/features/support-case-operations/model/support-case-operations";

const props = defineProps<{
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
  createView: [
    value: {
      name: string;
      code: string;
      scope: "PERSONAL" | "TEAM" | "PROJECT";
      teamId: string;
    },
  ];
  replaceView: [
    value: { view: SavedSupportViewResponseDto; displayName: string },
  ];
  publishView: [view: SavedSupportViewResponseDto];
  archiveView: [view: SavedSupportViewResponseDto];
  defaultView: [selection: SupportViewSelection];
  customSearch: [];
}>();

const searchToolsExpanded = ref(false);
const searchToolsPanel = ref<HTMLElement | null>(null);
const searchToolsPanelId = "support-inbox-search-tools";
const inboxSkeletonRowCount = 14;
const lastLoadedCount = ref(props.items.length);
const loadedCount = computed(() =>
  props.loading && !props.items.length
    ? lastLoadedCount.value
    : props.items.length,
);
const visibleModeCount = computed(
  () => Number(props.canReadCases) + Number(props.canReadConversations),
);
const activeModeIsSecond = computed(
  () => props.canReadCases && props.mode === "ALL_CONVERSATIONS",
);

watch(
  () => [props.items.length, props.loading] as const,
  ([count, loading]) => {
    if (!loading) lastLoadedCount.value = count;
  },
);
const systemViewNames: Record<string, string> = {
  MY_ACTIVE: "Мои обращения",
  MY_TEAM_UNASSIGNED: "Неназначенные команды",
  ALL_CASES: "Все обращения",
  ALL_CONVERSATIONS: "Все диалоги",
};
const searchScopeNames = {
  CASES: "Обращения",
  CONVERSATIONS: "Диалоги",
  MESSAGES: "Сообщения",
  END_USERS: "Пользователи",
} as const;

const activeFilterCount = computed(() =>
  Object.values(props.searchState.filters).reduce((total, value) => {
    if (Array.isArray(value)) return total + value.length;
    return value == null || value === "" ? total : total + 1;
  }, 0),
);

const searchToolsTitle = computed(() => {
  if (props.viewSelection?.kind === "SYSTEM")
    return systemViewNames[props.viewSelection.code] ?? "Представление";
  if (props.viewSelection?.kind === "SAVED") {
    const selectedId = props.viewSelection.id;
    return (
      props.viewSaved.find((item) => item.id === selectedId)?.draft
        .displayName ?? "Сохранённое представление"
    );
  }
  if (props.searchState.phrase.trim())
    return `Поиск: ${props.searchState.phrase.trim()}`;
  if (props.searchActive) return "Настроенный поиск";
  return "Поиск и представления";
});

function filterCountLabel(count: number): string {
  const lastTwo = count % 100;
  if (lastTwo >= 11 && lastTwo <= 14) return `${count} фильтров`;
  const last = count % 10;
  if (last === 1) return `${count} фильтр`;
  if (last >= 2 && last <= 4) return `${count} фильтра`;
  return `${count} фильтров`;
}

const searchToolsDescription = computed(() => {
  if (props.viewSelection?.kind === "SYSTEM") return "Системное представление";
  if (props.viewSelection?.kind === "SAVED") return "Сохранённое представление";
  if (props.searchActive) {
    const count = activeFilterCount.value;
    const filters = count ? ` · ${filterCountLabel(count)}` : "";
    return `${searchScopeNames[props.searchState.scope]}${filters}`;
  }
  return "Найти чат или настроить очередь";
});

function toggleSearchTools(): void {
  searchToolsExpanded.value = !searchToolsExpanded.value;
}

function handleSelectView(selection: SupportViewSelection): void {
  searchToolsExpanded.value = false;
  emit("selectView", selection);
}

function handleSubmitSearch(state: SupportSearchRouteState): void {
  searchToolsExpanded.value = false;
  emit("submitSearch", state);
}

function handleCloseSearch(): void {
  searchToolsExpanded.value = false;
  emit("closeSearch");
}

function handleCustomSearch(): void {
  searchToolsExpanded.value = true;
  emit("customSearch");
}

function openSearchTools(options: { focusSearch?: boolean } = {}): void {
  searchToolsExpanded.value = true;
  if (!options.focusSearch) return;
  void nextTick(() => {
    searchToolsPanel.value
      ?.querySelector<HTMLInputElement>("[data-support-search-input]")
      ?.focus({ preventScroll: true });
  });
}

watch(
  () => props.viewConflict,
  (conflict) => {
    if (conflict) searchToolsExpanded.value = true;
  },
);

defineExpose({ openSearchTools });

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
    }[value] ?? "Состояние не распознано"
  );
}

const casePriorityPresentation: Record<
  string,
  { label: string; emphasized: boolean }
> = {
  LOW: { label: "Низкий", emphasized: false },
  NORMAL: { label: "Обычный", emphasized: false },
  HIGH: { label: "Высокий", emphasized: true },
  URGENT: { label: "Срочный", emphasized: true },
  CRITICAL: { label: "Критический", emphasized: true },
};

function casePriority(value: string): string {
  return casePriorityPresentation[value]?.label ?? "Приоритет не распознан";
}

function isPriorityEmphasized(value: string): boolean {
  return casePriorityPresentation[value]?.emphasized ?? false;
}

const shadowSlaExplanation =
  "Теневой прогноз помогает оценить риск. Прогноз не является договорным сроком и не управляет действиями оператора.";

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

function caseAccessibleLabel(
  item: Extract<SupportInboxItem, { kind: "CASE" }>,
): string {
  return [
    `Обращение ${item.projectSequence}`,
    item.title,
    caseStatus(item.status),
    casePriority(item.priority),
    item.groupCode,
    item.attentionRequired ? "требуется реакция" : "",
    item.slaSignal?.state === "AVAILABLE"
      ? slaSignalCompactLabel(item.slaSignal)
      : "",
  ]
    .filter(Boolean)
    .join(". ");
}

function caseTooltip(
  item: Extract<SupportInboxItem, { kind: "CASE" }>,
): string {
  return [
    item.title,
    item.groupCode,
    formatDate(item.lastActivityAt),
    item.slaSignal?.state === "AVAILABLE" ? shadowSlaExplanation : "",
  ]
    .filter(Boolean)
    .join(" · ");
}

function slaDescriptionId(caseId: string): string {
  return `case-sla-description-${caseId}`;
}

function unreadLabel(
  item: Extract<SupportInboxItem, { kind: "CONVERSATION" }>,
): string {
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
        <p>Загружено: {{ loadedCount }}</p>
      </div>
      <span class="keyboard-hint" aria-hidden="true">J / K</span>
    </header>

    <div
      class="inbox-modes"
      :class="{
        'inbox-modes--single': visibleModeCount === 1,
        'inbox-modes--second': activeModeIsSecond,
      }"
      role="group"
      aria-label="Режим входящих"
    >
      <span class="inbox-modes__selection" aria-hidden="true" />
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

    <section
      v-if="canSearch"
      class="inbox-tools"
      aria-label="Поиск и представления"
    >
      <button
        type="button"
        class="inbox-tools__trigger"
        :class="{ active: searchActive || viewActive }"
        :aria-expanded="searchToolsExpanded"
        :aria-controls="searchToolsPanelId"
        @click="toggleSearchTools"
      >
        <span class="inbox-tools__icon" aria-hidden="true">
          <i :class="viewActive ? 'pi pi-bookmark' : 'pi pi-search'" />
        </span>
        <span class="inbox-tools__copy">
          <strong>{{ searchToolsTitle }}</strong>
          <small>{{ searchToolsDescription }}</small>
        </span>
        <span
          v-if="!searchActive && !viewActive"
          class="inbox-tools__shortcut"
          aria-hidden="true"
          >⌘ K</span
        >
        <i class="pi pi-chevron-down inbox-tools__chevron" aria-hidden="true" />
      </button>

      <Transition name="inbox-tools-panel">
        <div
          v-if="searchToolsExpanded"
          :id="searchToolsPanelId"
          ref="searchToolsPanel"
          class="inbox-tools__panel"
        >
          <SupportViewsRail
            :system="viewSystem"
            :saved="viewSaved"
            :selection="viewSelection"
            :search-scope="searchState.scope"
            :can-create="viewCanCreate"
            :can-manage-all="viewCanManageAll"
            :mutating="viewMutating"
            :conflict="viewConflict"
            @select="handleSelectView"
            @create="emit('createView', $event)"
            @replace="emit('replaceView', $event)"
            @publish="emit('publishView', $event)"
            @archive="emit('archiveView', $event)"
            @set-default="emit('defaultView', $event)"
            @custom-search="handleCustomSearch"
          />

          <SupportSearchToolbar
            :model-value="searchState"
            :active="searchActive"
            :loading="searchLoading"
            :locked="viewActive"
            @update:model-value="emit('changeSearch', $event)"
            @submit="handleSubmitSearch"
            @close="handleCloseSearch"
          />
        </div>
      </Transition>
    </section>

    <div class="inbox-content-stage">
      <Transition name="inbox-content" mode="out-in">
        <div
          v-if="searchActive || viewActive"
          key="search-results"
          class="search-results"
          aria-live="polite"
        >
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

          <SupportInboxSkeletonRows
            v-if="searchLoading && !searchItems.length"
            :mode="mode"
            :count="inboxSkeletonRowCount"
          />
          <div
            v-else-if="searchFailure === 'FORBIDDEN'"
            class="inbox-state"
            role="alert"
          >
            <i class="pi pi-lock" aria-hidden="true" /><strong
              >Поиск больше недоступен</strong
            >
            <p>Права обновлены; скрытые результаты удалены.</p>
          </div>
          <div
            v-else-if="searchFailure === 'VALIDATION'"
            class="inbox-state"
            role="alert"
          >
            <i class="pi pi-info-circle" aria-hidden="true" /><strong
              >Не удалось применить запрос</strong
            >
            <p>{{ searchError }}</p>
          </div>
          <div
            v-else-if="searchError && !searchItems.length"
            class="inbox-state"
            role="alert"
          >
            <i class="pi pi-exclamation-circle" aria-hidden="true" /><strong
              >Поиск временно недоступен</strong
            >
            <p>{{ searchError }}</p>
          </div>
          <div
            v-else-if="!searchItems.length && searchFreshness"
            class="inbox-state"
          >
            <i class="pi pi-search" aria-hidden="true" /><strong
              >Ничего не найдено</strong
            >
            <p>Измените запрос или снимите часть фильтров.</p>
          </div>
          <div v-else-if="!searchItems.length" class="inbox-state">
            <i class="pi pi-search" aria-hidden="true" /><strong
              >Введите запрос</strong
            >
            <p>Минимум два символа или выберите фильтр обращений.</p>
          </div>
          <div v-else class="search-result-list">
            <button
              v-for="item in searchItems"
              :key="`${item.kind}:${item.id}`"
              type="button"
              class="search-result-row"
              @click="emit('selectSearch', item)"
            >
              <span class="search-result-icon"
                ><i
                  :class="
                    item.kind === 'CASE'
                      ? 'pi pi-briefcase'
                      : item.kind === 'CONVERSATION'
                        ? 'pi pi-comments'
                        : item.kind === 'MESSAGE'
                          ? 'pi pi-comment'
                          : 'pi pi-user'
                  "
                  aria-hidden="true"
              /></span>
              <span class="search-result-copy">
                <span class="search-result-meta"
                  ><strong>{{ searchKind(item.kind) }}</strong
                  ><span
                    >{{ matchReason(item.matchProvenance)
                    }}<template v-if="item.locale">
                      · {{ item.locale.toUpperCase() }}</template
                    ></span
                  ><time :datetime="item.activityAt">{{
                    inboxTime(item.activityAt)
                  }}</time></span
                >
                <span class="search-result-snippet">{{ item.snippet }}</span>
              </span>
            </button>
            <div v-if="searchError" class="pagination-error" role="alert">
              <span>{{ searchError }}</span
              ><button type="button" @click="emit('submitSearch', searchState)">
                Повторить
              </button>
            </div>
            <button
              v-if="searchHasMore"
              type="button"
              class="load-more"
              :disabled="searchLoading"
              @click="emit('loadMoreSearch')"
            >
              <i class="pi pi-chevron-down" aria-hidden="true" />
              {{ searchLoading ? "Загружаем…" : "Показать ещё" }}
            </button>
          </div>
        </div>

        <SupportInboxSkeletonRows
          v-else-if="loading && !items.length"
          :key="`loading-${mode}`"
          :mode="mode"
          :count="inboxSkeletonRowCount"
        />

        <div
          v-else-if="!items.length && failure === 'FORBIDDEN'"
          key="forbidden"
          class="inbox-state"
          role="alert"
        >
          <i class="pi pi-lock" aria-hidden="true" />
          <strong>Входящие больше недоступны</strong>
          <p>
            Права доступа обновлены. Скрытые данные удалены из рабочего места.
          </p>
        </div>

        <div
          v-else-if="!items.length && error"
          key="error"
          class="inbox-state"
          role="alert"
        >
          <i class="pi pi-exclamation-circle" aria-hidden="true" />
          <strong>Не удалось загрузить входящие</strong>
          <p>{{ error }}</p>
          <button type="button" @click="emit('retry')">Повторить</button>
        </div>

        <div
          v-else-if="!items.length"
          :key="`empty-${mode}`"
          class="inbox-state"
        >
          <i
            :class="mode === 'CASES' ? 'pi pi-briefcase' : 'pi pi-comments'"
            aria-hidden="true"
          />
          <strong>{{
            mode === "CASES" ? "Обращений пока нет" : "Чатов пока нет"
          }}</strong>
          <p>Новые элементы появятся здесь автоматически.</p>
        </div>

        <div v-else :key="`list-${mode}`" class="inbox-list conversation-list">
          <button
            v-for="item in items"
            :key="itemKey(item)"
            type="button"
            class="inbox-row"
            :data-selection-key="itemKey(item)"
            :data-inbox-item-id="item.id"
            :class="{
              selected: selectedKey === itemKey(item),
              'conversation-row': item.kind === 'CONVERSATION',
              'case-row': item.kind === 'CASE',
              'case-row--with-sla':
                item.kind === 'CASE' && item.slaSignal?.state === 'AVAILABLE',
            }"
            :aria-current="selectedKey === itemKey(item) ? 'true' : undefined"
            :aria-label="
              item.kind === 'CASE' ? caseAccessibleLabel(item) : undefined
            "
            :aria-describedby="
              item.kind === 'CASE' && item.slaSignal?.state === 'AVAILABLE'
                ? slaDescriptionId(item.id)
                : undefined
            "
            :title="item.kind === 'CASE' ? caseTooltip(item) : undefined"
            @click="emit('select', item)"
          >
            <span
              class="inbox-row__avatar"
              :class="{
                attention: item.kind === 'CASE' && item.attentionRequired,
                'case-row__sequence': item.kind === 'CASE',
              }"
            >
              <template v-if="item.kind === 'CASE'">
                <span>{{ item.projectSequence }}</span>
                <i
                  v-if="item.attentionRequired"
                  class="pi pi-bell case-row__attention-icon"
                  aria-hidden="true"
                />
              </template>
              <template v-else>{{ initials(item.title) }}</template>
            </span>
            <span class="inbox-row__body">
              <span
                class="inbox-row__headline"
                :class="{ 'case-row__headline': item.kind === 'CASE' }"
              >
                <strong :title="item.title">{{ item.title }}</strong>
                <time
                  :datetime="
                    item.kind === 'CASE'
                      ? item.lastActivityAt
                      : (item.lastMessageAt ?? item.updatedAt)
                  "
                  :title="
                    item.kind === 'CASE'
                      ? formatDate(item.lastActivityAt)
                      : formatDate(item.lastMessageAt ?? item.updatedAt)
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
                  v-if="
                    item.kind === 'CONVERSATION' &&
                    item.readState.unreadMessageCount
                  "
                  class="unread-count"
                  :data-unread-conversation="item.id"
                  :aria-label="unreadLabel(item)"
                  :title="unreadLabel(item)"
                  >{{ item.readState.unreadMessageCount }}</span
                >
              </span>
              <template v-if="item.kind === 'CASE'">
                <span class="inbox-row__meta case-row__metadata">
                  <span class="case-row__status">{{
                    caseStatus(item.status)
                  }}</span>
                  <span class="case-row__separator" aria-hidden="true">·</span>
                  <span
                    :class="[
                      'case-row__priority',
                      {
                        'case-row__priority--emphasis': isPriorityEmphasized(
                          item.priority,
                        ),
                        [`priority-${item.priority.toLowerCase()}`]:
                          isPriorityEmphasized(item.priority),
                      },
                    ]"
                    >{{ casePriority(item.priority) }}</span
                  >
                  <span class="case-row__separator" aria-hidden="true">·</span>
                  <span class="case-row__topic" :title="item.groupCode">{{
                    item.groupCode
                  }}</span>
                </span>
                <span
                  v-if="item.slaSignal?.state === 'AVAILABLE'"
                  data-sla-signal
                  :title="`${slaSignalCompactLabel(item.slaSignal)}. ${shadowSlaExplanation}`"
                  :class="[
                    'inbox-sla-signal case-row__sla',
                    `signal-${item.slaSignal.signalCode.toLowerCase()}`,
                  ]"
                >
                  <i class="pi pi-stopwatch" aria-hidden="true" />
                  <span>{{ slaSignalCompactLabel(item.slaSignal) }}</span>
                  <span :id="slaDescriptionId(item.id)" class="sr-only">{{
                    shadowSlaExplanation
                  }}</span>
                </span>
              </template>
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
      </Transition>
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
  margin: 0 12px 12px;
  padding: 4px;
  position: relative;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-subtle);
}
.inbox-modes__selection {
  position: absolute;
  inset: 4px auto 4px 4px;
  width: calc((100% - 12px) / 2);
  box-sizing: border-box;
  border: 1px solid
    color-mix(in srgb, var(--text-brand) 28%, var(--line));
  border-radius: 8px;
  background: var(--brand-soft);
  pointer-events: none;
  transition: transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.inbox-modes--second .inbox-modes__selection {
  transform: translateX(calc(100% + 4px));
}
.inbox-modes--single {
  grid-template-columns: minmax(0, 1fr);
}
.inbox-modes--single .inbox-modes__selection {
  width: calc(100% - 8px);
}
.inbox-modes button {
  min-width: 0;
  min-height: 40px;
  position: relative;
  z-index: 1;
  padding: 0 8px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-secondary);
  font: inherit;
  font-size: 0.78rem;
  font-weight: 650;
  line-height: 1;
  cursor: pointer;
  transition:
    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.inbox-modes button.active {
  background: transparent;
  color: var(--text-primary);
  box-shadow: none;
}
.inbox-modes button:active {
  transform: scale(0.985);
}
.inbox-modes i {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  display: inline-grid;
  place-items: center;
  margin: 0;
  font-size: 0.82rem;
  line-height: 1;
}
.inbox-tools {
  margin: 0 12px 10px;
  display: grid;
  gap: 8px;
}
.inbox-tools__trigger {
  width: 100%;
  min-width: 0;
  min-height: 48px;
  padding: 7px 9px;
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr) auto 16px;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
  cursor: pointer;
  transition:
    border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.inbox-tools__trigger:hover {
  background: var(--surface-hover);
}
.inbox-tools__trigger.active {
  border-color: color-mix(in srgb, var(--brand) 24%, var(--line));
}
.inbox-tools__trigger:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 1px;
}
.inbox-tools__trigger:active {
  transform: scale(0.99);
}
.inbox-tools__icon {
  width: 32px;
  height: 32px;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
}
.inbox-tools__trigger.active .inbox-tools__icon {
  background: var(--brand-soft);
  color: var(--brand);
}
.inbox-tools__icon i {
  font-size: 0.8rem;
  line-height: 1;
}
.inbox-tools__copy {
  min-width: 0;
  display: grid;
  gap: 2px;
  text-align: left;
}
.inbox-tools__copy strong,
.inbox-tools__copy small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inbox-tools__copy strong {
  font-size: 0.75rem;
  font-weight: 700;
  line-height: 1.25;
}
.inbox-tools__copy small {
  color: var(--text-muted);
  font-size: 0.66rem;
  font-weight: 500;
  line-height: 1.25;
}
.inbox-tools__shortcut {
  padding: 2px 5px;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--text-muted);
  font-size: 0.64rem;
  font-weight: 700;
  line-height: 1;
}
.inbox-tools__chevron {
  width: 16px;
  height: 16px;
  display: grid;
  place-items: center;
  color: var(--text-muted);
  font-size: 0.68rem;
  line-height: 1;
  transition: transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.inbox-tools__trigger[aria-expanded="true"] .inbox-tools__chevron {
  transform: rotate(180deg);
}
.inbox-tools__panel {
  max-height: min(56vh, 520px);
  padding: 1px;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: thin;
}
.inbox-tools__panel :deep(.views-rail) {
  margin: 0 0 8px;
}
.inbox-tools__panel :deep(.search-rail) {
  margin: 0;
}
.inbox-tools-panel-enter-active,
.inbox-tools-panel-leave-active {
  transition:
    opacity 180ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.inbox-tools-panel-enter-from,
.inbox-tools-panel-leave-to {
  opacity: 0;
  transform: translateY(-4px);
}
.inbox-list {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  align-items: stretch;
  overflow: auto;
  overscroll-behavior: contain;
}
.inbox-content-stage {
  min-height: 0;
  flex: 1;
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.inbox-content-stage > * {
  width: 100%;
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
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.72rem;
}
.freshness-notice.degraded {
  border-color: color-mix(in srgb, var(--status-warning-text) 30%, var(--line));
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.search-result-list {
  min-height: 0;
  flex: 1;
  overflow: auto;
  overscroll-behavior: contain;
}
.search-result-row {
  width: 100%;
  min-height: 72px;
  padding: 11px 14px;
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
.search-result-row:hover {
  background: var(--surface-hover);
}
.search-result-row:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: -3px;
}
.search-result-icon {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--brand-soft);
  color: var(--brand);
}
.search-result-copy {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 6px;
}
.search-result-meta {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 6px;
  color: var(--text-muted);
  font-size: 0.68rem;
}
.search-result-meta strong {
  color: var(--text-primary);
  font-size: 0.72rem;
}
.search-result-meta span {
  min-width: 0;
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.search-result-meta time {
  flex: 0 0 auto;
}
.search-result-snippet {
  display: -webkit-box;
  overflow: hidden;
  -webkit-box-orient: vertical;
  -webkit-line-clamp: 2;
  color: var(--text-secondary);
  font-size: 0.78rem;
  line-height: 1.4;
}
.inbox-row {
  position: relative;
  width: 100%;
  min-height: 72px;
  flex: 0 0 auto;
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
  transition:
    background-color 140ms cubic-bezier(0.23, 1, 0.32, 1),
    color 140ms cubic-bezier(0.23, 1, 0.32, 1);
}
.inbox-row::before {
  content: "";
  position: absolute;
  inset: 6px auto 6px 0;
  width: 2px;
  border-radius: 2px;
  background: transparent;
}
.inbox-row:hover:not(.selected) {
  background: var(--surface-hover);
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
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-weight: 800;
}
.inbox-row__avatar.attention {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.case-row {
  min-height: 68px;
  padding: 8px 12px;
  align-items: stretch;
  gap: 8px;
}
.case-row--with-sla {
  min-height: 84px;
}
.case-row .case-row__sequence {
  width: 28px;
  height: auto;
  min-height: 24px;
  align-self: flex-start;
  place-items: center;
  padding-top: 1px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  border-radius: 0;
  background: transparent;
  color: var(--text-muted);
  font-size: 0.7rem;
  font-weight: 750;
  font-variant-numeric: tabular-nums;
  line-height: 1.4;
}
.case-row__attention-icon {
  font-size: 0.66rem;
  line-height: 1;
}
.case-row .case-row__sequence.attention {
  background: transparent;
  color: var(--status-warning-text);
}
.inbox-row__body {
  min-width: 0;
  flex: 1;
  display: grid;
  gap: 5px;
}
.case-row .inbox-row__body {
  align-content: center;
  gap: 3px;
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
.case-row__headline {
  min-height: 20px;
}
.case-row__headline strong {
  line-height: 1.35;
}
.case-row__headline time {
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
}
.unread-count {
  min-width: 22px;
  height: 22px;
  padding: 0 6px;
  flex: 0 0 auto;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  color: var(--on-brand);
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
.case-row__metadata {
  min-height: 18px;
  flex-wrap: nowrap;
  gap: 0;
  color: var(--text-secondary);
  font-size: 0.7rem;
  line-height: 1.35;
  white-space: nowrap;
}
.case-row__metadata > span {
  min-width: 0;
  display: inline-flex;
  align-items: center;
}
.case-row__separator {
  flex: 0 0 auto;
  margin: 0 5px;
  color: var(--text-muted);
  font-weight: 500;
}
.case-row__status {
  flex: 0 0 auto;
}
.case-row__priority {
  flex: 0 0 auto;
  color: var(--text-secondary);
  font-weight: 650;
}
.case-row__priority--emphasis {
  padding: 1px 6px;
  border-radius: 999px;
  font-size: 0.66rem;
  line-height: 1.45;
}
.case-row__priority--emphasis.priority-high,
.case-row__priority--emphasis.priority-urgent {
  background: var(--status-warning-soft);
  color: var(--status-warning-text);
}
.case-row__priority--emphasis.priority-critical {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.case-row__topic {
  flex: 1 1 auto;
  overflow: hidden;
  color: var(--text-muted);
  text-overflow: ellipsis;
}
.state-chip {
  flex: 0 0 auto;
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.68rem;
  font-weight: 650;
}
.inbox-sla-signal {
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--text-secondary);
  font-size: 0.67rem;
  line-height: 1.3;
}
.case-row__sla {
  min-height: 18px;
  gap: 5px;
  overflow: hidden;
  font-size: 0.68rem;
  font-variant-numeric: tabular-nums;
  line-height: 1.35;
  white-space: nowrap;
}
.inbox-sla-signal.case-row__sla span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.inbox-sla-signal i {
  flex: 0 0 auto;
  color: currentColor;
  font-size: 0.68rem;
}
.inbox-sla-signal span {
  min-width: 0;
  white-space: normal;
  overflow-wrap: anywhere;
  text-wrap: pretty;
}
.inbox-sla-signal.signal-sla_at_risk,
.inbox-sla-signal.signal-sla_paused {
  color: var(--status-warning-text);
}
.inbox-sla-signal.signal-sla_breached {
  color: var(--status-danger-text);
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
.inbox-content-enter-active,
.inbox-content-leave-active {
  transition:
    opacity 140ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 140ms cubic-bezier(0.23, 1, 0.32, 1);
}
.inbox-content-enter-from,
.inbox-content-leave-to {
  opacity: 0;
  transform: translateY(3px);
}
.inbox-state button,
.pagination-error button {
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
  min-height: 44px;
  margin: 8px 12px;
  padding: 0 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  justify-self: stretch;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
  font-weight: 650;
  cursor: pointer;
  transition:
    border-color 140ms cubic-bezier(0.23, 1, 0.32, 1),
    background-color 140ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.load-more:hover {
  border-color: var(--border-strong);
  background: var(--surface-hover);
}
.load-more:active {
  transform: translateY(1px);
}
@media (max-width: 767px) {
  .support-inbox-pane {
    border-right: 0;
  }
  .inbox-modes button {
    min-height: 44px;
    font-size: 0.82rem;
  }
  .inbox-tools__trigger {
    min-height: 52px;
  }
  .inbox-tools__panel {
    max-height: 60vh;
  }
  .case-row__headline strong {
    display: -webkit-box;
    overflow: hidden;
    white-space: normal;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
  }
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden !important;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap !important;
  border: 0;
}
@media (prefers-reduced-motion: reduce) {
  .inbox-modes__selection,
  .inbox-modes button,
  .inbox-row,
  .inbox-tools__trigger,
  .inbox-tools__chevron,
  .inbox-tools-panel-enter-active,
  .inbox-tools-panel-leave-active,
  .inbox-content-enter-active,
  .inbox-content-leave-active,
  .load-more {
    transition-duration: 0.01ms;
  }
}
</style>
