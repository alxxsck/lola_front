<script setup lang="ts">
import { computed, reactive, ref, toRaw, watch } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Drawer from "primevue/drawer";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import MultiSelect from "primevue/multiselect";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import {
  emptyPolicyDraft,
  emptyQueueDraft,
  labelUnknown,
  routingPolicyLabel,
  type PolicyDraft,
  type QueueDraft,
  type QueuePredicate,
  type RoutingQueue,
  type RoutingSection,
  type WorkforceConfiguration,
} from "@/features/support-routing-control-plane/model/routing-control-plane";
import { useRoutingControlPlane } from "@/features/support-routing-control-plane/model/use-routing-control-plane";
import QueuePredicateEditor from "@/features/support-routing-control-plane/ui/QueuePredicateEditor.vue";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const permissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const permissionRevision = computed(() =>
  [...permissions.value].sort().join(","),
);
const canReadRouting = computed(
  () =>
    hasProjectPermission(permissions.value, "project.support.routing.read") ||
    hasProjectPermission(permissions.value, "project.support.routing.manage"),
);
const canReadTeams = computed(
  () =>
    hasProjectPermission(permissions.value, "project.support.teams.read") ||
    hasProjectPermission(permissions.value, "project.support.teams.manage"),
);
const canReadQueues = computed(
  () =>
    hasProjectPermission(permissions.value, "project.support.queues.read") ||
    hasProjectPermission(permissions.value, "project.support.queues.manage"),
);
const canReadAvailability = computed(() =>
  hasProjectPermission(permissions.value, "project.support.availability.read"),
);
const canRead = computed(
  () => canReadRouting.value || canReadTeams.value || canReadQueues.value,
);
const canManageRouting = computed(() =>
  hasProjectPermission(permissions.value, "project.support.routing.manage"),
);
const canManageTeams = computed(() =>
  hasProjectPermission(permissions.value, "project.support.teams.manage"),
);
const canManageQueues = computed(() =>
  hasProjectPermission(permissions.value, "project.support.queues.manage"),
);

const controller = useRoutingControlPlane({
  projectId: computed(() => auth.project?.id),
  actorId: computed(() => auth.user?.id),
  permissionRevision,
  canRead,
  canReadRouting,
  canReadTeams,
  canReadAvailability,
  canReadQueues,
  canManageRouting,
  canManageTeams,
  canManageQueues,
});

const sections: Array<{
  id: RoutingSection;
  label: string;
  route: string;
  icon: string;
}> = [
  {
    id: "overview",
    label: "Готовность",
    route: "/support/settings/routing",
    icon: "pi pi-sitemap",
  },
  {
    id: "identities",
    label: "Команды и навыки",
    route: "/support/settings/teams-skills",
    icon: "pi pi-tags",
  },
  {
    id: "workforce",
    label: "Рабочая сила",
    route: "/support/settings/workforce",
    icon: "pi pi-users",
  },
  {
    id: "queues",
    label: "Очереди",
    route: "/support/settings/queues",
    icon: "pi pi-inbox",
  },
  {
    id: "policies",
    label: "Политики",
    route: "/support/settings/routing/policies",
    icon: "pi pi-sliders-h",
  },
  {
    id: "decisions",
    label: "Решения",
    route: "/support/settings/routing/decisions",
    icon: "pi pi-search",
  },
];
const visibleSections = computed(() =>
  sections.filter((item) =>
    item.id === "identities" || item.id === "workforce"
      ? canReadTeams.value
      : item.id === "queues"
        ? canReadQueues.value
        : canReadRouting.value,
  ),
);
const section = computed<RoutingSection>(() => {
  const name = String(route.name ?? "");
  if (name.includes("teams-skills")) return "identities";
  if (name.includes("workforce")) return "workforce";
  if (name.includes("queues")) return "queues";
  if (name.includes("policies")) return "policies";
  if (name.includes("decisions")) return "decisions";
  return "overview";
});

const selectedQueueId = ref("");
const selectedPolicyId = ref("");
const identityDialog = ref<"TEAM" | "SKILL" | null>(null);
const identityEdit = ref<{
  kind: "TEAM" | "SKILL";
  id: string;
  version: number;
  name: string;
  action: "RENAME" | "ARCHIVE";
} | null>(null);
const activationDialog = ref(false);
const revisionDialog = ref<"QUEUE" | "POLICY" | "WORKFORCE" | null>(null);
const createResourceDialog = ref<"QUEUE" | "POLICY" | null>(null);
const activationMode = ref<"OFFER" | "AUTO_ASSIGN">("OFFER");
const activationReason = ref("ROUTING_CONFIGURATION_APPROVED");
const queuePreview =
  ref<Awaited<ReturnType<typeof controller.previewQueue>>>(null);
const identityForm = reactive({
  code: "",
  name: "",
  kind: "GENERAL" as "GENERAL" | "SAFETY" | "CHANNEL",
});
const resourceForm = reactive({ code: "", name: "" });
const queueDraft = ref<QueueDraft>(emptyQueueDraft());
const policyDraft = ref<PolicyDraft>(emptyPolicyDraft());
const workforceDraft = ref<WorkforceConfiguration>({
  teams: [],
  operators: [],
});
const workforceSearch = ref("");
const decisionSearch = ref("");
const bindingPriority = ref(10);
const queueBaseline = ref("");
const policyBaseline = ref("");
const workforceBaseline = ref("");
const queueEditorId = ref("");
const policyEditorId = ref("");

function plain<T>(value: T): T {
  return JSON.parse(JSON.stringify(value)) as T;
}

const snapshot = computed(() => controller.snapshot.value);
const selectedQueue = computed(
  () =>
    snapshot.value?.queues.find((item) => item.id === selectedQueueId.value) ??
    null,
);
const selectedPolicy = computed(
  () =>
    snapshot.value?.policies.find(
      (item) => item.id === selectedPolicyId.value,
    ) ?? null,
);
const readiness = computed(
  () =>
    snapshot.value?.readiness.find(
      (item) => item.queueId === selectedQueueId.value,
    ) ??
    snapshot.value?.readiness[0] ??
    null,
);
const selectedSlot = computed(
  () =>
    snapshot.value?.slots.find(
      (item) => item.queueId === selectedQueueId.value,
    ) ?? null,
);
const filteredOperators = computed(() => {
  const query = workforceSearch.value.trim().toLocaleLowerCase("ru");
  return (
    snapshot.value?.operators.filter(
      (item) => !query || item.name.toLocaleLowerCase("ru").includes(query),
    ) ?? []
  );
});
const filteredDecisions = computed(() => {
  const query = decisionSearch.value.trim().toLocaleLowerCase("ru");
  return controller.decisions.value.filter(
    (item) =>
      !query ||
      item.caseId.toLocaleLowerCase("ru").includes(query) ||
      decisionOutcome(item.outcome).toLocaleLowerCase("ru").includes(query),
  );
});
const teamOptions = computed(
  () =>
    snapshot.value?.teams
      .filter((item) => item.lifecycle === "ACTIVE")
      .map((item) => ({ label: item.name, value: item.id })) ?? [],
);
const policyOptions = computed(
  () =>
    snapshot.value?.policies
      .filter((item) => item.lifecycle === "ACTIVE" && item.published)
      .map((item) => ({ label: routingPolicyLabel(item), value: item.id })) ?? [],
);
const activationModeOptions = computed(() =>
  [
    { label: "Предложение оператору", value: "OFFER" as const },
    { label: "Автоматическое назначение", value: "AUTO_ASSIGN" as const },
  ].filter((item) => readiness.value?.allowedTargetModes.includes(item.value)),
);
function queuePredicateValid(predicate: QueuePredicate): boolean {
  if (predicate.kind === "AND" || predicate.kind === "OR") {
    return (
      predicate.children.length >= 1 &&
      predicate.children.length <= 16 &&
      predicate.children.every(queuePredicateValid)
    );
  }
  if (predicate.kind === "NOT") return queuePredicateValid(predicate.child);
  if (predicate.kind === "ENUM_IN" || predicate.kind === "ID_IN") {
    return predicate.values.length >= 1 && predicate.values.length <= 50;
  }
  if (predicate.kind === "TIME_RANGE") {
    if (!predicate.from && !predicate.to) return false;
    const from = predicate.from ? Date.parse(predicate.from) : null;
    const to = predicate.to ? Date.parse(predicate.to) : null;
    return (
      (from === null || Number.isFinite(from)) &&
      (to === null || Number.isFinite(to)) &&
      (from === null || to === null || from <= to)
    );
  }
  if (predicate.kind === "RELATIVE_WINDOW")
    return (
      Number.isInteger(predicate.days) &&
      predicate.days >= 1 &&
      predicate.days <= 366
    );
  return true;
}
const queueValid = computed(
  () =>
    queueDraft.value.displayName.trim().length >= 2 &&
    (queueDraft.value.routing.mode === "MANUAL" ||
      queueDraft.value.routing.primaryTeamIds.length > 0) &&
    queuePredicateValid(queueDraft.value.filter.predicate),
);
const policyValid = computed(
  () =>
    policyDraft.value.retry.maxAttempts >= 1 &&
    policyDraft.value.retry.maxAttempts <= 5 &&
    Object.values(policyDraft.value.weights).every(
      (value) => value >= 0 && value <= 100,
    ) &&
    Object.values(policyDraft.value.queueWeights).every(
      (value) => value >= 0 && value <= 100,
    ),
);
const skillOptions = computed(
  () =>
    snapshot.value?.skills
      .filter((item) => item.lifecycle === "ACTIVE")
      .map((item) => ({ label: item.name, value: item.id })) ?? [],
);

watch(
  snapshot,
  (value) => {
    if (!value) {
      selectedQueueId.value = "";
      selectedPolicyId.value = "";
      queuePreview.value = null;
      queueEditorId.value = "";
      policyEditorId.value = "";
      queueDraft.value = emptyQueueDraft();
      policyDraft.value = emptyPolicyDraft();
      workforceDraft.value = { teams: [], operators: [] };
      queueBaseline.value = "";
      policyBaseline.value = "";
      workforceBaseline.value = "";
      return;
    }
    if (!selectedQueueId.value)
      selectedQueueId.value = value.queues[0]?.id ?? "";
    if (!selectedPolicyId.value)
      selectedPolicyId.value = value.policies[0]?.id ?? "";
    const workforceDirty =
      Boolean(workforceBaseline.value) &&
      workforceBaseline.value !== JSON.stringify(toRaw(workforceDraft.value));
    if (!workforceDirty) {
      workforceDraft.value = structuredClone(
        value.workforce.draft?.configuration ??
          value.workforce.published?.configuration ?? {
            teams: [],
            operators: [],
          },
      );
      workforceBaseline.value = JSON.stringify(toRaw(workforceDraft.value));
    }
  },
  { immediate: true },
);
watch(
  selectedQueue,
  (value) => {
    if (value) {
      const sameEditor = queueEditorId.value === value.id;
      const dirty =
        sameEditor &&
        Boolean(queueBaseline.value) &&
        queueBaseline.value !== JSON.stringify(toRaw(queueDraft.value));
      if (!dirty) {
        queueEditorId.value = value.id;
        queueDraft.value = structuredClone(
          value.draft?.configuration ?? emptyQueueDraft(value.name),
        );
        queueBaseline.value = JSON.stringify(toRaw(queueDraft.value));
      }
    }
  },
  { immediate: true },
);
watch(
  selectedPolicy,
  (value) => {
    if (value) {
      const sameEditor = policyEditorId.value === value.id;
      const dirty =
        sameEditor &&
        Boolean(policyBaseline.value) &&
        policyBaseline.value !== JSON.stringify(toRaw(policyDraft.value));
      if (!dirty) {
        policyEditorId.value = value.id;
        policyDraft.value = structuredClone(
          value.draft?.configuration ??
            value.published?.configuration ??
            emptyPolicyDraft(),
        );
        policyBaseline.value = JSON.stringify(toRaw(policyDraft.value));
      }
    }
  },
  { immediate: true },
);
watch(
  selectedSlot,
  (value) => {
    bindingPriority.value = value?.routePriority ?? 10;
  },
  { immediate: true },
);
watch(
  () => queueDraft.value.routing.mode,
  (mode) => {
    if (mode === "MANUAL") {
      queueDraft.value.routing.primaryTeamIds = [];
      queueDraft.value.routing.fallbackTeamIds = [];
    }
  },
);
watch(
  [section, selectedQueueId, () => selectedQueue.value?.detailLoaded],
  ([nextSection, id, detailLoaded]) => {
    if (nextSection === "queues" && id && !detailLoaded)
      void controller.hydrateQueue(id);
  },
  { immediate: true },
);
watch(
  [section, selectedPolicyId, () => selectedPolicy.value?.detailLoaded],
  ([nextSection, id, detailLoaded]) => {
    if (nextSection === "policies" && id && !detailLoaded)
      void controller.hydratePolicy(id);
  },
  { immediate: true },
);

const hasLocalChanges = computed(
  () =>
    (section.value === "queues" &&
      queueBaseline.value !== JSON.stringify(toRaw(queueDraft.value))) ||
    (section.value === "policies" &&
      policyBaseline.value !== JSON.stringify(toRaw(policyDraft.value))) ||
    (section.value === "workforce" &&
      workforceBaseline.value !== JSON.stringify(toRaw(workforceDraft.value))),
);
onBeforeRouteLeave(
  () =>
    !hasLocalChanges.value ||
    window.confirm(
      "Есть несохранённые изменения. Покинуть раздел без сохранения?",
    ),
);

function queueLabel(queue: RoutingQueue): string {
  return queue.name || queue.code;
}
function teamName(id: string | null): string {
  return (
    snapshot.value?.teams.find((item) => item.id === id)?.name ??
    (id ? "Неизвестная команда" : "Не выбрана")
  );
}
function operatorName(id: string | null): string {
  return (
    snapshot.value?.operators.find((item) => item.id === id)?.name ??
    (id ? "Недоступный оператор" : "Не назначен")
  );
}
function queueName(id: string | null): string {
  return (
    snapshot.value?.queues.find((item) => item.id === id)?.name ??
    (id ? "Неизвестная очередь" : "Без очереди")
  );
}
function modeLabel(mode: string): string {
  return labelUnknown(mode, {
    MANUAL: "Ручное распределение",
    OFFER: "Предложение оператору",
    AUTO_ASSIGN: "Автоматическое назначение",
    DISABLED: "Выключено",
  });
}
function decisionOutcome(value: string): string {
  return labelUnknown(value, {
    SELECTED: "Оператор выбран",
    NO_ELIGIBLE_OPERATOR: "Нет подходящего оператора",
    NO_QUEUE: "Очередь не найдена",
    SKIPPED: "Пропущено",
    FAILED: "Ошибка расчёта",
  });
}
function checkLabel(code: string): string {
  return labelUnknown(code, {
    WORKFORCE_PUBLISHED: "Рабочая сила опубликована",
    QUEUE_PUBLISHED: "Очередь опубликована",
    POLICY_PUBLISHED: "Политика опубликована",
    QUEUE_SLOT_CONFIGURED: "Очередь связана с политикой",
    CANDIDATE_SET_AVAILABLE: "Есть подходящие операторы",
    SLOT_MISSING: "Очередь не связана с политикой",
    QUEUE_NOT_ACTIVE: "Очередь неактивна",
    QUEUE_NOT_PUBLISHED: "Нет опубликованной очереди",
    QUEUE_GENERATION_MISSING: "Выборка очереди ещё не построена",
    QUEUE_GENERATION_BUILDING: "Выборка очереди строится",
    QUEUE_GENERATION_DEGRADED: "Выборка очереди работает с ограничениями",
    POLICY_NOT_ACTIVE: "Политика неактивна",
    POLICY_NOT_PUBLISHED: "Нет опубликованной политики",
    WORKFORCE_NOT_PUBLISHED: "Рабочая сила не опубликована",
    QUEUE_MODE_INCOMPATIBLE: "Режим очереди несовместим",
    ALGORITHM_REVISION_UNSUPPORTED: "Версия алгоритма не поддерживается",
    WORKFORCE_TEAM_REFERENCE_MISSING: "Команда отсутствует в рабочей силе",
    CANDIDATE_SET_TOO_LARGE: "Слишком много кандидатов",
  });
}
function readinessSeverity(
  value: string,
): "success" | "warn" | "danger" | "secondary" {
  return value === "READY" || value === "PASS"
    ? "success"
    : value === "DEGRADED"
      ? "warn"
      : value === "BLOCKING"
        ? "danger"
        : "secondary";
}
function formatDate(value: string | null | undefined): string {
  return value
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}

async function createIdentity(): Promise<void> {
  const ok =
    identityDialog.value === "TEAM"
      ? await controller.createTeam(
          identityForm.code.trim(),
          identityForm.name.trim(),
        )
      : await controller.createSkill(
          identityForm.code.trim(),
          identityForm.name.trim(),
          identityForm.kind,
        );
  if (ok) {
    identityDialog.value = null;
    identityForm.code = "";
    identityForm.name = "";
  }
}
async function commitIdentityEdit(): Promise<void> {
  const value = identityEdit.value;
  if (!value) return;
  const ok =
    value.action === "RENAME"
      ? await controller.renameIdentity(
          value.kind,
          value.id,
          value.name.trim(),
          value.version,
        )
      : await controller.archiveIdentity(
          value.kind,
          value.id,
          value.version,
          "Справочник больше не используется",
        );
  if (ok) identityEdit.value = null;
}
async function previewSelectedQueue(): Promise<void> {
  if (selectedQueue.value)
    queuePreview.value = await controller.previewQueue(
      selectedQueue.value.id,
      10,
    );
}
async function saveQueue(): Promise<void> {
  if (selectedQueue.value) {
    const ok = await controller.saveQueue(
      selectedQueue.value.id,
      plain(queueDraft.value),
    );
    if (ok) queueBaseline.value = JSON.stringify(toRaw(queueDraft.value));
  }
}
async function publishQueue(): Promise<void> {
  if (selectedQueue.value)
    await controller.publishQueue(selectedQueue.value.id);
}
async function savePolicy(): Promise<void> {
  if (selectedPolicy.value) {
    const ok = await controller.savePolicy(
      selectedPolicy.value.id,
      plain(policyDraft.value),
    );
    if (ok) policyBaseline.value = JSON.stringify(toRaw(policyDraft.value));
  }
}
async function saveWorkforce(): Promise<void> {
  const ok = await controller.saveWorkforce(plain(workforceDraft.value));
  if (ok) workforceBaseline.value = JSON.stringify(toRaw(workforceDraft.value));
}
async function publishPolicy(): Promise<void> {
  if (selectedPolicy.value)
    await controller.publishPolicy(selectedPolicy.value.id);
}
async function saveBinding(): Promise<void> {
  if (selectedQueue.value && selectedPolicyId.value)
    await controller.bind(
      selectedQueue.value.id,
      selectedPolicyId.value,
      bindingPriority.value,
    );
}
async function confirmActivation(): Promise<void> {
  if (!readiness.value) return;
  const ok = await controller.activate(
    readiness.value.queueId,
    activationMode.value,
    activationReason.value,
  );
  if (ok) activationDialog.value = false;
}
function operatorConfig(id: string) {
  return workforceDraft.value.operators.find((item) => item.cmsUserId === id);
}
function operatorTeamIds(id: string): string[] {
  return workforceDraft.value.teams
    .filter((team) => team.members.includes(id))
    .map((team) => team.teamId);
}
function setOperatorTeams(id: string, teamIds: string[]): void {
  for (const team of workforceDraft.value.teams) {
    const included = teamIds.includes(team.teamId);
    if (included && !team.members.includes(id)) team.members.push(id);
    if (!included)
      team.members = team.members.filter((memberId) => memberId !== id);
  }
}
function operatorSkillIds(id: string): string[] {
  return operatorConfig(id)?.skills.map((skill) => skill.skillId) ?? [];
}
function setOperatorSkills(id: string, skillIds: string[]): void {
  const operator = operatorConfig(id);
  if (!operator) return;
  operator.skills = skillIds.map(
    (skillId) =>
      operator.skills.find((skill) => skill.skillId === skillId) ?? {
        skillId,
        proficiency: 1,
        preferred: false,
      },
  );
}
function moveFallback(index: number, direction: -1 | 1): void {
  const values = queueDraft.value.routing.fallbackTeamIds;
  const target = index + direction;
  if (target < 0 || target >= values.length) return;
  [values[index], values[target]] = [values[target]!, values[index]!];
}
async function moveSelectedQueue(delta: number): Promise<void> {
  if (!selectedQueue.value || !selectedPolicyId.value) return;
  bindingPriority.value = Math.max(1, bindingPriority.value + delta);
  await saveBinding();
}
async function deactivate(): Promise<void> {
  if (!readiness.value?.activation) return;
  await controller.activate(
    readiness.value.queueId,
    "DISABLED",
    "ROUTING_DISABLED_BY_OPERATOR",
  );
}
function scoreLabel(code: string): string {
  return labelUnknown(code, {
    skill: "Навыки",
    language: "Язык",
    load: "Свободная ёмкость",
    continuity: "Продолжение диалога",
    idle: "Время без назначения",
    total: "Итог",
  });
}
async function openRevisions(
  kind: "QUEUE" | "POLICY" | "WORKFORCE",
): Promise<void> {
  const resourceId =
    kind === "QUEUE"
      ? selectedQueue.value?.id
      : kind === "POLICY"
        ? selectedPolicy.value?.id
        : undefined;
  revisionDialog.value = kind;
  await controller.loadRevisions(kind, resourceId);
  await controller.loadAudit(
    kind === "QUEUE"
      ? "SUPPORT_QUEUE"
      : kind === "POLICY"
        ? "SUPPORT_ROUTING_POLICY"
        : "SUPPORT_WORKFORCE",
    resourceId ?? auth.project?.id ?? "workforce",
  );
}
async function createResource(): Promise<void> {
  const ok =
    createResourceDialog.value === "QUEUE"
      ? await controller.createQueue(resourceForm.code.trim(), {
          ...emptyQueueDraft(resourceForm.name.trim()),
          routing: {
            mode: "MANUAL",
            primaryTeamIds: [],
            fallbackTeamIds: [],
          },
        })
      : await controller.createPolicy(
          resourceForm.code.trim(),
          emptyPolicyDraft(),
        );
  if (ok) {
    createResourceDialog.value = null;
    resourceForm.code = "";
    resourceForm.name = "";
  }
}
async function restoreSelectedRevision(revisionId: string): Promise<void> {
  if (!revisionDialog.value) return;
  const resourceId =
    revisionDialog.value === "QUEUE"
      ? selectedQueue.value?.id
      : revisionDialog.value === "POLICY"
        ? selectedPolicy.value?.id
        : undefined;
  const ok = await controller.restoreRevision(
    revisionDialog.value,
    revisionId,
    resourceId,
  );
  if (ok) revisionDialog.value = null;
}
</script>

<template>
  <main class="routing-page">
    <header class="routing-header">
      <div>
        <span class="routing-eyebrow">Настройки поддержки</span>
        <h1>Маршрутизация обращений</h1>
        <p>
          Настройте команды, очереди и правила назначения — от черновика до
          объяснимого решения.
        </p>
      </div>
      <div class="routing-header__actions">
        <Tag
          v-if="snapshot"
          :severity="controller.hasBlockingReadiness.value ? 'warn' : 'success'"
          :value="
            controller.hasBlockingReadiness.value
              ? 'Требует внимания'
              : 'Готово к работе'
          "
          rounded
        />
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="controller.loading.value"
          @click="controller.reload"
        />
      </div>
    </header>

    <nav class="routing-tabs" aria-label="Разделы маршрутизации">
      <button
        v-for="item in visibleSections"
        :key="item.id"
        type="button"
        :class="['routing-tab', { 'routing-tab--active': section === item.id }]"
        :aria-current="section === item.id ? 'page' : undefined"
        @click="router.push(item.route)"
      >
        <i :class="item.icon" aria-hidden="true" /><span>{{ item.label }}</span>
      </button>
    </nav>

    <Message
      v-if="controller.error.value"
      severity="error"
      :closable="true"
      @close="controller.error.value = null"
      >{{ controller.error.value }}</Message
    >
    <div class="sr-only" aria-live="polite">
      {{ controller.announcement.value }}
    </div>

    <section
      v-if="controller.loading.value && !snapshot"
      class="routing-loading"
      aria-label="Загрузка маршрутизации"
    >
      <Skeleton height="5rem" /><Skeleton height="22rem" />
    </section>
    <Message v-else-if="!canRead" severity="warn"
      >Недостаточно прав для просмотра маршрутизации.</Message
    >

    <template v-else-if="snapshot">
      <Message
        v-if="snapshot.readinessTruncated || snapshot.activationsTruncated"
        severity="warn"
        :closable="false"
      >
        Сервер вернул только часть состояний готовности. Очереди без состояния
        помечены как «не загружено»; включение для них недоступно.
      </Message>
      <section
        v-if="section === 'overview'"
        class="routing-workbench routing-workbench--overview"
      >
        <aside class="routing-catalog">
          <div class="panel-heading">
            <div>
              <h2>Очереди</h2>
              <p>Состояние каждой линии назначения</p>
            </div>
          </div>
          <button
            v-for="queue in snapshot.queues"
            :key="queue.id"
            type="button"
            :class="[
              'catalog-row',
              { 'catalog-row--selected': selectedQueueId === queue.id },
            ]"
            @click="selectedQueueId = queue.id"
          >
            <span
              class="status-dot"
              :data-status="
                snapshot.readiness.find((item) => item.queueId === queue.id)
                  ?.status ?? 'UNKNOWN'
              "
            />
            <span
              ><strong>{{ queueLabel(queue) }}</strong
              ><small>{{
                modeLabel(
                  snapshot.readiness.find((item) => item.queueId === queue.id)
                    ?.activation?.mode ?? "UNKNOWN",
                )
              }}</small></span
            >
            <i class="pi pi-angle-right" aria-hidden="true" />
          </button>
          <Button
            v-if="snapshot.catalogCursors.queues"
            label="Показать ещё очереди"
            text
            icon="pi pi-angle-down"
            @click="controller.loadMoreCatalog('queues')"
          />
        </aside>

        <div class="routing-surface">
          <div class="surface-title">
            <div>
              <span class="routing-eyebrow">Шкала готовности</span>
              <h2>{{ queueName(readiness?.queueId ?? null) }}</h2>
            </div>
            <Tag
              v-if="readiness"
              :severity="readinessSeverity(readiness.status)"
              :value="
                readiness.status === 'READY'
                  ? 'Готово'
                  : readiness.status === 'DEGRADED'
                    ? 'Работает с ограничениями'
                    : 'Заблокировано'
              "
            />
          </div>

          <ol v-if="readiness" class="readiness-rail">
            <li
              v-for="check in readiness.checks"
              :key="check.code"
              :class="`readiness-step readiness-step--${check.status.toLowerCase()}`"
            >
              <span class="readiness-step__mark"
                ><i
                  :class="
                    check.status === 'PASS'
                      ? 'pi pi-check'
                      : check.status === 'DEGRADED'
                        ? 'pi pi-exclamation-triangle'
                        : 'pi pi-lock'
                  "
              /></span>
              <div>
                <strong>{{ checkLabel(check.code) }}</strong
                ><small>{{
                  check.status === "PASS"
                    ? "Проверено сервером"
                    : "Откройте связанный раздел и устраните причину"
                }}</small>
              </div>
              <Button
                v-if="check.status !== 'PASS'"
                label="Исправить"
                size="small"
                text
                @click="
                  router.push(
                    check.code.includes('WORKFORCE')
                      ? '/support/settings/workforce'
                      : check.code.includes('POLICY')
                        ? '/support/settings/routing/policies'
                        : '/support/settings/queues',
                  )
                "
              />
            </li>
            <li
              class="readiness-step"
              :class="
                readiness.activation
                  ? 'readiness-step--pass'
                  : 'readiness-step--pending'
              "
            >
              <span class="readiness-step__mark"
                ><i
                  :class="readiness.activation ? 'pi pi-bolt' : 'pi pi-circle'"
              /></span>
              <div>
                <strong>Включение</strong
                ><small>{{
                  readiness.activation
                    ? `${modeLabel(readiness.activation.mode)} · ${formatDate(readiness.activation.activatedAt)}`
                    : "Режим назначения ещё не включён"
                }}</small>
              </div>
            </li>
          </ol>

          <div class="routing-summary-strip">
            <div>
              <span>Подходящих операторов</span
              ><strong>{{ readiness?.candidateCount ?? "—" }}</strong>
            </div>
            <div>
              <span>Политика</span
              ><strong>{{
                routingPolicyLabel(
                  snapshot.policies.find(
                    (item) => item.id === selectedSlot?.policyId,
                  ) ?? snapshot.policies[0],
                )
              }}</strong>
            </div>
            <div>
              <span>Приоритет</span
              ><strong>{{ selectedSlot?.routePriority ?? "Не задан" }}</strong>
            </div>
          </div>

          <div v-if="canManageRouting" class="surface-actions">
            <Button
              label="Проверочный запуск"
              icon="pi pi-play"
              severity="secondary"
              outlined
              :disabled="!canManageRouting"
              :loading="controller.saving.value"
              @click="controller.runShadow(50)"
            />
            <Button
              v-if="readiness?.activation"
              label="Выключить назначение"
              icon="pi pi-stop-circle"
              severity="secondary"
              outlined
              :disabled="!canManageRouting"
              @click="deactivate"
            />
            <Button
              label="Включить назначение"
              icon="pi pi-bolt"
              :disabled="!canManageRouting || readiness?.status !== 'READY'"
              @click="activationDialog = true"
            />
          </div>
          <div
            v-if="controller.shadowRun.value"
            class="shadow-result"
            role="status"
          >
            <i
              :class="
                controller.shadowRun.value.state === 'QUEUED' ||
                controller.shadowRun.value.state === 'RUNNING'
                  ? 'pi pi-spin pi-spinner'
                  : 'pi pi-check-circle'
              "
            />
            <div>
              <strong>{{
                controller.shadowRun.value.state === "QUEUED" ||
                controller.shadowRun.value.state === "RUNNING"
                  ? "Проверочный запуск выполняется"
                  : "Проверочный запуск завершён"
              }}</strong
              ><span
                >{{ controller.shadowDecisionIds.value.length }} решений связаны
                с запуском {{ controller.shadowRun.value.id.slice(-8) }}</span
              >
              <button
                v-for="decisionId in controller.shadowDecisionIds.value.slice(
                  0,
                  5,
                )"
                :key="decisionId"
                type="button"
                class="shadow-decision-link"
                @click="controller.inspectDecision(decisionId)"
              >
                Открыть решение {{ decisionId.slice(-6) }}
              </button>
            </div>
          </div>
        </div>
      </section>

      <section v-else-if="section === 'identities'" class="routing-surface">
        <div class="surface-title">
          <div>
            <span class="routing-eyebrow">Справочники</span>
            <h2>Команды и навыки</h2>
            <p>Архивирование сохраняет ссылки в опубликованных версиях.</p>
          </div>
          <div v-if="canManageTeams" class="surface-title__actions">
            <Button
              label="Новая команда"
              icon="pi pi-plus"
              :disabled="!canManageTeams"
              @click="identityDialog = 'TEAM'"
            /><Button
              label="Новый навык"
              icon="pi pi-plus"
              severity="secondary"
              outlined
              :disabled="!canManageTeams"
              @click="identityDialog = 'SKILL'"
            />
          </div>
        </div>
        <div class="identity-columns">
          <section>
            <h3>
              Команды <span>{{ snapshot.teams.length }}</span>
            </h3>
            <div class="identity-list">
              <article
                v-for="team in snapshot.teams"
                :key="team.id"
                class="identity-row"
              >
                <span class="identity-icon"><i class="pi pi-users" /></span>
                <div>
                  <strong>{{ team.name }}</strong
                  ><small
                    >{{ team.code }} ·
                    {{
                      snapshot.operators.filter((operator) =>
                        operator.teamIds.includes(team.id),
                      ).length
                    }}
                    операторов</small
                  >
                </div>
                <div class="identity-actions">
                  <Tag
                    :severity="
                      team.lifecycle === 'ACTIVE' ? 'success' : 'secondary'
                    "
                    :value="
                      team.lifecycle === 'ACTIVE' ? 'Работает' : 'В архиве'
                    "
                  /><Button
                    v-if="canManageTeams && team.lifecycle === 'ACTIVE'"
                    icon="pi pi-pencil"
                    text
                    rounded
                    aria-label="Переименовать команду"
                    @click="
                      identityEdit = {
                        kind: 'TEAM',
                        id: team.id,
                        version: team.version,
                        name: team.name,
                        action: 'RENAME',
                      }
                    "
                  /><Button
                    v-if="canManageTeams && team.lifecycle === 'ACTIVE'"
                    icon="pi pi-archive"
                    text
                    rounded
                    severity="secondary"
                    aria-label="Архивировать команду"
                    @click="
                      identityEdit = {
                        kind: 'TEAM',
                        id: team.id,
                        version: team.version,
                        name: team.name,
                        action: 'ARCHIVE',
                      }
                    "
                  />
                </div>
              </article>
            </div>
            <Button
              v-if="snapshot.catalogCursors.teams"
              label="Показать ещё команды"
              text
              icon="pi pi-angle-down"
              @click="controller.loadMoreCatalog('teams')"
            />
          </section>
          <section>
            <h3>
              Навыки <span>{{ snapshot.skills.length }}</span>
            </h3>
            <div class="identity-list">
              <article
                v-for="skill in snapshot.skills"
                :key="skill.id"
                class="identity-row"
              >
                <span class="identity-icon"><i class="pi pi-sparkles" /></span>
                <div>
                  <strong>{{ skill.name }}</strong
                  ><small
                    >{{ skill.code }} ·
                    {{
                      skill.kind === "SAFETY"
                        ? "Безопасность"
                        : skill.kind === "CHANNEL"
                          ? "Канал связи"
                          : "Общий"
                    }}</small
                  >
                </div>
                <div class="identity-actions">
                  <Tag
                    :severity="
                      skill.lifecycle === 'ACTIVE' ? 'success' : 'secondary'
                    "
                    :value="
                      skill.lifecycle === 'ACTIVE' ? 'Работает' : 'В архиве'
                    "
                  /><Button
                    v-if="canManageTeams && skill.lifecycle === 'ACTIVE'"
                    icon="pi pi-pencil"
                    text
                    rounded
                    aria-label="Переименовать навык"
                    @click="
                      identityEdit = {
                        kind: 'SKILL',
                        id: skill.id,
                        version: skill.version,
                        name: skill.name,
                        action: 'RENAME',
                      }
                    "
                  /><Button
                    v-if="canManageTeams && skill.lifecycle === 'ACTIVE'"
                    icon="pi pi-archive"
                    text
                    rounded
                    severity="secondary"
                    aria-label="Архивировать навык"
                    @click="
                      identityEdit = {
                        kind: 'SKILL',
                        id: skill.id,
                        version: skill.version,
                        name: skill.name,
                        action: 'ARCHIVE',
                      }
                    "
                  />
                </div>
              </article>
            </div>
            <Button
              v-if="snapshot.catalogCursors.skills"
              label="Показать ещё навыки"
              text
              icon="pi pi-angle-down"
              @click="controller.loadMoreCatalog('skills')"
            />
          </section>
        </div>
      </section>

      <section v-else-if="section === 'workforce'" class="routing-surface">
        <div class="surface-title">
          <div>
            <span class="routing-eyebrow">Рабочая сила</span>
            <h2>Покрытие и ёмкость</h2>
            <p>Настроенная ёмкость и текущая доступность показаны отдельно.</p>
          </div>
          <div v-if="canManageTeams" class="surface-title__actions">
            <Tag
              v-if="hasLocalChanges"
              severity="info"
              value="Изменения только в браузере"
            /><Tag
              :severity="snapshot.workforce.draft ? 'warn' : 'success'"
              :value="
                snapshot.workforce.draft
                  ? 'Черновик сохранён'
                  : `Версия ${snapshot.workforce.currentRevisionNumber} опубликована`
              "
            /><Button
              label="История"
              icon="pi pi-history"
              severity="secondary"
              text
              @click="openRevisions('WORKFORCE')"
            /><Button
              v-if="snapshot.workforce.draft"
              label="Отменить черновик"
              severity="secondary"
              text
              :disabled="!canManageTeams"
              @click="controller.discardWorkforce"
            /><Button
              label="Сохранить черновик"
              :disabled="!canManageTeams"
              :loading="controller.saving.value"
              @click="saveWorkforce"
            /><Button
              label="Опубликовать"
              icon="pi pi-send"
              :disabled="!canManageTeams || !snapshot.workforce.draft"
              @click="controller.publishWorkforce"
            />
          </div>
        </div>
        <div class="toolbar">
          <span class="search-field"
            ><i class="pi pi-search" /><InputText
              v-model="workforceSearch"
              placeholder="Найти оператора" /></span
          ><span class="toolbar-note"
            >{{ filteredOperators.length }} операторов ·
            {{ snapshot.teams.length }} команды</span
          >
        </div>
        <div class="workforce-table" aria-label="Настройка рабочей силы">
          <div class="workforce-row workforce-row--head">
            <span>Оператор</span><span>Команды</span><span>Навыки</span
            ><span>Ёмкость</span><span>Сейчас</span>
          </div>
          <div
            v-for="operator in filteredOperators"
            :key="operator.id"
            class="workforce-row"
          >
            <span class="operator-cell"
              ><span class="avatar-dot">{{ operator.name.slice(0, 1) }}</span
              ><span
                ><strong>{{ operator.name }}</strong
                ><small>{{
                  operator.state === "ACTIVE" ? "Активен" : "Неактивен"
                }}</small></span
              ></span
            >
            <span
              ><MultiSelect
                :model-value="operatorTeamIds(operator.id)"
                :options="teamOptions"
                option-label="label"
                option-value="value"
                display="chip"
                aria-label="Команды оператора"
                :disabled="!canManageTeams"
                @update:model-value="setOperatorTeams(operator.id, $event)"
            /></span>
            <span
              ><MultiSelect
                :model-value="operatorSkillIds(operator.id)"
                :options="skillOptions"
                option-label="label"
                option-value="value"
                display="chip"
                aria-label="Навыки оператора"
                :disabled="!canManageTeams"
                @update:model-value="setOperatorSkills(operator.id, $event)"
            /></span>
            <span
              ><template v-if="operatorConfig(operator.id)"
                ><label :for="`capacity-${operator.id}`" class="sr-only"
                  >Ёмкость оператора {{ operator.name }}</label
                ><InputNumber
                  :input-id="`capacity-${operator.id}`"
                  v-model="operatorConfig(operator.id)!.maxCapacityUnits"
                  :min="1"
                  :max="100"
                  show-buttons
                  input-class="capacity-input"
                  :disabled="!canManageTeams" /></template
              ><strong v-else>{{ operator.maxCapacityUnits }}</strong></span
            >
            <span
              ><Tag
                :severity="
                  operator.availability === 'AVAILABLE'
                    ? 'success'
                    : operator.availability === 'BUSY'
                      ? 'warn'
                      : 'secondary'
                "
                :value="
                  operator.availability === 'AVAILABLE'
                    ? 'Доступен'
                    : operator.availability === 'BUSY'
                      ? 'Занят'
                      : operator.availability === 'OFFLINE'
                        ? 'Не в сети'
                        : 'Статус недоступен'
                "
            /></span>
          </div>
        </div>
        <Button
          v-if="snapshot.catalogCursors.operators"
          label="Показать ещё операторов"
          text
          icon="pi pi-angle-down"
          @click="controller.loadMoreCatalog('operators')"
        />
      </section>

      <section v-else-if="section === 'queues'" class="routing-workbench">
        <aside class="routing-catalog">
          <div class="panel-heading">
            <div>
              <h2>Очереди</h2>
              <p>Опубликованные и черновики</p>
            </div>
            <Button
              v-if="canManageQueues"
              icon="pi pi-plus"
              rounded
              text
              aria-label="Создать очередь"
              :disabled="!canManageQueues"
              @click="createResourceDialog = 'QUEUE'"
            />
          </div>
          <button
            v-for="queue in snapshot.queues"
            :key="queue.id"
            type="button"
            :class="[
              'catalog-row',
              { 'catalog-row--selected': selectedQueueId === queue.id },
            ]"
            @click="selectedQueueId = queue.id"
          >
            <span
              ><strong>{{ queue.name }}</strong
              ><small>{{
                !queue.detailLoaded
                  ? "Откройте для подробностей"
                  : queue.draft
                    ? "Есть черновик"
                    : queue.published
                      ? `Версия ${queue.published.revisionNumber}`
                      : "Не опубликована"
              }}</small></span
            ><Tag
              :severity="
                !queue.detailLoaded
                  ? 'secondary'
                  : queue.draft
                    ? 'warn'
                    : queue.published
                      ? 'success'
                      : 'secondary'
              "
              :value="
                !queue.detailLoaded
                  ? 'Сводка'
                  : queue.draft
                    ? 'Черновик'
                    : queue.published
                      ? 'Опубликована'
                      : 'Новая'
              "
            />
          </button>
        </aside>
        <div
          v-if="selectedQueue && canManageQueues && selectedQueue.detailLoaded"
          class="routing-surface routing-editor"
        >
          <div class="surface-title">
            <div>
              <span class="routing-eyebrow">Редактор очереди</span>
              <h2>{{ selectedQueue.name }}</h2>
            </div>
            <div class="surface-title__actions">
              <Button
                label="История"
                icon="pi pi-history"
                severity="secondary"
                text
                @click="openRevisions('QUEUE')"
              /><Button
                label="Проверить выборку"
                severity="secondary"
                outlined
                @click="previewSelectedQueue"
              /><Button
                label="Сохранить"
                :disabled="!queueValid"
                @click="saveQueue"
              /><Button
                label="Опубликовать"
                icon="pi pi-send"
                :disabled="!canManageQueues || !selectedQueue.draft"
                @click="publishQueue"
              />
            </div>
          </div>
          <div class="form-grid">
            <label class="field field--wide"
              ><span>Название</span
              ><InputText
                v-model="queueDraft.displayName"
                :disabled="!canManageQueues" /></label
            ><label class="field field--wide"
              ><span>Описание</span
              ><Textarea
                v-model="queueDraft.description"
                rows="2"
                :disabled="!canManageQueues" /></label
            ><label class="field"
              ><span>Видимость</span
              ><Select
                v-model="queueDraft.visibility.kind"
                :options="[
                  { label: 'Весь проект', value: 'PROJECT' },
                  { label: 'Выбранные команды', value: 'TEAMS' },
                ]"
                option-label="label"
                option-value="value" /></label
            ><label v-if="queueDraft.visibility.kind === 'TEAMS'" class="field"
              ><span>Кому видна очередь</span
              ><MultiSelect
                v-model="queueDraft.visibility.teamIds"
                :options="teamOptions"
                option-label="label"
                option-value="value"
                display="chip" /></label
            ><label class="field"
              ><span>Режим</span
              ><Select
                v-model="queueDraft.routing.mode"
                :options="[
                  { label: 'Ручное распределение', value: 'MANUAL' },
                  { label: 'Предложение оператору', value: 'OFFER' },
                  { label: 'Автоматическое назначение', value: 'AUTO_ASSIGN' },
                ]"
                option-label="label"
                option-value="value"
                :disabled="!canManageQueues" /></label
            ><label class="field"
              ><span>Основные команды</span
              ><MultiSelect
                v-model="queueDraft.routing.primaryTeamIds"
                :options="teamOptions"
                option-label="label"
                option-value="value"
                display="chip"
                :disabled="!canManageQueues" /></label
            ><label class="field"
              ><span>Резервные команды</span
              ><MultiSelect
                v-model="queueDraft.routing.fallbackTeamIds"
                :options="teamOptions"
                option-label="label"
                option-value="value"
                display="chip"
                :disabled="!canManageQueues" /></label
            ><label class="field"
              ><span>Сортировка</span
              ><Select
                v-model="queueDraft.sort[0]!.field"
                :options="[
                  { label: 'По приоритету', value: 'EFFECTIVE_PRIORITY' },
                  { label: 'По сроку ответа', value: 'SLA_DUE_AT' },
                  { label: 'По времени ожидания', value: 'ELIGIBLE_SINCE' },
                ]"
                option-label="label"
                option-value="value"
                :disabled="!canManageQueues"
            /></label>
          </div>
          <Message v-if="!queueValid" severity="warn" :closable="false">
            Заполните название, команды и все условия очереди допустимыми
            значениями.
          </Message>
          <div
            v-if="queueDraft.routing.fallbackTeamIds.length"
            class="fallback-order"
            aria-label="Порядок резервных команд"
          >
            <span
              v-for="(teamId, index) in queueDraft.routing.fallbackTeamIds"
              :key="teamId"
            >
              <strong>{{ teamName(teamId) }}</strong>
              <Button
                icon="pi pi-arrow-up"
                text
                rounded
                :disabled="index === 0"
                aria-label="Поднять резервную команду"
                @click="moveFallback(index, -1)"
              />
              <Button
                icon="pi pi-arrow-down"
                text
                rounded
                :disabled="
                  index === queueDraft.routing.fallbackTeamIds.length - 1
                "
                aria-label="Опустить резервную команду"
                @click="moveFallback(index, 1)"
              />
            </span>
          </div>
          <section class="rule-builder">
            <div class="subheading">
              <div>
                <h3>Условия попадания</h3>
                <p>Проверяются сервером; браузер не вычисляет выборку.</p>
              </div>
            </div>
            <div class="rule-group">
              <QueuePredicateEditor
                v-model="queueDraft.filter.predicate"
                :team-options="teamOptions"
                :operator-options="
                  snapshot.operators.map((operator) => ({
                    label: operator.name,
                    value: operator.id,
                  }))
                "
              />
            </div>
          </section>
          <section class="binding-panel">
            <div>
              <span class="routing-eyebrow">Связь и порядок</span>
              <h3>Политика назначения</h3>
            </div>
            <label class="field"
              ><span>Политика</span
              ><Select
                v-model="selectedPolicyId"
                :options="policyOptions"
                option-label="label"
                option-value="value"
                :disabled="!canManageRouting" /></label
            ><label class="field"
              ><span>Приоритет маршрута</span
              ><InputNumber
                v-model="bindingPriority"
                :min="1"
                :max="10000"
                :disabled="!canManageRouting"
            /></label>
            <div class="order-actions">
              <Button
                icon="pi pi-arrow-up"
                label="Выше"
                severity="secondary"
                text
                :disabled="!canManageRouting || bindingPriority <= 1"
                @click="moveSelectedQueue(-1)"
              /><Button
                icon="pi pi-arrow-down"
                label="Ниже"
                severity="secondary"
                text
                :disabled="!canManageRouting"
                @click="moveSelectedQueue(1)"
              />
            </div>
            <Button
              label="Сохранить связь"
              severity="secondary"
              outlined
              :disabled="!canManageRouting"
              @click="saveBinding"
            />
            <Button
              v-if="snapshot.catalogCursors.slots"
              label="Загрузить остальные связи"
              text
              icon="pi pi-angle-down"
              @click="controller.loadMoreCatalog('slots')"
            />
          </section>
          <Message
            v-if="queuePreview"
            severity="success"
            :closable="true"
            @close="queuePreview = null"
            ><strong
              >Сервер нашёл
              {{
                queuePreview.exact
                  ? queuePreview.count
                  : `не менее ${queuePreview.lowerBound ?? queuePreview.count}`
              }}
              обращений.</strong
            >
            Пример:
            {{ queuePreview.caseIds.join(", ") || "нет обращений" }}. Проверено
            {{ formatDate(queuePreview.evaluatedAt) }}.<span
              v-if="queuePreview.diagnostics.length"
              class="preview-diagnostics"
              >{{ queuePreview.diagnostics.join(" · ") }}</span
            ></Message
          >
        </div>
        <div
          v-else-if="selectedQueue && !selectedQueue.detailLoaded"
          class="routing-surface"
        >
          <Skeleton height="18rem" />
        </div>
        <div v-else-if="selectedQueue" class="routing-surface">
          <span class="routing-eyebrow">Опубликованная очередь</span>
          <h2>{{ selectedQueue.name }}</h2>
          <Message severity="info" :closable="false"
            >Черновик и команды изменения скрыты: доступен только просмотр
            опубликованного состояния.</Message
          >
          <dl v-if="selectedQueue.published" class="readonly-summary">
            <div>
              <dt>Версия</dt>
              <dd>{{ selectedQueue.published.revisionNumber }}</dd>
            </div>
            <div>
              <dt>Опубликована</dt>
              <dd>{{ formatDate(selectedQueue.published.publishedAt) }}</dd>
            </div>
            <div>
              <dt>Описание</dt>
              <dd>{{ selectedQueue.description || "Нет описания" }}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section v-else-if="section === 'policies'" class="routing-workbench">
        <aside class="routing-catalog">
          <div class="panel-heading">
            <div>
              <h2>Политики</h2>
              <p>Неизменяемые опубликованные версии</p>
            </div>
            <Button
              v-if="canManageRouting"
              icon="pi pi-plus"
              rounded
              text
              aria-label="Создать политику"
              :disabled="!canManageRouting"
              @click="createResourceDialog = 'POLICY'"
            />
          </div>
          <button
            v-for="policy in snapshot.policies"
            :key="policy.id"
            type="button"
            :class="[
              'catalog-row',
              { 'catalog-row--selected': selectedPolicyId === policy.id },
            ]"
            @click="selectedPolicyId = policy.id"
          >
            <span
              ><strong>{{ routingPolicyLabel(policy) }}</strong
              ><small>{{
                policy.draft
                  ? "Отдельный черновик"
                  : policy.published
                    ? `Версия ${policy.published.revisionNumber}`
                    : "Не опубликована"
              }}</small></span
            ><i class="pi pi-angle-right" />
          </button>
        </aside>
        <div
          v-if="
            selectedPolicy && canManageRouting && selectedPolicy.detailLoaded
          "
          class="routing-surface routing-editor"
        >
          <div class="surface-title">
            <div>
              <span class="routing-eyebrow">Политика назначения</span>
              <h2>{{ routingPolicyLabel(selectedPolicy) }}</h2>
              <p>Числа сопровождаются объяснением влияния на выбор.</p>
            </div>
            <div class="surface-title__actions">
              <Button
                label="История"
                icon="pi pi-history"
                severity="secondary"
                text
                @click="openRevisions('POLICY')"
              /><Button
                label="Сохранить черновик"
                :disabled="!policyValid"
                @click="savePolicy"
              /><Button
                label="Опубликовать"
                icon="pi pi-send"
                :disabled="!canManageRouting || !selectedPolicy.draft"
                @click="publishPolicy"
              />
            </div>
          </div>
          <section class="policy-section">
            <h3>Обязательные условия</h3>
            <div class="form-grid">
              <label class="field"
                ><span>Обязательные навыки</span
                ><MultiSelect
                  v-model="policyDraft.mandatorySkills"
                  :options="skillOptions"
                  option-label="label"
                  option-value="value"
                  display="chip"
                  :disabled="!canManageRouting" /></label
              ><label class="field"
                ><span>Желаемые навыки</span
                ><MultiSelect
                  v-model="policyDraft.preferredSkills"
                  :options="skillOptions"
                  option-label="label"
                  option-value="value"
                  display="chip"
                  :disabled="!canManageRouting" /></label
              ><label class="field"
                ><span>Обязательные языки</span
                ><InputText
                  :model-value="policyDraft.mandatoryLanguages.join(', ')"
                  :disabled="!canManageRouting"
                  @update:model-value="
                    policyDraft.mandatoryLanguages = String($event)
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean)
                  " /></label
              ><label class="field"
                ><span>Желаемые языки</span
                ><InputText
                  :model-value="policyDraft.preferredLanguages.join(', ')"
                  @update:model-value="
                    policyDraft.preferredLanguages = String($event)
                      .split(',')
                      .map((item) => item.trim())
                      .filter(Boolean)
                  " /></label
              ><label class="field"
                ><span>Единиц ёмкости на назначение</span
                ><InputNumber
                  v-model="policyDraft.capacityWeightUnits"
                  :min="1"
                  :max="100" /></label
              ><label class="field"
                ><span>Предел занятости, %</span
                ><InputNumber
                  v-model="policyDraft.hardUtilizationPercent"
                  :min="1"
                  :max="100"
                  suffix=" %"
                  :disabled="!canManageRouting"
                /><small
                  >Операторы выше предела исключаются до ранжирования.</small
                ></label
              >
            </div>
          </section>
          <section class="policy-section">
            <h3>Веса выбора оператора</h3>
            <div class="weight-grid">
              <label
                v-for="(label, key) in {
                  skill: 'Навыки',
                  language: 'Язык',
                  load: 'Свободная ёмкость',
                  continuity: 'Продолжение диалога',
                  idle: 'Время без назначения',
                }"
                :key="key"
                class="field"
                ><span>{{ label }}</span
                ><InputNumber
                  v-model="
                    policyDraft.weights[key as keyof typeof policyDraft.weights]
                  "
                  :min="0"
                  :max="100"
                  :disabled="!canManageRouting"
              /></label>
            </div>
            <p class="impact-summary">
              <i class="pi pi-info-circle" /> Сейчас навыки и язык дают
              {{ policyDraft.weights.skill + policyDraft.weights.language }}%
              оценки, а загрузка — {{ policyDraft.weights.load }}%.
            </p>
          </section>
          <section class="policy-section">
            <h3>Очередь, ожидание и повторы</h3>
            <div class="weight-grid">
              <label
                v-for="(label, key) in {
                  sla: 'Риск срока',
                  priority: 'Приоритет',
                  escalation: 'Эскалация',
                  age: 'Возраст обращения',
                }"
                :key="key"
                class="field"
                ><span>{{ label }}</span
                ><InputNumber
                  v-model="
                    policyDraft.queueWeights[
                      key as keyof typeof policyDraft.queueWeights
                    ]
                  "
                  :min="0"
                  :max="100" /></label
              ><label class="field"
                ><span>Ответ на предложение, сек.</span
                ><InputNumber
                  v-model="policyDraft.timeouts.offerSeconds"
                  :min="5"
                  :max="3600"
                  :disabled="!canManageRouting" /></label
              ><label class="field"
                ><span>Бронь назначения, сек.</span
                ><InputNumber
                  v-model="policyDraft.timeouts.reservationSeconds"
                  :min="5"
                  :max="3600"
                  :disabled="!canManageRouting" /></label
              ><label class="field"
                ><span>Число попыток</span
                ><InputNumber
                  v-model="policyDraft.retry.maxAttempts"
                  :min="1"
                  :max="5"
                  show-buttons
                  :disabled="!canManageRouting"
                /><small
                  >Не более пяти — одинаково в форме и на сервере.</small
                ></label
              ><label class="field"
                ><span>Пауза между попытками, сек.</span
                ><InputNumber
                  v-model="policyDraft.retry.cooldownSeconds"
                  :min="0"
                  :max="3600"
                  :disabled="!canManageRouting" /></label
              ><label class="field"
                ><span>Задержка резерва, сек.</span
                ><InputNumber
                  v-model="policyDraft.retry.fallbackDelaySeconds"
                  :min="0"
                  :max="3600"
                  :disabled="!canManageRouting"
              /></label>
            </div>
            <Message v-if="!policyValid" severity="error" :closable="false"
              >Проверьте веса и число попыток: допустимы значения от 0 до 100,
              попыток — от 1 до 5.</Message
            >
          </section>
        </div>
        <div
          v-else-if="selectedPolicy && !selectedPolicy.detailLoaded"
          class="routing-surface"
        >
          <Skeleton height="18rem" />
        </div>
        <div v-else-if="selectedPolicy" class="routing-surface">
          <span class="routing-eyebrow">Опубликованная политика</span>
          <h2>{{ routingPolicyLabel(selectedPolicy) }}</h2>
          <Message severity="info" :closable="false"
            >Черновик и команды изменения скрыты. Показана опубликованная версия
            {{ selectedPolicy.published?.revisionNumber ?? "—" }}.</Message
          >
          <dl v-if="selectedPolicy.published" class="readonly-summary">
            <div>
              <dt>Предел занятости</dt>
              <dd>
                {{
                  selectedPolicy.published.configuration.hardUtilizationPercent
                }}%
              </dd>
            </div>
            <div>
              <dt>Число попыток</dt>
              <dd>
                {{ selectedPolicy.published.configuration.retry.maxAttempts }}
              </dd>
            </div>
            <div>
              <dt>Обязательные навыки</dt>
              <dd>
                {{
                  selectedPolicy.published.configuration.mandatorySkills.length
                }}
              </dd>
            </div>
          </dl>
        </div>
      </section>

      <section v-else class="routing-surface">
        <div class="surface-title">
          <div>
            <span class="routing-eyebrow">Объяснение решения</span>
            <h2>Решения маршрутизации</h2>
            <p>
              Результат, кандидаты и закреплённые версии из серверного
              доказательства.
            </p>
          </div>
        </div>
        <div class="toolbar">
          <span class="search-field"
            ><i class="pi pi-search" /><InputText
              v-model="decisionSearch"
              placeholder="Номер обращения или результат" /></span
          ><span class="toolbar-note"
            >{{ filteredDecisions.length }} решений</span
          >
        </div>
        <div class="decision-table" aria-label="Решения маршрутизации">
          <div class="decision-row decision-row--head">
            <span>Время</span><span>Обращение</span><span>Результат</span
            ><span>Очередь</span><span>Команда и оператор</span
            ><span>Кандидаты</span><span>Расчёт</span>
          </div>
          <button
            v-for="decision in filteredDecisions"
            :key="decision.id"
            type="button"
            class="decision-row"
            @click="controller.inspectDecision(decision.id)"
          >
            <span>{{ formatDate(decision.evaluatedAt) }}</span
            ><strong>№ {{ decision.caseId }}</strong
            ><span
              ><Tag
                :severity="decision.outcome === 'SELECTED' ? 'success' : 'warn'"
                :value="decisionOutcome(decision.outcome)" /></span
            ><span>{{ queueName(decision.queueId) }}</span
            ><span
              >{{ teamName(decision.selectedTeamId)
              }}<small>{{
                operatorName(decision.selectedOperatorId)
              }}</small></span
            ><span
              >{{ decision.candidateCount }}
              <small v-if="decision.excludedCount"
                >· исключено {{ decision.excludedCount }}</small
              ></span
            ><span
              >{{ decision.latencyMs }} мс <i class="pi pi-angle-right"
            /></span>
          </button>
        </div>
        <Button
          v-if="controller.decisionNextCursor.value"
          label="Показать ещё решения"
          text
          icon="pi pi-angle-down"
          @click="controller.loadMoreDecisions"
        />
      </section>
    </template>

    <Dialog
      :visible="Boolean(identityDialog)"
      modal
      :header="identityDialog === 'TEAM' ? 'Новая команда' : 'Новый навык'"
      :style="{ width: '32rem', maxWidth: 'calc(100vw - 32px)' }"
      @update:visible="!$event && (identityDialog = null)"
    >
      <div class="dialog-form">
        <label class="field"
          ><span>Код</span
          ><InputText
            v-model="identityForm.code"
            placeholder="priority_support" /></label
        ><label class="field"
          ><span>Название</span
          ><InputText
            v-model="identityForm.name"
            placeholder="Приоритетная поддержка" /></label
        ><label v-if="identityDialog === 'SKILL'" class="field"
          ><span>Тип навыка</span
          ><Select
            v-model="identityForm.kind"
            :options="[
              { label: 'Общий', value: 'GENERAL' },
              { label: 'Безопасность', value: 'SAFETY' },
              { label: 'Канал связи', value: 'CHANNEL' },
            ]"
            option-label="label"
            option-value="value"
        /></label>
      </div>
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="identityDialog = null" /><Button
          label="Создать"
          :disabled="
            identityForm.code.trim().length < 2 ||
            identityForm.name.trim().length < 2
          "
          :loading="controller.saving.value"
          @click="createIdentity"
      /></template>
    </Dialog>

    <Dialog
      :visible="Boolean(createResourceDialog)"
      modal
      :header="
        createResourceDialog === 'QUEUE' ? 'Новая очередь' : 'Новая политика'
      "
      :style="{ width: '32rem', maxWidth: 'calc(100vw - 32px)' }"
      @update:visible="!$event && (createResourceDialog = null)"
    >
      <div class="dialog-form">
        <label class="field"
          ><span>Код</span
          ><InputText
            v-model="resourceForm.code"
            placeholder="urgent_support" /></label
        ><label v-if="createResourceDialog === 'QUEUE'" class="field"
          ><span>Название</span
          ><InputText
            v-model="resourceForm.name"
            placeholder="Срочные обращения" /></label
        ><Message severity="info" :closable="false"
          >Будет создан отдельный серверный черновик. Публикация выполняется
          следующим действием.</Message
        >
      </div>
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="createResourceDialog = null" /><Button
          label="Создать черновик"
          :disabled="
            resourceForm.code.trim().length < 2 ||
            (createResourceDialog === 'QUEUE' &&
              resourceForm.name.trim().length < 2)
          "
          :loading="controller.saving.value"
          @click="createResource"
      /></template>
    </Dialog>

    <Dialog
      :visible="Boolean(identityEdit)"
      modal
      :header="
        identityEdit?.action === 'ARCHIVE'
          ? 'Архивировать справочник'
          : 'Переименовать'
      "
      :style="{ width: '30rem', maxWidth: 'calc(100vw - 32px)' }"
      @update:visible="!$event && (identityEdit = null)"
    >
      <div v-if="identityEdit" class="dialog-form">
        <Message
          v-if="identityEdit.action === 'ARCHIVE'"
          severity="warn"
          :closable="false"
          >Справочник исчезнет из новых настроек, но сохранится в опубликованных
          версиях и журнале.</Message
        ><label v-else class="field"
          ><span>Новое название</span><InputText v-model="identityEdit.name"
        /></label>
      </div>
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="identityEdit = null" /><Button
          :label="
            identityEdit?.action === 'ARCHIVE'
              ? 'Архивировать'
              : 'Сохранить название'
          "
          :severity="identityEdit?.action === 'ARCHIVE' ? 'danger' : undefined"
          :loading="controller.saving.value"
          @click="commitIdentityEdit"
      /></template>
    </Dialog>

    <Dialog
      :visible="Boolean(revisionDialog)"
      modal
      header="История и изменения"
      :style="{ width: '46rem', maxWidth: 'calc(100vw - 32px)' }"
      @update:visible="!$event && (revisionDialog = null)"
    >
      <div class="revision-dialog">
        <Message
          v-if="controller.revisionDiff.value"
          severity="info"
          :closable="false"
          ><strong
            >Сравнение версий {{ controller.revisionDiff.value.fromRevision }} →
            {{ controller.revisionDiff.value.toRevision }}</strong
          ><br />{{ controller.revisionDiff.value.summary }}</Message
        >
        <div class="revision-list">
          <article
            v-for="revision in controller.revisions.value"
            :key="revision.id"
            class="revision-row"
          >
            <span class="revision-number">{{ revision.revisionNumber }}</span>
            <div>
              <strong>Версия {{ revision.revisionNumber }}</strong
              ><small
                >{{ revision.publisherName }} ·
                {{ formatDate(revision.publishedAt) }}</small
              >
            </div>
            <Button
              label="Восстановить как черновик"
              severity="secondary"
              outlined
              size="small"
              :disabled="
                revision.revisionNumber ===
                controller.revisions.value[0]?.revisionNumber
              "
              @click="restoreSelectedRevision(revision.id)"
            />
          </article>
        </div>
        <section
          v-if="controller.auditEvents.value.length"
          class="audit-section"
        >
          <h3>Журнал ресурса</h3>
          <article
            v-for="event in controller.auditEvents.value"
            :key="event.id"
            class="audit-row"
          >
            <span
              ><strong>{{ event.actorName }}</strong
              ><small>{{ formatDate(event.occurredAt) }}</small></span
            ><span>{{
              event.reason ?? event.reasonCode ?? event.eventType
            }}</span
            ><Tag
              :severity="event.outcome === 'APPLIED' ? 'success' : 'warn'"
              :value="event.outcome === 'APPLIED' ? 'Выполнено' : event.outcome"
            />
          </article>
        </section>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="activationDialog"
      modal
      header="Включить назначение"
      :style="{ width: '38rem', maxWidth: 'calc(100vw - 32px)' }"
    >
      <div class="activation-confirm">
        <Message severity="warn" :closable="false"
          >Режим будет закреплён за опубликованными версиями очереди, политики и
          рабочей силы. Новые публикации не заменят их автоматически.</Message
        >
        <div class="pin-list">
          <span
            ><i class="pi pi-inbox" /><strong>{{
              queueName(readiness?.queueId ?? null)
            }}</strong
            ><small>Очередь</small></span
          ><span
            ><i class="pi pi-sliders-h" /><strong>{{
              routingPolicyLabel(
                snapshot?.policies.find(
                  (item) => item.id === selectedSlot?.policyId,
                ) ?? snapshot?.policies[0],
              )
            }}</strong
            ><small>Политика</small></span
          ><span
            ><i class="pi pi-users" /><strong
              >Версия {{ snapshot?.workforce.currentRevisionNumber }}</strong
            ><small>Рабочая сила</small></span
          >
        </div>
        <label class="field"
          ><span>Целевой режим</span
          ><Select
            v-model="activationMode"
            :options="activationModeOptions"
            option-label="label"
            option-value="value" /></label
        ><label class="field"
          ><span>Причина</span><InputText v-model="activationReason"
        /></label>
      </div>
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="activationDialog = false" /><Button
          :label="
            activationMode === 'AUTO_ASSIGN'
              ? 'Подтвердить автоназначение'
              : 'Включить предложения'
          "
          icon="pi pi-bolt"
          :disabled="
            !activationModeOptions.some((item) => item.value === activationMode)
          "
          :loading="controller.saving.value"
          @click="confirmActivation"
      /></template>
    </Dialog>

    <Drawer
      :visible="Boolean(controller.selectedDecision.value)"
      position="right"
      header="Объяснение решения"
      class="decision-drawer"
      @update:visible="!$event && controller.closeDecision()"
    >
      <article v-if="controller.selectedDecision.value" class="decision-detail">
        <div class="decision-hero">
          <span class="routing-eyebrow"
            >Обращение № {{ controller.selectedDecision.value.caseId }}</span
          >
          <h2>
            {{ decisionOutcome(controller.selectedDecision.value.outcome) }}
          </h2>
          <p>
            {{ formatDate(controller.selectedDecision.value.evaluatedAt) }} ·
            {{ controller.selectedDecision.value.latencyMs }} мс
          </p>
          <RouterLink
            :to="{
              name: 'support-inbox-case',
              params: { caseId: controller.selectedDecision.value.caseId },
            }"
            >Открыть обращение</RouterLink
          >
        </div>
        <section>
          <h3>Выбранный маршрут</h3>
          <dl>
            <div>
              <dt>Очередь</dt>
              <dd>
                {{ queueName(controller.selectedDecision.value.queueId) }}
              </dd>
            </div>
            <div>
              <dt>Команда</dt>
              <dd>
                {{ teamName(controller.selectedDecision.value.selectedTeamId) }}
              </dd>
            </div>
            <div>
              <dt>Оператор</dt>
              <dd>
                {{
                  operatorName(
                    controller.selectedDecision.value.selectedOperatorId,
                  )
                }}
              </dd>
            </div>
          </dl>
        </section>
        <section>
          <h3>Кандидаты</h3>
          <article
            v-for="candidate in controller.selectedDecision.value.candidates"
            :key="candidate.operatorId"
            class="candidate-row"
          >
            <span class="candidate-rank">{{ candidate.rank }}</span>
            <div>
              <strong>{{ operatorName(candidate.operatorId) }}</strong
              ><small v-if="candidate.exclusions.length"
                >Исключён:
                {{
                  candidate.exclusions
                    .map((value) =>
                      labelUnknown(value, {
                        CAPACITY_EXHAUSTED: "нет свободной ёмкости",
                        AVAILABILITY_NOT_ROUTABLE: "оператор недоступен",
                      }),
                    )
                    .join(", ")
                }}</small
              ><small v-else
                >Итоговая оценка {{ candidate.score.total ?? 0 }}</small
              ><span v-if="candidate.eligible" class="score-breakdown"
                ><span v-for="(score, code) in candidate.score" :key="code"
                  >{{ scoreLabel(String(code)) }} {{ score }}</span
                ></span
              ><small
                >Версии фактов:
                {{
                  Object.entries(candidate.factVersions)
                    .map(([key, value]) => `${key} ${value}`)
                    .join(" · ")
                }}</small
              >
            </div>
            <Tag
              :severity="candidate.eligible ? 'success' : 'secondary'"
              :value="candidate.eligible ? 'Подходит' : 'Исключён'"
            />
          </article>
        </section>
        <section>
          <h3>Закреплённые версии</h3>
          <dl>
            <div>
              <dt>Очередь</dt>
              <dd>
                …{{
                  controller.selectedDecision.value.pins.queueRevisionId?.slice(
                    -8,
                  )
                }}
              </dd>
            </div>
            <div>
              <dt>Политика</dt>
              <dd>
                …{{
                  controller.selectedDecision.value.pins.policyRevisionId?.slice(
                    -8,
                  )
                }}
              </dd>
            </div>
            <div>
              <dt>Рабочая сила</dt>
              <dd>
                …{{
                  controller.selectedDecision.value.pins.workforceRevisionId?.slice(
                    -8,
                  )
                }}
              </dd>
            </div>
          </dl>
        </section>
        <section>
          <h3>Путь расчёта</h3>
          <dl>
            <div
              v-for="(value, key) in controller.selectedDecision.value
                .inputManifest"
              :key="String(key)"
            >
              <dt>{{ String(key) }}</dt>
              <dd>
                {{ typeof value === "object" ? JSON.stringify(value) : value }}
              </dd>
            </div>
          </dl>
        </section>
        <section>
          <h3>Версии исходных данных</h3>
          <dl>
            <div
              v-for="(value, key) in controller.selectedDecision.value
                .sourceVector"
              :key="String(key)"
            >
              <dt>{{ String(key) }}</dt>
              <dd>
                {{ typeof value === "object" ? JSON.stringify(value) : value }}
              </dd>
            </div>
          </dl>
        </section>
      </article>
    </Drawer>
  </main>
</template>

<style scoped>
.routing-page {
  box-sizing: border-box;
  width: 100%;
  max-width: 1500px;
  margin: 0 auto;
  padding: 24px;
  overflow-x: clip;
  color: var(--text-primary);
}
.routing-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}
.routing-header h1 {
  margin: 4px 0 6px;
  font-size: clamp(1.55rem, 2vw, 2.1rem);
  line-height: 1.1;
  letter-spacing: -0.025em;
}
.routing-header p,
.surface-title p,
.panel-heading p,
.subheading p {
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.82rem;
  line-height: 1.5;
}
.routing-eyebrow {
  color: var(--text-tertiary);
  font-size: 0.68rem;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.routing-header__actions,
.surface-title__actions,
.surface-actions {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}
.routing-tabs {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  display: flex;
  gap: 4px;
  padding: 4px;
  margin-bottom: 16px;
  overflow-x: auto;
  border: 1px solid var(--surface-border);
  border-radius: 12px;
  background: var(--surface-subtle);
  scrollbar-width: none;
}
.routing-tab {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 38px;
  padding: 0 13px;
  border: 0;
  border-radius: 9px;
  color: var(--text-secondary);
  background: transparent;
  font: inherit;
  font-size: 0.78rem;
  font-weight: 600;
  white-space: nowrap;
  cursor: pointer;
  transition:
    background 180ms ease,
    color 180ms ease,
    transform 180ms ease;
}
.routing-tab:hover {
  color: var(--text-primary);
  background: var(--surface-card);
}
.routing-tab--active {
  color: var(--text-primary);
  background: var(--surface-card);
  box-shadow: 0 1px 2px color-mix(in srgb, var(--text-primary) 8%, transparent);
}
.routing-workbench {
  display: grid;
  grid-template-columns: minmax(240px, 300px) minmax(0, 1fr);
  gap: 14px;
  align-items: start;
}
.routing-workbench--overview {
  grid-template-columns: minmax(260px, 320px) minmax(0, 1fr);
}
.routing-catalog,
.routing-surface {
  border: 1px solid var(--surface-border);
  border-radius: 14px;
  background: var(--surface-card);
}
.readonly-summary {
  display: grid;
  gap: 10px;
  margin: 18px 0 0;
}
.readonly-summary div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  padding: 10px 0;
  border-bottom: 1px solid var(--surface-border);
}
.readonly-summary dt {
  color: var(--text-secondary);
}
.readonly-summary dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}
.routing-catalog {
  position: sticky;
  top: 16px;
  overflow: hidden;
}
.routing-surface {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  padding: 20px;
  min-width: 0;
  overflow: hidden;
}
.panel-heading {
  display: flex;
  justify-content: space-between;
  padding: 17px 18px 13px;
  border-bottom: 1px solid var(--surface-border);
}
.panel-heading h2,
.surface-title h2 {
  margin: 2px 0 4px;
  font-size: 1.08rem;
}
.catalog-row {
  width: 100%;
  min-height: 66px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 11px 14px;
  border: 0;
  border-bottom: 1px solid var(--surface-border);
  color: var(--text-primary);
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.catalog-row:last-child {
  border-bottom: 0;
}
.catalog-row:hover,
.catalog-row--selected {
  background: var(--surface-subtle);
}
.catalog-row--selected {
  box-shadow: inset 3px 0 var(--brand-primary);
}
.catalog-row strong,
.catalog-row small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.catalog-row strong {
  font-size: 0.82rem;
}
.catalog-row small {
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: 0.69rem;
}
.status-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: var(--status-danger);
  box-shadow: 0 0 0 3px
    color-mix(in srgb, var(--status-danger) 14%, transparent);
}
.status-dot[data-status="READY"] {
  background: var(--status-success);
  box-shadow: 0 0 0 3px
    color-mix(in srgb, var(--status-success) 14%, transparent);
}
.status-dot[data-status="DEGRADED"] {
  background: var(--status-warning);
  box-shadow: 0 0 0 3px
    color-mix(in srgb, var(--status-warning) 14%, transparent);
}
.surface-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  flex-wrap: wrap;
  gap: 18px;
  padding-bottom: 16px;
  border-bottom: 1px solid var(--surface-border);
}
.surface-title__actions {
  margin-left: auto;
  justify-content: flex-end;
}
.readiness-rail {
  list-style: none;
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(130px, 1fr));
  padding: 24px 0;
  margin: 0;
}
.readiness-step {
  position: relative;
  display: grid;
  justify-items: center;
  gap: 8px;
  padding: 0 10px;
  text-align: center;
}
.readiness-step::before {
  content: "";
  position: absolute;
  top: 15px;
  left: -50%;
  width: 100%;
  height: 1px;
  background: var(--surface-border);
}
.readiness-step:first-child::before {
  display: none;
}
.readiness-step__mark {
  z-index: 1;
  display: grid;
  place-items: center;
  width: 31px;
  height: 31px;
  border: 1px solid var(--surface-border);
  border-radius: 50%;
  color: var(--text-tertiary);
  background: var(--surface-card);
  transition:
    transform 180ms ease,
    background 180ms ease;
}
.readiness-step--pass .readiness-step__mark {
  color: var(--status-success);
  border-color: color-mix(
    in srgb,
    var(--status-success) 36%,
    var(--surface-border)
  );
  background: color-mix(
    in srgb,
    var(--status-success) 10%,
    var(--surface-card)
  );
}
.readiness-step--blocking .readiness-step__mark {
  color: var(--status-danger);
  border-color: color-mix(
    in srgb,
    var(--status-danger) 36%,
    var(--surface-border)
  );
}
.readiness-step--degraded .readiness-step__mark {
  color: var(--status-warning);
}
.readiness-step strong,
.readiness-step small {
  display: block;
}
.readiness-step strong {
  font-size: 0.73rem;
  line-height: 1.3;
}
.readiness-step small {
  margin-top: 4px;
  color: var(--text-tertiary);
  font-size: 0.63rem;
  line-height: 1.35;
}
.routing-summary-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  overflow: hidden;
  margin-bottom: 16px;
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  background: var(--surface-border);
}
.routing-summary-strip > div {
  padding: 12px 14px;
  background: var(--surface-subtle);
}
.routing-summary-strip span,
.routing-summary-strip strong {
  display: block;
}
.routing-summary-strip span {
  color: var(--text-tertiary);
  font-size: 0.66rem;
}
.routing-summary-strip strong {
  margin-top: 4px;
  font-size: 0.82rem;
}
.surface-actions {
  justify-content: flex-end;
}
.shadow-result {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-top: 14px;
  padding: 12px;
  border-radius: 10px;
  color: var(--status-success);
  background: color-mix(in srgb, var(--status-success) 8%, var(--surface-card));
}
.shadow-result strong,
.shadow-result span {
  display: block;
}
.shadow-result span {
  margin-top: 2px;
  color: var(--text-secondary);
  font-size: 0.7rem;
}
.identity-columns {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 24px;
  padding-top: 20px;
}
.identity-columns h3 {
  margin: 0 0 10px;
  font-size: 0.85rem;
}
.identity-columns h3 span {
  color: var(--text-tertiary);
  font-weight: 500;
}
.identity-list {
  overflow: hidden;
  border: 1px solid var(--surface-border);
  border-radius: 10px;
}
.identity-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 62px;
  padding: 10px 12px;
  border-bottom: 1px solid var(--surface-border);
}
.identity-row:last-child {
  border: 0;
}
.identity-icon {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 9px;
  color: var(--brand-primary);
  background: var(--brand-soft);
}
.identity-row strong,
.identity-row small {
  display: block;
}
.identity-row strong {
  font-size: 0.78rem;
}
.identity-row small {
  margin-top: 3px;
  color: var(--text-tertiary);
  font-size: 0.66rem;
}
.identity-actions {
  display: flex;
  align-items: center;
  gap: 2px;
}
.toolbar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 14px 0;
}
.search-field {
  position: relative;
  display: flex;
  align-items: center;
}
.search-field > i {
  position: absolute;
  left: 11px;
  z-index: 1;
  color: var(--text-tertiary);
}
.search-field :deep(input) {
  padding-left: 32px;
}
.toolbar-note {
  color: var(--text-tertiary);
  font-size: 0.72rem;
}
.workforce-table,
.decision-table {
  box-sizing: border-box;
  width: 100%;
  max-width: 100%;
  min-width: 0;
  overflow-x: auto;
  border: 1px solid var(--surface-border);
  border-radius: 10px;
  overscroll-behavior-inline: contain;
  contain: inline-size;
}
.workforce-row {
  display: grid;
  grid-template-columns:
    minmax(180px, 1.35fr) minmax(150px, 1fr) minmax(190px, 1.5fr)
    110px 110px;
  align-items: center;
  min-width: 850px;
  min-height: 64px;
  border-bottom: 1px solid var(--surface-border);
  font-size: 0.73rem;
}
.workforce-row:last-child {
  border: 0;
}
.workforce-row > span {
  padding: 10px 12px;
}
.workforce-row--head {
  min-height: 38px;
  color: var(--text-tertiary);
  background: var(--surface-subtle);
  font-size: 0.66rem;
  font-weight: 700;
}
.operator-cell {
  display: flex;
  align-items: center;
  gap: 9px;
}
.operator-cell strong,
.operator-cell small {
  display: block;
}
.operator-cell small {
  margin-top: 2px;
  color: var(--text-tertiary);
  font-size: 0.64rem;
}
.avatar-dot {
  display: grid;
  place-items: center;
  width: 32px;
  height: 32px;
  border-radius: 50%;
  color: var(--brand-primary);
  background: var(--brand-soft);
  font-weight: 700;
}
.chip-list {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
}
.mini-chip {
  padding: 3px 6px;
  border: 1px solid var(--surface-border);
  border-radius: 999px;
  font-size: 0.61rem;
  background: var(--surface-subtle);
}
.capacity-input {
  width: 52px;
}
.routing-editor {
  display: grid;
  grid-template-columns: minmax(0, 1fr);
  gap: 18px;
}
.form-grid,
.weight-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 13px;
}
.weight-grid {
  grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
}
.field {
  display: grid;
  align-content: start;
  gap: 6px;
  min-width: 0;
}
.field--wide {
  grid-column: 1 / -1;
}
.field > span {
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 600;
}
.field small {
  color: var(--text-tertiary);
  font-size: 0.64rem;
  line-height: 1.4;
}
.field :deep(.p-component),
.field :deep(input),
.field :deep(textarea) {
  width: 100%;
}
.rule-builder,
.policy-section {
  padding: 16px;
  border: 1px solid var(--surface-border);
  border-radius: 11px;
  background: var(--surface-subtle);
}
.subheading {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 12px;
}
.rule-mode {
  width: min(220px, 100%);
}
.subheading h3,
.binding-panel h3,
.policy-section h3 {
  margin: 0 0 4px;
  font-size: 0.84rem;
}
.rule-group {
  margin-top: 12px;
  padding: 10px;
  border-left: 2px solid var(--brand-primary);
  border-radius: 0 9px 9px 0;
  background: var(--surface-card);
}
.rule-group__operator {
  margin-bottom: 8px;
  color: var(--brand-primary);
  font-size: 0.67rem;
  font-weight: 700;
}
.rule-row {
  display: grid;
  grid-template-columns: 24px minmax(140px, 0.8fr) minmax(160px, 1fr) auto;
  align-items: center;
  gap: 8px;
  min-height: 42px;
  border-top: 1px solid var(--surface-border);
  font-size: 0.7rem;
}
.rule-index {
  display: grid;
  place-items: center;
  width: 20px;
  height: 20px;
  border-radius: 6px;
  color: var(--text-tertiary);
  background: var(--surface-subtle);
}
.binding-panel {
  display: grid;
  grid-template-columns:
    minmax(135px, 1fr) minmax(150px, 1fr)
    120px auto minmax(110px, 0.72fr);
  align-items: end;
  gap: 12px;
  padding: 16px;
  border: 1px solid
    color-mix(in srgb, var(--brand-primary) 22%, var(--surface-border));
  border-radius: 11px;
  background: color-mix(in srgb, var(--brand-soft) 42%, var(--surface-card));
}
.binding-panel > :deep(.p-button) {
  width: 100%;
  min-width: 0;
}
.order-actions {
  display: flex;
  gap: 2px;
}
.impact-summary {
  display: flex;
  gap: 8px;
  margin: 12px 0 0;
  padding: 10px;
  border-radius: 8px;
  color: var(--text-secondary);
  background: var(--surface-card);
  font-size: 0.69rem;
}
.decision-row {
  width: 100%;
  display: grid;
  grid-template-columns:
    125px 90px minmax(160px, 1.1fr) minmax(130px, 1fr)
    minmax(170px, 1.2fr) 100px 90px;
  align-items: center;
  min-width: 980px;
  min-height: 62px;
  padding: 0;
  border: 0;
  border-bottom: 1px solid var(--surface-border);
  color: var(--text-primary);
  background: var(--surface-card);
  text-align: left;
  font: inherit;
  cursor: pointer;
}
.decision-row:hover {
  background: var(--surface-subtle);
}
.decision-row:last-child {
  border: 0;
}
.decision-row > span,
.decision-row > strong {
  padding: 9px 11px;
  font-size: 0.71rem;
}
.decision-row small {
  display: block;
  margin-top: 3px;
  color: var(--text-tertiary);
  font-size: 0.62rem;
}
.decision-row--head {
  min-height: 38px;
  color: var(--text-tertiary);
  background: var(--surface-subtle);
  font-weight: 700;
  cursor: default;
}
.dialog-form,
.activation-confirm {
  display: grid;
  gap: 14px;
}
.pin-list {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
}
.pin-list > span {
  display: grid;
  gap: 3px;
  padding: 10px;
  border: 1px solid var(--surface-border);
  border-radius: 9px;
  background: var(--surface-subtle);
}
.pin-list i {
  color: var(--brand-primary);
}
.pin-list strong {
  font-size: 0.72rem;
}
.pin-list small {
  color: var(--text-tertiary);
  font-size: 0.61rem;
}
.decision-detail {
  display: grid;
  gap: 18px;
}
.decision-detail section {
  padding-top: 16px;
  border-top: 1px solid var(--surface-border);
}
.decision-detail h2 {
  margin: 4px 0;
}
.decision-detail h3 {
  margin: 0 0 10px;
  font-size: 0.82rem;
}
.decision-hero p {
  color: var(--text-secondary);
  font-size: 0.72rem;
}
.decision-detail dl {
  display: grid;
  gap: 8px;
  margin: 0;
}
.decision-detail dl div {
  display: flex;
  justify-content: space-between;
  gap: 16px;
  font-size: 0.72rem;
}
.decision-detail dt {
  color: var(--text-tertiary);
}
.decision-detail dd {
  margin: 0;
  font-weight: 600;
  text-align: right;
}
.candidate-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 9px;
  padding: 9px 0;
  border-bottom: 1px solid var(--surface-border);
}
.candidate-rank {
  display: grid;
  place-items: center;
  width: 25px;
  height: 25px;
  border-radius: 7px;
  background: var(--surface-subtle);
  font-size: 0.68rem;
  font-weight: 700;
}
.candidate-row strong,
.candidate-row small {
  display: block;
}
.candidate-row strong {
  font-size: 0.73rem;
}
.candidate-row small {
  margin-top: 3px;
  color: var(--text-tertiary);
  font-size: 0.63rem;
}
.score-breakdown {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  margin-top: 6px;
}
.score-breakdown span {
  padding: 2px 5px;
  border-radius: 5px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.6rem;
}
.routing-loading {
  display: grid;
  gap: 12px;
}
.revision-dialog,
.revision-list,
.audit-section {
  display: grid;
  gap: 10px;
}
.revision-list {
  overflow: hidden;
  border: 1px solid var(--surface-border);
  border-radius: 10px;
}
.revision-row {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 10px;
  min-height: 60px;
  padding: 9px 11px;
  border-bottom: 1px solid var(--surface-border);
}
.revision-row:last-child {
  border: 0;
}
.revision-number {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  border-radius: 8px;
  color: var(--brand-primary);
  background: var(--brand-soft);
  font-size: 0.72rem;
  font-weight: 700;
}
.revision-row strong,
.revision-row small {
  display: block;
}
.revision-row strong {
  font-size: 0.75rem;
}
.revision-row small {
  margin-top: 3px;
  color: var(--text-tertiary);
  font-size: 0.64rem;
}
.audit-section {
  padding-top: 14px;
  border-top: 1px solid var(--surface-border);
}
.audit-section h3 {
  margin: 0;
  font-size: 0.8rem;
}
.audit-row {
  display: grid;
  grid-template-columns: minmax(140px, 0.8fr) minmax(160px, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 8px 0;
  border-bottom: 1px solid var(--surface-border);
  font-size: 0.69rem;
}
.audit-row strong,
.audit-row small {
  display: block;
}
.audit-row small {
  margin-top: 2px;
  color: var(--text-tertiary);
  font-size: 0.61rem;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
@media (max-width: 1050px) {
  .routing-workbench,
  .routing-workbench--overview {
    grid-template-columns: 230px minmax(0, 1fr);
  }
  .binding-panel {
    grid-template-columns: 1fr 1fr;
  }
  .readiness-rail {
    grid-template-columns: repeat(3, 1fr);
    row-gap: 22px;
  }
  .readiness-step::before {
    display: none;
  }
}
@media (max-width: 760px) {
  .routing-page {
    padding: 16px;
  }
  .routing-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .routing-header__actions {
    width: 100%;
    justify-content: space-between;
  }
  .routing-workbench,
  .routing-workbench--overview {
    display: block;
  }
  .routing-catalog {
    position: static;
    margin-bottom: 12px;
    max-height: 220px;
    overflow-y: auto;
  }
  .routing-surface {
    padding: 15px;
  }
  .surface-title,
  .subheading {
    align-items: stretch;
    flex-direction: column;
  }
  .surface-title__actions {
    width: 100%;
    display: grid;
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .surface-title__actions :deep(.p-button) {
    width: 100%;
    min-width: 0;
  }
  .identity-columns,
  .form-grid {
    grid-template-columns: 1fr;
  }
  .field--wide {
    grid-column: auto;
  }
  .readiness-rail {
    grid-template-columns: 1fr;
    padding: 14px 0;
  }
  .readiness-step {
    grid-template-columns: 32px minmax(0, 1fr) auto;
    justify-items: start;
    text-align: left;
    padding: 7px 0;
  }
  .readiness-step small {
    margin-top: 2px;
  }
  .routing-summary-strip {
    grid-template-columns: 1fr;
  }
  .binding-panel {
    grid-template-columns: 1fr;
  }
  .pin-list {
    grid-template-columns: 1fr;
  }
  .toolbar {
    align-items: flex-start;
    flex-direction: column;
  }
  .search-field,
  .search-field :deep(input) {
    width: 100%;
  }
  .routing-tabs {
    margin-inline: -16px;
    padding-inline: 16px;
    border-inline: 0;
    border-radius: 0;
  }
  .routing-tab {
    padding-inline: 10px;
  }
  .routing-tab i {
    display: none;
  }
  .workforce-row--head {
    display: none;
  }
  .workforce-row {
    min-width: 0;
    grid-template-columns: 1fr;
    padding-block: 6px;
  }
  .workforce-row > span {
    padding-block: 6px;
  }
}
@media (max-width: 390px) {
  .routing-page {
    padding: 12px;
  }
  .routing-tabs {
    margin-inline: -12px;
    padding-inline: 12px;
  }
  .routing-header__actions :deep(.p-button) {
    flex: 1;
  }
  .surface-actions {
    position: sticky;
    bottom: 8px;
    z-index: 3;
    padding: 8px;
    border: 1px solid var(--surface-border);
    border-radius: 10px;
    background: color-mix(in srgb, var(--surface-card) 92%, transparent);
    backdrop-filter: blur(8px);
  }
  .surface-actions :deep(.p-button) {
    flex: 1;
  }
  .identity-columns {
    gap: 16px;
  }
  .surface-title__actions {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .routing-tab,
  .readiness-step__mark {
    transition: none;
  }
}
</style>
