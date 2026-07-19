<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { useAuthStore } from "@/features/auth/auth.store";
import SegmentManager from "@/features/scenario-audience/ui/SegmentManager.vue";
import { repository } from "@/shared/api/repository";
import {
  scenarioAuthoringRepository,
  type ConditionCatalogResponseDtoAudience,
} from "@/shared/api/repository/scenario-authoring";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const loading = ref(true);
const error = ref("");
const catalog = ref<ConditionCatalogResponseDtoAudience | null>(null);
const canManage = computed(
  () => auth.user?.role === "OWNER" || auth.user?.role === "ADMIN",
);
const initialAction = computed<
  "create" | "detail" | "revision" | "exact" | undefined
>(() =>
  route.name === "segment-create"
    ? "create"
    : route.name === "segment-revision-create"
      ? "revision"
      : route.name === "segment-revision-detail"
        ? "exact"
        : route.params.segmentId
          ? "detail"
          : undefined,
);
const initialSegmentId = computed(() =>
  typeof route.params.segmentId === "string"
    ? route.params.segmentId
    : undefined,
);
const initialSegmentRevisionId = computed(() =>
  typeof route.params.segmentRevisionId === "string"
    ? route.params.segmentRevisionId
    : undefined,
);

onMounted(load);

function demoCatalog(): ConditionCatalogResponseDtoAudience {
  return {
    version: 2,
    source: "CURRENT_PROFILE",
    revision: "demo-audience-v2",
    attributes: [
      {
        definitionId: "attr-tier",
        definitionRevisionId: "attr-tier-r1",
        revision: 1,
        key: "loyaltyTier",
        label: "Уровень лояльности",
        description: "Текущий уровень программы лояльности.",
        valueType: "STRING",
        lifecycle: "ACTIVE",
        classification: "INTERNAL",
        audienceRead: true,
        authoringAvailability: "AVAILABLE",
        operators: [
          "eq",
          "neq",
          "in",
          "not_in",
          "exists",
          "is_missing",
          "is_stale",
        ],
        control: "SELECT",
        allowedValues: ["basic", "silver", "gold"],
        constraints: {},
        defaultFreshnessHint: { mode: "USE_LAST_KNOWN" },
      },
    ],
    freshnessPolicies: [],
    segmentSource: {
      authoringAvailability: "AVAILABLE",
      control: "SEARCH",
      operators: ["is_member", "is_not_member"],
      searchEndpoint: "/segments",
    },
    snapshotPolicy: {
      initialEvaluation: "RUN_START",
      missing: "NO_MATCH",
      stale: "TRI_STATE",
      truth: "KLEENE",
      persistence: "SNAPSHOT_WITH_SEPARATE_LAST_RECHECK",
      recheckTrigger: "DELIVERY_RECHECK_ELIGIBILITY",
      revision: "PINNED",
    },
  } as unknown as ConditionCatalogResponseDtoAudience;
}

async function load() {
  const projectId = auth.project?.id;
  if (!projectId) return;
  loading.value = true;
  error.value = "";
  try {
    const nextCatalog =
      repository.mode === "mock"
        ? demoCatalog()
        : (await scenarioAuthoringRepository.getContract(projectId)).audience;
    if (!nextCatalog)
      throw new Error(
        "Для проекта ещё не опубликован каталог условий сегментации.",
      );
    catalog.value = nextCatalog;
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить условия сегментации";
  } finally {
    loading.value = false;
  }
}

async function refreshCatalog() {
  const projectId = auth.project?.id;
  if (!projectId) throw new Error("Проект не выбран");
  const next = (await scenarioAuthoringRepository.getContract(projectId))
    .audience;
  if (!next) throw new Error("Каталог условий сегментации не опубликован");
  catalog.value = next;
  return next;
}

async function afterPublished(segmentId: string) {
  const returnTo =
    typeof route.query.returnTo === "string" &&
    route.query.returnTo.startsWith("/") &&
    !route.query.returnTo.startsWith("//")
      ? route.query.returnTo
      : "";
  await router.push(
    returnTo || { name: "segment-detail", params: { segmentId } },
  );
}
</script>

<template>
  <section class="page segments-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Аудитории пользователей</div>
        <h1>Библиотека сегментов</h1>
        <p class="subtitle">
          Создавайте переиспользуемые группы пользователей и закрепляйте нужную
          версию сегмента в сценарии.
        </p>
      </div>
      <div class="header-actions">
        <Button
          label="Сценарии"
          icon="pi pi-arrow-left"
          severity="secondary"
          text
          as="router-link"
          to="/scenarios"
        /><Button
          v-if="canManage && route.name !== 'segment-create'"
          label="Новый сегмент"
          icon="pi pi-plus"
          as="router-link"
          :to="{
            name: 'segment-create',
            query: route.query.returnTo
              ? { returnTo: route.query.returnTo }
              : {},
          }"
        />
      </div>
    </header>
    <Message severity="info" :closable="false"
      >Чтобы проверить условие, укажите одного пользователя. Lola покажет,
      подходит ли он сегменту и насколько свежие данные использовались.</Message
    >
    <Message v-if="error" severity="error" :closable="false"
      ><div class="error-row">
        <span>{{ error }}</span
        ><Button label="Повторить" size="small" text @click="load" /></div
    ></Message>
    <div v-if="loading" class="loading">
      <Skeleton height="120px" border-radius="18px" /><Skeleton
        height="320px"
        border-radius="18px"
      />
    </div>
    <SegmentManager
      v-else-if="catalog && auth.project"
      :key="`${String(route.name)}:${initialSegmentId ?? ''}:${initialSegmentRevisionId ?? ''}`"
      :project-id="auth.project.id"
      :catalog="catalog"
      :refresh-catalog="refreshCatalog"
      :readonly="!canManage"
      :demo="repository.mode === 'mock'"
      :initial-action="initialAction"
      :initial-segment-id="initialSegmentId"
      :initial-segment-revision-id="initialSegmentRevisionId"
      @published="afterPublished"
    />
  </section>
</template>

<style scoped>
.segments-page {
  max-width: 1240px;
}
.header-actions {
  display: flex;
  gap: 8px;
  flex-wrap: wrap;
}
.error-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
}
.loading {
  display: grid;
  gap: 12px;
  margin-top: 14px;
}
.segments-page :deep(.segment-manager) {
  margin-top: 14px;
  padding: 22px;
  border-color: var(--border-default);
  background: var(--surface-card);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--text-primary) 2%, transparent);
}
</style>
