<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import Button from "primevue/button";
import Column from "primevue/column";
import DataTable from "primevue/datatable";
import Drawer from "primevue/drawer";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { endUserProfileRepository } from "@/features/end-user-profile/api/end-user-profile-repository";
import {
  formatProfileValue,
  profileValueStateLabel,
} from "@/features/end-user-profile/model/profile-value";
import { repository } from "@/shared/api/repository";
import type {
  CmsProfileSummaryResponseDto,
  ProfileProjectionFieldResponseDto,
  ProfileProjectionResponseDto,
} from "@/shared/api/generated/models";
import { formatDate, relativeTime } from "@/shared/lib/format";

const auth = useAuthStore();
const items = ref<CmsProfileSummaryResponseDto[]>([]);
const nextCursor = ref<string | null>(null);
const loading = ref(true);
const loadingMore = ref(false);
const detailLoading = ref(false);
const error = ref("");
const detailError = ref("");
const query = ref("");
const appliedQuery = ref("");
const filterDefinitionId = ref("");
const filterOperator = ref<"EQ" | "LT" | "LTE" | "GT" | "GTE">("EQ");
const filterValue = ref("");
const sort = ref<"LAST_SEEN_DESC" | "LAST_SEEN_ASC">("LAST_SEEN_DESC");
const selected = ref<CmsProfileSummaryResponseDto | null>(null);
const detail = ref<ProfileProjectionResponseDto | null>(null);
const drawerVisible = ref(false);
const showDeveloperKeys = ref(false);
const showArchivedFields = ref(false);
let requestSequence = 0;
let detailRequestSequence = 0;

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
const visibleDetailFields = computed(() =>
  (detail.value?.fields ?? []).filter(
    (field) => showArchivedFields.value || field.lifecycle !== "ARCHIVED",
  ),
);
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

onMounted(() => void load());

function mockField(
  definitionId: string,
  key: string,
  label: string,
  valueType: string,
  value: string | number | boolean | undefined,
): ProfileProjectionFieldResponseDto {
  return {
    definitionId,
    definitionRevisionId: `${definitionId}-r1`,
    key,
    label,
    valueType,
    lifecycle: "ACTIVE",
    classification: "INTERNAL",
    access: "ALLOWED",
    availability: value === undefined ? "MISSING" : "AVAILABLE",
    ...(value === undefined ? {} : { value: { type: valueType, value } }),
  };
}

async function load(append = false) {
  const projectId = auth.project?.id;
  if (!projectId || (append && !nextCursor.value)) return;
  const request = ++requestSequence;
  if (append) loadingMore.value = true;
  else loading.value = true;
  error.value = "";
  try {
    let response: {
      items: CmsProfileSummaryResponseDto[];
      nextCursor?: string | null;
    };
    if (repository.mode === "mock") {
      const legacy = await repository.getUsersPage(projectId, { limit: 50 });
      const normalizedQuery = appliedQuery.value.toLowerCase();
      const profiles = legacy.items
        .map((user) => ({
          endUserId: user.id,
          externalUserId: user.externalId,
          locale: user.locale,
          lastSeenAt: user.lastSeenAt,
          observedAt: user.lastSeenAt,
          profileVersion: "1",
          syncStatus: "VALID" as const,
          fields: [
            mockField(
              "attr-name",
              "displayName",
              "Отображаемое имя",
              "STRING",
              user.profile.name,
            ),
            mockField(
              "attr-email",
              "email",
              "Email",
              "STRING",
              user.profile.email,
            ),
            mockField(
              "attr-country",
              "country",
              "Страна",
              "COUNTRY_CODE",
              user.profile.country,
            ),
            mockField(
              "attr-tier",
              "loyaltyTier",
              "Уровень лояльности",
              "STRING",
              user.segment,
            ),
          ],
        }))
        .filter(
          (profile) =>
            !normalizedQuery ||
            profile.externalUserId.toLowerCase().includes(normalizedQuery),
        );
      response = { items: profiles, nextCursor: null };
    } else {
      response = await endUserProfileRepository.list(projectId, {
        limit: 50,
        ...(append && nextCursor.value ? { cursor: nextCursor.value } : {}),
        ...(appliedQuery.value ? { externalUserId: appliedQuery.value } : {}),
        ...(filterDefinitionId.value && filterValue.value
          ? {
              filterDefinitionId: filterDefinitionId.value,
              filterOperator: filterOperator.value,
              ...(filterValue.value ? { filterValue: filterValue.value } : {}),
            }
          : {}),
        sort: sort.value,
      });
    }
    if (request !== requestSequence) return;
    items.value = append ? [...items.value, ...response.items] : response.items;
    nextCursor.value = response.nextCursor ?? null;
  } catch (cause) {
    if (request === requestSequence)
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить Current Profiles";
  } finally {
    if (request === requestSequence) {
      loading.value = false;
      loadingMore.value = false;
    }
  }
}

function search() {
  appliedQuery.value = query.value.trim();
  nextCursor.value = null;
  void load();
}

async function openProfile(profile: CmsProfileSummaryResponseDto) {
  const projectId = auth.project?.id;
  if (!projectId) return;
  const request = ++detailRequestSequence;
  selected.value = profile;
  detail.value = null;
  detailError.value = "";
  detailLoading.value = true;
  drawerVisible.value = true;
  try {
    const response: ProfileProjectionResponseDto =
      repository.mode === "mock"
        ? ({
            endUserId: profile.endUserId,
            externalUserId: profile.externalUserId,
            profileVersion: profile.profileVersion,
            syncStatus: profile.syncStatus,
            fields: profile.fields,
            observedAt: profile.observedAt,
            receivedAt: profile.lastSeenAt,
            ageSeconds: Math.max(
              0,
              Math.round(
                (Date.now() -
                  new Date(
                    profile.observedAt ?? profile.lastSeenAt,
                  ).valueOf()) /
                  1000,
              ),
            ),
            contractRevision: 1,
            provenance: "PRODUCT_PROFILE",
          } as ProfileProjectionResponseDto)
        : await endUserProfileRepository.profile(projectId, profile.endUserId);
    if (
      request === detailRequestSequence &&
      selected.value?.endUserId === profile.endUserId
    )
      detail.value = response;
  } catch (cause) {
    if (request === detailRequestSequence)
      detailError.value =
        cause instanceof Error ? cause.message : "Не удалось загрузить профиль";
  } finally {
    if (request === detailRequestSequence) detailLoading.value = false;
  }
}

function displayField(field: ProfileProjectionFieldResponseDto): string {
  return field.availability === "AVAILABLE" &&
    field.access === "ALLOWED" &&
    field.value
    ? formatProfileValue(field.value)
    : profileValueStateLabel(
        field.access === "ALLOWED" ? field.availability : "DENIED",
      );
}

function syncSeverity(status: string) {
  return status === "VALID"
    ? "success"
    : status === "VALID_WITH_WARNINGS"
      ? "warn"
      : "danger";
}
</script>

<template>
  <section class="page profiles-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">End User Attribute Platform</div>
        <h1>Current Profiles</h1>
        <p class="subtitle">
          Типизированная проекция последнего принятого snapshot. Поиск,
          фильтрация и сортировка выполняются backend.
        </p>
      </div>
      <Button
        label="Настроить контракт"
        icon="pi pi-sliders-h"
        severity="secondary"
        outlined
        as="router-link"
        to="/project/user-attributes"
      />
    </header>
    <Message v-if="error" severity="error" :closable="false"
      ><div class="error-row">
        <span>{{ error }}</span
        ><Button label="Повторить" size="small" text @click="load()" /></div
    ></Message>

    <form class="filters card" @submit.prevent="search">
      <label class="search"
        ><span>External user ID</span>
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
          @change="load()"
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
        @row-click="openProfile($event.data)"
      >
        <template #empty
          ><div class="empty">
            <i class="pi pi-users" /><strong>Профили не найдены</strong
            ><span
              >Backend успешно ответил, но по заданным условиям данных
              нет.</span
            >
          </div></template
        >
        <Column header="Пользователь"
          ><template #body="{ data }"
            ><div class="user-cell">
              <span class="avatar">{{
                data.externalUserId.slice(0, 1).toUpperCase()
              }}</span>
              <div>
                <strong>{{ data.externalUserId }}</strong
                ><small>ID {{ data.endUserId }}</small>
              </div>
            </div></template
          ></Column
        >
        <Column header="Current Profile"
          ><template #body="{ data }"
            ><div class="preview-fields">
              <span
                v-for="field in data.fields.slice(0, 2)"
                :key="field.definitionId"
                ><b>{{ field.label }}</b
                >{{ displayField(field) }}</span
              ><small v-if="data.fields.length > 2"
                >+{{ data.fields.length - 2 }} полей</small
              >
            </div></template
          ></Column
        >
        <Column header="Sync"
          ><template #body="{ data }"
            ><Tag
              :value="data.syncStatus"
              :severity="syncSeverity(data.syncStatus)" /></template
        ></Column>
        <Column header="Locale" class="mobile-hide"
          ><template #body="{ data }">{{
            data.locale ?? "—"
          }}</template></Column
        >
        <Column header="Profile v" class="mobile-hide"
          ><template #body="{ data }">{{
            data.profileVersion
          }}</template></Column
        >
        <Column header="Profile observed" class="mobile-hide"
          ><template #body="{ data }"
            ><span :title="formatDate(data.observedAt)">{{
              data.observedAt ? relativeTime(data.observedAt) : "Нет snapshot"
            }}</span></template
          ></Column
        >
        <Column header="Last seen" class="mobile-hide"
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
              :aria-label="`Открыть Current Profile ${data.externalUserId}`"
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

  <Drawer
    v-model:visible="drawerVisible"
    position="right"
    :style="{ width: 'min(680px, 100vw)' }"
  >
    <template #header
      ><div>
        <div class="eyebrow">Current Profile</div>
        <h2>{{ selected?.externalUserId }}</h2>
      </div></template
    >
    <div v-if="detailLoading" class="loading-list">
      <Skeleton v-for="item in 6" :key="item" height="72px" />
    </div>
    <Message v-else-if="detailError" severity="error" :closable="false">{{
      detailError
    }}</Message>
    <div v-else-if="detail" class="profile-detail">
      <section class="profile-meta surface-soft">
        <div>
          <span>Profile version</span
          ><strong>{{ detail.profileVersion }}</strong>
        </div>
        <div>
          <span>Contract revision</span
          ><strong>{{ detail.contractRevision ?? "Legacy / нет" }}</strong>
        </div>
        <div>
          <span>Observed at</span
          ><strong>{{
            detail.observedAt
              ? formatDate(detail.observedAt)
              : "Нет принятого snapshot"
          }}</strong>
        </div>
        <div>
          <span>Возраст</span
          ><strong>{{
            detail.ageSeconds === null || detail.ageSeconds === undefined
              ? "—"
              : `${detail.ageSeconds} сек.`
          }}</strong>
        </div>
        <div>
          <span>Received at</span
          ><strong>{{
            detail.receivedAt ? formatDate(detail.receivedAt) : "—"
          }}</strong>
        </div>
        <div>
          <span>Sync status</span
          ><Tag
            :value="detail.syncStatus"
            :severity="syncSeverity(detail.syncStatus)"
          />
        </div>
      </section>
      <Message v-if="detail.lastRejectedSync" severity="warn" :closable="false"
        ><strong>Последний sync отклонён.</strong> Current Profile ниже остаётся
        последним валидным snapshot; отклонённые данные его не заменили.<span
          v-if="detail.lastRejectedSync.at"
        >
          {{ formatDate(detail.lastRejectedSync.at) }}.</span
        ><span v-if="detail.lastRejectedSync.issues?.length">
          Причины:
          {{
            detail.lastRejectedSync.issues
              .map((issue) => issue.code)
              .join(", ")
          }}.</span
        ></Message
      >
      <div class="detail-nav">
        <strong
          >{{ visibleDetailFields.length }} полей опубликованного
          контракта</strong
        ><label class="detail-toggle"
          ><input v-model="showArchivedFields" type="checkbox" />Архивные</label
        ><label class="detail-toggle"
          ><input v-model="showDeveloperKeys" type="checkbox" />Ключи</label
        ><RouterLink
          :to="{ name: 'event-logs', query: { user: detail.externalUserId } }"
          >История событий отдельно <i class="pi pi-arrow-up-right"
        /></RouterLink>
      </div>
      <div class="profile-fields">
        <article
          v-for="field in visibleDetailFields"
          :key="field.definitionId"
          class="profile-field card"
          :class="field.availability.toLowerCase()"
        >
          <div>
            <span>{{ field.label }}</span
            ><code>{{ field.valueType }}</code
            ><code v-if="showDeveloperKeys">{{ field.key }}</code>
          </div>
          <strong>{{ displayField(field) }}</strong>
          <div class="field-meta">
            <Tag
              :value="field.availability"
              :severity="
                field.availability === 'AVAILABLE'
                  ? 'success'
                  : field.availability === 'STALE'
                    ? 'warn'
                    : 'secondary'
              "
            /><Tag :value="field.lifecycle" severity="secondary" /><Tag
              v-if="field.classification !== 'INTERNAL'"
              :value="field.classification"
              severity="warn"
            /><span v-if="field.untrustedData">untrusted</span>
          </div>
          <p v-if="field.description">{{ field.description }}</p>
        </article>
      </div>
      <details class="technical">
        <summary>Техническая provenance</summary>
        <pre>{{ JSON.stringify(detail.provenance, null, 2) }}</pre>
      </details>
    </div>
  </Drawer>
</template>

<style scoped>
.profiles-page {
  max-width: 1400px;
}
.detail-toggle {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 0.72rem;
}
.filters {
  display: grid;
  grid-template-columns: 1.4fr 1.2fr 0.8fr 1fr 1fr;
  gap: 10px;
  padding: 14px;
  margin-bottom: 18px;
  align-items: end;
}
.filters label {
  display: flex;
  flex-direction: column;
  gap: 6px;
}
.filters label > span {
  font-size: 0.62rem;
  font-weight: 700;
  color: var(--muted);
  text-transform: uppercase;
}
.search > div {
  display: flex;
  position: relative;
}
.search i {
  position: absolute;
  left: 12px;
  top: 50%;
  z-index: 1;
  transform: translateY(-50%);
  color: var(--muted);
}
.search :deep(input) {
  min-width: 0;
  padding-left: 34px;
}
.table-card {
  overflow: hidden;
}
.loading-list {
  display: grid;
  gap: 9px;
  padding: 16px;
}
.user-cell {
  display: flex;
  align-items: center;
  gap: 10px;
}
.avatar {
  width: 38px;
  height: 38px;
  display: grid;
  place-items: center;
  border-radius: 12px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  font-weight: 800;
}
.user-cell strong,
.user-cell small {
  display: block;
}
.user-cell small {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.63rem;
}
.preview-fields {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.preview-fields span {
  font-size: 0.67rem;
}
.preview-fields b {
  display: inline-block;
  min-width: 110px;
  margin-right: 6px;
  color: var(--muted);
}
.preview-fields small {
  color: var(--muted);
}
.table-card :deep(tbody tr) {
  cursor: pointer;
}
.load-more {
  display: flex;
  justify-content: center;
  padding: 14px;
}
.empty {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 6px;
  padding: 30px;
  color: var(--muted);
}
.error-row,
.detail-nav {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.profile-detail {
  display: flex;
  flex-direction: column;
  gap: 14px;
}
.profile-meta {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  padding: 1px;
  overflow: hidden;
}
.profile-meta > div {
  padding: 13px;
  background: var(--surface-card);
}
.profile-meta span,
.profile-meta strong {
  display: block;
}
.profile-meta span {
  color: var(--muted);
  font-size: 0.59rem;
  text-transform: uppercase;
}
.profile-meta strong {
  margin-top: 5px;
  font-size: 0.73rem;
}
.detail-nav a {
  color: var(--status-violet-text);
  font-size: 0.68rem;
}
.profile-fields {
  display: grid;
  gap: 8px;
}
.profile-field {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 8px;
  padding: 13px;
}
.profile-field > div:first-child span,
.profile-field > div:first-child code {
  display: block;
}
.profile-field > div:first-child span {
  font-size: 0.75rem;
  font-weight: 700;
}
.profile-field code {
  margin-top: 3px;
  color: var(--muted);
  font-size: 0.59rem;
}
.profile-field > strong {
  align-self: center;
  text-align: right;
  overflow-wrap: anywhere;
}
.field-meta {
  display: flex;
  align-items: center;
  gap: 5px;
}
.profile-field p {
  grid-column: 1/3;
  margin: 0;
  color: var(--muted);
  font-size: 0.66rem;
}
.profile-field.missing,
.profile-field.denied,
.profile-field.invalid {
  opacity: 0.75;
}
.technical {
  padding: 12px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
}
.technical summary {
  cursor: pointer;
  font-weight: 700;
  font-size: 0.7rem;
}
.technical pre {
  overflow: auto;
  font-size: 0.65rem;
}
@media (max-width: 1100px) {
  .filters {
    grid-template-columns: repeat(2, 1fr);
  }
  .search {
    grid-column: 1/-1;
  }
}
@media (max-width: 620px) {
  .filters {
    grid-template-columns: 1fr;
  }
  .search {
    grid-column: auto;
  }
  .mobile-hide {
    display: none;
  }
  .profile-meta {
    grid-template-columns: 1fr;
  }
  .preview-fields {
    display: none;
  }
}
</style>
