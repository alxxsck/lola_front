<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { onBeforeRouteLeave, useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import MultiSelect from "primevue/multiselect";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import SupportDetectionCalibrationCard from "@/features/support-case-intelligence/ui/SupportDetectionCalibrationCard.vue";
import SupportDetectionPreviewConsole from "@/features/support-case-intelligence/ui/SupportDetectionPreviewConsole.vue";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import {
  type CaseIntelligenceAuthority,
  useSupportCaseIntelligence,
} from "@/features/support-case-intelligence/model/use-support-case-intelligence";
import {
  createRule,
  createTopic,
  presentCaseIntelligenceRuntime,
} from "@/features/support-case-intelligence/model/support-case-intelligence-policy";
import type {
  CaseIntelligenceAttributePredicateDto,
  CaseIntelligenceDetectionRuleDto,
} from "@/shared/api/generated/models";
import { localeDisplayName } from "@/shared/lib/locale";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const accessDenied = ref(false);
const publishKind = ref<"DETECTION" | "BUDGET" | null>(null);
const discardVisible = ref(false);
const detectionEditor = ref<"SCOPE" | "TOPIC" | "RULE" | "ADVANCED" | null>(
  null,
);
const previewVisible = ref(false);
const reason = ref("");
const selectedTopicIndex = ref(0);
const selectedRuleIndex = ref(0);
const mobilePanel = computed<"MAP" | "EDITOR" | "PREVIEW">(() => "MAP");

const permissions = computed(
  () => auth.project?.effectivePermissionCodes ?? [],
);
const permissionSignature = computed(() =>
  [...permissions.value].sort().join(","),
);
const canRead = computed(
  () =>
    !accessDenied.value &&
    hasProjectPermission(permissions.value, "project.case_intelligence.read"),
);
const section = computed<"OVERVIEW" | "DETECTION" | "BUDGET">(() => {
  if (route.name === "support-case-intelligence-detection") return "DETECTION";
  if (route.name === "support-case-intelligence-budget") return "BUDGET";
  return "OVERVIEW";
});

function currentAuthority(): CaseIntelligenceAuthority | null {
  return auth.user?.id && auth.project?.id
    ? {
        actorId: auth.user.id,
        projectId: auth.project.id,
        permissions: auth.project.effectivePermissionCodes ?? [],
      }
    : null;
}

const controller = useSupportCaseIntelligence({
  authority: currentAuthority,
  async onForbidden() {
    accessDenied.value = true;
    try {
      await auth.refreshContext();
    } catch {
      // The protected state is already gone.
    }
  },
  async onAuthenticationRequired() {
    try {
      await auth.logout();
    } catch {
      // Local authority is cleared before the remote logout request.
    } finally {
      await router.replace({
        path: "/login",
        query: { redirect: route.fullPath },
      });
    }
  },
});

const draftDetection = computed(
  () => controller.snapshot.value?.detection?.draft ?? null,
);
const publishedDetection = computed(
  () => controller.snapshot.value?.detection?.published ?? null,
);
const draftBudget = computed(
  () => controller.snapshot.value?.budget?.draft ?? null,
);
const publishedBudget = computed(
  () => controller.snapshot.value?.budget?.published ?? null,
);
const activeDetectionRevisionId = computed(
  () => controller.snapshot.value?.release?.detectionPolicyRevisionId ?? null,
);
const selectedTopic = computed(
  () => controller.detection.value.topics[selectedTopicIndex.value] ?? null,
);
const selectedRule = computed(
  () => controller.detection.value.rules[selectedRuleIndex.value] ?? null,
);
const isBusy = computed(
  () => controller.loading.value || controller.mutating.value,
);

const ruleKindOptions = [
  { label: "Точное совпадение", value: "EXACT" },
  { label: "Фраза в сообщении", value: "PHRASE" },
  { label: "Поле профиля", value: "ATTRIBUTE" },
  { label: "Смысл сообщения", value: "SEMANTIC_STATEMENT" },
];
const ruleActionOptions = [
  { label: "Не создавать обращение", value: "NO_CASE" },
  { label: "Создать обращение", value: "CREATE" },
  { label: "Привязать к открытому", value: "ATTACH" },
  { label: "Открыть повторно", value: "REOPEN" },
  { label: "Передать на проверку", value: "DEFER" },
];
const attributeOperatorOptions = [
  { label: "равно", value: "EQ" },
  { label: "одно из", value: "IN" },
  { label: "больше", value: "GT" },
  { label: "не меньше", value: "GTE" },
  { label: "меньше", value: "LT" },
  { label: "не больше", value: "LTE" },
];
const channelOptions = [
  { label: "Текст", value: "TEXT" },
  { label: "Голос", value: "VOICE" },
  { label: "Telegram", value: "TELEGRAM" },
];
const ambiguityOptions = [
  { label: "Передать на проверку", value: "DEFER" },
  { label: "Добавить в очередь разбора", value: "REVIEW" },
];
const audienceKinds = ["include", "exclude"] as const;
const commonClassificationLocales = [
  "ru-RU", "en-US", "en-GB", "es-ES", "de-DE", "fr-FR", "it-IT",
  "pt-PT", "pt-BR", "pl-PL", "uk-UA", "tr-TR", "ar-SA", "zh-CN",
  "ja-JP", "ko-KR", "hi-IN", "id-ID", "kk-KZ", "uz-UZ",
] as const;

const runtimePresentation = computed(() =>
  presentCaseIntelligenceRuntime(controller.snapshot.value),
);
const modelProfileOptions = computed(
  () => controller.modelProfiles.value?.items ?? [],
);
const selectedModelProfile = computed(() =>
  modelProfileOptions.value.find(
    (profile) =>
      profile.revisionId ===
      controller.detection.value.modelProfileRevisionId,
  ),
);
const classificationLocaleOptions = computed(() => {
  const projectLocales = auth.project?.supportedLocales ?? [];
  const values = [...new Set([
    ...projectLocales,
    ...controller.detection.value.locales,
    controller.detection.value.fallbackLocale,
    ...commonClassificationLocales,
  ])].filter(Boolean);
  const projectLocaleSet = new Set(projectLocales);
  return values.map((value) => ({
    value,
    label: `${humanLocaleName(value)} · ${value}`,
    project: projectLocaleSet.has(value),
  })).sort((left, right) =>
    Number(right.project) - Number(left.project) ||
    left.label.localeCompare(right.label, "ru"),
  );
});
const fallbackLocaleOptions = computed(() =>
  controller.detection.value.locales.map((value) => ({
    value,
    label: `${humanLocaleName(value)} · ${value}`,
  })),
);
const classificationLocaleSummary = computed(() =>
  humanLocaleList(controller.detection.value.locales),
);
const fallbackLocaleSummary = computed(() =>
  controller.detection.value.fallbackLocale
    ? humanLocaleName(controller.detection.value.fallbackLocale)
    : "Не выбран",
);
const detectionEditorTitle = computed(() => {
  if (detectionEditor.value === "SCOPE") return "Охват классификации";
  if (detectionEditor.value === "TOPIC")
    return selectedTopic.value?.label || "Новая категория";
  if (detectionEditor.value === "RULE")
    return selectedRule.value?.phrase ||
      selectedRule.value?.statement ||
      selectedRule.value?.attributeCode
      ? "Точное правило"
      : "Новое точное правило";
  return "Дополнительные настройки";
});
const detectionErrors = computed(() =>
  controller.detectionIssues.value.filter((item) => item.severity === "ERROR"),
);
const detectionWarnings = computed(() =>
  controller.detectionIssues.value.filter((item) => item.severity === "WARNING"),
);
const modelSetupMissing = computed(
  () =>
    controller.modelProfiles.value !== null &&
    modelProfileOptions.value.length === 0,
);
const safetyPresentation = computed(() => {
  const safety = controller.snapshot.value?.safety;
  if (safety?.state === "READY")
    return {
      label: "Защита согласована",
      copy:
        safety.assistantReleaseGate === "ALLOW"
          ? "Обязательные правила безопасности проверены. Обычные ответы Lola разрешены."
          : "Сервер использует только безопасный резервный ответ.",
      tone: "success",
    };
  if (safety?.state === "SAFETY_RECONCILING")
    return {
      label: "Защита обновляется",
      copy:
        "Платформа согласует обязательную версию. Проект не может отменить или ослабить эту проверку.",
      tone: "warning",
    };
  return {
    label: "Защита недоступна",
    copy:
      "Обычные автоматические ответы заблокированы до восстановления обязательной проверки.",
    tone: "warning",
  };
});

function examplesText(values: string[]) {
  return values.join("\n");
}

function updateExamples(
  kind: "positiveExamples" | "negativeExamples",
  value: string | undefined,
) {
  if (!selectedTopic.value) return;
  selectedTopic.value[kind] = String(value ?? "")
    .split("\n")
    .map((item) => item.trim())
    .filter(Boolean)
    .slice(0, 20);
}

function humanLocaleName(value: string) {
  const name = localeDisplayName(value);
  return name.charAt(0).toLocaleUpperCase("ru-RU") + name.slice(1);
}

function humanLocaleList(values: string[]) {
  if (!values.length) return "Не выбраны";
  return new Intl.ListFormat("ru", { style: "long", type: "conjunction" })
    .format(values.map(humanLocaleName));
}

function updateLocales(value: string[] | undefined) {
  const locales = [...new Set(value ?? [])].slice(0, 20);
  controller.detection.value.locales = locales;
  if (!locales.includes(controller.detection.value.fallbackLocale)) {
    controller.detection.value.fallbackLocale = locales[0] ?? "";
  }
}

function addTopic() {
  if (controller.detection.value.topics.length >= 50) return;
  controller.detection.value.topics.push(
    createTopic(controller.detection.value.topics.length + 1),
  );
  selectedTopicIndex.value = controller.detection.value.topics.length - 1;
  detectionEditor.value = "TOPIC";
}

function removeTopic(index: number) {
  controller.detection.value.topics.splice(index, 1);
  selectedTopicIndex.value = Math.max(
    0,
    Math.min(
      selectedTopicIndex.value,
      controller.detection.value.topics.length - 1,
    ),
  );
}

function addRule() {
  if (controller.detection.value.rules.length >= 200) return;
  controller.detection.value.rules.push(
    createRule(controller.detection.value.rules.length + 1),
  );
  selectedRuleIndex.value = controller.detection.value.rules.length - 1;
  detectionEditor.value = "RULE";
}

function removeRule(index: number) {
  controller.detection.value.rules.splice(index, 1);
  selectedRuleIndex.value = Math.max(
    0,
    Math.min(
      selectedRuleIndex.value,
      controller.detection.value.rules.length - 1,
    ),
  );
}

function updateRuleKind(rule: CaseIntelligenceDetectionRuleDto, value: string) {
  rule.kind = value as CaseIntelligenceDetectionRuleDto["kind"];
  delete rule.phrase;
  delete rule.statement;
  delete rule.attributeCode;
  delete rule.operator;
  delete rule.value;
  if (rule.kind === "EXACT" || rule.kind === "PHRASE") rule.phrase = "";
  if (rule.kind === "SEMANTIC_STATEMENT") rule.statement = "";
  if (rule.kind === "ATTRIBUTE") {
    rule.attributeCode = "";
    rule.operator = "EQ";
    rule.value = "";
  }
}

function ruleValueText(rule: CaseIntelligenceDetectionRuleDto) {
  return Array.isArray(rule.value)
    ? rule.value.join(", ")
    : String(rule.value ?? "");
}

function updateRuleValue(
  rule: CaseIntelligenceDetectionRuleDto,
  value: string | undefined,
) {
  const normalized = String(value ?? "").trim();
  rule.value =
    rule.operator === "IN"
      ? normalized
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : normalized;
}

function addAudiencePredicate(kind: "include" | "exclude") {
  controller.detection.value.audience[kind].push({
    attributeCode: "",
    operator: "EQ",
    value: "",
  });
}

function showMobilePanel(_panel: "MAP" | "EDITOR" | "PREVIEW") {
  void _panel;
  // The desktop and mobile flows now use the same explicit editor dialogs.
}

function audienceValueText(predicate: CaseIntelligenceAttributePredicateDto) {
  return Array.isArray(predicate.value)
    ? predicate.value.join(", ")
    : String(predicate.value ?? "");
}

function updateAudienceValue(
  predicate: CaseIntelligenceAttributePredicateDto,
  value: string | undefined,
) {
  const normalized = String(value ?? "").trim();
  predicate.value =
    predicate.operator === "IN"
      ? normalized
          .split(",")
          .map((item) => item.trim())
          .filter(Boolean)
      : normalized;
}

function openTopic(index: number) {
  selectedTopicIndex.value = index;
  detectionEditor.value = "TOPIC";
}

function openRule(index: number) {
  selectedRuleIndex.value = index;
  detectionEditor.value = "RULE";
}

function closeDetectionEditor() {
  detectionEditor.value = null;
}

function openIssue(path: string) {
  const topic = /^topics\.(\d+)/u.exec(path);
  if (topic) {
    openTopic(Number(topic[1]));
    return;
  }
  const rule = /^rules\.(\d+)/u.exec(path);
  if (rule) {
    openRule(Number(rule[1]));
    return;
  }
  if (["scope", "locales", "fallbackLocale", "channels"].includes(path)) {
    detectionEditor.value = "SCOPE";
    return;
  }
  detectionEditor.value = "ADVANCED";
}

function decisionLabel(value: string) {
  return (
    ruleActionOptions.find((item) => item.value === value)?.label ??
    "Передать на проверку"
  );
}

function formatMicroUsd(value: string) {
  if (!/^\d+$/.test(value)) return "Введите сумму целым числом";
  return `≈ ${new Intl.NumberFormat("ru-RU", {
    style: "currency",
    currency: "USD",
    maximumFractionDigits: 4,
  }).format(Number(value) / 1_000_000)}`;
}

function issueFor(path: string) {
  return (
    controller.detectionIssues.value.find((item) => item.path === path)
      ?.message ?? ""
  );
}

function budgetIssueFor(path: string) {
  return (
    controller.budgetIssues.value.find((item) => item.path === path)?.message ??
    ""
  );
}

function openPublish(kind: "DETECTION" | "BUDGET") {
  reason.value = "Обновление рабочих правил поддержки";
  publishKind.value = kind;
}

async function confirmPublish() {
  const kind = publishKind.value;
  publishKind.value = null;
  if (!reason.value.trim()) return;
  if (kind === "DETECTION")
    await controller.publishDetection(reason.value.trim());
  if (kind === "BUDGET") await controller.publishBudget(reason.value.trim());
}

async function confirmDiscard() {
  discardVisible.value = false;
  await controller.discardDetection("Черновик больше не нужен");
}

async function load() {
  await controller.load();
  selectedTopicIndex.value = 0;
  selectedRuleIndex.value = 0;
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (!controller.hasPendingRecovery.value) return;
  event.preventDefault();
  event.returnValue = "";
}

onBeforeRouteLeave(() => {
  if (!controller.hasPendingRecovery.value) return true;
  return window.confirm(
    "Сервер ещё не подтвердил предыдущую команду. Всё равно покинуть страницу?",
  );
});

watch(
  () => [auth.user?.id, auth.project?.id, permissionSignature.value] as const,
  () => {
    accessDenied.value = false;
    controller.reset({ nextAuthority: currentAuthority() });
    if (canRead.value) void load();
  },
  { flush: "sync" },
);

onMounted(() => {
  window.addEventListener("beforeunload", beforeUnload);
  if (canRead.value) void load();
});

onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", beforeUnload);
  controller.reset();
});
</script>

<template>
  <section class="page intelligence-page" aria-labelledby="intelligence-title">
    <header class="intelligence-header">
      <div>
        <div class="eyebrow">
          <i class="pi pi-sitemap" /> Настройки поддержки
        </div>
        <h1 id="intelligence-title">Категории и правила обращений</h1>
        <p>
          Настройте, как Lola распознаёт тему сообщения и решает, создавать ли
          обращение.
        </p>
      </div>
      <div class="header-actions">
        <Tag
          v-if="canRead && !controller.canManageDetection.value"
          value="Только просмотр"
          severity="secondary"
        />
        <Button
          v-if="canRead"
          label="Перечитать"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="controller.loading.value"
          :disabled="
            controller.mutating.value || controller.hasPendingRecovery.value
          "
          @click="load"
        />
      </div>
    </header>

    <Message v-if="!canRead" severity="warn" :closable="false">
      Для этого раздела нужен доступ к правилам обращений текущего проекта.
    </Message>

    <template v-else>
      <nav class="section-tabs" aria-label="Разделы правил обращений">
        <RouterLink
          to="/support/settings/case-intelligence"
          :aria-current="section === 'OVERVIEW' ? 'page' : undefined"
          ><i class="pi pi-th-large" /> Обзор</RouterLink
        >
        <RouterLink
          to="/support/settings/case-intelligence/detection"
          :aria-current="section === 'DETECTION' ? 'page' : undefined"
          ><i class="pi pi-tags" /> Категории и правила</RouterLink
        >
        <RouterLink
          to="/support/settings/case-intelligence/models-budget"
          :aria-current="section === 'BUDGET' ? 'page' : undefined"
          ><i class="pi pi-gauge" /> Модель и лимиты</RouterLink
        >
      </nav>

      <div class="live-region" aria-live="polite" aria-atomic="true">
        <Message
          v-if="controller.error.value"
          severity="error"
          :closable="false"
          >{{ controller.error.value }}</Message
        >
        <Message
          v-else-if="controller.feedback.value"
          severity="success"
          :closable="false"
          >{{ controller.feedback.value }}</Message
        >
        <Message
          v-if="controller.hasPendingRecovery.value"
          severity="warn"
          :closable="false"
        >
          <div class="recovery-message">
            <span
              >Предыдущая команда ждёт подтверждения сервера. Новые изменения
              временно заблокированы.</span
            ><Button
              label="Проверить эту попытку"
              size="small"
              :loading="controller.mutating.value"
              @click="controller.retryPending"
            />
          </div>
        </Message>
      </div>

      <div
        v-if="controller.loading.value && !controller.snapshot.value"
        class="skeleton-grid"
        aria-label="Загрузка правил"
      >
        <Skeleton height="9rem" border-radius="14px" />
        <Skeleton height="20rem" border-radius="14px" />
        <Skeleton height="20rem" border-radius="14px" />
      </div>

      <section
        v-else-if="!controller.snapshot.value"
        class="empty-state"
        role="alert"
      >
        <i class="pi pi-cloud-off" aria-hidden="true" />
        <h2>Не удалось открыть правила</h2>
        <p>
          Данные проекта не загружены. На этой странице ничего не изменилось.
        </p>
        <Button label="Попробовать снова" icon="pi pi-refresh" @click="load" />
      </section>

      <template v-else>
        <main v-if="section === 'OVERVIEW'" class="overview-grid">
          <article
            class="summary-card summary-card--primary"
            :data-tone="runtimePresentation.tone"
          >
            <div class="card-kicker">Рабочая версия</div>
            <div class="summary-heading">
              <span class="status-dot" /> {{ runtimePresentation.label }}
            </div>
            <p>{{ runtimePresentation.copy }}</p>
            <dl class="facts">
              <div>
                <dt>Рабочие правила</dt>
                <dd>
                  {{
                    activeDetectionRevisionId
                      ? activeDetectionRevisionId === publishedDetection?.id
                        ? `Версия ${publishedDetection.version}`
                        : "Предыдущая опубликованная версия"
                      : "Не входят в общую версию"
                  }}
                </dd>
              </div>
              <div>
                <dt>Черновик</dt>
                <dd>
                  {{
                    draftDetection ? `Версия ${draftDetection.version}` : "Нет"
                  }}
                </dd>
              </div>
            </dl>
            <Button
              label="Открыть правила"
              icon="pi pi-arrow-right"
              icon-pos="right"
              @click="
                router.push('/support/settings/case-intelligence/detection')
              "
            />
          </article>
          <article class="summary-card">
            <div class="card-kicker">Карта правил</div>
            <h2>
              {{ controller.detection.value.topics.length }} категорий ·
              {{ controller.detection.value.rules.length }} правил
            </h2>
            <p>
              Категории объясняют смысл обращения. Правила задают точные
              признаки и действие.
            </p>
            <div class="topic-cloud">
              <Tag
                v-for="topic in controller.detection.value.topics.slice(0, 6)"
                :key="topic.code"
                :value="topic.label || topic.code"
                severity="secondary"
              /><span
                v-if="!controller.detection.value.topics.length"
                class="muted"
                >Категории ещё не созданы</span
              >
            </div>
          </article>
          <article class="summary-card" :data-tone="safetyPresentation.tone">
            <div class="card-kicker">Обязательная безопасность</div>
            <h2>{{ safetyPresentation.label }}</h2>
            <p>{{ safetyPresentation.copy }}</p>
            <div class="platform-owned-note">
              <i class="pi pi-shield" aria-hidden="true" />
              Управляется платформой и доступно здесь только для просмотра.
            </div>
          </article>
          <article class="summary-card">
            <div class="card-kicker">Расходы</div>
            <h2>
              {{
                controller.canReadCost.value
                  ? Number(
                      controller.budget.value.dailyTokenHardCap,
                    ).toLocaleString("ru-RU")
                  : "Скрыто правами"
              }}
            </h2>
            <p>
              {{
                controller.canReadCost.value
                  ? "Максимум токенов в день. При достижении лимита новые проверки останавливаются."
                  : "Для просмотра лимитов нужен отдельный доступ к расходам."
              }}
            </p>
            <Button
              label="Модель и лимиты"
              severity="secondary"
              outlined
              @click="
                router.push('/support/settings/case-intelligence/models-budget')
              "
            />
          </article>
        </main>

        <div v-else-if="section === 'DETECTION'" class="detection-workbench">
          <main class="classification-map">
            <section class="classification-brief">
              <div>
                <div class="card-kicker">Текущий черновик</div>
                <h2>Карта классификации</h2>
                <p>
                  Категория объясняет тему обращения через название, описание и
                  примеры. Lola сравнивает с ними смысл сообщения. Точное
                  правило нужно только для однозначной фразы; если уверенного
                  совпадения нет, система не придумывает новую категорию и
                  передаёт решение на проверку.
                </p>
              </div>
              <div class="brief-actions">
                <Button
                  label="Настроить охват"
                  icon="pi pi-sliders-h"
                  severity="secondary"
                  outlined
                  @click="detectionEditor = 'SCOPE'"
                />
                <Button
                  label="Открыть проверку"
                  icon="pi pi-play"
                  :disabled="controller.hasDetectionErrors.value"
                  @click="previewVisible = true"
                />
              </div>
              <div class="scope-facts">
                <div>
                  <span class="scope-facts__label">Языки классификации</span>
                  <strong>{{ classificationLocaleSummary }}</strong>
                  <small>Для этих языков применяются свои правила и проверенные пороги.</small>
                </div>
                <div>
                  <span class="scope-facts__label">Запасной язык</span>
                  <strong>{{ fallbackLocaleSummary }}</strong>
                  <small>Используется, когда источник не сообщил язык.</small>
                </div>
                <div>
                  <span class="scope-facts__label">Каналы</span>
                  <strong>
                    {{
                      controller.detection.value.channels
                        .map(
                          (value) =>
                            channelOptions.find((item) => item.value === value)
                              ?.label ?? value,
                        )
                        .join(", ")
                    }}
                  </strong>
                  <small>Классификация запускается только для выбранных каналов.</small>
                </div>
              </div>
            </section>

            <Message
              v-if="modelSetupMissing"
              severity="warn"
              :closable="false"
              class="model-empty-message"
            >
              <div>
                <strong>Для проекта ещё не подготовлена модель классификации.</strong>
                <span
                  >Категории можно заполнить сейчас, но сохранить и проверить
                  общий черновик получится после того, как администратор
                  платформы опубликует модель для этого проекта.</span
                >
              </div>
              <Button
                label="Посмотреть модель и лимиты"
                severity="secondary"
                outlined
                @click="
                  router.push(
                    '/support/settings/case-intelligence/models-budget',
                  )
                "
              />
            </Message>

            <section class="catalog-section" aria-labelledby="topics-title">
              <div class="catalog-heading">
                <div>
                  <span class="catalog-count"
                    >{{ controller.detection.value.topics.length }}/50</span
                  >
                  <h2 id="topics-title">Категории</h2>
                  <p>
                    Понятные темы обращений: «Доставка», «Возврат», «Не проходит
                    оплата».
                  </p>
                </div>
                <Button
                  v-if="controller.canManageDetection.value"
                  label="Добавить категорию"
                  icon="pi pi-plus"
                  @click="addTopic"
                />
              </div>
              <div
                v-if="controller.detection.value.topics.length"
                class="topic-grid"
              >
                <article
                  v-for="(topic, index) in controller.detection.value.topics"
                  :key="`${topic.code}-${index}`"
                  class="topic-card"
                >
                  <div class="topic-card__topline">
                    <Tag
                      :value="
                        issueFor(`topics.${index}.code`) ||
                        issueFor(`topics.${index}.label`) ||
                        issueFor(`topics.${index}.description`)
                          ? 'Нужно заполнить'
                          : 'Готово'
                      "
                      :severity="
                        issueFor(`topics.${index}.code`) ||
                        issueFor(`topics.${index}.label`) ||
                        issueFor(`topics.${index}.description`)
                          ? 'warn'
                          : 'success'
                      "
                    />
                    <span class="stable-code">{{
                      topic.code || "КОД НЕ ЗАДАН"
                    }}</span>
                  </div>
                  <h3>{{ topic.label || "Новая категория" }}</h3>
                  <p>
                    {{
                      topic.description ||
                      "Добавьте короткое объяснение, какие обращения относятся к этой категории."
                    }}
                  </p>
                  <div class="topic-card__meta">
                    <span
                      ><i class="pi pi-check-circle" />
                      {{ topic.positiveExamples.length }} подходящих</span
                    >
                    <span
                      ><i class="pi pi-minus-circle" />
                      {{ topic.negativeExamples.length }} исключений</span
                    >
                  </div>
                  <Button
                    label="Редактировать"
                    icon="pi pi-pencil"
                    severity="secondary"
                    text
                    @click="openTopic(index)"
                  />
                </article>
              </div>
              <div v-else class="catalog-empty">
                <i class="pi pi-tags" aria-hidden="true" />
                <div>
                  <h3>Категорий пока нет</h3>
                  <p>
                    Добавьте первую тему и приведите несколько реальных
                    примеров без личных данных.
                  </p>
                </div>
              </div>
            </section>

            <section class="catalog-section" aria-labelledby="rules-title">
              <div class="catalog-heading">
                <div>
                  <span class="catalog-count"
                    >{{ controller.detection.value.rules.length }}/200</span
                  >
                  <h2 id="rules-title">Точные правила</h2>
                  <p>
                    Исключения для однозначных фраз. Они проверяются раньше
                    смысловой модели.
                  </p>
                </div>
                <Button
                  v-if="controller.canManageDetection.value"
                  label="Добавить правило"
                  icon="pi pi-plus"
                  severity="secondary"
                  outlined
                  @click="addRule"
                />
              </div>
              <div
                v-if="controller.detection.value.rules.length"
                class="rule-list"
              >
                <button
                  v-for="(rule, index) in controller.detection.value.rules"
                  :key="`${rule.code}-${index}`"
                  type="button"
                  class="rule-row"
                  @click="openRule(index)"
                >
                  <span class="rule-kind">{{
                    ruleKindOptions.find((item) => item.value === rule.kind)
                      ?.label
                  }}</span>
                  <span
                    ><strong>{{
                      rule.phrase ||
                      rule.statement ||
                      rule.attributeCode ||
                      "Новое правило"
                    }}</strong
                    ><small
                      >{{ rule.code }} · {{ decisionLabel(rule.action) }}</small
                    ></span
                  >
                  <i class="pi pi-chevron-right" aria-hidden="true" />
                </button>
              </div>
              <div v-else class="catalog-empty catalog-empty--compact">
                <i class="pi pi-bolt" aria-hidden="true" />
                <div>
                  <h3>Точных правил нет</h3>
                  <p>
                    Это нормально: категории и примеры уже дают Lola основу
                    для классификации.
                  </p>
                </div>
              </div>
            </section>

            <button
              type="button"
              class="advanced-summary"
              @click="detectionEditor = 'ADVANCED'"
            >
              <span class="advanced-summary__icon"
                ><i class="pi pi-sliders-h"
              /></span>
              <span
                ><strong>Порог уверенности и ограничения</strong
                ><small
                  >Когда предложить категорию, когда применить её автоматически
                  и сколько данных учитывать.</small
                ></span
              >
              <span class="advanced-summary__value"
                >{{
                  Math.round(
                    controller.detection.value.confidenceTiers.autoApply * 100,
                  )
                }}% для автоматики</span
              >
              <i class="pi pi-chevron-right" aria-hidden="true" />
            </button>

            <section class="save-panel" aria-label="Сохранение черновика">
              <div class="save-panel__status">
                <Tag
                  v-if="detectionErrors.length"
                  :value="`${detectionErrors.length} ошибок`"
                  severity="danger"
                />
                <Tag v-else value="Можно сохранять" severity="success" />
                <span v-if="detectionWarnings.length"
                  >{{ detectionWarnings.length }} рекомендаций</span
                >
                <span
                  v-if="controller.validatedPolicyHash.value"
                  class="validation-confirmation"
                  ><i class="pi pi-check-circle" /> Серверная проверка
                  пройдена</span
                >
              </div>
              <div v-if="detectionErrors.length" class="blocking-list">
                <p>Чтобы сохранить общий черновик, исправьте:</p>
                <button
                  v-for="item in detectionErrors.slice(0, 6)"
                  :key="`${item.path}-${item.message}`"
                  type="button"
                  @click="openIssue(item.path)"
                >
                  <i class="pi pi-arrow-right" /> {{ item.message }}
                </button>
              </div>
              <div class="save-panel__actions">
                <Button
                  v-if="controller.canPreview.value"
                  label="Проверить настройки"
                  icon="pi pi-shield"
                  severity="secondary"
                  outlined
                  :loading="controller.validating.value"
                  :disabled="
                    controller.hasDetectionErrors.value ||
                    controller.hasPendingRecovery.value
                  "
                  @click="controller.validateDraft"
                />
                <Button
                  v-if="controller.canManageDetection.value"
                  label="Сохранить черновик"
                  icon="pi pi-save"
                  :loading="controller.mutating.value"
                  :disabled="
                    controller.hasDetectionErrors.value ||
                    controller.hasPendingRecovery.value
                  "
                  @click="controller.saveDetection"
                />
                <Button
                  v-if="draftDetection && controller.canPublishDetection.value"
                  label="Опубликовать"
                  icon="pi pi-check"
                  severity="success"
                  :disabled="isBusy || controller.hasPendingRecovery.value"
                  @click="openPublish('DETECTION')"
                />
              </div>
            </section>
          </main>

          <nav v-if="false" class="mobile-workflow" aria-label="Шаги настройки правил">
            <button type="button" class="mobile-step" :aria-current="mobilePanel === 'MAP' ? 'step' : undefined" @click="showMobilePanel('MAP')">Карта</button>
            <button type="button" class="mobile-step" :aria-current="mobilePanel === 'EDITOR' ? 'step' : undefined" @click="showMobilePanel('EDITOR')">Редактор</button>
            <button type="button" class="mobile-step" :aria-current="mobilePanel === 'PREVIEW' ? 'step' : undefined" @click="showMobilePanel('PREVIEW')">Проверка</button>
          </nav>
          <Dialog
            :visible="detectionEditor !== null"
            modal
            :header="detectionEditorTitle"
            class="ci-editor-dialog"
            :style="{ width: 'min(68rem, calc(100vw - 2rem))' }"
            @update:visible="closeDetectionEditor"
          >
          <main class="policy-layout policy-layout--dialog" :data-mobile-panel="mobilePanel">
          <aside class="policy-map" aria-label="Карта категорий и правил">
            <div class="map-section">
              <div class="map-heading">
                <div>
                  <span>Категории</span
                  ><small
                    >{{ controller.detection.value.topics.length }}/50</small
                  >
                </div>
                <Button
                  v-if="controller.canManageDetection.value"
                  icon="pi pi-plus"
                  rounded
                  text
                  aria-label="Добавить категорию"
                  @click="addTopic"
                />
              </div>
              <button
                v-for="(topic, index) in controller.detection.value.topics"
                :key="`${topic.code}-${index}`"
                type="button"
                class="map-item"
                :class="{ 'map-item--active': index === selectedTopicIndex }"
                @click="
                  selectedTopicIndex = index;
                  showMobilePanel('EDITOR');
                "
              >
                <span class="map-code">{{ topic.code || "БЕЗ_КОДА" }}</span
                ><span>{{ topic.label || topic.description || "Новая категория" }}</span
                ><i class="pi pi-chevron-right" />
              </button>
              <div
                v-if="!controller.detection.value.topics.length"
                class="map-empty"
              >
                Добавьте первую категорию и опишите сообщения, которые к ней
                относятся.
              </div>
            </div>
            <div class="map-section">
              <div class="map-heading">
                <div>
                  <span>Правила</span
                  ><small
                    >{{ controller.detection.value.rules.length }}/200</small
                  >
                </div>
                <Button
                  v-if="controller.canManageDetection.value"
                  icon="pi pi-plus"
                  rounded
                  text
                  aria-label="Добавить правило"
                  @click="addRule"
                />
              </div>
              <button
                v-for="(rule, index) in controller.detection.value.rules"
                :key="`${rule.code}-${index}`"
                type="button"
                class="map-item"
                :class="{ 'map-item--active': index === selectedRuleIndex }"
                @click="
                  selectedRuleIndex = index;
                  showMobilePanel('EDITOR');
                "
              >
                <span class="map-code">{{ rule.code || "БЕЗ_КОДА" }}</span
                ><span>{{ decisionLabel(rule.action) }}</span
                ><i class="pi pi-chevron-right" />
              </button>
              <div
                v-if="!controller.detection.value.rules.length"
                class="map-empty"
              >
                Правила не обязательны: Lola может опираться на описания и
                примеры категорий.
              </div>
            </div>
          </aside>

          <div class="editor-column">
            <section v-if="detectionEditor === 'SCOPE'" class="editor-card">
              <div class="editor-card__heading">
                <div>
                  <div class="card-kicker">Охват классификации</div>
                  <h2>Какие сообщения относить к категориям</h2>
                  <p>Здесь вы задаёте, для каких языков и каналов сервер будет применять правила классификации.</p>
                </div>
                <Tag
                  :value="
                    draftDetection
                      ? `Черновик ${draftDetection.version}`
                      : `На основе версии ${publishedDetection?.version ?? 0}`
                  "
                  severity="secondary"
                />
              </div>
              <section class="scope-explainer" aria-label="Как работает языковой охват">
                <i class="pi pi-language" aria-hidden="true" />
                <div>
                  <strong>Язык здесь — не переключатель понимания Lola</strong>
                  <p>Он выбирает языковые правила и пороги точности. Например, русское сообщение проверяется по русским правилам, а английское — по английским.</p>
                </div>
              </section>
              <div class="scope-section">
                <div class="scope-section__heading">
                  <span>Описание для команды</span>
                  <small>Пользователи этот текст не увидят.</small>
                </div>
                <div class="field field--flush">
                  <label for="policy-scope">Зачем проекту нужна классификация</label
                  ><Textarea
                    id="policy-scope"
                    v-model="controller.detection.value.scope"
                    rows="2"
                    auto-resize
                    maxlength="2000"
                    placeholder="Например: распределять обращения по темам и показывать оператору подходящую категорию"
                    :aria-invalid="Boolean(issueFor('scope'))"
                    aria-describedby="policy-scope-help"
                    :disabled="!controller.canManageDetection.value"
                  /><small id="policy-scope-help" :class="{ 'field-error': issueFor('scope') }"
                    >Одно короткое предложение, понятное любому руководителю. {{ issueFor("scope") }}</small
                  >
                </div>
              </div>
              <div class="scope-section scope-section--language">
                <div class="scope-section__heading">
                  <span>Языковой охват</span>
                  <small>Добавьте все языки, на которых пользователи пишут в поддержку.</small>
                </div>
                <div class="field-grid scope-language-grid">
                  <div class="field field--flush">
                    <label for="policy-locales">Языки классификации</label
                    ><MultiSelect
                      input-id="policy-locales"
                      :model-value="controller.detection.value.locales"
                      :options="classificationLocaleOptions"
                      option-label="label"
                      option-value="value"
                      display="chip"
                      filter
                      :max-selected-labels="4"
                      selected-items-label="Выбрано языков: {0}"
                      placeholder="Выберите языки"
                      :disabled="!controller.canManageDetection.value"
                      :aria-invalid="Boolean(issueFor('locales'))"
                      aria-describedby="policy-locales-help policy-locales-error"
                      @update:model-value="updateLocales"
                    /><small id="policy-locales-help"
                      >Список начинается с языков проекта. После названия показан технический код для интеграций.</small
                    >
                    <small id="policy-locales-error" class="field-error">{{ issueFor("locales") }}</small>
                  </div>
                  <div class="field field--flush">
                    <label for="policy-fallback">Запасной язык</label
                    ><Select
                      input-id="policy-fallback"
                      v-model="controller.detection.value.fallbackLocale"
                      :options="fallbackLocaleOptions"
                      option-label="label"
                      option-value="value"
                      placeholder="Сначала выберите языки"
                      aria-label="Запасной язык"
                      :disabled="!controller.canManageDetection.value || !fallbackLocaleOptions.length"
                      :aria-invalid="Boolean(issueFor('fallbackLocale'))"
                      aria-describedby="policy-fallback-help policy-fallback-error"
                    /><small id="policy-fallback-help"
                      >Сервер использует его, если канал или профиль пользователя не сообщил язык.</small
                    >
                    <small id="policy-fallback-error" class="field-error">{{ issueFor("fallbackLocale") }}</small>
                  </div>
                </div>
                <Message severity="warn" :closable="false" class="fallback-note">
                  Сообщение на другом языке не пропадёт, но будет обработано по правилам запасного языка. Поэтому включите все языки, которые реально использует ваша поддержка.
                </Message>
              </div>
              <div class="scope-section">
                <div class="scope-section__heading">
                  <span>Каналы</span>
                  <small>Где должна запускаться классификация.</small>
                </div>
                <div class="field field--flush">
                  <span class="field-label">Проверять сообщения из каналов</span>
                  <div class="check-row channel-choice-row">
                    <label v-for="channel in channelOptions" :key="channel.value"
                      ><Checkbox
                        v-model="controller.detection.value.channels"
                        :input-id="`channel-${channel.value}`"
                        :value="channel.value"
                        :aria-invalid="Boolean(issueFor('channels'))"
                        aria-describedby="channels-error"
                        :disabled="!controller.canManageDetection.value"
                      /><span>{{ channel.label }}</span></label
                    >
                  </div>
                  <small id="channels-error" class="field-error">{{ issueFor("channels") }}</small>
                </div>
              </div>
            </section>

            <section
              v-if="detectionEditor === 'TOPIC' && selectedTopic"
              class="editor-card editor-card--focus"
            >
              <div class="editor-card__heading">
                <div>
                  <div class="card-kicker">
                    Категория {{ selectedTopicIndex + 1 }}
                  </div>
                  <h2>{{ selectedTopic.label || "Новая категория" }}</h2>
                </div>
                <Button
                  v-if="false"
                  label="Удалить"
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  @click="removeTopic(selectedTopicIndex)"
                />
              </div>
              <div class="field-grid">
                <div class="field">
                  <label for="topic-code">Код категории</label
                  ><InputText
                    id="topic-code"
                    v-model="selectedTopic.code"
                    maxlength="64"
                    :disabled="!controller.canManageDetection.value"
                  /><small
                    :class="{
                      'field-error': issueFor(
                        `topics.${selectedTopicIndex}.code`,
                      ),
                    }"
                    >Короткий постоянный код для отчётов. Используйте заглавные
                    латинские буквы, цифры и подчёркивание.
                    {{ issueFor(`topics.${selectedTopicIndex}.code`) }}</small
                  >
                </div>
                <div class="field">
                  <label for="topic-label">Название категории</label>
                  <InputText
                    id="topic-label"
                    v-model="selectedTopic.label"
                    maxlength="120"
                    :aria-invalid="Boolean(issueFor(`topics.${selectedTopicIndex}.label`))"
                    :aria-describedby="`topic-label-error-${selectedTopicIndex}`"
                    :disabled="!controller.canManageDetection.value"
                  />
                  <small :id="`topic-label-error-${selectedTopicIndex}`" class="field-error">{{
                    issueFor(`topics.${selectedTopicIndex}.label`)
                  }}</small>
                </div>
              </div>
              <div class="field">
                  <label for="topic-description"
                    >Какие обращения сюда относятся</label
                  ><Textarea
                    id="topic-description"
                    v-model="selectedTopic.description"
                    rows="3"
                    auto-resize
                    maxlength="1000"
                    :disabled="!controller.canManageDetection.value"
                  /><small class="field-error">{{
                    issueFor(`topics.${selectedTopicIndex}.description`)
                  }}</small>
              </div>
              <div class="field-grid">
                <div class="field">
                  <label for="topic-positive">Подходящие примеры</label
                  ><Textarea
                    id="topic-positive"
                    :model-value="examplesText(selectedTopic.positiveExamples)"
                    rows="4"
                    :disabled="!controller.canManageDetection.value"
                    @update:model-value="
                      updateExamples('positiveExamples', $event)
                    "
                  /><small
                    >Один пример в строке. Используйте реальные формулировки без
                    личных данных.</small
                  >
                  <small class="field-error">{{ issueFor(`topics.${selectedTopicIndex}.positiveExamples`) }}</small>
                </div>
                <div class="field">
                  <label for="topic-negative"
                    >Похожие, но неподходящие примеры</label
                  ><Textarea
                    id="topic-negative"
                    :model-value="examplesText(selectedTopic.negativeExamples)"
                    rows="4"
                    :disabled="!controller.canManageDetection.value"
                    @update:model-value="
                      updateExamples('negativeExamples', $event)
                    "
                  /><small
                    >Покажите границу категории, чтобы сократить ложные
                    совпадения.</small
                  >
                  <small class="field-error">{{ issueFor(`topics.${selectedTopicIndex}.negativeExamples`) }}</small>
                </div>
              </div>
            </section>

            <section v-else-if="detectionEditor === 'TOPIC'" class="editor-card empty-card">
              <i class="pi pi-tags" />
              <h2>Добавьте категорию</h2>
              <p>
                Начните с понятного названия, описания и нескольких примеров.
              </p>
              <Button
                v-if="controller.canManageDetection.value"
                label="Добавить категорию"
                icon="pi pi-plus"
                @click="addTopic"
              />
            </section>

            <section v-if="detectionEditor === 'RULE' && selectedRule" class="editor-card">
              <div class="editor-card__heading">
                <div>
                  <div class="card-kicker">
                    Точное правило {{ selectedRuleIndex + 1 }}
                  </div>
                  <h2>{{ selectedRule.code || "Новое правило" }}</h2>
                </div>
                <Button
                  v-if="false"
                  label="Удалить"
                  icon="pi pi-trash"
                  severity="danger"
                  text
                  @click="removeRule(selectedRuleIndex)"
                />
              </div>
              <div class="field-grid field-grid--three">
                <div class="field">
                  <label for="rule-code">Код правила</label
                  ><InputText
                    id="rule-code"
                    v-model="selectedRule.code"
                    maxlength="64"
                    :disabled="!controller.canManageDetection.value"
                  />
                  <small class="field-error">{{ issueFor(`rules.${selectedRuleIndex}.code`) }}</small>
                </div>
                <div class="field">
                  <label for="rule-kind">Что проверять</label
                  ><Select
                    id="rule-kind"
                    :model-value="selectedRule.kind"
                    :options="ruleKindOptions"
                    option-label="label"
                    option-value="value"
                    :disabled="!controller.canManageDetection.value"
                    @update:model-value="updateRuleKind(selectedRule, $event)"
                  />
                </div>
                <div class="field">
                  <label for="rule-action">Что сделать</label
                  ><Select
                    id="rule-action"
                    v-model="selectedRule.action"
                    :options="ruleActionOptions"
                    option-label="label"
                    option-value="value"
                    :disabled="!controller.canManageDetection.value"
                  />
                </div>
              </div>
              <div
                v-if="
                  selectedRule.kind === 'EXACT' ||
                  selectedRule.kind === 'PHRASE'
                "
                class="field"
              >
                <label for="rule-phrase">{{
                  selectedRule.kind === "EXACT"
                    ? "Точный текст"
                    : "Фраза в сообщении"
                }}</label
                ><InputText
                  id="rule-phrase"
                  v-model="selectedRule.phrase"
                  maxlength="500"
                  :disabled="!controller.canManageDetection.value"
                /><small class="field-error">{{
                  issueFor(`rules.${selectedRuleIndex}.phrase`)
                }}</small>
              </div>
              <div
                v-else-if="selectedRule.kind === 'SEMANTIC_STATEMENT'"
                class="field"
              >
                <label for="rule-statement">Какой смысл искать</label
                ><Textarea
                  id="rule-statement"
                  v-model="selectedRule.statement"
                  rows="3"
                  auto-resize
                  maxlength="1000"
                  :disabled="!controller.canManageDetection.value"
                />
                <small class="field-error">{{ issueFor(`rules.${selectedRuleIndex}.statement`) }}</small>
              </div>
              <div v-else class="field-grid field-grid--three">
                <div class="field">
                  <label for="rule-attribute">Поле профиля</label
                  ><InputText
                    id="rule-attribute"
                    v-model="selectedRule.attributeCode"
                    maxlength="64"
                    :disabled="!controller.canManageDetection.value"
                  />
                  <small class="field-error">{{ issueFor(`rules.${selectedRuleIndex}.attributeCode`) }}</small>
                </div>
                <div class="field">
                  <label for="rule-operator">Условие</label
                  ><Select
                    id="rule-operator"
                    v-model="selectedRule.operator"
                    :options="attributeOperatorOptions"
                    option-label="label"
                    option-value="value"
                    :disabled="!controller.canManageDetection.value"
                  />
                  <small class="field-error">{{ issueFor(`rules.${selectedRuleIndex}.operator`) }}</small>
                </div>
                <div class="field">
                  <label for="rule-value">Значение</label
                  ><InputText
                    id="rule-value"
                    :model-value="ruleValueText(selectedRule)"
                    :disabled="!controller.canManageDetection.value"
                    @update:model-value="updateRuleValue(selectedRule, $event)"
                  />
                  <small class="field-error">{{ issueFor(`rules.${selectedRuleIndex}.value`) }}</small>
                </div>
              </div>
              <div class="field-grid field-grid--three">
                <div class="field">
                  <label for="rule-locale">Язык правила</label
                  ><InputText
                    id="rule-locale"
                    v-model="selectedRule.locale"
                    placeholder="ru-RU"
                    maxlength="35"
                    :disabled="!controller.canManageDetection.value"
                  />
                  <small class="field-error">{{ issueFor(`rules.${selectedRuleIndex}.locale`) }}</small>
                </div>
                <div class="field">
                  <label for="rule-priority">Порядок проверки</label
                  ><InputNumber
                    input-id="rule-priority"
                    v-model="selectedRule.priority"
                    :min="0"
                    :max="10000"
                    :disabled="!controller.canManageDetection.value"
                  />
                  <small class="field-error">{{ issueFor(`rules.${selectedRuleIndex}.priority`) }}</small>
                </div>
              </div>
            </section>

            <details v-if="detectionEditor === 'ADVANCED'" class="editor-card advanced-card" open>
              <summary>
                <span
                  ><span class="card-kicker">Дополнительно</span
                  ><strong>Пороги и технические ограничения</strong></span
                ><i class="pi pi-chevron-down" />
              </summary>
              <div class="advanced-content">
                <Message severity="info" :closable="false">
                  Текст сравнивается без различия регистра и лишних пробелов.
                  Точное правило учитывает границы слов. Совпадение внутри
                  цитаты или отрицания не запускает действие автоматически.
                  Сначала проверяется больший приоритет; конфликт правил одного
                  уровня передаётся человеку.
                </Message>
                <div class="field-grid field-grid--three">
                  <div class="field">
                    <label for="threshold-monitor">Начать учитывать категорию</label
                    ><InputNumber
                      input-id="threshold-monitor"
                      v-model="
                        controller.detection.value.confidenceTiers.monitor
                      "
                      :min="0"
                      :max="1"
                      :min-fraction-digits="2"
                      :max-fraction-digits="2"
                      :disabled="!controller.canManageDetection.value"
                    />
                    <small>Ниже этого значения категория отбрасывается.</small>
                  </div>
                  <div class="field">
                    <label for="threshold-suggest">Подсказка оператору</label
                    ><InputNumber
                      input-id="threshold-suggest"
                      v-model="
                        controller.detection.value.confidenceTiers.suggest
                      "
                      :min="0"
                      :max="1"
                      :min-fraction-digits="2"
                      :max-fraction-digits="2"
                      :disabled="!controller.canManageDetection.value"
                    />
                    <small>Категория появится как рекомендация, но решение останется за человеком.</small>
                  </div>
                  <div class="field">
                    <label for="threshold-auto">Применить без подтверждения</label
                    ><InputNumber
                      input-id="threshold-auto"
                      v-model="
                        controller.detection.value.confidenceTiers.autoApply
                      "
                      :min="0"
                      :max="1"
                      :min-fraction-digits="2"
                      :max-fraction-digits="2"
                      :disabled="!controller.canManageDetection.value"
                    />
                    <small>Самый высокий и осторожный порог.</small>
                  </div>
                </div>
                <Message
                  v-if="issueFor('confidenceTiers')"
                  severity="error"
                  :closable="false"
                  >{{ issueFor("confidenceTiers") }}</Message
                >
                <div class="field-grid field-grid--three">
                  <div class="field">
                    <label for="candidate-limit">Сколько обращений сравнить</label
                    ><InputNumber
                      input-id="candidate-limit"
                      v-model="controller.detection.value.candidateLimit"
                      :min="1"
                      :max="20"
                      :aria-invalid="Boolean(issueFor('candidateLimit'))"
                      aria-describedby="candidate-limit-error"
                      :disabled="!controller.canManageDetection.value"
                    />
                    <small id="candidate-limit-error" :class="{ 'field-error': issueFor('candidateLimit') }">Последние открытые обращения, к которым можно привязать сообщение. {{ issueFor("candidateLimit") }}</small>
                  </div>
                  <div class="field">
                    <label for="debounce">Пауза после сообщения, мс</label
                    ><InputNumber
                      input-id="debounce"
                      v-model="controller.detection.value.debounceMs"
                      :min="0"
                      :max="60000"
                      :aria-invalid="Boolean(issueFor('debounceMs'))"
                      aria-describedby="debounce-error"
                      :disabled="!controller.canManageDetection.value"
                    />
                    <small id="debounce-error" :class="{ 'field-error': issueFor('debounceMs') }">Сервер подождёт продолжение сообщения и только затем начнёт проверку. {{ issueFor("debounceMs") }}</small>
                  </div>
                  <div class="field model-profile-field">
                    <label for="model-revision">Модель классификации</label
                    ><Select
                      input-id="model-revision"
                      v-model="controller.detection.value.modelProfileRevisionId"
                      :options="modelProfileOptions"
                      option-label="displayName"
                      option-value="revisionId"
                      placeholder="Выберите разрешённую модель"
                      :aria-invalid="Boolean(issueFor('modelProfileRevisionId'))"
                      aria-describedby="model-revision-description model-revision-error"
                      :disabled="!controller.canManageDetection.value"
                    />
                    <small id="model-revision-description">
                      {{ selectedModelProfile?.description ?? "Сервер не вернул описание выбранной модели." }}
                    </small>
                    <small id="model-revision-error" class="field-error">{{
                      issueFor("modelProfileRevisionId")
                    }}</small>
                  </div>
                </div>
                <div class="field-grid field-grid--three">
                  <div class="field">
                    <label for="ambiguity-action">Если уверенности недостаточно</label>
                    <Select
                      input-id="ambiguity-action"
                      v-model="controller.detection.value.ambiguityAction"
                      :options="ambiguityOptions"
                      option-label="label"
                      option-value="value"
                      :disabled="!controller.canManageDetection.value"
                    />
                    <small>Без автоматического изменения обращения.</small>
                  </div>
                  <div class="field">
                    <label for="attach-window">Продолжать открытое обращение, минут</label>
                    <InputNumber
                      input-id="attach-window"
                      :model-value="Math.round(controller.detection.value.attachWindowMs / 60000)"
                      :min="1"
                      :max="525600"
                      :aria-invalid="Boolean(issueFor('attachWindowMs'))"
                      :disabled="!controller.canManageDetection.value"
                      @update:model-value="controller.detection.value.attachWindowMs = Number($event ?? 1) * 60000"
                    />
                    <small :class="{ 'field-error': issueFor('attachWindowMs') }">В этот период новое сообщение продолжит уже открытое обращение. {{ issueFor("attachWindowMs") }}</small>
                  </div>
                  <div class="field">
                    <label for="reopen-window">Возвращать закрытое обращение, минут</label>
                    <InputNumber
                      input-id="reopen-window"
                      :model-value="Math.round(controller.detection.value.reopenWindowMs / 60000)"
                      :min="1"
                      :max="525600"
                      :aria-invalid="Boolean(issueFor('reopenWindowMs'))"
                      :disabled="!controller.canManageDetection.value"
                      @update:model-value="controller.detection.value.reopenWindowMs = Number($event ?? 1) * 60000"
                    />
                    <small :class="{ 'field-error': issueFor('reopenWindowMs') }">Позже этого срока будет создано новое обращение. {{ issueFor("reopenWindowMs") }}</small>
                  </div>
                </div>
                <div class="advanced-group">
                  <div class="advanced-group__heading">
                    <div>
                      <strong>Кому применять правила</strong>
                      <small>Оставьте списки пустыми, чтобы проверять всех пользователей проекта.</small>
                    </div>
                  </div>
                  <div
                    v-for="kind in audienceKinds"
                    :key="kind"
                    class="audience-block"
                  >
                    <div class="advanced-group__heading">
                      <span>{{ kind === 'include' ? 'Включать' : 'Исключать' }}</span>
                      <Button
                        v-if="controller.canManageDetection.value"
                        :label="kind === 'include' ? 'Добавить условие' : 'Добавить исключение'"
                        icon="pi pi-plus"
                        size="small"
                        text
                        :disabled="controller.detection.value.audience[kind].length >= 100"
                        @click="addAudiencePredicate(kind)"
                      />
                    </div>
                    <div
                      v-for="(predicate, predicateIndex) in controller.detection.value.audience[kind]"
                      :key="`${kind}-${predicateIndex}`"
                      class="predicate-row"
                    >
                      <InputText
                        v-model="predicate.attributeCode"
                        aria-label="Код поля профиля"
                        placeholder="Например, SEGMENT"
                        maxlength="64"
                        :aria-invalid="Boolean(issueFor(`audience.${kind}.${predicateIndex}.attributeCode`))"
                        :disabled="!controller.canManageDetection.value"
                      />
                      <Select
                        v-model="predicate.operator"
                        :options="attributeOperatorOptions"
                        option-label="label"
                        option-value="value"
                        aria-label="Условие"
                        :disabled="!controller.canManageDetection.value"
                      />
                      <InputText
                        :model-value="audienceValueText(predicate)"
                        aria-label="Значение условия"
                        placeholder="Значение"
                        :disabled="!controller.canManageDetection.value"
                        :aria-invalid="Boolean(issueFor(`audience.${kind}.${predicateIndex}.value`))"
                        @update:model-value="updateAudienceValue(predicate, $event)"
                      />
                      <div class="predicate-errors">
                        <small class="field-error">{{ issueFor(`audience.${kind}.${predicateIndex}.attributeCode`) }}</small>
                        <small class="field-error">{{ issueFor(`audience.${kind}.${predicateIndex}.value`) }}</small>
                      </div>
                      <Button
                        v-if="controller.canManageDetection.value"
                        icon="pi pi-trash"
                        severity="danger"
                        text
                        rounded
                        aria-label="Удалить условие"
                        @click="controller.detection.value.audience[kind].splice(predicateIndex, 1)"
                      />
                    </div>
                    <small v-if="!controller.detection.value.audience[kind].length" class="muted">Условий нет</small>
                  </div>
                </div>
                <div class="advanced-group">
                  <div class="advanced-group__heading"><div><strong>Данные для решения</strong><small>Сколько истории и фактов сервер может использовать для одной классификации.</small></div></div>
                  <div class="field-grid field-grid--three">
                    <div class="field">
                      <label for="max-signals">Сигналы о пользователе</label>
                      <InputNumber input-id="max-signals" v-model="controller.detection.value.routerContext.maxSignals" :min="1" :max="8" :aria-invalid="Boolean(issueFor('routerContext.maxSignals'))" :disabled="!controller.canManageDetection.value" />
                      <small :class="{ 'field-error': issueFor('routerContext.maxSignals') }">Структурированные факты профиля, полезные для решения. {{ issueFor("routerContext.maxSignals") }}</small>
                    </div>
                    <div class="field">
                      <label for="max-context-messages">Последние сообщения</label>
                      <InputNumber input-id="max-context-messages" v-model="controller.detection.value.routerContext.maxContextMessages" :min="0" :max="50" :aria-invalid="Boolean(issueFor('routerContext.maxContextMessages'))" :disabled="!controller.canManageDetection.value" />
                      <small :class="{ 'field-error': issueFor('routerContext.maxContextMessages') }">Сколько сообщений взять, чтобы понять контекст диалога. {{ issueFor("routerContext.maxContextMessages") }}</small>
                    </div>
                    <div class="field">
                      <label for="max-candidate-cases">Открытые обращения</label>
                      <InputNumber input-id="max-candidate-cases" v-model="controller.detection.value.routerContext.maxCandidateCases" :min="0" :max="20" :aria-invalid="Boolean(issueFor('routerContext.maxCandidateCases'))" :disabled="!controller.canManageDetection.value" />
                      <small :class="{ 'field-error': issueFor('routerContext.maxCandidateCases') }">Кандидаты на продолжение вместо создания нового обращения. {{ issueFor("routerContext.maxCandidateCases") }}</small>
                    </div>
                  </div>
                </div>
                <div class="advanced-group">
                  <div class="advanced-group__heading"><div><strong>Ограничения одной проверки</strong><small>Защитные пределы на случай слишком сложной конфигурации.</small></div></div>
                  <div class="field-grid field-grid--three">
                    <div class="field">
                      <label for="max-rules-evaluated">Точных правил за проверку</label>
                      <InputNumber input-id="max-rules-evaluated" v-model="controller.detection.value.runtimeLimits.maxRulesEvaluated" :min="1" :max="20" :aria-invalid="Boolean(issueFor('runtimeLimits.maxRulesEvaluated'))" :disabled="!controller.canManageDetection.value" />
                      <small :class="{ 'field-error': issueFor('runtimeLimits.maxRulesEvaluated') }">Это технический предел, а не требуемое количество созданных правил. {{ issueFor("runtimeLimits.maxRulesEvaluated") }}</small>
                    </div>
                    <div class="field">
                      <label for="max-semantic-statements">Смысловых признаков</label>
                      <InputNumber input-id="max-semantic-statements" v-model="controller.detection.value.runtimeLimits.maxSemanticStatements" :min="0" :max="50" :aria-invalid="Boolean(issueFor('runtimeLimits.maxSemanticStatements'))" :disabled="!controller.canManageDetection.value" />
                      <small :class="{ 'field-error': issueFor('runtimeLimits.maxSemanticStatements') }">Сколько смысловых условий модель может оценить за раз. {{ issueFor("runtimeLimits.maxSemanticStatements") }}</small>
                    </div>
                    <div class="field">
                      <label for="max-evaluation-ms">Максимальное время, мс</label>
                      <InputNumber input-id="max-evaluation-ms" v-model="controller.detection.value.runtimeLimits.maxEvaluationMs" :min="1" :max="5000" :aria-invalid="Boolean(issueFor('runtimeLimits.maxEvaluationMs'))" :disabled="!controller.canManageDetection.value" />
                      <small :class="{ 'field-error': issueFor('runtimeLimits.maxEvaluationMs') }">После этого срока сервер выберет безопасный результат. {{ issueFor("runtimeLimits.maxEvaluationMs") }}</small>
                    </div>
                  </div>
                </div>
              </div>
            </details>

            <div v-if="false" class="editor-actions">
              <div>
                <strong
                  >{{
                    controller.detectionIssues.value.filter(
                      (item) => item.severity === "ERROR",
                    ).length
                  }}
                  ошибок</strong
                ><span
                  >{{
                    controller.detectionIssues.value.filter(
                      (item) => item.severity === "WARNING",
                    ).length
                  }}
                  рекомендаций</span
                >
                <span
                  v-if="controller.validatedPolicyHash.value"
                  class="validation-confirmation"
                  role="status"
                >
                  <i class="pi pi-check-circle" aria-hidden="true" />
                  Серверная проверка пройдена
                </span>
                <ul
                  v-if="controller.hasDetectionErrors.value"
                  class="error-summary"
                  aria-label="Ошибки в правилах"
                >
                  <li
                    v-for="item in controller.detectionIssues.value.filter((issue) => issue.severity === 'ERROR').slice(0, 5)"
                    :key="`${item.path}-${item.message}`"
                  >{{ item.message }}</li>
                </ul>
              </div>
              <Button
                v-if="controller.canPreview.value"
                label="Проверить правила"
                icon="pi pi-shield"
                severity="secondary"
                outlined
                :loading="controller.validating.value"
                :disabled="controller.hasDetectionErrors.value || controller.hasPendingRecovery.value"
                @click="controller.validateDraft"
              /><Button
                v-if="draftDetection && controller.canManageDetection.value"
                label="Удалить черновик"
                severity="danger"
                text
                :disabled="isBusy || controller.hasPendingRecovery.value"
                @click="discardVisible = true"
              /><Button
                v-if="controller.canManageDetection.value"
                label="Сохранить черновик"
                icon="pi pi-save"
                :loading="controller.mutating.value"
                :disabled="
                  controller.hasDetectionErrors.value ||
                  controller.hasPendingRecovery.value
                "
                @click="controller.saveDetection"
              /><Button
                v-if="draftDetection && controller.canPublishDetection.value"
                label="Опубликовать"
                icon="pi pi-check"
                severity="success"
                :disabled="isBusy || controller.hasPendingRecovery.value"
                @click="openPublish('DETECTION')"
              />
            </div>
          </div>
          <SupportDetectionPreviewConsole
            v-if="false"
            :result="controller.dryRunResult.value"
            :locales="controller.detection.value.locales"
            :can-preview="controller.canPreview.value"
            :blocked="controller.hasDetectionErrors.value || controller.hasPendingRecovery.value"
            :loading="controller.previewing.value || controller.validating.value"
            @preview="controller.preview"
          />
        </main>
          <template #footer>
            <Button
              v-if="detectionEditor === 'TOPIC' && controller.canManageDetection.value"
              label="Удалить категорию"
              icon="pi pi-trash"
              severity="danger"
              text
              @click="removeTopic(selectedTopicIndex); closeDetectionEditor()"
            />
            <Button
              v-if="detectionEditor === 'RULE' && controller.canManageDetection.value"
              label="Удалить правило"
              icon="pi pi-trash"
              severity="danger"
              text
              @click="removeRule(selectedRuleIndex); closeDetectionEditor()"
            />
            <Button label="Готово" @click="closeDetectionEditor" />
          </template>
          </Dialog>

          <Dialog
            v-model:visible="previewVisible"
            modal
            header="Проверка на примере"
            class="ci-preview-dialog"
            :style="{ width: 'min(76rem, calc(100vw - 2rem))' }"
          >
            <SupportDetectionPreviewConsole
              :result="controller.dryRunResult.value"
              :locales="controller.detection.value.locales"
              :can-preview="controller.canPreview.value"
              :blocked="controller.hasDetectionErrors.value || controller.hasPendingRecovery.value"
              :loading="controller.previewing.value || controller.validating.value"
              @preview="controller.preview"
            />
            <template #footer>
              <Button
                label="Закрыть"
                severity="secondary"
                @click="previewVisible = false"
              />
            </template>
          </Dialog>
        </div>

        <main v-else class="budget-layout">
          <section class="editor-card budget-card">
            <div class="editor-card__heading">
              <div>
                <div class="card-kicker">Модель и лимиты</div>
                <h2>Ограничения расходов</h2>
                <p>
                  Задайте предупреждения и жёсткие пределы. Все суммы хранятся в
                  миллионных долях доллара.
                </p>
              </div>
              <Tag
                :value="
                  draftBudget
                    ? `Черновик ${draftBudget.version}`
                    : `Опубликовано ${publishedBudget?.version ?? 0}`
                "
                severity="secondary"
              />
            </div>
            <Message
              v-if="!controller.canReadCost.value"
              severity="warn"
              :closable="false"
              >Ваша роль может видеть состояние настроек, но не значения лимитов
              расходов.</Message
            >
            <div v-else class="field-grid">
              <div class="field">
                <label for="token-soft">Предупреждение по токенам в день</label
                ><InputText
                  id="token-soft"
                  v-model="controller.budget.value.dailyTokenSoftCap"
                  :aria-invalid="Boolean(budgetIssueFor('dailyTokenSoftCap'))"
                  aria-describedby="token-soft-error"
                  :disabled="!controller.canManageBudget.value"
                />
                <small id="token-soft-error" class="field-error">{{
                  budgetIssueFor("dailyTokenSoftCap")
                }}</small>
              </div>
              <div class="field">
                <label for="token-hard">Максимум токенов в день</label
                ><InputText
                  id="token-hard"
                  v-model="controller.budget.value.dailyTokenHardCap"
                  :aria-invalid="Boolean(budgetIssueFor('dailyTokenHardCap'))"
                  aria-describedby="token-hard-error"
                  :disabled="!controller.canManageBudget.value"
                />
                <small id="token-hard-error" class="field-error">{{
                  budgetIssueFor("dailyTokenHardCap")
                }}</small>
              </div>
              <div class="field">
                <label for="cost-soft">Предупреждение по расходам</label
                ><InputText
                  id="cost-soft"
                  v-model="controller.budget.value.dailyCostMicroUsdSoftCap"
                  :aria-invalid="Boolean(budgetIssueFor('dailyCostMicroUsdSoftCap'))"
                  aria-describedby="cost-soft-help cost-soft-error"
                  :disabled="!controller.canManageBudget.value"
                />
                <small id="cost-soft-help">{{
                  formatMicroUsd(
                    controller.budget.value.dailyCostMicroUsdSoftCap,
                  )
                }}</small>
                <small id="cost-soft-error" class="field-error">{{
                  budgetIssueFor("dailyCostMicroUsdSoftCap")
                }}</small>
              </div>
              <div class="field">
                <label for="cost-hard">Максимум расходов в день</label
                ><InputText
                  id="cost-hard"
                  v-model="controller.budget.value.dailyCostMicroUsdHardCap"
                  :aria-invalid="Boolean(budgetIssueFor('dailyCostMicroUsdHardCap'))"
                  aria-describedby="cost-hard-help cost-hard-error"
                  :disabled="!controller.canManageBudget.value"
                />
                <small id="cost-hard-help">{{
                  formatMicroUsd(
                    controller.budget.value.dailyCostMicroUsdHardCap,
                  )
                }}</small>
                <small id="cost-hard-error" class="field-error">{{
                  budgetIssueFor("dailyCostMicroUsdHardCap")
                }}</small>
              </div>
              <div class="field">
                <label for="run-cost">Максимум на одну проверку</label
                ><InputText
                  id="run-cost"
                  v-model="controller.budget.value.maxRunCostMicroUsd"
                  :aria-invalid="Boolean(budgetIssueFor('maxRunCostMicroUsd'))"
                  aria-describedby="run-cost-help run-cost-error"
                  :disabled="!controller.canManageBudget.value"
                />
                <small id="run-cost-help">{{
                  formatMicroUsd(controller.budget.value.maxRunCostMicroUsd)
                }}</small>
                <small id="run-cost-error" class="field-error">{{
                  budgetIssueFor("maxRunCostMicroUsd")
                }}</small>
              </div>
              <div class="field">
                <label for="token-rate">Стоимость миллиона токенов</label
                ><InputText
                  id="token-rate"
                  v-model="controller.budget.value.costMicroUsdPerMillionTokens"
                  :aria-invalid="Boolean(budgetIssueFor('costMicroUsdPerMillionTokens'))"
                  aria-describedby="token-rate-help token-rate-error"
                  :disabled="!controller.canManageBudget.value"
                />
                <small id="token-rate-help">{{
                  formatMicroUsd(
                    controller.budget.value.costMicroUsdPerMillionTokens,
                  )
                }}</small>
                <small id="token-rate-error" class="field-error">{{
                  budgetIssueFor("costMicroUsdPerMillionTokens")
                }}</small>
              </div>
              <div class="field">
                <label for="max-runs">Одновременных проверок</label
                ><InputNumber
                  input-id="max-runs"
                  v-model="controller.budget.value.maxConcurrentRuns"
                  :min="1"
                  :max="1024"
                  :aria-invalid="Boolean(budgetIssueFor('maxConcurrentRuns'))"
                  aria-describedby="max-runs-error"
                  :disabled="!controller.canManageBudget.value"
                />
                <small id="max-runs-error" class="field-error">{{ budgetIssueFor("maxConcurrentRuns") }}</small>
              </div>
              <div class="field">
                <label for="route-tokens">Токенов на одно решение</label
                ><InputNumber
                  input-id="route-tokens"
                  v-model="controller.budget.value.routeMaxEstimatedTokens"
                  :min="64"
                  :max="20000"
                  :aria-invalid="Boolean(budgetIssueFor('routeMaxEstimatedTokens'))"
                  aria-describedby="route-tokens-error"
                  :disabled="!controller.canManageBudget.value"
                />
                <small id="route-tokens-error" class="field-error">{{ budgetIssueFor("routeMaxEstimatedTokens") }}</small>
              </div>
            </div>
            <div v-if="controller.canReadCost.value" class="editor-actions">
              <div>
                <strong
                  >{{ controller.budgetIssues.value.length }} ошибок</strong
                >
              </div>
              <Button
                v-if="controller.canManageBudget.value"
                label="Сохранить черновик"
                icon="pi pi-save"
                :loading="controller.mutating.value"
                :disabled="
                  controller.hasBudgetErrors.value ||
                  controller.hasPendingRecovery.value
                "
                @click="controller.saveBudget"
              /><Button
                v-if="draftBudget && controller.canPublishBudget.value"
                label="Опубликовать"
                icon="pi pi-check"
                severity="success"
                :disabled="isBusy || controller.hasPendingRecovery.value"
                @click="openPublish('BUDGET')"
              />
            </div>
          </section>
          <aside class="budget-aside">
            <div class="card-kicker">Как читать лимиты</div>
            <h2>Два уровня защиты</h2>
            <ol>
              <li>
                <strong>Предупреждение</strong
                ><span>Лид видит, что расход приближается к пределу.</span>
              </li>
              <li>
                <strong>Жёсткий предел</strong
                ><span
                  >Новые проверки приостанавливаются до следующего
                  периода.</span
                >
              </li>
            </ol>
            <p>
              Публикация лимитов требует свежего входа в систему. Команда не
              повторяется автоматически.
            </p>
          </aside>
          <SupportDetectionCalibrationCard
            class="budget-calibration"
            :calibration="controller.calibration.value"
            :loading="controller.calibrating.value || controller.validating.value"
            :can-preview="controller.canPreview.value"
            @load="controller.loadCalibration"
          />
        </main>
      </template>
    </template>

    <Dialog
      v-model:visible="discardVisible"
      modal
      header="Удалить черновик?"
      :style="{ width: 'min(30rem, calc(100vw - 2rem))' }"
    >
      <p>
        Опубликованная версия останется без изменений. Несохранённые правки
        восстановить не получится.
      </p>
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="discardVisible = false" /><Button
          label="Удалить черновик"
          severity="danger"
          @click="confirmDiscard"
      /></template>
    </Dialog>
    <Dialog
      :visible="publishKind !== null"
      modal
      header="Опубликовать изменения?"
      :style="{ width: 'min(34rem, calc(100vw - 2rem))' }"
      @update:visible="publishKind = null"
    >
      <p>
        Версия станет доступна для следующей общей рабочей конфигурации. Одна
        публикация этого раздела не переключает обработку сообщений. Уже
        принятые решения не изменятся.
      </p>
      <div class="field">
        <label for="publish-reason">Причина изменения</label
        ><Textarea
          id="publish-reason"
          v-model="reason"
          rows="3"
          maxlength="2000"
          auto-resize
        />
      </div>
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="publishKind = null" /><Button
          label="Опубликовать"
          severity="success"
          :disabled="!reason.trim()"
          @click="confirmPublish"
      /></template>
    </Dialog>
  </section>
</template>

<style scoped>
.intelligence-page {
  --ci-ink: var(--text-primary);
  --ci-muted: var(--text-secondary);
  --ci-line: var(--border-subtle);
  --ci-soft: var(--surface-subtle);
  --ci-blue: var(--action-primary);
  max-width: 1540px;
  margin: 0 auto;
  padding: 28px 32px 56px;
  border-radius: 18px;
  background: var(--surface-canvas);
  color: var(--ci-ink);
}
.mobile-workflow {
  display: none;
}
.classification-map {
  display: grid;
  gap: 18px;
  max-width: 1120px;
  margin: 0 auto;
}
.classification-brief,
.catalog-section,
.advanced-summary,
.save-panel {
  border: 1px solid var(--ci-line);
  border-radius: 16px;
  background: var(--surface-card);
  box-shadow: var(--shadow-raised);
}
.classification-brief {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 24px;
  padding: 26px;
}
.classification-brief h2,
.catalog-heading h2 {
  margin: 5px 0 7px;
  font-size: 1.3rem;
  line-height: 1.2;
}
.classification-brief p,
.catalog-heading p,
.topic-card p,
.catalog-empty p {
  margin: 0;
  color: var(--ci-muted);
  line-height: 1.5;
}
.brief-actions {
  display: flex;
  align-items: flex-start;
  gap: 8px;
}
.scope-facts {
  display: grid;
  grid-column: 1 / -1;
  grid-template-columns: repeat(3, 1fr);
  gap: 1px;
  margin: 2px 0 0;
  overflow: hidden;
  border: 1px solid var(--ci-line);
  border-radius: 12px;
  background: var(--ci-line);
}
.scope-facts div {
  display: grid;
  gap: 4px;
  padding: 14px 16px;
  background: var(--ci-soft);
}
.scope-facts__label {
  color: var(--text-secondary);
  font-size: 0.72rem;
  font-weight: 750;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.scope-facts strong {
  font-weight: 800;
}
.scope-facts small {
  color: var(--text-tertiary);
  line-height: 1.35;
}
.model-empty-message :deep(.p-message-content) {
  display: flex;
  width: 100%;
  align-items: center;
  gap: 16px;
}
.model-empty-message :deep(.p-message-text) {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.model-empty-message :deep(.p-message-text > div) {
  display: grid;
  gap: 4px;
}
.catalog-section {
  padding: 24px;
}
.catalog-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 20px;
  margin-bottom: 18px;
}
.catalog-count {
  float: right;
  margin-left: 10px;
  color: var(--text-tertiary);
  font-size: 0.78rem;
  font-variant-numeric: tabular-nums;
}
.topic-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.topic-card {
  display: grid;
  min-width: 0;
  gap: 10px;
  padding: 18px;
  border: 1px solid var(--ci-line);
  border-radius: 13px;
  background: var(--ci-soft);
  transition:
    border-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.topic-card:hover {
  border-color: var(--border-strong);
  transform: translateY(-1px);
}
.topic-card__topline,
.topic-card__meta {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.stable-code,
.rule-kind {
  color: var(--text-tertiary);
  font-size: 0.7rem;
  font-weight: 750;
  letter-spacing: 0.04em;
}
.topic-card h3,
.catalog-empty h3 {
  margin: 0;
  font-size: 1.05rem;
}
.topic-card__meta {
  justify-content: flex-start;
  flex-wrap: wrap;
  color: var(--text-secondary);
  font-size: 0.76rem;
}
.topic-card > :deep(.p-button) {
  justify-self: start;
  margin-left: -10px;
}
.rule-list {
  display: grid;
  gap: 8px;
}
.rule-row {
  display: grid;
  grid-template-columns: 150px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  width: 100%;
  min-height: 64px;
  padding: 12px 14px;
  border: 1px solid var(--ci-line);
  border-radius: 11px;
  background: var(--surface-card);
  color: var(--ci-ink);
  text-align: left;
  cursor: pointer;
  transition:
    background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    border-color 160ms cubic-bezier(0.23, 1, 0.32, 1);
}
.rule-row:hover {
  border-color: var(--border-strong);
  background: var(--ci-soft);
}
.rule-row > span:nth-child(2) {
  display: grid;
  gap: 4px;
}
.rule-row small {
  color: var(--text-secondary);
}
.catalog-empty {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 28px;
  border-radius: 13px;
  background: var(--ci-soft);
}
.catalog-empty > i {
  display: grid;
  width: 46px;
  height: 46px;
  place-items: center;
  border-radius: 12px;
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
  font-size: 1.15rem;
}
.catalog-empty--compact {
  padding-block: 20px;
}
.advanced-summary {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto auto;
  align-items: center;
  gap: 16px;
  width: 100%;
  padding: 18px 20px;
  color: var(--ci-ink);
  text-align: left;
  cursor: pointer;
}
.advanced-summary:hover {
  border-color: var(--border-strong);
}
.advanced-summary__icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 11px;
  background: var(--ci-soft);
  color: var(--status-accent-text);
}
.advanced-summary > span:nth-child(2) {
  display: grid;
  gap: 4px;
}
.advanced-summary small,
.advanced-summary__value {
  color: var(--text-secondary);
}
.advanced-summary__value {
  font-size: 0.82rem;
  font-weight: 700;
}
.save-panel {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px 22px;
  padding: 18px 20px;
}
.save-panel__status,
.save-panel__actions {
  display: flex;
  align-items: center;
  flex-wrap: wrap;
  gap: 8px;
}
.save-panel__actions {
  justify-content: flex-end;
}
.blocking-list {
  display: grid;
  gap: 4px;
  grid-column: 1 / -1;
  padding-top: 12px;
  border-top: 1px solid var(--ci-line);
}
.blocking-list p {
  margin: 0 0 4px;
  font-weight: 750;
}
.blocking-list button {
  width: fit-content;
  border: 0;
  background: transparent;
  color: var(--status-danger-text);
  text-align: left;
  cursor: pointer;
}
.policy-layout.policy-layout--dialog {
  display: block;
}
.policy-layout--dialog .policy-map,
.policy-layout--dialog > .test-console {
  display: none;
}
.policy-layout--dialog .editor-column {
  display: block;
}
.policy-layout--dialog .editor-card {
  border: 0;
  padding: 0;
  box-shadow: none;
}
.policy-layout--dialog .advanced-card summary {
  display: none;
}
.policy-layout--dialog .advanced-content {
  padding: 0;
}
.stable-fields > .field,
.field-grid > .field {
  align-content: start;
}
.field-grid > .field > small {
  min-height: 2.5em;
}
.empty-state {
  display: grid;
  justify-items: start;
  gap: 10px;
  padding: 36px;
  border: 1px solid var(--ci-line);
  border-radius: 14px;
  background: var(--surface-card);
}
.empty-state i {
  font-size: 1.7rem;
  color: var(--ci-muted);
}
.empty-state h2,
.empty-state p {
  margin: 0;
}
.intelligence-header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 24px;
  margin-bottom: 20px;
}
.eyebrow,
.card-kicker {
  font-size: 0.72rem;
  font-weight: 800;
  letter-spacing: 0.11em;
  text-transform: uppercase;
  color: var(--text-secondary);
}
.intelligence-header h1 {
  margin: 6px 0 6px;
  font-size: clamp(1.8rem, 3vw, 2.55rem);
  line-height: 1.05;
}
.intelligence-header p,
.editor-card__heading p {
  margin: 0;
  color: var(--ci-muted);
  max-width: 760px;
}
.header-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}
.header-actions :deep(.p-button-secondary) {
  border-color: var(--border-strong);
  color: var(--text-primary);
}
.section-tabs {
  display: flex;
  gap: 4px;
  width: max-content;
  max-width: 100%;
  padding: 4px;
  border: 1px solid var(--ci-line);
  border-radius: 12px;
  background: var(--surface-card);
  margin-bottom: 18px;
  overflow: auto;
}
.section-tabs a {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 9px 13px;
  border-radius: 9px;
  color: var(--text-secondary);
  text-decoration: none;
  font-weight: 700;
  white-space: nowrap;
  transition:
    background-color 0.18s ease,
    color 0.18s ease,
    transform 0.18s ease;
}
.section-tabs a:hover {
  background: var(--ci-soft);
  color: var(--ci-ink);
}
.section-tabs a[aria-current="page"] {
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
  box-shadow: inset 0 0 0 1px var(--palette-blue-200);
}
.live-region {
  margin-bottom: 16px;
}
.recovery-message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.skeleton-grid {
  display: grid;
  grid-template-columns: 1fr 2fr;
  gap: 16px;
}
.skeleton-grid :last-child {
  grid-column: 1/-1;
}
.overview-grid {
  display: grid;
  grid-template-columns: 1.35fr 1fr 1fr;
  gap: 16px;
}
.summary-card,
.editor-card,
.test-console,
.budget-aside {
  background: var(--surface-card);
  border: 1px solid var(--ci-line);
  border-radius: 14px;
  padding: 22px;
  box-shadow: var(--shadow-raised);
}
.summary-card--primary {
  background: linear-gradient(145deg, var(--surface-card) 40%, var(--status-accent-soft));
}
.summary-card--primary[data-tone="warning"] .status-dot {
  background: var(--status-warning);
  box-shadow: 0 0 0 5px var(--status-warning-soft);
}
.summary-card--primary[data-tone="neutral"] .status-dot {
  background: var(--text-tertiary);
  box-shadow: 0 0 0 5px var(--surface-hover);
}
.summary-card h2,
.editor-card h2,
.test-console h2,
.budget-aside h2 {
  margin: 5px 0 8px;
  font-size: 1.15rem;
}
.summary-heading {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 6px 0 8px;
  font-size: 1.25rem;
  font-weight: 800;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--status-success);
  box-shadow: 0 0 0 5px var(--status-success-soft);
}
.summary-card p {
  color: var(--ci-muted);
  min-height: 66px;
}
.facts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  margin: 18px 0;
  border-block: 1px solid var(--ci-line);
}
.facts div {
  padding: 12px 0;
}
.facts dt {
  font-size: 0.75rem;
  color: var(--ci-muted);
}
.facts dd {
  margin: 4px 0 0;
  font-weight: 800;
}
.topic-cloud {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  margin-top: 18px;
}
.platform-owned-note {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin-top: 18px;
  padding-top: 14px;
  border-top: 1px solid var(--ci-line);
  color: var(--ci-muted);
  font-size: 0.78rem;
  line-height: 1.4;
}
.muted {
  color: var(--ci-muted);
}
.policy-layout {
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 310px;
  gap: 14px;
  align-items: start;
}
.policy-map {
  position: sticky;
  top: 16px;
  border: 1px solid var(--ci-line);
  border-radius: 14px;
  background: var(--surface-card);
  overflow: hidden;
}
.map-section + .map-section {
  border-top: 1px solid var(--ci-line);
}
.map-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 13px 12px 8px;
}
.map-heading > div {
  display: flex;
  align-items: baseline;
  gap: 7px;
  font-weight: 800;
}
.map-heading small {
  color: var(--ci-muted);
}
.map-item {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 3px 8px;
  width: 100%;
  padding: 10px 12px;
  border: 0;
  border-left: 3px solid transparent;
  background: transparent;
  text-align: left;
  color: var(--ci-ink);
  cursor: pointer;
}
.map-item span:not(.map-code) {
  grid-column: 1;
  color: var(--text-secondary);
  font-size: 0.78rem;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.map-item i {
  grid-column: 2;
  grid-row: 1/3;
  align-self: center;
  color: var(--text-tertiary);
  font-size: 0.7rem;
}
.map-item:hover {
  background: var(--ci-soft);
}
.map-item--active {
  border-left-color: var(--ci-blue);
  background: var(--status-accent-soft);
}
.map-code {
  font-size: 0.76rem;
  font-weight: 800;
  overflow: hidden;
  text-overflow: ellipsis;
}
.map-empty {
  padding: 8px 14px 16px;
  color: var(--ci-muted);
  font-size: 0.82rem;
  line-height: 1.45;
}
.editor-column {
  display: grid;
  min-width: 0;
  gap: 14px;
}
.editor-card--focus {
  border-color: var(--palette-blue-200);
  box-shadow: var(--shadow-raised);
}
.editor-card__heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
  margin-bottom: 18px;
}
.scope-explainer {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 12px;
  margin-bottom: 18px;
  padding: 14px 16px;
  border: 1px solid var(--ci-line);
  border-radius: 12px;
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
}
.scope-explainer > i {
  display: grid;
  width: 34px;
  height: 34px;
  place-items: center;
  border-radius: 9px;
  background: var(--surface-card);
}
.scope-explainer strong,
.scope-section__heading > span { font-weight: 800; }
.scope-explainer p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  line-height: 1.45;
}
.scope-section {
  display: grid;
  gap: 14px;
  padding: 18px 0;
  border-top: 1px solid var(--ci-line);
}
.scope-section__heading { display: grid; gap: 3px; }
.scope-section__heading > span { font-size: 0.94rem; }
.scope-section__heading small { color: var(--ci-muted); line-height: 1.4; }
.field.field--flush { margin-top: 0; }
.scope-language-grid {
  grid-template-columns: minmax(0, 1.35fr) minmax(240px, 0.65fr);
  align-items: start;
}
.scope-language-grid :deep(.p-multiselect) { width: 100%; min-height: 44px; }
.scope-language-grid :deep(.p-multiselect-label) {
  display: flex;
  flex-wrap: wrap;
  gap: 5px;
  align-items: center;
}
.fallback-note { margin-top: 2px; }
.fallback-note :deep(.p-message-text) { line-height: 1.45; }
.channel-choice-row label {
  min-height: 44px;
  padding: 9px 12px;
  border: 1px solid var(--ci-line);
  border-radius: 10px;
  background: var(--ci-soft);
}
.empty-card {
  text-align: center;
  padding: 54px 24px;
}
.empty-card > i {
  font-size: 1.8rem;
  color: var(--palette-blue-400);
}
.field-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 16px;
}
.field-grid--three {
  grid-template-columns: repeat(3, 1fr);
}
.field {
  display: grid;
  gap: 7px;
  margin-top: 14px;
}
.field label,
.field-label {
  font-size: 0.82rem;
  font-weight: 800;
  color: var(--text-primary);
}
.field small {
  color: var(--ci-muted);
  line-height: 1.35;
}
.field .field-error {
  color: var(--status-danger-text);
}
.field :deep(.p-inputtext),
.field :deep(.p-select),
.field :deep(.p-inputnumber),
.field :deep(.p-textarea) {
  width: 100%;
}
.editor-card :deep(.p-button-danger.p-button-text) {
  color: var(--status-danger-text);
}
.check-row {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
}
.check-row label {
  display: flex;
  align-items: center;
  gap: 7px;
  font-weight: 600;
}
.advanced-card {
  padding: 0;
  overflow: hidden;
}
.advanced-card summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 22px;
  cursor: pointer;
  list-style: none;
}
.advanced-card summary span {
  display: grid;
  gap: 4px;
}
.advanced-card[open] summary {
  border-bottom: 1px solid var(--ci-line);
}
.advanced-card[open] summary i {
  transform: rotate(180deg);
}
.advanced-content {
  display: grid;
  gap: 18px;
  padding: 8px 22px 22px;
}
.advanced-group {
  display: grid;
  gap: 12px;
  padding-top: 16px;
  border-top: 1px solid var(--ci-line);
}
.advanced-group__heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.advanced-group__heading > div {
  display: grid;
  gap: 3px;
}
.advanced-group__heading small {
  color: var(--ci-muted);
}
.audience-block {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--ci-line);
  border-radius: 10px;
  background: var(--ci-soft);
}
.predicate-row {
  display: grid;
  grid-template-columns: minmax(120px, 1fr) minmax(120px, 0.7fr) minmax(120px, 1fr) auto;
  gap: 8px;
}
.predicate-row > :deep(.p-button) {
  grid-column: 4;
  grid-row: 1;
}
.predicate-errors {
  display: grid;
  grid-column: 1/-1;
  gap: 2px;
}
.error-summary {
  margin: 6px 0 0;
  padding-left: 18px;
  color: var(--status-danger-text);
}
.editor-actions {
  position: sticky;
  bottom: 12px;
  display: flex;
  width: 100%;
  min-width: 0;
  max-width: 100%;
  box-sizing: border-box;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
  padding: 10px;
  border: 1px solid var(--ci-line);
  border-radius: 12px;
  background: var(--surface-card);
  backdrop-filter: blur(12px);
  box-shadow: var(--shadow-raised);
  z-index: 2;
}
.editor-actions > div {
  display: grid;
  margin-right: auto;
  font-size: 0.78rem;
}
.editor-actions > div span {
  color: var(--ci-muted);
}
.test-console {
  position: sticky;
  top: 16px;
  background: var(--surface-card);
  color: var(--text-primary);
  border-color: var(--border-subtle);
}
.test-console .card-kicker,
.test-console p,
.test-console label {
  color: var(--text-secondary);
}
.test-console :deep(.p-inputtext),
.test-console :deep(.p-textarea) {
  background: var(--surface-card);
  border-color: var(--border-subtle);
  color: var(--text-primary);
}
.test-console__heading {
  margin-bottom: 14px;
}
.permission-note {
  display: flex;
  gap: 7px;
  font-size: 0.82rem;
}
.test-result {
  margin-top: 18px;
  padding: 16px;
  border-radius: 12px;
  background: var(--surface-subtle);
  border: 1px solid var(--border-subtle);
}
.test-result .result-label {
  display: block;
  color: var(--text-on-emphasis-muted);
  font-size: 0.72rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}
.test-result strong {
  display: block;
  margin: 5px 0;
  font-size: 1.1rem;
}
.test-result > div {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.budget-layout {
  display: grid;
  grid-template-columns: minmax(0, 2fr) minmax(260px, 0.8fr);
  gap: 16px;
  align-items: start;
}
.budget-card {
  padding: 26px;
}
.budget-aside {
  position: sticky;
  top: 16px;
}
.budget-aside ol {
  display: grid;
  gap: 18px;
  padding-left: 22px;
}
.budget-aside li span {
  display: block;
  color: var(--ci-muted);
  margin-top: 4px;
}
.budget-aside > p {
  border-top: 1px solid var(--ci-line);
  padding-top: 16px;
  color: var(--ci-muted);
}
.budget-calibration {
  grid-column: 1 / -1;
}
.validation-confirmation {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--status-success-text);
  font-size: 0.8rem;
  font-weight: 750;
}
@media (max-width: 1560px) {
  .policy-layout {
    grid-template-columns: 210px minmax(0, 1fr);
  }
  .test-console {
    position: static;
    grid-column: 1/-1;
  }
  .overview-grid {
    grid-template-columns: 1fr 1fr;
  }
  .summary-card--primary {
    grid-column: 1/-1;
  }
}
@media (max-width: 1400px) {
  .editor-actions {
    position: static;
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    width: 100%;
    max-width: 100%;
  }
  .editor-actions > * {
    min-width: 0;
  }
  .editor-actions > div {
    width: auto;
    margin-right: 0;
  }
  .editor-actions :deep(.p-button) {
    width: 100%;
  }
}
@media (max-width: 1100px) {
  .classification-brief {
    grid-template-columns: 1fr;
  }
  .brief-actions {
    grid-row: 3;
  }
  .scope-facts {
    grid-row: 2;
  }
  .policy-layout {
    grid-template-columns: minmax(0, 1fr);
  }
  .policy-map {
    position: static;
    display: grid;
    grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
  }
  .map-section + .map-section {
    border-top: 0;
    border-left: 1px solid var(--ci-line);
  }
  .test-console {
    grid-column: auto;
  }
}
@media (max-width: 760px) {
  .intelligence-page {
    padding: 18px 14px 40px;
  }
  .intelligence-header {
    display: grid;
  }
  .header-actions {
    justify-content: space-between;
  }
  .section-tabs {
    width: 100%;
  }
  .section-tabs a {
    flex: 1;
    justify-content: center;
  }
  .section-tabs a i {
    display: none;
  }
  .mobile-workflow {
    display: none;
    grid-template-columns: repeat(3, 1fr);
    gap: 6px;
    margin-bottom: 12px;
  }
  .mobile-step {
    min-width: 0;
    padding: 9px 6px;
    border: 1px solid var(--ci-line);
    border-radius: 9px;
    background: var(--surface-card);
    color: var(--text-primary);
    font: inherit;
    font-weight: 750;
  }
  .mobile-step[aria-current="step"] {
    border-color: var(--action-primary);
    background: var(--action-primary);
    color: var(--on-action-primary);
  }
  .overview-grid,
  .policy-layout,
  .budget-layout,
  .field-grid,
  .field-grid--three,
  .scope-language-grid {
    grid-template-columns: 1fr;
  }
  .classification-brief,
  .catalog-section,
  .save-panel {
    padding: 18px;
  }
  .brief-actions,
  .catalog-heading,
  .save-panel {
    align-items: stretch;
  }
  .brief-actions,
  .catalog-heading {
    display: grid;
  }
  .brief-actions :deep(.p-button),
  .catalog-heading :deep(.p-button),
  .save-panel__actions :deep(.p-button) {
    width: 100%;
  }
  .scope-facts,
  .topic-grid {
    grid-template-columns: 1fr;
  }
  .rule-row {
    grid-template-columns: minmax(0, 1fr) auto;
  }
  .rule-kind {
    grid-column: 1 / -1;
  }
  .advanced-summary {
    grid-template-columns: auto minmax(0, 1fr) auto;
  }
  .advanced-summary__value {
    grid-column: 2;
  }
  .save-panel {
    grid-template-columns: 1fr;
  }
  .save-panel__actions {
    display: grid;
    width: 100%;
  }
  .policy-map {
    position: static;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .policy-layout[data-mobile-panel="MAP"] .editor-column,
  .policy-layout[data-mobile-panel="MAP"] .test-console,
  .policy-layout[data-mobile-panel="EDITOR"] .policy-map,
  .policy-layout[data-mobile-panel="EDITOR"] .test-console,
  .policy-layout[data-mobile-panel="PREVIEW"] .policy-map,
  .policy-layout[data-mobile-panel="PREVIEW"] .editor-column {
    display: none;
  }
  .policy-layout.policy-layout--dialog[data-mobile-panel="MAP"] .editor-column,
  .policy-layout.policy-layout--dialog[data-mobile-panel="EDITOR"] .editor-column,
  .policy-layout.policy-layout--dialog[data-mobile-panel="PREVIEW"] .editor-column {
    display: block;
  }
  .predicate-row {
    grid-template-columns: 1fr;
  }
  .predicate-row > :deep(.p-button),
  .predicate-errors {
    grid-column: 1;
    grid-row: auto;
  }
  .map-section + .map-section {
    border-top: 0;
    border-left: 1px solid var(--ci-line);
  }
  .test-console {
    grid-column: auto;
  }
  .editor-card,
  .summary-card,
  .test-console,
  .budget-aside {
    padding: 18px;
  }
  .editor-actions {
    position: static;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .editor-actions > div {
    grid-column: 1/-1;
  }
  .editor-actions :deep(.p-button) {
    width: 100%;
  }
  .recovery-message {
    align-items: flex-start;
    flex-direction: column;
  }
  .budget-aside {
    position: static;
  }
}
@media (max-width: 430px) {
  .section-tabs a {
    padding-inline: 9px;
    font-size: 0.8rem;
  }
  .policy-map {
    grid-template-columns: 1fr;
  }
  .map-section + .map-section {
    border-left: 0;
    border-top: 1px solid var(--ci-line);
  }
  .editor-actions {
    grid-template-columns: 1fr;
  }
  .editor-card__heading {
    display: grid;
  }
  .facts {
    grid-template-columns: 1fr;
  }
  .facts div + div {
    border-top: 1px solid var(--ci-line);
  }
}
@media (prefers-reduced-motion: reduce) {
  .section-tabs a,
  .advanced-card summary i {
    transition: none;
  }
}
</style>
