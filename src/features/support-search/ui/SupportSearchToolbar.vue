<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  SupportCaseSearchFilters,
  SupportSearchScope,
} from "@/features/support-search/api/support-search-source";
import type { SupportSearchRouteState } from "@/features/support-search/model/support-search-route";
import {
  isoToLocalDateTime,
  localDateTimeToIso,
  normalizeSearchTimeRange,
} from "@/features/support-search/model/support-search-time";

const props = defineProps<{
  modelValue: SupportSearchRouteState;
  active: boolean;
  loading: boolean;
  locked?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [state: SupportSearchRouteState];
  submit: [state: SupportSearchRouteState];
  close: [];
}>();
const timeFrom = ref(
  props.modelValue.filters.timeRange?.from
    ? isoToLocalDateTime(props.modelValue.filters.timeRange.from)
    : "",
);
const timeTo = ref(
  props.modelValue.filters.timeRange?.to
    ? isoToLocalDateTime(props.modelValue.filters.timeRange.to)
    : "",
);
watch(
  () => props.modelValue.filters.timeRange,
  (value) => {
    timeFrom.value = value?.from ? isoToLocalDateTime(value.from) : "";
    timeTo.value = value?.to ? isoToLocalDateTime(value.to) : "";
  },
);

const scopeLabels: Record<SupportSearchScope, string> = {
  CASES: "Обращения",
  CONVERSATIONS: "Диалоги",
  MESSAGES: "Сообщения",
  END_USERS: "Пользователи",
};
const statusLabels: Record<string, string> = {
  OPEN: "Открыто",
  IN_PROGRESS: "В работе",
  WAITING_END_USER: "Ждём пользователя",
  WAITING_SYSTEM: "Ждём систему",
  WAITING_ADMIN: "Нужен оператор",
  RESOLVED: "Решено",
  UNRESOLVED: "Не решено",
  CANCELLED: "Отменено",
};
const priorityLabels: Record<string, string> = {
  LOW: "Низкий",
  NORMAL: "Обычный",
  HIGH: "Высокий",
  URGENT: "Срочный",
  CRITICAL: "Критический",
};
const sortLabels: Record<string, string> = {
  RELEVANCE: "Релевантность",
  ACTIVITY_AT: "Последняя активность",
  PRIORITY: "Приоритет",
  SLA_DUE_AT: "Срок SLA",
  WAITING_SINCE: "Время ожидания",
  UNREAD_COUNT: "Непрочитанные",
  CREATED_AT: "Дата создания",
};
const assignmentStateLabels: Record<string, string> = {
  ASSIGNED: "Назначено",
  UNASSIGNED: "Без назначения",
};
const slaStateLabels: Record<string, string> = {
  ON_TRACK: "В норме",
  AT_RISK: "Под риском",
  BREACHED: "Нарушен",
  NOT_CONFIGURED: "Не настроен",
};
const waitingSideLabels: Record<string, string> = {
  END_USER: "пользователя",
  SUPPORT: "поддержку",
  SYSTEM: "систему",
  NONE: "никого",
};
const channelLabels: Record<string, string> = {
  TEXT: "Текст",
  VOICE: "Голос",
  CMS: "Панель управления",
};
const categoryLabels: Record<string, string> = {
  INFORMATION_REQUEST: "Информация",
  PROBLEM_RESOLUTION: "Решение проблемы",
  DECISION_SUPPORT: "Помощь с решением",
  ACTION_REQUEST: "Запрос действия",
  FEEDBACK: "Обратная связь",
  OTHER: "Другое",
};
const unknownFilterValue = "значение не распознано";

const chips = computed(() => {
  const filters = props.modelValue.filters;
  return [
    ...(filters.statuses ?? []).map(
      (value) => `Статус: ${statusLabels[value] ?? unknownFilterValue}`,
    ),
    ...(filters.priorities ?? []).map(
      (value) => `Приоритет: ${priorityLabels[value] ?? unknownFilterValue}`,
    ),
    ...(filters.assignmentStates ?? []).map(
      (value) => assignmentStateLabels[value] ?? unknownFilterValue,
    ),
    ...(filters.slaStates ?? []).map(
      (value) => `SLA: ${slaStateLabels[value] ?? unknownFilterValue}`,
    ),
    ...(filters.waitingSides ?? []).map(
      (value) => `Ожидаем: ${waitingSideLabels[value] ?? unknownFilterValue}`,
    ),
    ...(filters.channels ?? []).map(
      (value) => `Канал: ${channelLabels[value] ?? unknownFilterValue}`,
    ),
    ...(filters.queueIds ?? []).map((value) => `Очередь: ${value}`),
    ...(filters.topicCodes ?? []).map((value) => `Тема: ${value}`),
    ...(filters.categoryCodes ?? []).map(
      (value) => `Категория: ${categoryLabels[value] ?? unknownFilterValue}`,
    ),
    ...(filters.languages ?? []).map((value) => `Язык: ${value}`),
    ...(filters.teamIds ?? []).map((value) => `Команда: ${value}`),
    ...(filters.assigneeCmsUserIds ?? []).map((value) => `Оператор: ${value}`),
    ...(filters.caseIds ?? []).map((value) => `Обращение: ${value}`),
    ...(filters.conversationIds ?? []).map((value) => `Диалог: ${value}`),
    ...(filters.messageIds ?? []).map((value) => `Сообщение: ${value}`),
    ...(filters.endUserIds ?? []).map((value) => `Пользователь: ${value}`),
    ...(filters.externalEndUserIds ?? []).map(
      (value) => `Внешний идентификатор: ${value}`,
    ),
    ...(filters.unreadState
      ? [filters.unreadState === "UNREAD" ? "Непрочитанные" : "Прочитанные"]
      : []),
    ...(filters.draftState
      ? [filters.draftState === "HAS_DRAFT" ? "Есть черновик" : "Без черновика"]
      : []),
    ...(filters.deliveryState
      ? [
          filters.deliveryState === "PROBLEM"
            ? "Ошибка доставки"
            : "Доставка без ошибок",
        ]
      : []),
    ...(filters.timeRange?.from ? [`С: ${filters.timeRange.from}`] : []),
    ...(filters.timeRange?.to ? [`До: ${filters.timeRange.to}`] : []),
    ...(props.modelValue.sort.field !== "RELEVANCE"
      ? [sortLabels[props.modelValue.sort.field] ?? "Сортировка не распознана"]
      : []),
  ];
});

function update(patch: Partial<SupportSearchRouteState>): void {
  emit("update:modelValue", { ...props.modelValue, ...patch });
}

function changeScope(event: Event): void {
  const scope = (event.target as HTMLSelectElement).value as SupportSearchScope;
  update({
    scope,
    filters: scope === "CASES" ? props.modelValue.filters : {},
    sort: { field: "RELEVANCE", direction: "DESC" },
  });
}

function closePopover(event: Event): void {
  (event.currentTarget as HTMLElement)
    .closest("details")
    ?.removeAttribute("open");
}

function updateFilter(
  key: keyof SupportCaseSearchFilters,
  value: string,
  array = false,
): void {
  const filters = { ...props.modelValue.filters };
  if (!value) delete filters[key];
  else
    Object.assign(filters, {
      [key]: array
        ? value
            .split(",")
            .map((item) => item.trim())
            .filter(Boolean)
        : value,
    });
  update({ filters });
}

function updateSingleFilter(
  key: keyof SupportCaseSearchFilters,
  value: string,
): void {
  const filters = { ...props.modelValue.filters };
  if (!value) delete filters[key];
  else Object.assign(filters, { [key]: [value] });
  update({ filters });
}

function updateTimeRange(key: "from" | "to", value: string): void {
  if (key === "from") timeFrom.value = value;
  else timeTo.value = value;
  const filters = { ...props.modelValue.filters };
  const fromIso = localDateTimeToIso(timeFrom.value);
  const toIso = localDateTimeToIso(timeTo.value);
  const range =
    fromIso && toIso ? normalizeSearchTimeRange(fromIso, toIso) : undefined;
  if (range) filters.timeRange = range;
  else delete filters.timeRange;
  update({ filters });
}

function updateSortField(value: string): void {
  update({
    sort: {
      ...props.modelValue.sort,
      field: value as SupportSearchRouteState["sort"]["field"],
    },
  });
}

function submit(): void {
  emit("submit", props.modelValue);
}
</script>

<template>
  <section
    class="search-rail"
    :class="{ active }"
    aria-label="Поиск по поддержке"
  >
    <form class="search-form" role="search" @submit.prevent="submit">
      <i class="pi pi-search" aria-hidden="true" />
      <input
        data-support-search-input
        data-focus-ring="container"
        type="search"
        :value="modelValue.phrase"
        placeholder="Найти обращение, диалог, сообщение…"
        aria-label="Поиск по поддержке"
        @input="update({ phrase: ($event.target as HTMLInputElement).value })"
        @keydown.esc.prevent="emit('close')"
      />
      <span v-if="!active" class="search-shortcut" aria-hidden="true">⌘ K</span>
      <button type="submit" class="search-submit" :disabled="loading">
        <i
          :class="loading ? 'pi pi-spin pi-spinner' : 'pi pi-arrow-right'"
          aria-hidden="true"
        />
        <span class="sr-only">Искать</span>
      </button>
    </form>

    <div v-if="active && !locked" class="search-controls">
      <label class="scope-control">
        <span class="sr-only">Область поиска</span>
        <select
          :value="modelValue.scope"
          aria-label="Область поиска"
          @change="changeScope"
        >
          <option
            v-for="(label, value) in scopeLabels"
            :key="value"
            :value="value"
          >
            {{ label }}
          </option>
        </select>
      </label>

      <details v-if="modelValue.scope === 'CASES'" class="filter-popover">
        <summary>
          <i class="pi pi-sliders-h" aria-hidden="true" />
          <span>Фильтры</span>
        </summary>
        <div class="filter-grid">
          <div class="filter-grid-heading">
            <strong>Фильтры обращений</strong>
            <button
              type="button"
              aria-label="Закрыть фильтры"
              @click="closePopover"
            >
              <i class="pi pi-times" aria-hidden="true" />
            </button>
          </div>
          <label
            >Статус
            <select
              :value="modelValue.filters.statuses?.[0] ?? ''"
              @change="
                updateSingleFilter(
                  'statuses',
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option value="">Любой</option>
              <option
                v-for="(label, value) in statusLabels"
                :key="value"
                :value="value"
              >
                {{ label }}
              </option>
            </select>
          </label>
          <label
            >Приоритет
            <select
              :value="modelValue.filters.priorities?.[0] ?? ''"
              @change="
                updateSingleFilter(
                  'priorities',
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option value="">Любой</option>
              <option
                v-for="(label, value) in priorityLabels"
                :key="value"
                :value="value"
              >
                {{ label }}
              </option>
            </select>
          </label>
          <label
            >Назначение
            <select
              :value="modelValue.filters.assignmentStates?.[0] ?? ''"
              @change="
                updateSingleFilter(
                  'assignmentStates',
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option value="">Любое</option>
              <option value="ASSIGNED">Назначено</option>
              <option value="UNASSIGNED">Без назначения</option>
            </select>
          </label>
          <label
            >SLA
            <select
              :value="modelValue.filters.slaStates?.[0] ?? ''"
              @change="
                updateSingleFilter(
                  'slaStates',
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option value="">Любой</option>
              <option value="ON_TRACK">В норме</option>
              <option value="AT_RISK">Под риском</option>
              <option value="BREACHED">Нарушен</option>
              <option value="NOT_CONFIGURED">Нет SLA</option>
            </select>
          </label>
          <label
            >Ожидаем
            <select
              :value="modelValue.filters.waitingSides?.[0] ?? ''"
              @change="
                updateSingleFilter(
                  'waitingSides',
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option value="">Любая сторона</option>
              <option value="END_USER">Пользователя</option>
              <option value="SUPPORT">Поддержку</option>
              <option value="SYSTEM">Систему</option>
              <option value="NONE">Никого</option>
            </select>
          </label>
          <label
            >Состояние чтения
            <select
              :value="modelValue.filters.unreadState ?? ''"
              @change="
                updateFilter(
                  'unreadState',
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option value="">Любое</option>
              <option value="UNREAD">Непрочитанные</option>
              <option value="READ">Прочитанные</option>
            </select>
          </label>
          <label
            >Черновик
            <select
              :value="modelValue.filters.draftState ?? ''"
              @change="
                updateFilter(
                  'draftState',
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option value="">Любой</option>
              <option value="HAS_DRAFT">Есть</option>
              <option value="NO_DRAFT">Нет</option>
            </select>
          </label>
          <label
            >Доставка
            <select
              :value="modelValue.filters.deliveryState ?? ''"
              @change="
                updateFilter(
                  'deliveryState',
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option value="">Любая</option>
              <option value="PROBLEM">Есть проблема</option>
              <option value="HEALTHY">Без ошибок</option>
            </select>
          </label>
          <label
            >Канал
            <select
              :value="modelValue.filters.channels?.[0] ?? ''"
              @change="
                updateSingleFilter(
                  'channels',
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option value="">Любой</option>
              <option value="TEXT">Текст</option>
              <option value="VOICE">Голос</option>
              <option value="CMS">CMS</option>
            </select>
          </label>
          <label
            >Очереди
            <input
              :value="modelValue.filters.queueIds?.join(', ') ?? ''"
              placeholder="Идентификаторы через запятую"
              @change="
                updateFilter(
                  'queueIds',
                  ($event.target as HTMLInputElement).value,
                  true,
                )
              "
          /></label>
          <label
            >Темы
            <input
              :value="modelValue.filters.topicCodes?.join(', ') ?? ''"
              placeholder="Коды через запятую"
              @change="
                updateFilter(
                  'topicCodes',
                  ($event.target as HTMLInputElement).value,
                  true,
                )
              "
          /></label>
          <label
            >Категория
            <select
              :value="modelValue.filters.categoryCodes?.[0] ?? ''"
              @change="
                updateSingleFilter(
                  'categoryCodes',
                  ($event.target as HTMLSelectElement).value,
                )
              "
            >
              <option value="">Любая</option>
              <option value="INFORMATION_REQUEST">Информация</option>
              <option value="PROBLEM_RESOLUTION">Решение проблемы</option>
              <option value="DECISION_SUPPORT">Помощь с решением</option>
              <option value="ACTION_REQUEST">Запрос действия</option>
              <option value="FEEDBACK">Обратная связь</option>
              <option value="OTHER">Другое</option>
            </select>
          </label>
          <label
            >Языки
            <input
              :value="modelValue.filters.languages?.join(', ') ?? ''"
              placeholder="ru, en"
              @change="
                updateFilter(
                  'languages',
                  ($event.target as HTMLInputElement).value,
                  true,
                )
              "
          /></label>
          <label
            >Команды
            <input
              :value="modelValue.filters.teamIds?.join(', ') ?? ''"
              placeholder="Идентификаторы через запятую"
              @change="
                updateFilter(
                  'teamIds',
                  ($event.target as HTMLInputElement).value,
                  true,
                )
              "
          /></label>
          <label
            >Операторы
            <input
              :value="modelValue.filters.assigneeCmsUserIds?.join(', ') ?? ''"
              placeholder="Идентификаторы через запятую"
              @change="
                updateFilter(
                  'assigneeCmsUserIds',
                  ($event.target as HTMLInputElement).value,
                  true,
                )
              "
          /></label>
          <label
            >С
            <input
              type="datetime-local"
              :value="timeFrom"
              @change="
                updateTimeRange(
                  'from',
                  ($event.target as HTMLInputElement).value,
                )
              "
          /></label>
          <label
            >До
            <input
              type="datetime-local"
              :value="timeTo"
              @change="
                updateTimeRange('to', ($event.target as HTMLInputElement).value)
              "
          /></label>
        </div>
      </details>

      <details class="filter-popover exact-filter-popover">
        <summary>
          <i class="pi pi-hashtag" aria-hidden="true" />
          <span>Идентификаторы</span>
        </summary>
        <div class="filter-grid exact-filter-grid">
          <div class="filter-grid-heading">
            <strong>Точные идентификаторы</strong>
            <button
              type="button"
              aria-label="Закрыть фильтры по идентификаторам"
              @click="closePopover"
            >
              <i class="pi pi-times" aria-hidden="true" />
            </button>
          </div>
          <label
            v-if="
              modelValue.scope === 'CASES' || modelValue.scope === 'MESSAGES'
            "
            >Обращения
            <input
              :value="modelValue.filters.caseIds?.join(', ') ?? ''"
              placeholder="По одному через запятую"
              @change="
                updateFilter(
                  'caseIds',
                  ($event.target as HTMLInputElement).value,
                  true,
                )
              "
          /></label>
          <label
            v-if="
              modelValue.scope === 'CONVERSATIONS' ||
              modelValue.scope === 'MESSAGES'
            "
            >Диалоги
            <input
              :value="modelValue.filters.conversationIds?.join(', ') ?? ''"
              placeholder="По одному через запятую"
              @change="
                updateFilter(
                  'conversationIds',
                  ($event.target as HTMLInputElement).value,
                  true,
                )
              "
          /></label>
          <label v-if="modelValue.scope === 'MESSAGES'"
            >Сообщения
            <input
              :value="modelValue.filters.messageIds?.join(', ') ?? ''"
              placeholder="По одному через запятую"
              @change="
                updateFilter(
                  'messageIds',
                  ($event.target as HTMLInputElement).value,
                  true,
                )
              "
          /></label>
          <label
            >Пользователи
            <input
              :value="modelValue.filters.endUserIds?.join(', ') ?? ''"
              placeholder="По одному через запятую"
              @change="
                updateFilter(
                  'endUserIds',
                  ($event.target as HTMLInputElement).value,
                  true,
                )
              "
          /></label>
          <label
            >Внешний идентификатор
            <input
              :value="modelValue.filters.externalEndUserIds?.join(', ') ?? ''"
              placeholder="Точное значение"
              @change="
                updateFilter(
                  'externalEndUserIds',
                  ($event.target as HTMLInputElement).value,
                  true,
                )
              "
          /></label>
          <template
            v-if="
              modelValue.scope !== 'CASES' && modelValue.scope !== 'END_USERS'
            "
          >
            <label
              >С
              <input
                type="datetime-local"
                :value="timeFrom"
                @change="
                  updateTimeRange(
                    'from',
                    ($event.target as HTMLInputElement).value,
                  )
                "
            /></label>
            <label
              >До
              <input
                type="datetime-local"
                :value="timeTo"
                @change="
                  updateTimeRange(
                    'to',
                    ($event.target as HTMLInputElement).value,
                  )
                "
            /></label>
          </template>
        </div>
      </details>

      <label v-if="modelValue.scope !== 'END_USERS'" class="sort-control">
        <span class="sr-only">Сортировка</span>
        <select
          :value="modelValue.sort.field"
          @change="updateSortField(($event.target as HTMLSelectElement).value)"
        >
          <option value="RELEVANCE">По релевантности</option>
          <option value="ACTIVITY_AT">По активности</option>
          <template v-if="modelValue.scope === 'CASES'">
            <option value="PRIORITY">По приоритету</option>
            <option value="SLA_DUE_AT">По сроку SLA</option>
            <option value="WAITING_SINCE">По ожиданию</option>
            <option value="UNREAD_COUNT">По непрочитанным</option>
            <option value="CREATED_AT">По созданию</option>
          </template>
        </select>
      </label>
      <button
        v-if="modelValue.scope !== 'END_USERS'"
        type="button"
        class="direction-button"
        :aria-label="
          modelValue.sort.direction === 'ASC' ? 'По возрастанию' : 'По убыванию'
        "
        @click="
          update({
            sort: {
              ...modelValue.sort,
              direction: modelValue.sort.direction === 'ASC' ? 'DESC' : 'ASC',
            },
          })
        "
      >
        <i
          :class="
            modelValue.sort.direction === 'ASC'
              ? 'pi pi-sort-amount-up'
              : 'pi pi-sort-amount-down'
          "
          aria-hidden="true"
        />
      </button>
    </div>

    <div
      v-if="active && !locked && chips.length"
      class="filter-chips"
      aria-label="Активные фильтры"
    >
      <span v-for="chip in chips" :key="chip">{{ chip }}</span>
    </div>
  </section>
</template>

<style scoped>
.search-rail {
  margin: 0 12px 10px;
  display: grid;
  gap: 8px;
}
.search-form {
  min-height: 44px;
  padding: 0 2px 0 11px;
  display: flex;
  align-items: center;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--surface-card);
}
.search-form:focus-within {
  border-color: var(--focus-ring);
  box-shadow: 0 0 0 1px var(--focus-ring);
}
.search-form > i {
  width: 16px;
  height: 16px;
  flex: 0 0 16px;
  display: inline-grid;
  place-items: center;
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1;
}
.search-form input {
  min-width: 0;
  min-height: 0;
  flex: 1;
  padding: 0;
  border: 0;
  outline: 0;
  appearance: none;
  background: transparent;
  box-shadow: none;
  color: var(--text-primary);
  font: inherit;
  font-size: 0.78rem;
}
.search-form input:focus,
.search-form input:focus-visible {
  outline: 0;
  box-shadow: none;
}
.search-shortcut {
  padding: 2px 5px;
  border: 1px solid var(--line);
  border-radius: 5px;
  color: var(--text-muted);
  font-size: 0.66rem;
  font-weight: 700;
}
.search-submit,
.direction-button {
  width: 40px;
  height: 40px;
  padding: 0;
  display: inline-grid;
  place-items: center;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--brand);
  line-height: 1;
  cursor: pointer;
}
.search-submit i,
.direction-button i {
  font-size: 0.8rem;
  line-height: 1;
}
.search-submit:hover,
.direction-button:hover {
  background: var(--brand-soft);
}
.search-controls {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 0.88fr) minmax(0, 1.12fr);
  align-items: center;
  gap: 8px;
}
.scope-control {
  min-width: 0;
  grid-column: 1 / -1;
}
.scope-control select {
  width: 100%;
}
.search-controls select,
.filter-grid input {
  min-height: 40px;
  max-width: 100%;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
  font-size: 0.72rem;
}
.search-controls select {
  padding: 0 24px 0 8px;
}
.sort-control {
  min-width: 0;
  grid-column: 1 / -1;
  grid-row: 3;
  padding-right: 48px;
}
.sort-control select {
  width: 100%;
}
.direction-button {
  grid-column: 2;
  grid-row: 3;
  justify-self: end;
}
.filter-popover {
  min-width: 0;
}
.filter-popover:only-of-type {
  grid-column: 1 / -1;
}
.filter-popover[open] {
  grid-column: 1 / -1;
}
.search-controls:has(.filter-popover[open]) .filter-popover:not([open]) {
  display: none;
}
.filter-popover summary {
  width: 100%;
  min-width: 0;
  min-height: 40px;
  padding: 0 9px;
  display: flex;
  align-items: center;
  gap: 6px;
  border: 1px solid var(--line);
  border-radius: 7px;
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 650;
  cursor: pointer;
  list-style: none;
}
.filter-popover summary::marker {
  content: "";
}
.filter-popover summary::-webkit-details-marker {
  display: none;
}
.filter-popover summary span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.filter-grid {
  position: static;
  z-index: 15;
  width: 100%;
  margin-top: 8px;
  padding: 12px;
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-card);
  box-shadow: var(--shadow-elevated);
}
.filter-grid label {
  min-width: 0;
  display: grid;
  gap: 4px;
  color: var(--text-muted);
  font-size: 0.68rem;
  font-weight: 650;
}
.filter-grid-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-primary);
  font-size: 0.75rem;
}
.filter-grid-heading button {
  width: 30px;
  height: 30px;
  border: 0;
  border-radius: 7px;
  background: transparent;
  color: var(--text-muted);
  cursor: pointer;
}
.filter-grid-heading button:hover {
  background: var(--surface-soft);
  color: var(--text-primary);
}
.filter-grid select,
.filter-grid input {
  width: 100%;
  min-height: 36px;
  padding: 0 7px;
}
.filter-chips {
  display: flex;
  gap: 5px;
  overflow-x: auto;
  scrollbar-width: thin;
}
.filter-chips span {
  flex: 0 0 auto;
  padding: 3px 7px;
  border: 1px solid color-mix(in srgb, var(--brand) 26%, var(--line));
  border-radius: 6px;
  background: var(--brand-soft);
  color: var(--text-secondary);
  font-size: 0.66rem;
  font-weight: 650;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 767px) {
  .filter-popover[open] .filter-grid {
    position: fixed;
    inset: auto 8px 8px;
    width: auto;
    margin-top: 0;
    grid-template-columns: 1fr;
    max-height: calc(100dvh - 16px);
    overflow: auto;
    border-radius: 12px;
  }
  .filter-grid select,
  .filter-grid input {
    min-height: 44px;
  }
}
</style>
