<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import ToggleSwitch from "primevue/toggleswitch";
import { translationSettingsApi } from "@/features/translation-settings/api/translation-settings.api";
import type {
  AiModelCatalogItemResponseDto,
  AiModelSettingsResponseDto,
} from "@/shared/api/generated/models";
import { isMockMode } from "@/shared/config/data-mode";
import ProjectSettingsSectionHeader from "@/shared/ui/ProjectSettingsSectionHeader.vue";

type Workload = "ASSISTANT" | "TRANSLATION";
type ReasoningEffort = "none" | "low" | "medium" | "high";

const props = defineProps<{
  projectId: string;
  editable: boolean;
  projectVersion?: number;
}>();
const emit = defineEmits<{
  changed: [projectVersion: number];
  dirtyChange: [dirty: boolean];
}>();
const expanded = ref(false);
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const settings = ref<AiModelSettingsResponseDto | null>(null);
const catalogs = reactive<Record<Workload, AiModelCatalogItemResponseDto[]>>({
  ASSISTANT: [],
  TRANSLATION: [],
});
const catalogStale = ref(false);
const form = reactive({
  assistant: { modelId: "", reasoningEffort: "none" as ReasoningEffort },
  translation: { modelId: "", reasoningEffort: "none" as ReasoningEffort },
});
const lastReasoningEffort = reactive<
  Record<"assistant" | "translation", ReasoningEffort>
>({
  assistant: "low",
  translation: "low",
});
const baseline = ref("");
const formSnapshot = computed(() => JSON.stringify(form));
const dirty = computed(
  () => Boolean(baseline.value) && baseline.value !== formSnapshot.value,
);

const workloadCards = [
  {
    key: "assistant" as const,
    workload: "ASSISTANT" as const,
    title: "Основная модель",
    description: "Отвечает пользователям и выполняет продуктовые сценарии.",
  },
  {
    key: "translation" as const,
    workload: "TRANSLATION" as const,
    title: "Модель переводов",
    description:
      "Переводит сценарии и сообщения поддержки независимо от основной модели.",
  },
];

function modelOptions(workload: Workload) {
  return catalogs[workload].map((model) => ({
    label: `${model.displayName}${model.lolaTested ? " · проверено Lola" : ""}`,
    value: model.id,
    disabled: !model.selectable || model.providerAvailable === false,
  }));
}

function selectedModel(key: "assistant" | "translation", workload: Workload) {
  return catalogs[workload].find((item) => item.id === form[key].modelId);
}

function reasoningOptions(
  key: "assistant" | "translation",
  workload: Workload,
) {
  const model = selectedModel(key, workload);
  return (model?.reasoningEfforts ?? ["none"])
    .filter((effort) => !model?.reasoningRequired || effort !== "none")
    .map((effort) => ({
      label:
        effort === "none"
          ? "Без reasoning"
          : effort === "low"
            ? "Низкий"
            : effort === "medium"
              ? "Средний"
              : "Высокий",
      value: effort,
    }));
}

function reasoningEnabled(key: "assistant" | "translation"): boolean {
  return form[key].reasoningEffort !== "none";
}

function setReasoning(
  key: "assistant" | "translation",
  workload: Workload,
  enabled: boolean,
): void {
  const model = selectedModel(key, workload);
  if (!enabled && !model?.reasoningRequired) {
    if (form[key].reasoningEffort !== "none") {
      lastReasoningEffort[key] = form[key].reasoningEffort;
    }
    form[key].reasoningEffort = "none";
    return;
  }
  form[key].reasoningEffort = model?.reasoningEfforts.includes(
    lastReasoningEffort[key],
  )
    ? lastReasoningEffort[key]
    : model?.reasoningEfforts.includes("low")
      ? "low"
      : (model?.reasoningEfforts.find((item) => item !== "none") ?? "none");
}

function normalizeReasoning(
  key: "assistant" | "translation",
  workload: Workload,
): void {
  const model = selectedModel(key, workload);
  if (!model) return;
  if (form[key].reasoningEffort !== "none") {
    lastReasoningEffort[key] = form[key].reasoningEffort;
  }
  if (
    !model.reasoningEfforts.includes(form[key].reasoningEffort) ||
    (model.reasoningRequired && form[key].reasoningEffort === "none")
  ) {
    form[key].reasoningEffort =
      model.reasoningEfforts.find((item) =>
        model.reasoningRequired ? item !== "none" : true,
      ) ?? "none";
  }
}

const settingsValid = computed(() =>
  workloadCards.every((card) => {
    const model = selectedModel(card.key, card.workload);
    const effort = form[card.key].reasoningEffort;
    return Boolean(
      model &&
      model.selectable &&
      model.providerAvailable !== false &&
      model.reasoningEfforts.includes(effort) &&
      (!model.reasoningRequired || effort !== "none"),
    );
  }),
);

async function load(): Promise<void> {
  loading.value = true;
  error.value = "";
  try {
    const demoItem = (
      workload: Workload,
      id: "grok-4.3" | "grok-4.5",
      reasoningRequired = false,
    ) => ({
      id,
      displayName: id === "grok-4.5" ? "Grok 4.5" : "Grok 4.3",
      workload,
      selectable: true,
      lolaTested: true,
      providerAvailable: true,
      reasoningRequired,
      reasoningEfforts: ["none", "low", "medium", "high"] as ReasoningEffort[],
      inputPricePerMillion: "0",
      cachedInputPricePerMillion: "0",
      outputPricePerMillion: "0",
    });
    const [current, assistant, translation] = isMockMode
      ? [
          {
            projectVersion: 1,
            resolved: {
              assistant: {
                modelId: "grok-4.5",
                reasoningEffort: "low" as const,
                configRevision: "demo-assistant-model",
                source: "PROJECT" as const,
              },
              translation: {
                modelId: "grok-4.3",
                reasoningEffort: "low" as const,
                configRevision: "demo-translation-model",
                source: "PROJECT" as const,
              },
            },
            saved: null,
          },
          {
            items: [
              demoItem("ASSISTANT", "grok-4.5", true),
              demoItem("ASSISTANT", "grok-4.3"),
            ],
            stale: false,
          },
          {
            items: [
              demoItem("TRANSLATION", "grok-4.3"),
              demoItem("TRANSLATION", "grok-4.5", true),
            ],
            stale: false,
          },
        ]
      : await Promise.all([
          translationSettingsApi.aiModels.settings(props.projectId),
          translationSettingsApi.aiModels.catalog(props.projectId, {
            workload: "ASSISTANT",
          }),
          translationSettingsApi.aiModels.catalog(props.projectId, {
            workload: "TRANSLATION",
          }),
        ]);
    settings.value = current;
    catalogs.ASSISTANT = assistant.items;
    catalogs.TRANSLATION = translation.items;
    catalogStale.value = assistant.stale || translation.stale;
    form.assistant = {
      modelId: current.resolved.assistant.modelId,
      reasoningEffort: current.resolved.assistant
        .reasoningEffort as ReasoningEffort,
    };
    form.translation = {
      modelId: current.resolved.translation.modelId,
      reasoningEffort: current.resolved.translation
        .reasoningEffort as ReasoningEffort,
    };
    baseline.value = formSnapshot.value;
  } catch {
    error.value = "Не удалось загрузить модели xAI";
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  if (
    !settings.value ||
    saving.value ||
    !props.editable ||
    !settingsValid.value
  )
    return;
  saving.value = true;
  error.value = "";
  try {
    const response = isMockMode
      ? {
          ...settings.value,
          projectVersion: settings.value.projectVersion + 1,
          resolved: {
            assistant: {
              ...form.assistant,
              configRevision: "demo-assistant-model",
              source: "PROJECT" as const,
            },
            translation: {
              ...form.translation,
              configRevision: "demo-translation-model",
              source: "PROJECT" as const,
            },
          },
        }
      : await translationSettingsApi.aiModels.update(props.projectId, {
          assistant: { ...form.assistant },
          translation: { ...form.translation },
          expectedProjectVersion: settings.value.projectVersion,
        });
    settings.value = response;
    baseline.value = formSnapshot.value;
    emit("changed", response.projectVersion);
  } catch {
    error.value = "Не удалось сохранить модели";
  } finally {
    saving.value = false;
  }
}

const hasCatalog = computed(
  () => catalogs.ASSISTANT.length > 0 && catalogs.TRANSLATION.length > 0,
);

onMounted(load);
watch(dirty, (value) => emit("dirtyChange", value), { immediate: true });
watch(
  () => props.projectVersion,
  (projectVersion) => {
    if (settings.value && projectVersion) {
      settings.value = { ...settings.value, projectVersion };
    }
  },
);
</script>

<template>
  <section class="card card-pad settings-section">
    <ProjectSettingsSectionHeader
      v-model:expanded="expanded"
      title="Модели AI"
      description="Основная модель и модель переводов настраиваются независимо."
      icon="pi pi-microchip-ai"
      tone="brand"
      content-id="ai-model-settings"
    />
    <div id="ai-model-settings" v-show="expanded" class="model-settings">
      <div v-if="loading" class="model-grid">
        <Skeleton v-for="item in 2" :key="item" height="190px" />
      </div>
      <Message
        v-else-if="error && !hasCatalog"
        severity="error"
        :closable="false"
      >
        <div class="model-error">
          <span>{{ error }}</span>
          <Button
            label="Повторить"
            icon="pi pi-refresh"
            size="small"
            text
            @click="load"
          />
        </div>
      </Message>
      <template v-else>
        <Message v-if="catalogStale" severity="warn" :closable="false">
          Каталог xAI временно недоступен. Показана последняя проверенная
          версия.
        </Message>
        <Message v-if="error" severity="error" :closable="false">
          <div class="model-error">
            <span>{{ error }}</span>
            <Button
              label="Обновить"
              icon="pi pi-refresh"
              size="small"
              text
              @click="load"
            />
          </div>
        </Message>
        <div class="model-grid">
          <article
            v-for="card in workloadCards"
            :key="card.key"
            class="model-card"
          >
            <header>
              <span
                ><i
                  :class="
                    card.key === 'assistant'
                      ? 'pi pi-sparkles'
                      : 'pi pi-language'
                  "
              /></span>
              <div>
                <strong>{{ card.title }}</strong>
                <small>{{ card.description }}</small>
              </div>
            </header>
            <label>
              <span>Модель xAI</span>
              <Select
                v-model="form[card.key].modelId"
                :options="modelOptions(card.workload)"
                option-label="label"
                option-value="value"
                option-disabled="disabled"
                :disabled="saving || !editable"
                @change="normalizeReasoning(card.key, card.workload)"
              />
            </label>
            <div class="reasoning-row">
              <div>
                <strong>Reasoning</strong>
                <small
                  >Даёт модели больше времени на сложные формулировки и
                  добавляет задержку.</small
                >
                <small
                  v-if="
                    selectedModel(card.key, card.workload)?.reasoningRequired
                  "
                  >Для этой модели reasoning обязателен.</small
                >
              </div>
              <ToggleSwitch
                :model-value="reasoningEnabled(card.key)"
                :disabled="
                  saving ||
                  !editable ||
                  selectedModel(card.key, card.workload)?.reasoningRequired
                "
                :aria-label="`Reasoning: ${card.title}`"
                @update:model-value="
                  setReasoning(card.key, card.workload, $event)
                "
              />
            </div>
            <label v-if="reasoningEnabled(card.key)">
              <span>Уровень reasoning</span>
              <Select
                v-model="form[card.key].reasoningEffort"
                :options="reasoningOptions(card.key, card.workload)"
                option-label="label"
                option-value="value"
                :disabled="saving || !editable"
              />
            </label>
            <div
              v-if="selectedModel(card.key, card.workload)"
              class="model-meta"
            >
              <span v-if="settings?.resolved[card.key]">
                Сохранено:
                {{ settings.resolved[card.key].modelId }} · reasoning
                {{ settings.resolved[card.key].reasoningEffort }}
              </span>
              <span>
                Input
                {{
                  selectedModel(card.key, card.workload)?.inputPricePerMillion
                }}/1M · cached
                {{
                  selectedModel(card.key, card.workload)
                    ?.cachedInputPricePerMillion
                }}/1M · output
                {{
                  selectedModel(card.key, card.workload)?.outputPricePerMillion
                }}/1M
              </span>
            </div>
          </article>
        </div>
        <footer class="settings-footer">
          <span
            >Для переводов по умолчанию рекомендуется Grok 4.3 с reasoning
            low.</span
          >
          <Button
            data-testid="save-ai-model-settings"
            label="Сохранить модели"
            icon="pi pi-check"
            :loading="saving"
            :disabled="!editable || !settingsValid"
            @click="save"
          />
        </footer>
      </template>
    </div>
  </section>
</template>

<style scoped>
.model-settings,
.model-card,
.model-card header > div,
.model-card label {
  display: grid;
}
.model-settings {
  gap: 14px;
}
.model-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.model-card {
  gap: 15px;
  padding: 17px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface-subtle);
}
.model-card header,
.reasoning-row,
.settings-footer,
.model-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.model-card header > span {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 11px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.model-card header > div,
.model-card label {
  gap: 4px;
  flex: 1;
}
.model-card small,
.settings-footer > span,
.model-card label > span {
  color: var(--text-secondary);
  font-size: 0.65rem;
  line-height: 1.4;
}
.model-card label > span {
  font-weight: 700;
}
.reasoning-row > div {
  display: grid;
  gap: 3px;
}
.model-meta {
  display: grid;
  gap: 3px;
  padding: 10px 12px;
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 0.62rem;
}
.settings-footer {
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
@media (max-width: 760px) {
  .model-grid {
    grid-template-columns: 1fr;
  }
  .settings-footer {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
