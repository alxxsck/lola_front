<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import { useAuthStore } from "@/features/auth/auth.store";
import {
  type CaseIntelligenceOperationsAuthority,
  useSupportCaseIntelligenceOperations,
} from "@/features/support-case-intelligence/model/use-support-case-intelligence-operations";
import type {
  CaseIntelligenceDecision,
  CaseIntelligenceEvaluationSide,
  CaseIntelligenceGateName,
  CaseIntelligenceOperationsSection,
  CaseIntelligenceRelease,
} from "@/features/support-case-intelligence/model/support-case-intelligence-operations-domain";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const period = ref<7 | 30>(30);
const rollbackTarget = ref<CaseIntelligenceRelease | null>(null);
const rollbackReason = ref("");
const correctionVisible = ref(false);
const correctionReason = ref("OPERATOR_REVIEW");
const correctionNotes = ref("");
const correctionCaseDecision = ref("CREATE");
const correctionClass = ref("ISSUE");
const correctionReview = ref("REVIEW");
const correctionHandoff = ref("NONE");
const correctionSafety = ref("CLEAR");

const permissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const permissionSignature = computed(() =>
  [...permissions.value].sort().join("\0"),
);
const section = computed<CaseIntelligenceOperationsSection>(() => {
  if (route.name === "support-case-intelligence-observability")
    return "observability";
  if (route.name === "support-case-intelligence-decisions") return "decisions";
  if (route.name === "support-case-intelligence-versions") return "versions";
  return "evaluation";
});

function authority(): CaseIntelligenceOperationsAuthority | null {
  return auth.user?.id && auth.project?.id
    ? {
        actorId: auth.user.id,
        projectId: auth.project.id,
        permissions: permissions.value,
      }
    : null;
}

const controller = useSupportCaseIntelligenceOperations({
  authority,
  async onForbidden() {
    try {
      await auth.refreshContext();
    } catch {
      /* Protected state is already gone. */
    }
  },
  async onAuthenticationRequired() {
    try {
      await auth.logout();
    } catch {
      /* Local authority is cleared first. */
    } finally {
      await router.replace({
        path: "/login",
        query: { redirect: route.fullPath },
      });
    }
  },
});

const selectedDatasetId = computed(() => {
  const value = route.query.dataset;
  return typeof value === "string"
    ? value
    : (controller.datasets.value[0]?.id ?? "");
});
const selectedEvaluationId = computed(() =>
  typeof route.query.evaluation === "string" ? route.query.evaluation : "",
);
const selectedDecisionId = computed(() =>
  typeof route.query.decision === "string" ? route.query.decision : "",
);
const canOpenEvaluation = computed(() => controller.canManageRelease.value);
const allGatesPassed = computed(() =>
  controller.evaluation.value
    ? Object.values(controller.evaluation.value.gates).every(Boolean)
    : false,
);
const currentRelease = computed(
  () => controller.current.value?.release ?? null,
);
const safetyNotice = computed(() => {
  const snapshot = controller.current.value;
  if (!snapshot || snapshot.safetyState === "READY") return null;
  return snapshot.safetyState === "SAFETY_RECONCILING"
    ? {
        severity: "warn" as const,
        text: "Платформа применяет обязательную версию безопасности. Публикация временно закрыта; проект не может остановить или откатить это обновление.",
      }
    : {
        severity: "warn" as const,
        text: "Администратор платформы ещё не опубликовал обязательную политику безопасности. Это не ошибка ваших прав: настройки проекта доступны, но проверка и публикация останутся закрыты до настройки на сервере.",
      };
});
const pageTitle = computed(
  () =>
    ({
      evaluation: "Качество и публикация",
      observability: "Расходы и путь обращения",
      decisions: "Журнал решений",
      versions: "Версии",
    })[section.value],
);
const pageDescription = computed(
  () =>
    ({
      evaluation:
        "Сравните новую конфигурацию с рабочей и публикуйте только после всех серверных проверок.",
      observability:
        "Серверная воронка решений, расходы и полнота данных без пересчёта в браузере.",
      decisions:
        "Почему Lola приняла решение, какие версии участвовали и что исправил сотрудник.",
      versions:
        "Неизменяемая история рабочих версий и безопасный возврат к проверенной конфигурации.",
    })[section.value],
);

const navItems = [
  {
    label: "Качество и публикация",
    to: "/support/settings/case-intelligence/evaluation",
  },
  {
    label: "Расходы и путь обращения",
    to: "/support/settings/case-intelligence/observability",
  },
  {
    label: "Журнал решений",
    to: "/support/settings/case-intelligence/decision-log",
  },
  { label: "Версии", to: "/support/settings/case-intelligence/versions-audit" },
];
const gateRows: Array<{
  key: CaseIntelligenceGateName;
  label: string;
  description: string;
}> = [
  {
    key: "security",
    label: "Безопасность",
    description:
      "Критические риски распознаны во всех обязательных языках и каналах.",
  },
  {
    key: "quality",
    label: "Качество",
    description: "Точность, полнота и ошибки соответствуют порогам проекта.",
  },
  {
    key: "calibration",
    label: "Калибровка",
    description: "Порог уверенности подтверждён достаточным числом примеров.",
  },
  {
    key: "cost",
    label: "Расходы",
    description:
      "Стоимость проверки и одного принятого обращения укладывается в лимиты.",
  },
  {
    key: "capacity",
    label: "Нагрузка",
    description:
      "Изменение очереди и передачи оператору допустимо для команды.",
  },
];
const metricRows: Array<{
  key: keyof Pick<
    CaseIntelligenceEvaluationSide,
    | "accuracy"
    | "macroF1"
    | "criticalRecall"
    | "attachReopenAccuracy"
    | "handoffRecall"
  >;
  label: string;
}> = [
  { key: "accuracy", label: "Общая точность" },
  { key: "macroF1", label: "Сбалансированное качество" },
  { key: "criticalRecall", label: "Полнота критических рисков" },
  { key: "attachReopenAccuracy", label: "Привязка и повторное открытие" },
  { key: "handoffRecall", label: "Полнота передачи оператору" },
];
const funnelLabels: Record<string, string> = {
  ELIGIBLE_SIGNALS: "Сообщения, подходящие для проверки",
  DETECTED: "Распознано решение",
  DEFERRED: "Передано на проверку",
  CASE_CREATED: "Создано обращение",
  CASE_ATTACHED: "Привязано к открытому",
  CASE_REOPENED: "Открыто повторно",
  HANDOFF_OFFERED: "Предложена передача",
  HANDOFF_ACCEPTED: "Передача принята",
};
const decisionOptions = [
  { label: "Не создавать обращение", value: "NO_CASE" },
  { label: "Создать обращение", value: "CREATE" },
  { label: "Привязать к открытому", value: "ATTACH" },
  { label: "Открыть повторно", value: "REOPEN" },
  { label: "Передать на проверку", value: "DEFER" },
];
const classOptions = [
  { label: "Проблема", value: "ISSUE" },
  { label: "Запрос", value: "REQUEST" },
  { label: "Вопрос", value: "QUESTION" },
  { label: "Отзыв", value: "FEEDBACK" },
  { label: "Другое", value: "OTHER" },
];
const reviewOptions = [
  { label: "Применить автоматически", value: "AUTO_APPLY" },
  { label: "Проверить человеку", value: "REVIEW" },
  { label: "Заблокировать", value: "BLOCK" },
];
const handoffOptions = [
  { label: "Не передавать", value: "NONE" },
  { label: "Предложить оператора", value: "OFFER" },
  { label: "Передать немедленно", value: "ESCALATE" },
];
const safetyOptions = [
  { label: "Риска нет", value: "CLEAR" },
  { label: "Возможен риск", value: "SUSPECTED" },
  { label: "Срочный риск", value: "URGENT" },
  { label: "Проверка продолжается", value: "PENDING" },
  { label: "Проверка не завершилась", value: "FAILED" },
];

function pct(value: number | null | undefined) {
  return value == null
    ? "—"
    : new Intl.NumberFormat("ru-RU", {
        style: "percent",
        maximumFractionDigits: 1,
      }).format(value);
}
function number(value: number) {
  return new Intl.NumberFormat("ru-RU").format(value);
}
function money(microUsd: string | null | undefined) {
  if (!microUsd) return "Нет данных";
  return new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 3,
  }).format(Number(microUsd) / 1_000_000);
}
function date(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("ru-RU", {
        dateStyle: "medium",
        timeStyle: "short",
      }).format(new Date(value))
    : "—";
}
function shortId(value: string | null | undefined) {
  return value
    ? value.length > 18
      ? `${value.slice(0, 8)}…${value.slice(-6)}`
      : value
    : "—";
}
function statusLabel(value: string) {
  return (
    (
      {
        LIVE: "Рабочая",
        SUPERSEDED: "Предыдущая",
        PASSED: "Допущена",
        FAILED: "Не допущена",
        PENDING: "В очереди",
        PROCESSING: "Проверяется",
        OUTCOME_UNKNOWN: "Нужна сверка",
      } as Record<string, string>
    )[value] ?? "Состояние уточняется"
  );
}
function channelLabel(value: string) {
  return (
    (
      { TEXT: "Текст", VOICE: "Голос", TELEGRAM: "Telegram" } as Record<
        string,
        string
      >
    )[value] ?? "Другой канал"
  );
}
function riskLabel(value: string) {
  return (
    (
      {
        NONE: "Без критического риска",
        RESPONSIBLE_GAMING: "Риск ответственной игры",
        RESPONSIBLE_GAMING_CRISIS: "Кризис ответственной игры",
        SELF_HARM_OR_SUICIDE: "Риск самоповреждения",
        CREDIBLE_THREAT_OR_VIOLENCE: "Угроза насилия",
        HARM_INVOLVING_MINORS: "Риск для несовершеннолетних",
      } as Record<string, string>
    )[value] ?? "Критический риск"
  );
}
function decisionLabel(value: string) {
  return (
    decisionOptions.find((item) => item.value === value)?.label ??
    "Решение сервера"
  );
}
function classLabel(value: string | null) {
  return (
    classOptions.find((item) => item.value === value)?.label ?? "Без класса"
  );
}
function handoffLabel(value: string | null) {
  return (
    handoffOptions.find((item) => item.value === value)?.label ??
    "Не передавать"
  );
}
function safetyLabel(value: string | null) {
  return (
    safetyOptions.find((item) => item.value === value)?.label ?? "Нет решения"
  );
}
function reasonLabel(value: string) {
  return (
    (
      {
        EXACT_RULE_MATCH: "Сработало точное правило",
        SEMANTIC_MATCH: "Совпало по смыслу",
        CASE_INTELLIGENCE_DETERMINISTIC_RULE_MATCH: "Сработало точное правило",
        CASE_INTELLIGENCE_NO_DETERMINISTIC_MATCH: "Точного правила нет",
      } as Record<string, string>
    )[value] ?? "Серверное основание"
  );
}
function metricValue(
  side: CaseIntelligenceEvaluationSide | null,
  key: (typeof metricRows)[number]["key"],
) {
  return side?.[key] ?? null;
}

async function load() {
  const to = new Date();
  const from = new Date(to.getTime() - period.value * 86_400_000);
  await controller.load(section.value, {
    from: from.toISOString(),
    to: to.toISOString(),
  });
  if (section.value === "evaluation" && selectedDatasetId.value)
    await controller.selectDataset(selectedDatasetId.value);
  if (section.value === "evaluation") {
    const id =
      selectedEvaluationId.value || controller.evaluations.value[0]?.id;
    if (id) await controller.selectEvaluation(id);
  }
  if (section.value === "decisions" && selectedDecisionId.value)
    await controller.selectDecision(selectedDecisionId.value);
}

async function selectDataset(value: string) {
  await router.replace({
    query: { ...route.query, dataset: value || undefined },
  });
  if (value) await controller.selectDataset(value);
}
async function openEvaluation(id: string) {
  await router.push({ query: { ...route.query, evaluation: id } });
  await controller.selectEvaluation(id);
}
async function closeEvaluation() {
  const query = { ...route.query };
  delete query.evaluation;
  await router.push({ query });
  controller.evaluation.value = null;
}
async function openDecision(item: CaseIntelligenceDecision) {
  await router.push({ query: { ...route.query, decision: item.id } });
  await controller.selectDecision(item.id);
}
async function closeDecision() {
  const query = { ...route.query };
  delete query.decision;
  await router.push({ query });
  controller.selectDecision(null);
}
function openCorrection() {
  const item = controller.decision.value;
  if (!item) return;
  correctionCaseDecision.value = item.caseDecision;
  correctionClass.value = item.conversationClass ?? "ISSUE";
  correctionReview.value = item.reviewDisposition ?? "REVIEW";
  correctionHandoff.value = item.handoffAction ?? "NONE";
  correctionSafety.value = item.safetyDecision ?? "CLEAR";
  correctionNotes.value = "";
  correctionVisible.value = true;
}
async function saveCorrection() {
  const item = controller.decision.value;
  if (!item) return;
  const saved = await controller.correct({
    decisionId: item.id,
    reasonCode: correctionReason.value,
    notes: correctionNotes.value || undefined,
    correctedOutputs: {
      conversationClass: correctionClass.value,
      caseDecision: correctionCaseDecision.value,
      reviewDisposition: correctionReview.value,
      handoffAction: correctionHandoff.value,
      safetyDecision: correctionSafety.value,
    },
  });
  if (!saved) return;
  correctionVisible.value = false;
  await load();
  await controller.selectDecision(item.id);
}
async function confirmRollback() {
  if (!rollbackTarget.value) return;
  const completed = await controller.rollback(
    rollbackTarget.value,
    rollbackReason.value,
  );
  if (!completed) return;
  rollbackTarget.value = null;
  rollbackReason.value = "";
}

watch(
  () =>
    [
      auth.user?.id ?? "",
      auth.project?.id ?? "",
      permissionSignature.value,
      section.value,
    ] as const,
  (next, previous) => {
    const pendingPermission =
      controller.pending.value?.operation === "CORRECT_DECISION"
        ? "project.case_intelligence.labels.review"
        : controller.pending.value
          ? "project.case_intelligence.release.manage"
          : null;
    const previousPermissions = new Set(
      (previous?.[2] ?? "").split("\0").filter(Boolean),
    );
    const nextPermissions = new Set(next[2].split("\0").filter(Boolean));
    const actorChanged = !!previous?.[0] && previous[0] !== next[0];
    const lostRead =
      previousPermissions.has("project.case_intelligence.read") &&
      !nextPermissions.has("project.case_intelligence.read");
    const lostCommandAuthority =
      !!pendingPermission &&
      previousPermissions.has(pendingPermission) &&
      !nextPermissions.has(pendingPermission);
    controller.reset({
      forgetRetained: actorChanged || lostRead || lostCommandAuthority,
    });
    void load();
  },
);
watch(period, () => {
  if (section.value === "observability") void load();
});
watch(selectedDecisionId, (id) => {
  if (section.value === "decisions") void controller.selectDecision(id || null);
});
onMounted(load);
onBeforeUnmount(() => controller.reset());
</script>

<template>
  <main class="ci-ops" data-testid="case-intelligence-operations">
    <header class="ci-ops__header">
      <div>
        <p class="eyebrow">Настройки поддержки · логика обращений</p>
        <h1>{{ pageTitle }}</h1>
        <p>{{ pageDescription }}</p>
      </div>
      <div class="ci-ops__actions">
        <RouterLink
          class="authoring-workspace-link"
          to="/support/settings/case-intelligence/detection"
        >
          <i class="pi pi-arrow-left" aria-hidden="true" />
          Настройки правил
        </RouterLink>
        <Button
          label="Перечитать"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="controller.loading.value"
          @click="load"
        />
      </div>
    </header>

    <nav class="ci-ops__nav" aria-label="Разделы Case Intelligence">
      <RouterLink
        v-for="item in navItems"
        :key="item.to"
        :to="item.to"
        :aria-current="route.path === item.to ? 'page' : undefined"
        >{{ item.label }}</RouterLink
      >
    </nav>

    <Message v-if="controller.error.value" severity="error" :closable="false">{{
      controller.error.value
    }}</Message>
    <Message
      v-if="controller.feedback.value"
      severity="success"
      :closable="false"
      >{{ controller.feedback.value }}</Message
    >
    <Message v-if="controller.pending.value" severity="warn" :closable="false">
      <div class="pending-command">
        <span
          >Исход последней команды ещё не подтверждён. Новые изменения
          заблокированы.</span
        ><Button
          label="Проверить исход"
          size="small"
          @click="controller.reconcilePending"
        />
      </div>
    </Message>
    <Message
      v-if="safetyNotice"
      :severity="safetyNotice.severity"
      :closable="false"
      >{{ safetyNotice.text }}</Message
    >

    <section
      v-if="controller.loading.value"
      class="skeleton-grid"
      aria-label="Загрузка данных"
    >
      <Skeleton height="10rem" /><Skeleton height="22rem" /><Skeleton
        height="22rem"
      />
    </section>

    <template v-else-if="controller.canRead.value">
      <template v-if="section === 'evaluation'">
        <Message v-if="!canOpenEvaluation" severity="info" :closable="false"
          >Для запуска проверок и публикации нужен доступ к управлению версиями.
          Рабочее состояние проекта остаётся доступным в обзоре.</Message
        >
        <section class="admission-card" aria-labelledby="admission-title">
          <div class="admission-card__summary">
            <div
              class="admission-orb"
              :class="{ 'admission-orb--pass': allGatesPassed }"
            >
              <i :class="allGatesPassed ? 'pi pi-check' : 'pi pi-shield'" />
            </div>
            <div>
              <p class="eyebrow">Линия допуска</p>
              <h2 id="admission-title">
                {{
                  allGatesPassed
                    ? "Кандидат готов к публикации"
                    : controller.evaluation.value
                      ? "Публикация заблокирована"
                      : "Сначала запустите проверку"
                }}
              </h2>
              <p>
                Решение принимает сервер по полному набору версии. Один зелёный
                показатель не может скрыть проблему в другом.
              </p>
            </div>
            <Button
              v-if="controller.evaluation.value && allGatesPassed"
              label="Сделать рабочей"
              icon="pi pi-check-circle"
              :disabled="
                !controller.canActivate.value || !!controller.pending.value
              "
              :loading="controller.mutating.value"
              @click="controller.activateSelected"
            />
          </div>
          <div class="gate-line">
            <article
              v-for="gate in gateRows"
              :key="gate.key"
              :class="[
                'gate',
                { 'gate--pass': controller.evaluation.value?.gates[gate.key] },
              ]"
            >
              <i
                :class="
                  controller.evaluation.value?.gates[gate.key]
                    ? 'pi pi-check-circle'
                    : 'pi pi-circle'
                "
              />
              <div>
                <strong>{{ gate.label }}</strong
                ><span>{{ gate.description }}</span>
              </div>
            </article>
          </div>
        </section>

        <section v-if="canOpenEvaluation" class="ops-grid">
          <aside class="history-panel">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Основа проверки</p>
                <h2>Набор примеров</h2>
              </div>
            </div>
            <Select
              :model-value="selectedDatasetId"
              :options="controller.datasets.value"
              option-label="name"
              option-value="id"
              placeholder="Выберите набор"
              fluid
              @update:model-value="selectDataset"
            />
            <Button
              v-if="controller.datasetCursor.value"
              class="load-more"
              label="Ещё наборы"
              severity="secondary"
              text
              :loading="controller.loadingMore.value"
              @click="controller.loadMore('datasets')"
            />
            <div v-if="controller.dataset.value" class="dataset-summary">
              <strong>{{ controller.dataset.value.name }}</strong
              ><span>{{ controller.dataset.value.description }}</span
              ><b
                >{{ number(controller.dataset.value.sampleCount) }} примеров</b
              >
              <dl>
                <div>
                  <dt>Языки</dt>
                  <dd>
                    {{
                      controller.dataset.value.locales
                        .map((x) => x.code)
                        .join(", ")
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Каналы</dt>
                  <dd>
                    {{
                      controller.dataset.value.channels
                        .map((x) => channelLabel(x.code))
                        .join(", ")
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Критические случаи</dt>
                  <dd>
                    {{
                      controller.dataset.value.risks
                        .filter((x) => x.code !== "NONE")
                        .reduce((sum, x) => sum + x.count, 0)
                    }}
                  </dd>
                </div>
              </dl>
              <Button
                label="Запустить проверку"
                icon="pi pi-play"
                :disabled="
                  !!controller.pending.value || controller.mutating.value
                "
                :loading="controller.mutating.value"
                @click="controller.runEvaluation(controller.dataset.value.id)"
              />
            </div>
            <div class="section-heading section-heading--history">
              <div>
                <p class="eyebrow">История</p>
                <h2>Последние проверки</h2>
              </div>
            </div>
            <button
              v-for="item in controller.evaluations.value"
              :key="item.id"
              type="button"
              class="history-row"
              :class="{
                'history-row--active':
                  controller.evaluation.value?.id === item.id,
              }"
              @click="openEvaluation(item.id)"
            >
              <span
                ><strong>Версия {{ item.version }}</strong
                ><small>{{ date(item.createdAt) }}</small></span
              ><Tag
                :value="statusLabel(item.status)"
                :severity="item.status === 'PASSED' ? 'success' : 'danger'"
              />
            </button>
            <Button
              v-if="controller.evaluationCursor.value"
              class="load-more"
              label="Показать более ранние"
              severity="secondary"
              text
              :loading="controller.loadingMore.value"
              @click="controller.loadMore('evaluations')"
            />
          </aside>

          <div v-if="controller.evaluation.value" class="report-stack">
            <section class="surface compare-surface">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">Сравнение</p>
                  <h2>Кандидат и рабочая версия</h2>
                </div>
                <Button
                  label="Закрыть"
                  icon="pi pi-times"
                  text
                  @click="closeEvaluation"
                />
              </div>
              <p class="compatibility-note">
                <i class="pi pi-lock" /> Сравнение построено сервером на одном
                наборе примеров и закреплённых версиях модели и калибровки.
              </p>
              <div class="metric-table" aria-label="Сравнение качества">
                <div class="metric-row metric-row--head">
                  <span>Показатель</span><b>Рабочая</b><b>Кандидат</b>
                </div>
                <div
                  v-for="metric in metricRows"
                  :key="metric.key"
                  class="metric-row"
                >
                  <span>{{ metric.label }}</span
                  ><b>{{
                    pct(
                      metricValue(
                        controller.evaluation.value.published,
                        metric.key,
                      ),
                    )
                  }}</b
                  ><b class="candidate-value">{{
                    pct(
                      metricValue(
                        controller.evaluation.value.candidate,
                        metric.key,
                      ),
                    )
                  }}</b>
                </div>
              </div>
              <div
                v-if="controller.evaluation.value.queueImpact"
                class="queue-impact"
              >
                <div>
                  <span>Обращения в очереди</span
                  ><strong
                    >{{
                      controller.evaluation.value.queueImpact
                        .candidateCaseDelta > 0
                        ? "+"
                        : ""
                    }}{{
                      controller.evaluation.value.queueImpact.candidateCaseDelta
                    }}</strong
                  >
                </div>
                <div>
                  <span>Передачи оператору</span
                  ><strong
                    >{{
                      controller.evaluation.value.queueImpact
                        .candidateHandoffDelta > 0
                        ? "+"
                        : ""
                    }}{{
                      controller.evaluation.value.queueImpact
                        .candidateHandoffDelta
                    }}</strong
                  >
                </div>
                <p>
                  Прогноз получен на проверочном наборе и не изменяет рабочие
                  обращения.
                </p>
              </div>
            </section>

            <section class="surface">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">Обязательная детализация</p>
                  <h2>Безопасность по языкам и каналам</h2>
                </div>
                <Tag
                  :value="
                    controller.evaluation.value.safety.every((x) => x.passed)
                      ? 'Без пропусков'
                      : 'Есть пропуски'
                  "
                  :severity="
                    controller.evaluation.value.safety.every((x) => x.passed)
                      ? 'success'
                      : 'danger'
                  "
                />
              </div>
              <div class="matrix-list">
                <article
                  v-for="cell in controller.evaluation.value.safety"
                  :key="cell.key"
                  :class="{ 'matrix-cell--fail': !cell.passed }"
                >
                  <div>
                    <strong>{{ riskLabel(cell.riskClass) }}</strong
                    ><span
                      >{{ cell.locale }} ·
                      {{ channelLabel(cell.channel) }}</span
                    >
                  </div>
                  <b>{{ pct(cell.criticalRecall) }}</b
                  ><small
                    >{{ cell.sampleCount }} примеров ·
                    {{ cell.falseNegatives }} пропусков</small
                  >
                </article>
              </div>
            </section>

            <section class="surface">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">Уверенность модели</p>
                  <h2>Калибровка</h2>
                </div>
              </div>
              <div class="calibration-grid">
                <article
                  v-for="cell in controller.evaluation.value.calibration"
                  :key="cell.key"
                >
                  <strong
                    >{{ cell.locale }} ·
                    {{ channelLabel(cell.channel) }}</strong
                  ><span
                    >{{ decisionLabel(cell.caseDecision) }} ·
                    {{ cell.samples }} примеров</span
                  >
                  <div class="confidence-bar">
                    <i :style="{ width: `${cell.threshold * 100}%` }" />
                  </div>
                  <small
                    >Порог {{ pct(cell.threshold)
                    }}<template v-if="cell.interval">
                      · интервал {{ pct(cell.interval.low) }}–{{
                        pct(cell.interval.high)
                      }}</template
                    ></small
                  >
                </article>
              </div>
            </section>

            <section class="surface">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">Разбор ошибок</p>
                  <h2>Примеры, где решения различаются</h2>
                </div>
                <Tag
                  :value="`${controller.evaluation.value.observations.length}`"
                  severity="secondary"
                />
              </div>
              <div class="observation-list">
                <article
                  v-for="item in controller.evaluation.value.observations.slice(
                    0,
                    12,
                  )"
                  :key="item.id"
                >
                  <div>
                    <strong>{{ item.topicCode ?? "Без темы" }}</strong
                    ><span
                      >{{ item.locale }} · {{ channelLabel(item.channel) }} ·
                      {{ riskLabel(item.riskClass) }}</span
                    >
                  </div>
                  <p>
                    Ожидалось:
                    <b>{{ decisionLabel(item.expectedCaseDecision) }}</b> ·
                    кандидат:
                    <b>{{ decisionLabel(item.candidateCaseDecision) }}</b> ·
                    рабочая:
                    <b>{{ decisionLabel(item.publishedCaseDecision) }}</b>
                  </p>
                  <Tag
                    v-if="item.corrected"
                    value="Проверено человеком"
                    severity="info"
                  />
                </article>
              </div>
            </section>
          </div>
          <section v-else class="surface empty-report">
            <i class="pi pi-chart-line" />
            <h2>Выберите проверку</h2>
            <p>
              Здесь появятся сравнение, матрица безопасности, калибровка и
              ошибки без скрытых средних.
            </p>
          </section>
        </section>
      </template>

      <template v-else-if="section === 'observability'">
        <div class="period-switch" aria-label="Период">
          <Button
            label="7 дней"
            :severity="period === 7 ? 'primary' : 'secondary'"
            :outlined="period !== 7"
            @click="period = 7"
          /><Button
            label="30 дней"
            :severity="period === 30 ? 'primary' : 'secondary'"
            :outlined="period !== 30"
            @click="period = 30"
          />
        </div>
        <Message
          v-if="!controller.canReadCost.value"
          severity="info"
          :closable="false"
          >Расходы и воронка доступны только сотрудникам с правом просмотра
          стоимости Case Intelligence.</Message
        >
        <template v-else-if="controller.observability.value">
          <section class="surface authority-strip">
            <div>
              <p class="eyebrow">Полнота</p>
              <strong>{{
                controller.observability.value.cost.completeness === "COMPLETE"
                  ? "Данные полные"
                  : "Данные ещё собираются"
              }}</strong
              ><span
                >Учтено по
                {{ date(controller.observability.value.completeThrough) }}</span
              >
            </div>
            <div>
              <p class="eyebrow">Рабочие версии</p>
              <strong>{{
                controller.observability.value.mixedRevisions
                  ? "Несколько версий"
                  : "Одна версия"
              }}</strong
              ><span>{{
                controller.observability.value.releaseRevisionIds
                  .map(shortId)
                  .join(", ")
              }}</span>
            </div>
            <div>
              <p class="eyebrow">Источник</p>
              <strong>Серверный расчёт</strong
              ><span>{{
                controller.observability.value.definitionsRevision
              }}</span>
            </div>
          </section>
          <section class="funnel-layout">
            <div class="surface">
              <div class="section-heading">
                <div>
                  <p class="eyebrow">Путь обращения</p>
                  <h2>От сообщения до принятой передачи</h2>
                </div>
              </div>
              <ol class="funnel">
                <li
                  v-for="(item, index) in controller.observability.value.funnel"
                  :key="item.code"
                >
                  <span class="funnel-index">{{ index + 1 }}</span>
                  <div>
                    <strong>{{
                      funnelLabels[item.code] ?? "Этап обработки"
                    }}</strong
                    ><small>{{
                      item.denominator == null
                        ? "Начальная выборка"
                        : `${pct(item.rate)} от предыдущей базы`
                    }}</small>
                  </div>
                  <b>{{ number(item.numerator) }}</b>
                </li>
              </ol>
            </div>
            <div class="cost-stack">
              <section class="surface cost-primary">
                <p class="eyebrow">Итого за период</p>
                <strong>{{
                  money(controller.observability.value.cost.billedMicroUsd)
                }}</strong
                ><span>Счёт сервера, без клиентских оценок</span>
              </section>
              <section class="surface unit-costs">
                <h2>Стоимость единицы</h2>
                <dl>
                  <div>
                    <dt>1 000 сообщений</dt>
                    <dd>
                      {{
                        money(
                          controller.observability.value.cost
                            .perThousandSignalsMicroUsd,
                        )
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt>Одно обращение</dt>
                    <dd>
                      {{
                        money(
                          controller.observability.value.cost.perCaseMicroUsd,
                        )
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt>Одна передача</dt>
                    <dd>
                      {{
                        money(
                          controller.observability.value.cost
                            .perEscalationMicroUsd,
                        )
                      }}
                    </dd>
                  </div>
                  <div>
                    <dt>Одно завершение</dt>
                    <dd>
                      {{
                        money(
                          controller.observability.value.cost
                            .perResolutionMicroUsd,
                        )
                      }}
                    </dd>
                  </div>
                </dl>
              </section>
              <section class="surface token-use">
                <h2>Использование модели</h2>
                <span
                  >Вход:
                  {{
                    number(controller.observability.value.cost.inputTokens)
                  }}</span
                ><span
                  >Ответ:
                  {{
                    number(controller.observability.value.cost.outputTokens)
                  }}</span
                ><span
                  >Из кэша:
                  {{
                    number(
                      controller.observability.value.cost.cachedInputTokens,
                    )
                  }}</span
                >
              </section>
            </div>
          </section>
        </template>
      </template>

      <template v-else-if="section === 'decisions'">
        <Message
          v-if="!controller.canReadDecisions.value"
          severity="info"
          :closable="false"
          >Для просмотра объяснений нужен отдельный доступ к журналу
          решений.</Message
        >
        <section
          v-else
          class="decision-layout"
          :class="{ 'decision-layout--detail': !!controller.decision.value }"
        >
          <div class="surface decision-list">
            <div class="section-heading">
              <div>
                <p class="eyebrow">Неизменяемая история</p>
                <h2>Последние решения</h2>
              </div>
            </div>
            <button
              v-for="item in controller.decisions.value"
              :key="item.id"
              type="button"
              class="decision-row"
              :class="{
                'decision-row--active':
                  controller.decision.value?.id === item.id,
              }"
              @click="openDecision(item)"
            >
              <span class="decision-icon"
                ><i
                  :class="
                    item.safetyDecision && item.safetyDecision !== 'CLEAR'
                      ? 'pi pi-shield'
                      : 'pi pi-sparkles'
                  " /></span
              ><span
                ><strong
                  >{{ decisionLabel(item.caseDecision) }} ·
                  {{ classLabel(item.conversationClass) }}</strong
                ><small
                  >{{ date(item.decidedAt) }} ·
                  {{
                    item.confidence
                      ? pct(Number(item.confidence))
                      : "без оценки уверенности"
                  }}</small
                ></span
              ><i class="pi pi-chevron-right" /></button
            ><Button
              v-if="controller.decisionCursor.value"
              class="load-more"
              label="Показать более ранние"
              severity="secondary"
              text
              :loading="controller.loadingMore.value"
              @click="controller.loadMore('decisions')"
            />
          </div>
          <section
            v-if="controller.decision.value"
            class="surface decision-detail"
          >
            <div class="section-heading">
              <div>
                <p class="eyebrow">Почему принято решение</p>
                <h2>
                  {{ decisionLabel(controller.decision.value.caseDecision) }} ·
                  {{ classLabel(controller.decision.value.conversationClass) }}
                </h2>
              </div>
              <Button
                label="Назад"
                icon="pi pi-arrow-left"
                text
                @click="closeDecision"
              />
            </div>
            <div class="decision-verdict">
              <div>
                <span>Уверенность</span
                ><strong>{{
                  controller.decision.value.confidence
                    ? pct(Number(controller.decision.value.confidence))
                    : "Не рассчитывалась"
                }}</strong>
              </div>
              <div>
                <span>Передача оператору</span
                ><strong>{{
                  handoffLabel(controller.decision.value.handoffAction)
                }}</strong>
              </div>
              <div>
                <span>Безопасность</span
                ><strong>{{
                  safetyLabel(controller.decision.value.safetyDecision)
                }}</strong>
              </div>
            </div>
            <div class="explain-block">
              <h3>Основания</h3>
              <div class="chip-row">
                <Tag
                  v-for="code in controller.decision.value.reasonCodes"
                  :key="code"
                  :value="reasonLabel(code)"
                  severity="info"
                /><Tag
                  v-for="code in controller.decision.value.matchedRuleCodes"
                  :key="code"
                  :value="`Правило ${code}`"
                  severity="secondary"
                />
              </div>
              <p>
                Показаны только безопасные причины и ссылки на доказательства.
                Текст сообщений, внутренние рассуждения модели и личные данные
                здесь не раскрываются.
              </p>
            </div>
            <div class="explain-block">
              <h3>Закреплённые версии</h3>
              <dl class="pins">
                <div>
                  <dt>Рабочая версия</dt>
                  <dd>
                    {{ shortId(controller.decision.value.releaseRevisionId) }}
                  </dd>
                </div>
                <div>
                  <dt>Категории</dt>
                  <dd>
                    {{
                      shortId(
                        controller.decision.value.detectionPolicyRevisionId,
                      )
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Передача</dt>
                  <dd>
                    {{
                      shortId(
                        controller.decision.value.escalationPolicyRevisionId,
                      )
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Безопасность</dt>
                  <dd>
                    {{
                      shortId(controller.decision.value.safetyPolicyRevisionId)
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Модель</dt>
                  <dd>
                    {{
                      shortId(controller.decision.value.modelProfileRevisionId)
                    }}
                  </dd>
                </div>
                <div>
                  <dt>Калибровка</dt>
                  <dd>
                    {{
                      shortId(controller.decision.value.calibratorRevisionId)
                    }}
                  </dd>
                </div>
              </dl>
            </div>
            <div class="explain-block">
              <div class="section-heading">
                <h3>Исправления сотрудника</h3>
                <Button
                  v-if="controller.canCorrect.value"
                  label="Добавить исправление"
                  icon="pi pi-pencil"
                  outlined
                  @click="openCorrection"
                />
              </div>
              <article
                v-for="item in controller.decision.value.corrections"
                :key="item.id"
                class="correction"
              >
                <strong>{{ item.reasonCode }}</strong
                ><span>{{ date(item.createdAt) }}</span>
                <p>{{ item.notes || "Без комментария" }}</p>
              </article>
              <p
                v-if="controller.decision.value.corrections.length === 0"
                class="muted"
              >
                Исправлений нет. Новое исправление сохранит исходное решение и
                добавит отдельную запись — история не перезаписывается.
              </p>
            </div>
          </section>
          <section v-else class="surface empty-report">
            <i class="pi pi-list" />
            <h2>Выберите решение</h2>
            <p>
              Откроются безопасные причины, версии правил и история исправлений.
            </p>
          </section>
        </section>
      </template>

      <template v-else>
        <section class="surface version-hero">
          <div>
            <p class="eyebrow">Сейчас работает</p>
            <h2>Версия {{ currentRelease?.version ?? "—" }}</h2>
            <p>
              Это атомарный набор категорий, передачи оператору, безопасности,
              модели, калибровки и маршрутизации.
            </p>
          </div>
          <Tag
            :value="
              currentRelease
                ? statusLabel(currentRelease.status)
                : 'Нет рабочей версии'
            "
            :severity="currentRelease?.status === 'LIVE' ? 'success' : 'warn'"
          />
        </section>
        <section class="version-timeline">
          <article
            v-for="(item, index) in controller.releases.value"
            :key="item.id"
            class="surface version-card"
          >
            <span class="timeline-dot" />
            <div class="section-heading">
              <div>
                <p class="eyebrow">
                  {{ index === 0 ? "Текущая" : "Предыдущая" }}
                </p>
                <h2>Версия {{ item.version }}</h2>
              </div>
              <Tag
                :value="statusLabel(item.status)"
                :severity="index === 0 ? 'success' : 'secondary'"
              />
            </div>
            <p>{{ date(item.activatedAt ?? item.createdAt) }}</p>
            <dl class="pins">
              <div>
                <dt>Категории</dt>
                <dd>{{ shortId(item.detectionPolicyRevisionId) }}</dd>
              </div>
              <div>
                <dt>Передача</dt>
                <dd>{{ shortId(item.escalationPolicyRevisionId) }}</dd>
              </div>
              <div>
                <dt>Безопасность</dt>
                <dd>{{ shortId(item.safetyPolicyRevisionId) }}</dd>
              </div>
              <div>
                <dt>Модель</dt>
                <dd>{{ shortId(item.modelProfileRevisionId) }}</dd>
              </div>
              <div>
                <dt>Калибровка</dt>
                <dd>{{ shortId(item.calibratorRevisionId) }}</dd>
              </div>
              <div>
                <dt>Набор данных</dt>
                <dd>{{ shortId(item.datasetRevisionId) }}</dd>
              </div>
            </dl>
            <Button
              v-if="index > 0 && controller.canRollback.value"
              label="Вернуть эту конфигурацию"
              icon="pi pi-history"
              severity="danger"
              outlined
              :disabled="!!controller.pending.value"
              @click="rollbackTarget = item"
            />
          </article>
        </section>
        <Message severity="info" :closable="false"
          >Возврат не переписывает историю. Сервер создаст новую рабочую версию
          из выбранной конфигурации и снова проверит её целиком.</Message
        >
      </template>
    </template>

    <Dialog
      :visible="!!rollbackTarget"
      modal
      header="Вернуть проверенную конфигурацию"
      :style="{ width: 'min(34rem, calc(100vw - 2rem))' }"
      @update:visible="rollbackTarget = $event ? rollbackTarget : null"
    >
      <p>
        Будет создана новая версия на основе версии
        {{ rollbackTarget?.version }}. Укажите причину для журнала изменений.
      </p>
      <label class="field"
        ><span>Причина возврата</span
        ><Textarea v-model="rollbackReason" rows="4" maxlength="2000" fluid
      /></label>
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="rollbackTarget = null" /><Button
          label="Создать новую рабочую версию"
          severity="danger"
          :disabled="rollbackReason.trim().length < 3"
          :loading="controller.mutating.value"
          @click="confirmRollback"
      /></template>
    </Dialog>

    <Dialog
      v-model:visible="correctionVisible"
      modal
      header="Добавить исправление"
      :style="{ width: 'min(44rem, calc(100vw - 2rem))' }"
    >
      <Message severity="info" :closable="false"
        >Исходное решение останется в истории. Исправление не переобучает модель
        автоматически.</Message
      >
      <div class="correction-form">
        <label
          ><span>Класс обращения</span
          ><Select
            v-model="correctionClass"
            :options="classOptions"
            option-label="label"
            option-value="value"
            fluid /></label
        ><label
          ><span>Решение</span
          ><Select
            v-model="correctionCaseDecision"
            :options="decisionOptions"
            option-label="label"
            option-value="value"
            fluid /></label
        ><label
          ><span>Проверка</span
          ><Select
            v-model="correctionReview"
            :options="reviewOptions"
            option-label="label"
            option-value="value"
            fluid /></label
        ><label
          ><span>Передача</span
          ><Select
            v-model="correctionHandoff"
            :options="handoffOptions"
            option-label="label"
            option-value="value"
            fluid /></label
        ><label
          ><span>Безопасность</span
          ><Select
            v-model="correctionSafety"
            :options="safetyOptions"
            option-label="label"
            option-value="value"
            fluid /></label
        ><label
          ><span>Причина</span
          ><InputText v-model="correctionReason" maxlength="64" fluid /></label
        ><label class="correction-form__wide"
          ><span>Комментарий без личных данных</span
          ><Textarea v-model="correctionNotes" rows="3" maxlength="2000" fluid
        /></label>
      </div>
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="correctionVisible = false" /><Button
          label="Сохранить исправление"
          :disabled="!correctionReason.trim()"
          :loading="controller.mutating.value"
          @click="saveCorrection"
      /></template>
    </Dialog>
  </main>
</template>

<style scoped>
.ci-ops {
  --ops-ink: var(--text-primary);
  --ops-muted: var(--text-secondary);
  --ops-line: var(--border-default);
  --ops-surface: var(--surface-card);
  --ops-soft: var(--surface-subtle);
  max-width: 1480px;
  margin: 0 auto;
  padding: 28px clamp(16px, 3vw, 32px) 64px;
  color: var(--ops-ink);
}
.ci-ops__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}
.ci-ops__actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.authoring-workspace-link {
  display: inline-flex;
  min-height: 40px;
  align-items: center;
  gap: 8px;
  padding: 0 12px;
  border: 1px solid var(--ops-line);
  border-radius: 9px;
  color: var(--ops-ink);
  background: var(--ops-surface);
  font-size: 0.84rem;
  font-weight: 650;
  text-decoration: none;
}
.authoring-workspace-link:hover {
  background: var(--ops-soft);
}
.authoring-workspace-link:focus-visible {
  outline: 2px solid var(--action-primary);
  outline-offset: 2px;
}
.ci-ops__header h1 {
  margin: 4px 0 8px;
  font-size: clamp(1.8rem, 3vw, 2.55rem);
  line-height: 1.05;
  letter-spacing: -0.035em;
}
.ci-ops__header p:not(.eyebrow) {
  max-width: 760px;
  margin: 0;
  color: var(--ops-muted);
  font-size: 1.02rem;
}
.eyebrow {
  margin: 0;
  color: var(--ops-muted);
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.13em;
  text-transform: uppercase;
}
.ci-ops__nav {
  display: flex;
  gap: 4px;
  overflow-x: auto;
  padding: 5px;
  margin-bottom: 22px;
  border: 1px solid var(--ops-line);
  border-radius: 14px;
  background: var(--ops-surface);
  scrollbar-width: none;
}
.ci-ops__nav a {
  flex: 0 0 auto;
  padding: 9px 12px;
  border-radius: 9px;
  color: var(--ops-muted);
  font-size: 0.84rem;
  font-weight: 700;
  text-decoration: none;
}
.ci-ops__nav a[aria-current="page"] {
  color: var(--status-info-text);
  background: color-mix(
    in srgb,
    var(--status-info-text) 10%,
    var(--ops-surface)
  );
  box-shadow: inset 0 0 0 1px
    color-mix(in srgb, var(--status-info-text) 28%, var(--ops-line));
}
.pending-command,
.section-heading,
.admission-card__summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.skeleton-grid {
  display: grid;
  gap: 18px;
}
.surface,
.admission-card,
.history-panel {
  border: 1px solid var(--ops-line);
  border-radius: 18px;
  background: var(--ops-surface);
  box-shadow: var(--shadow-raised);
}
.admission-card {
  overflow: hidden;
  margin-bottom: 20px;
}
.admission-card__summary {
  padding: 22px;
}
.admission-card__summary h2,
.section-heading h2,
.surface h2 {
  margin: 3px 0 5px;
  font-size: 1.2rem;
  letter-spacing: -0.02em;
}
.admission-card__summary p:not(.eyebrow) {
  max-width: 700px;
  margin: 0;
  color: var(--ops-muted);
}
.admission-orb {
  display: grid;
  flex: 0 0 auto;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 15px;
  color: var(--status-warning-text);
  background: color-mix(
    in srgb,
    var(--status-warning-text) 12%,
    var(--ops-surface)
  );
}
.admission-orb--pass {
  color: var(--status-success-text);
  background: color-mix(
    in srgb,
    var(--status-success-text) 12%,
    var(--ops-surface)
  );
}
.gate-line {
  display: grid;
  grid-template-columns: repeat(5, minmax(0, 1fr));
  border-top: 1px solid var(--ops-line);
}
.gate {
  display: flex;
  min-height: 112px;
  gap: 10px;
  padding: 15px;
  color: var(--ops-muted);
  border-right: 1px solid var(--ops-line);
}
.gate:last-child {
  border-right: 0;
}
.gate > i {
  margin-top: 2px;
  color: var(--text-tertiary);
}
.gate strong,
.gate span {
  display: block;
}
.gate span {
  margin-top: 5px;
  font-size: 0.76rem;
  line-height: 1.35;
}
.gate--pass > i,
.gate--pass strong {
  color: var(--status-success-text);
}
.ops-grid {
  display: grid;
  grid-template-columns: minmax(230px, 300px) minmax(0, 1fr);
  gap: 20px;
  align-items: start;
}
.history-panel {
  position: sticky;
  top: 16px;
  padding: 18px;
}
.dataset-summary {
  display: grid;
  gap: 10px;
  padding: 16px 0;
}
.dataset-summary > span {
  color: var(--ops-muted);
  font-size: 0.84rem;
  line-height: 1.45;
}
.dataset-summary dl {
  display: grid;
  gap: 8px;
  margin: 0;
}
.dataset-summary dl div,
.pins div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.dataset-summary dt,
.pins dt {
  color: var(--ops-muted);
}
.dataset-summary dd,
.pins dd {
  margin: 0;
  font-weight: 700;
  text-align: right;
  overflow-wrap: anywhere;
}
.section-heading--history {
  margin-top: 18px;
  padding-top: 17px;
  border-top: 1px solid var(--ops-line);
}
.history-row,
.decision-row {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 12px;
  margin-top: 7px;
  border: 1px solid transparent;
  border-radius: 12px;
  color: inherit;
  background: transparent;
  text-align: left;
  cursor: pointer;
}
.history-row:hover,
.decision-row:hover,
.history-row--active,
.decision-row--active {
  border-color: color-mix(in srgb, var(--action-primary) 30%, var(--ops-line));
  background: color-mix(in srgb, var(--action-primary) 8%, var(--ops-surface));
}
.history-row span,
.decision-row > span:nth-child(2) {
  display: grid;
  gap: 3px;
}
.history-row small,
.decision-row small {
  color: var(--ops-muted);
}
.load-more {
  width: 100%;
  margin-top: 8px;
}
.report-stack {
  display: grid;
  gap: 18px;
}
.surface {
  padding: 20px;
}
.compatibility-note {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 12px;
  border-radius: 11px;
  color: var(--status-info-text);
  background: color-mix(
    in srgb,
    var(--status-info-text) 9%,
    var(--ops-surface)
  );
  font-size: 0.82rem;
}
.metric-table {
  overflow: hidden;
  border: 1px solid var(--ops-line);
  border-radius: 12px;
}
.metric-row {
  display: grid;
  grid-template-columns: minmax(180px, 1fr) 120px 120px;
  align-items: center;
  min-height: 48px;
  padding: 0 14px;
  border-top: 1px solid var(--ops-line);
}
.metric-row:first-child {
  border-top: 0;
}
.metric-row--head {
  color: var(--ops-muted);
  background: var(--ops-soft);
  font-size: 0.78rem;
}
.candidate-value {
  color: var(--status-info-text);
}
.queue-impact {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  margin-top: 12px;
}
.queue-impact div {
  display: flex;
  justify-content: space-between;
  padding: 13px;
  border-radius: 11px;
  background: var(--ops-soft);
}
.queue-impact p {
  grid-column: 1 / -1;
  margin: 0;
  color: var(--ops-muted);
  font-size: 0.78rem;
}
.matrix-list,
.calibration-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}
.matrix-list article,
.calibration-grid article {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 4px 12px;
  padding: 14px;
  border: 1px solid
    color-mix(in srgb, var(--status-success-text) 25%, var(--ops-line));
  border-radius: 12px;
  background: color-mix(
    in srgb,
    var(--status-success-text) 7%,
    var(--ops-surface)
  );
}
.matrix-list article > div {
  display: grid;
  gap: 2px;
}
.matrix-list article span,
.matrix-list article small,
.calibration-grid article span,
.calibration-grid article small {
  color: var(--ops-muted);
  font-size: 0.78rem;
}
.matrix-list article small {
  grid-column: 1 / -1;
}
.matrix-cell--fail {
  border-color: color-mix(
    in srgb,
    var(--status-danger-text) 35%,
    var(--ops-line)
  ) !important;
  background: color-mix(
    in srgb,
    var(--status-danger-text) 8%,
    var(--ops-surface)
  ) !important;
}
.calibration-grid article {
  grid-template-columns: 1fr;
  border-color: var(--ops-line);
  background: var(--ops-surface);
}
.confidence-bar {
  height: 7px;
  overflow: hidden;
  border-radius: 999px;
  background: var(--surface-hover);
}
.confidence-bar i {
  display: block;
  height: 100%;
  border-radius: inherit;
  background: var(--action-primary);
}
.observation-list {
  display: grid;
  gap: 9px;
}
.observation-list article {
  display: grid;
  grid-template-columns: minmax(140px, 0.5fr) minmax(260px, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 13px;
  border: 1px solid var(--ops-line);
  border-radius: 12px;
}
.observation-list article div {
  display: grid;
}
.observation-list article span,
.observation-list p {
  color: var(--ops-muted);
  font-size: 0.8rem;
}
.observation-list p {
  margin: 0;
}
.empty-report {
  display: grid;
  min-height: 310px;
  place-items: center;
  align-content: center;
  text-align: center;
}
.empty-report > i {
  font-size: 2rem;
  color: var(--status-info-text);
}
.empty-report p {
  max-width: 420px;
  color: var(--ops-muted);
}
.period-switch {
  display: flex;
  gap: 8px;
  margin-bottom: 16px;
}
.authority-strip {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  padding: 0;
  overflow: hidden;
  margin-bottom: 20px;
  background: var(--ops-line);
}
.authority-strip > div {
  display: grid;
  gap: 5px;
  padding: 18px;
  background: var(--ops-surface);
}
.authority-strip span {
  color: var(--ops-muted);
  font-size: 0.8rem;
  overflow-wrap: anywhere;
}
.funnel-layout {
  display: grid;
  grid-template-columns: minmax(0, 1.5fr) minmax(260px, 0.65fr);
  gap: 20px;
}
.funnel {
  display: grid;
  gap: 0;
  padding: 0;
  list-style: none;
}
.funnel li {
  display: grid;
  grid-template-columns: 34px 1fr auto;
  align-items: center;
  gap: 12px;
  padding: 12px 0;
  border-top: 1px solid var(--ops-line);
}
.funnel-index {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 10px;
  color: var(--status-info-text);
  background: var(--status-info-soft);
  font-weight: 800;
}
.funnel li div {
  display: grid;
}
.funnel small {
  color: var(--ops-muted);
}
.cost-stack {
  display: grid;
  gap: 14px;
  align-content: start;
}
.cost-primary {
  color: var(--text-on-emphasis);
  background: linear-gradient(
    145deg,
    var(--action-primary-active),
    var(--action-primary)
  );
}
.cost-primary > strong {
  display: block;
  margin: 8px 0;
  font-size: 2.35rem;
  letter-spacing: -0.05em;
}
.cost-primary .eyebrow,
.cost-primary span {
  color: var(--text-on-emphasis-muted);
}
.unit-costs dl,
.token-use {
  display: grid;
  gap: 12px;
}
.unit-costs dl div {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}
.unit-costs dt {
  color: var(--ops-muted);
}
.unit-costs dd {
  margin: 0;
  font-weight: 800;
}
.token-use span {
  color: var(--ops-muted);
}
.decision-layout {
  display: grid;
  grid-template-columns: minmax(300px, 0.75fr) minmax(0, 1.25fr);
  gap: 20px;
}
.decision-list {
  padding: 14px;
}
.decision-row {
  display: grid;
  grid-template-columns: 38px 1fr auto;
}
.decision-icon {
  display: grid;
  width: 36px;
  height: 36px;
  place-items: center;
  border-radius: 11px;
  color: var(--status-info-text);
  background: color-mix(
    in srgb,
    var(--status-info-text) 10%,
    var(--ops-surface)
  );
}
.decision-verdict {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
.decision-verdict div {
  display: grid;
  gap: 4px;
  padding: 14px;
  border-radius: 12px;
  background: var(--ops-soft);
}
.decision-verdict span {
  color: var(--ops-muted);
  font-size: 0.8rem;
}
.explain-block {
  padding-top: 18px;
  margin-top: 18px;
  border-top: 1px solid var(--ops-line);
}
.explain-block h3 {
  margin: 0 0 10px;
}
.explain-block > p {
  color: var(--ops-muted);
  font-size: 0.83rem;
  line-height: 1.5;
}
.chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 7px;
}
.pins {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 10px 24px;
  margin: 0;
}
.correction {
  padding: 12px;
  border-radius: 11px;
  background: var(--ops-soft);
}
.correction span {
  margin-left: 8px;
  color: var(--ops-muted);
}
.correction p,
.muted {
  color: var(--ops-muted);
}
.version-hero {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  margin-bottom: 24px;
}
.version-hero p:not(.eyebrow) {
  max-width: 700px;
  color: var(--ops-muted);
}
.version-timeline {
  position: relative;
  display: grid;
  gap: 16px;
  padding-left: 30px;
}
.version-timeline::before {
  position: absolute;
  top: 0;
  bottom: 0;
  left: 10px;
  width: 2px;
  content: "";
  background: var(--ops-line);
}
.version-card {
  position: relative;
}
.timeline-dot {
  position: absolute;
  left: -37px;
  top: 27px;
  width: 16px;
  height: 16px;
  border: 4px solid var(--ops-surface);
  border-radius: 50%;
  background: var(--action-primary);
  box-shadow: 0 0 0 1px var(--action-primary);
}
.field,
.correction-form label {
  display: grid;
  gap: 7px;
  font-weight: 700;
}
.correction-form {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 14px;
  margin-top: 16px;
}
.correction-form__wide {
  grid-column: 1 / -1;
}
.ci-ops :deep(.p-message-success),
.ci-ops :deep(.p-message-success .p-message-text) {
  color: var(--status-success-text);
}
.ci-ops :deep(.p-tag-info),
.ci-ops :deep(.p-tag-info .p-tag-label) {
  color: var(--text-primary);
}
@media (max-width: 1100px) {
  .gate-line {
    grid-template-columns: repeat(2, 1fr);
  }
  .gate {
    border-bottom: 1px solid var(--ops-line);
  }
  .ops-grid,
  .funnel-layout {
    grid-template-columns: 1fr;
  }
  .history-panel {
    position: static;
  }
  .decision-layout {
    grid-template-columns: minmax(260px, 0.75fr) minmax(0, 1.25fr);
  }
  .observation-list article {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 720px) {
  .ci-ops {
    padding: 18px 12px 64px;
  }
  .ci-ops__header {
    align-items: stretch;
    flex-direction: column;
  }
  .ci-ops__actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .authoring-workspace-link {
    justify-content: center;
  }
  .ci-ops__header h1 {
    font-size: 2.15rem;
  }
  .admission-card__summary {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .admission-orb {
    width: 42px;
    height: 42px;
  }
  .gate-line,
  .matrix-list,
  .calibration-grid,
  .authority-strip,
  .decision-verdict,
  .pins,
  .correction-form {
    grid-template-columns: 1fr;
  }
  .gate {
    min-height: auto;
    border-right: 0;
  }
  .metric-row {
    grid-template-columns: minmax(130px, 1fr) 78px 78px;
    padding: 0 9px;
    font-size: 0.82rem;
  }
  .queue-impact {
    grid-template-columns: 1fr;
  }
  .queue-impact p {
    grid-column: 1;
  }
  .decision-layout {
    display: block;
  }
  .decision-layout--detail .decision-list {
    display: none;
  }
  .decision-detail {
    min-height: 68vh;
  }
  .version-timeline {
    padding-left: 22px;
  }
  .timeline-dot {
    left: -29px;
  }
  .correction-form__wide {
    grid-column: 1;
  }
}
@media (prefers-reduced-motion: no-preference) {
  .surface,
  .history-row,
  .decision-row {
    transition:
      border-color 0.18s ease,
      background-color 0.18s ease,
      transform 0.18s ease;
  }
  .history-row:hover,
  .decision-row:hover {
    transform: translateY(-1px);
  }
}
</style>
