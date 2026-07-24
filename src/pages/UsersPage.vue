<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import UserAISuspensionIndicator from "@/features/conversation-ai-suspension/ui/UserAISuspensionIndicator.vue";
import { endUserProfileRepository } from "@/features/end-user-profile/api/end-user-profile-repository";
import { formatProfileValue } from "@/features/end-user-profile/model/profile-value";
import UserWorkspaceDialog from "@/features/end-user-workspace/UserWorkspaceDialog.vue";
import type {
  CmsProfileSummaryResponseDto,
  ProfileProjectionFieldResponseDto,
} from "@/shared/api/generated/models";
import { repository } from "@/shared/api/repository";
import { conversationAISuspensionEnabled } from "@/shared/config/features";
import { formatDate, relativeTime } from "@/shared/lib/format";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const items = ref<CmsProfileSummaryResponseDto[]>([]);
const selected = ref<CmsProfileSummaryResponseDto | null>(null);
const workspaceVisible = ref(false);
const nextCursor = ref<string | null>(null);
const loading = ref(true);
const loadingMore = ref(false);
const error = ref("");
const query = ref("");
const appliedQuery = ref("");
const filterDefinitionId = ref("");
const filterOperator = ref<"EQ" | "LT" | "LTE" | "GT" | "GTE">("EQ");
const filterValue = ref("");
const sort = ref<"LAST_SEEN_DESC" | "LAST_SEEN_ASC">("LAST_SEEN_DESC");
const aiFilter = ref<"ALL" | "SUSPENDED">("ALL");
let requestSequence = 0;
let reloadTimer: ReturnType<typeof setTimeout> | undefined;

const availableFields = computed(() => {
  const byId = new Map<string, ProfileProjectionFieldResponseDto>();
  items.value
    .flatMap((item) => item.fields)
    .forEach((field) => byId.set(field.definitionId, field));
  return [...byId.values()].map((field) => ({
    value: field.definitionId,
    label: `${field.label} · ${field.key}`,
  }));
});
const operatorOptions = [
  { value: "EQ", label: "Равно" },
  { value: "LT", label: "Меньше" },
  { value: "LTE", label: "Не больше" },
  { value: "GT", label: "Больше" },
  { value: "GTE", label: "Не меньше" },
];
const sortOptions = [
  { value: "LAST_SEEN_DESC", label: "Сначала недавно активные" },
  { value: "LAST_SEEN_ASC", label: "Сначала давно активные" },
];
const aiFilterOptions = [
  { value: "ALL", label: "Все" },
  { value: "SUSPENDED", label: "AI приостановлен" },
];

async function load(append = false): Promise<void> {
  const projectId = auth.project?.id;
  if (!projectId || (append && !nextCursor.value)) return;
  const request = ++requestSequence;
  if (append) loadingMore.value = true;
  else loading.value = true;
  error.value = "";
  try {
    const response =
      repository.mode === "mock"
        ? await loadMockProfiles(projectId)
        : await endUserProfileRepository.list(projectId, {
            limit: 50,
            ...(append && nextCursor.value ? { cursor: nextCursor.value } : {}),
            ...(appliedQuery.value
              ? { externalUserId: appliedQuery.value }
              : {}),
            ...(aiFilter.value === "SUSPENDED"
              ? { hasActiveConversationAiSuspension: true }
              : {}),
            ...(filterDefinitionId.value && filterValue.value
              ? {
                  filterDefinitionId: filterDefinitionId.value,
                  filterOperator: filterOperator.value,
                  filterValue: filterValue.value,
                }
              : {}),
            sort: sort.value,
          });
    if (request !== requestSequence) return;
    items.value = append ? [...items.value, ...response.items] : response.items;
    nextCursor.value = response.nextCursor ?? null;
    if (selected.value) {
      selected.value =
        items.value.find(
          (item) => item.endUserId === selected.value?.endUserId,
        ) ?? selected.value;
    }
  } catch {
    if (request === requestSequence)
      error.value = "Не удалось загрузить профили пользователей";
  } finally {
    if (request === requestSequence) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

function mockField(
  definitionId: string,
  key: string,
  label: string,
  value: string | number | boolean | undefined,
  semanticRole?: string,
): ProfileProjectionFieldResponseDto {
  const type =
    typeof value === "boolean"
      ? "BOOLEAN"
      : typeof value === "number"
        ? "INTEGER"
        : "STRING";
  return {
    definitionId,
    definitionRevisionId: `${definitionId}-r1`,
    key,
    label,
    valueType: type,
    lifecycle: "ACTIVE",
    classification: "INTERNAL",
    access: "ALLOWED",
    availability: value === undefined ? "MISSING" : "AVAILABLE",
    ...(semanticRole ? { semanticRole } : {}),
    ...(value === undefined ? {} : { value: { type, value } }),
  };
}

async function loadMockProfiles(
  projectId: string,
): Promise<{ items: CmsProfileSummaryResponseDto[]; nextCursor: null }> {
  const users = await repository.getUsersPage(projectId, { limit: 100 });
  const normalizedQuery = appliedQuery.value.toLowerCase();
  const profiles = await Promise.all(
    users.items.map(async (user) => {
      const page = await repository.getConversations(projectId, user.id, {
        limit: 30,
      });
      const active = page.items.filter((conversation) => {
        const state = conversation.aiSuspension;
        return (
          state.mode === "SUSPENDED" &&
          state.lifecycle === "ACTIVE" &&
          Boolean(state.suspendedUntil) &&
          Date.parse(state.suspendedUntil!) > Date.parse(state.serverTime)
        );
      });
      const deadlines = active.flatMap((conversation) =>
        conversation.aiSuspension.suspendedUntil
          ? [conversation.aiSuspension.suspendedUntil]
          : [],
      );
      return {
        endUserId: user.id,
        externalUserId: user.externalId,
        locale: user.locale,
        lastSeenAt: user.lastSeenAt,
        observedAt: user.lastSeenAt,
        profileVersion: "demo",
        syncStatus: "VALID" as const,
        conversationAiSuspensionSummary: {
          activeConversationCount: active.length,
          nearestSuspendedUntil: deadlines.sort()[0] ?? null,
          mostRecentlyStartedConversationId: active[0]?.id ?? null,
          serverTime: new Date().toISOString(),
        },
        fields: [
          mockField(
            "mock-name",
            "displayName",
            "Имя",
            user.profile.name,
            "DISPLAY_NAME",
          ),
          mockField("mock-email", "email", "Email", user.profile.email),
          mockField("mock-country", "country", "Страна", user.profile.country),
          mockField("mock-segment", "segment", "Сегмент", user.segment),
        ],
      };
    }),
  );
  const filtered = profiles
    .filter(
      (profile) =>
        !normalizedQuery ||
        profile.externalUserId.toLowerCase().includes(normalizedQuery),
    )
    .filter(
      (profile) =>
        aiFilter.value !== "SUSPENDED" ||
        profile.conversationAiSuspensionSummary.activeConversationCount > 0,
    )
    .sort((left, right) =>
      sort.value === "LAST_SEEN_ASC"
        ? left.lastSeenAt.localeCompare(right.lastSeenAt)
        : right.lastSeenAt.localeCompare(left.lastSeenAt),
    );
  return { items: filtered, nextCursor: null };
}

function search(): void {
  appliedQuery.value = query.value.trim();
  nextCursor.value = null;
  void load();
}

function changeFilter(): void {
  nextCursor.value = null;
  void load();
}

async function openProfile(
  profile: CmsProfileSummaryResponseDto,
  updateRoute = true,
): Promise<void> {
  selected.value = profile;
  workspaceVisible.value = true;
  if (!updateRoute) return;
  await router.replace({
    name: "users",
    params: { endUserId: profile.endUserId },
  });
}

async function selectConversation(conversationId: string): Promise<void> {
  if (!selected.value) return;
  await router.replace({
    name: "users",
    params: { endUserId: selected.value.endUserId },
    query: { conversationId },
  });
}

async function selectProfile(): Promise<void> {
  if (!selected.value) return;
  await router.replace({
    name: "users",
    params: { endUserId: selected.value.endUserId },
  });
}

function closeProfile(): void {
  if (workspaceVisible.value) return;
  selected.value = null;
  void router.replace({ name: "users" });
}

function scheduleReload(): void {
  if (reloadTimer) clearTimeout(reloadTimer);
  reloadTimer = setTimeout(() => void load(), 250);
}

function userDisplayName(profile: CmsProfileSummaryResponseDto): string {
  const displayName = profile.fields.find(
    (field) =>
      field.semanticRole === "DISPLAY_NAME" &&
      field.availability === "AVAILABLE" &&
      field.access === "ALLOWED" &&
      field.value,
  );
  if (!displayName?.value) return profile.externalUserId;
  return formatProfileValue(displayName.value).trim() || profile.externalUserId;
}

function userProductId(profile: CmsProfileSummaryResponseDto): string {
  return profile.externalUserId;
}

function syncSeverity(
  status: string,
): "success" | "warn" | "secondary" | "danger" {
  return status === "VALID"
    ? "success"
    : status === "VALID_WITH_WARNINGS"
      ? "warn"
      : status === "NO_VALID_SNAPSHOT"
        ? "secondary"
        : "danger";
}

function syncStatusLabel(status: string): string {
  return (
    {
      VALID: "Данные приняты",
      VALID_WITH_WARNINGS: "Принято с предупреждением",
      NO_VALID_SNAPSHOT: "Профиль ещё не передан",
      INVALID: "Обновление отклонено",
    }[status] ?? status
  );
}

onMounted(async () => {
  await load();
  const endUserId = route.params.endUserId;
  if (typeof endUserId !== "string" || !endUserId.trim()) return;
  let profile = items.value.find((item) => item.endUserId === endUserId);
  if (!profile && auth.project?.id) {
    try {
      const detail = await endUserProfileRepository.profile(
        auth.project.id,
        endUserId,
      );
      const exact = await endUserProfileRepository.list(auth.project.id, {
        limit: 50,
        externalUserId: detail.externalUserId,
      });
      profile = exact.items.find((item) => item.endUserId === endUserId);
    } catch {
      error.value = "Не удалось открыть пользователя по ссылке";
    }
  }
  if (profile) await openProfile(profile, false);
});

onBeforeUnmount(() => {
  if (reloadTimer) clearTimeout(reloadTimer);
});
</script>

<template>
  <section class="page profiles-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Данные пользователей</div>
        <h1>Профили пользователей</h1>
        <p class="subtitle">
          Откройте пользователя, чтобы работать с профилем и разговорами в одном
          окне.
        </p>
      </div>
      <div class="header-actions">
        <Button
          label="Как устроены поля"
          icon="pi pi-book"
          severity="secondary"
          text
          as="router-link"
          :to="{ name: 'profile-fields-guide' }"
        />
        <Button
          label="Настроить поля профиля"
          icon="pi pi-sliders-h"
          severity="secondary"
          outlined
          as="router-link"
          to="/profile-fields"
        />
      </div>
    </header>

    <RouterLink to="/profile-fields" class="profile-fields-callout card">
      <span class="callout-icon"><i class="pi pi-id-card" /></span>
      <span
        ><strong>Нужно добавить или изменить данные профиля?</strong
        ><small>Настройте названия, типы и доступность полей.</small></span
      >
      <span class="callout-action"
        >Настроить поля <i class="pi pi-arrow-right"
      /></span>
    </RouterLink>

    <Message v-if="error" severity="error" :closable="false">
      <div class="error-row">
        <span>{{ error }}</span
        ><Button label="Повторить" size="small" text @click="load()" />
      </div>
    </Message>

    <form class="filters card" @submit.prevent="search">
      <label class="search"
        ><span>ID пользователя в вашем продукте</span>
        <div>
          <i class="pi pi-search" /><InputText
            v-model="query"
            placeholder="user-123"
          /><Button type="submit" label="Найти" /></div
      ></label>
      <label
        ><span>Поле профиля</span
        ><Select
          v-model="filterDefinitionId"
          :options="availableFields"
          option-label="label"
          option-value="value"
          show-clear
          placeholder="Без фильтра"
      /></label>
      <label
        ><span>Оператор</span
        ><Select
          v-model="filterOperator"
          :options="operatorOptions"
          option-label="label"
          option-value="value"
          :disabled="!filterDefinitionId"
      /></label>
      <label
        ><span>Значение</span
        ><InputText v-model="filterValue" :disabled="!filterDefinitionId"
      /></label>
      <label
        ><span>Сортировка</span
        ><Select
          v-model="sort"
          :options="sortOptions"
          option-label="label"
          option-value="value"
          @change="changeFilter"
      /></label>
      <label v-if="conversationAISuspensionEnabled"
        ><span>AI</span
        ><Select
          v-model="aiFilter"
          :options="aiFilterOptions"
          option-label="label"
          option-value="value"
          aria-label="Состояние AI"
          @change="changeFilter"
      /></label>
    </form>

    <div class="card table-card">
      <div v-if="loading" class="loading-list">
        <Skeleton v-for="item in 7" :key="item" height="58px" />
      </div>
      <DataTable
        v-else
        :value="items"
        row-hover
        data-key="endUserId"
        :pt="{
          tableContainer: {
            tabindex: 0,
            role: 'region',
            'aria-label': 'Профили пользователей',
          },
        }"
        @row-click="openProfile($event.data)"
      >
        <template #empty
          ><div class="empty">
            <i class="pi pi-users" /><strong>Профили не найдены</strong
            ><span>По заданным условиям нет пользователей.</span>
          </div></template
        >
        <Column header="Пользователь"
          ><template #body="{ data }"
            ><div class="user-cell">
              <span class="avatar">{{
                data.externalUserId.slice(0, 1).toUpperCase()
              }}</span>
              <div>
                <strong>{{ userDisplayName(data) }}</strong
                ><small>{{ userProductId(data) }}</small>
              </div>
              <UserAISuspensionIndicator
                v-if="conversationAISuspensionEnabled"
                :summary="data.conversationAiSuspensionSummary"
                @expired="scheduleReload"
              /></div></template
        ></Column>
        <Column header="Состояние"
          ><template #body="{ data }"
            ><Tag
              :value="syncStatusLabel(data.syncStatus)"
              :severity="syncSeverity(data.syncStatus)" /></template
        ></Column>
        <Column header="Версия профиля" class="mobile-hide"
          ><template #body="{ data }">{{
            data.profileVersion
          }}</template></Column
        >
        <Column header="Данные получены" class="mobile-hide"
          ><template #body="{ data }"
            ><span :title="formatDate(data.observedAt)">{{
              data.observedAt ? relativeTime(data.observedAt) : "Данных ещё нет"
            }}</span></template
          ></Column
        >
        <Column header="Последняя активность" class="mobile-hide"
          ><template #body="{ data }">{{
            relativeTime(data.lastSeenAt)
          }}</template></Column
        >
        <Column
          ><template #body="{ data }"
            ><Button
              icon="pi pi-chevron-right"
              severity="secondary"
              text
              rounded
              :aria-label="`Открыть профиль ${data.externalUserId}`"
              @click.stop="openProfile(data)" /></template
        ></Column>
      </DataTable>
      <div v-if="!loading && nextCursor" class="load-more">
        <Button
          label="Загрузить ещё"
          icon="pi pi-chevron-down"
          severity="secondary"
          outlined
          :loading="loadingMore"
          @click="load(true)"
        />
      </div>
    </div>
  </section>

  <UserWorkspaceDialog
    v-if="auth.project"
    v-model:visible="workspaceVisible"
    :project-id="auth.project.id"
    :end-user-id="selected?.endUserId ?? null"
    :external-user-id="selected?.externalUserId"
    :preferred-conversation-id="
      typeof route.query.conversationId === 'string'
        ? route.query.conversationId
        : undefined
    "
    @changed="load()"
    @conversation-selected="selectConversation"
    @profile-selected="selectProfile"
    @update:visible="closeProfile"
  />
</template>

<style scoped>
.header-actions,
.error-row,
.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.header-actions {
  flex-wrap: wrap;
  justify-content: flex-end;
}
.profile-fields-callout {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-bottom: 16px;
  padding: 16px 18px;
  text-decoration: none;
  color: inherit;
}
.profile-fields-callout span:nth-child(2) {
  display: grid;
  gap: 3px;
  flex: 1;
}
.profile-fields-callout small,
.user-cell small {
  color: var(--muted);
}
.callout-icon {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.callout-action {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  font-weight: 700;
  font-size: 0.76rem;
  line-height: 1;
  white-space: nowrap;
}
.callout-action i {
  display: inline-grid;
  place-items: center;
}
.error-row {
  justify-content: space-between;
}
.filters {
  display: grid;
  grid-template-columns: minmax(220px, 1.5fr) repeat(5, minmax(0, 1fr));
  gap: 12px;
  padding: 16px;
  margin: 16px 0;
}
.filters label {
  display: grid;
  gap: 6px;
  min-width: 0;
}
.filters :deep(.p-select),
.filters :deep(.p-inputtext) {
  width: 100%;
  min-width: 0;
}
.filters label > span {
  font-size: 0.68rem;
  color: var(--muted);
  font-weight: 700;
}
.search div {
  position: relative;
  display: flex;
}
.search i {
  position: absolute;
  z-index: 1;
  left: 12px;
  top: 50%;
  transform: translateY(-50%);
  color: var(--muted);
}
.search input {
  flex: 1;
  padding-left: 34px;
}
.table-card {
  overflow: hidden;
}
.loading-list {
  display: grid;
  gap: 8px;
  padding: 16px;
}
.user-cell {
  min-width: 210px;
}
.user-cell > div {
  display: grid;
}
.avatar {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  font-weight: 800;
}
.load-more {
  display: flex;
  justify-content: center;
  padding: 16px;
  border-top: 1px solid var(--line);
}
.empty {
  display: grid;
  place-items: center;
  gap: 8px;
  padding: 42px;
  color: var(--muted);
}
@media (max-width: 1100px) {
  .filters {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
  .search {
    grid-column: span 2;
  }
}
@media (max-width: 760px) {
  .header-actions {
    justify-content: flex-start;
  }
  .profile-fields-callout {
    align-items: flex-start;
  }
  .callout-action {
    display: none;
  }
  .filters {
    grid-template-columns: 1fr 1fr;
  }
  .search {
    grid-column: 1/-1;
  }
  .mobile-hide {
    display: none;
  }
}
@media (max-width: 480px) {
  .filters {
    grid-template-columns: 1fr;
  }
  .search {
    grid-column: auto;
  }
  .profile-fields-callout {
    padding: 14px;
  }
  .user-cell {
    min-width: 160px;
  }
}
</style>
