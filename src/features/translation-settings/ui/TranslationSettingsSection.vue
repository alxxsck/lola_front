<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue';
import Button from 'primevue/button';
import InputText from 'primevue/inputtext';
import Message from 'primevue/message';
import Select from 'primevue/select';
import Skeleton from 'primevue/skeleton';
import ToggleSwitch from 'primevue/toggleswitch';
import { translationSettingsApi } from '@/features/translation-settings/api/translation-settings.api';
import type {
  ProjectTranslationGlossaryEntryDto,
  ProjectTranslationSettingsResponseDto,
} from '@/shared/api/generated/models';
import { isMockMode } from '@/shared/config/data-mode';
import { localeDisplayName } from '@/shared/lib/locale';
import ProjectSettingsSectionHeader from '@/shared/ui/ProjectSettingsSectionHeader.vue';

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
const error = ref('');
const current = ref<ProjectTranslationSettingsResponseDto | null>(null);
const form = reactive({
  enabled: false,
  workingLocale: 'ru',
  formality: 'AUTO' as 'AUTO' | 'FORMAL' | 'INFORMAL',
  outgoingTone: 'PRESERVE' as 'PRESERVE' | 'FRIENDLY' | 'NEUTRAL' | 'PROFESSIONAL',
  glossary: [] as ProjectTranslationGlossaryEntryDto[],
});
const baseline = ref('');
const formSnapshot = computed(() => JSON.stringify(form));
const dirty = computed(() => Boolean(baseline.value) && baseline.value !== formSnapshot.value);
const deploymentUnavailable = computed(
  () => current.value?.availability.reason === 'DEPLOYMENT_DISABLED',
);
const glossaryValid = computed(() =>
  form.glossary.every(
    (entry) =>
      Boolean(entry.source.trim()) && (entry.behavior === 'KEEP' || Boolean(entry.target?.trim())),
  ),
);
const toneOptions = [
  { label: 'Сохранять исходный тон', value: 'PRESERVE' },
  { label: 'Дружелюбный', value: 'FRIENDLY' },
  { label: 'Нейтральный', value: 'NEUTRAL' },
  { label: 'Профессиональный', value: 'PROFESSIONAL' },
];
const formalityOptions = [
  { label: 'Определять автоматически', value: 'AUTO' },
  { label: 'Формально', value: 'FORMAL' },
  { label: 'Неформально', value: 'INFORMAL' },
];

async function load(): Promise<void> {
  loading.value = true;
  error.value = '';
  try {
    const response: ProjectTranslationSettingsResponseDto = isMockMode
      ? {
          availability: { available: true, reason: null },
          configRevision: 'demo-translation-settings',
          projectVersion: 1,
          supportedLocales: ['ru', 'de', 'en', 'es', 'fr'],
          settings: {
            enabled: true,
            formality: 'AUTO',
            glossary: [],
            inboundMode: 'ON_DEMAND',
            outboundMode: 'PREVIEW_REQUIRED',
            outgoingTone: 'PROFESSIONAL',
            version: 1,
            workingLocale: 'ru',
          },
        }
      : await translationSettingsApi.project.get(props.projectId);
    current.value = response;
    Object.assign(form, {
      enabled: response.settings.enabled,
      workingLocale: response.settings.workingLocale,
      formality: response.settings.formality,
      outgoingTone: response.settings.outgoingTone,
      glossary: response.settings.glossary.map((entry) => ({ ...entry })),
    });
    baseline.value = formSnapshot.value;
  } catch {
    error.value = 'Не удалось загрузить настройки переводов';
  } finally {
    loading.value = false;
  }
}

async function save(): Promise<void> {
  if (!current.value || saving.value || !props.editable || !glossaryValid.value) return;
  saving.value = true;
  error.value = '';
  try {
    const response = isMockMode
      ? {
          ...current.value,
          projectVersion: current.value.projectVersion + 1,
          settings: {
            ...current.value.settings,
            ...form,
          },
        }
      : await translationSettingsApi.project.update(props.projectId, {
          ...form,
          expectedProjectVersion: current.value.projectVersion,
          inboundMode: 'ON_DEMAND',
          outboundMode: 'PREVIEW_REQUIRED',
          glossary: form.glossary.map((entry) =>
            entry.behavior === 'KEEP'
              ? { behavior: entry.behavior, source: entry.source.trim() }
              : {
                  behavior: entry.behavior,
                  source: entry.source.trim(),
                  target: entry.target?.trim(),
                },
          ),
          version: 1,
        });
    current.value = response;
    baseline.value = formSnapshot.value;
    emit('changed', response.projectVersion);
  } catch {
    error.value = 'Не удалось сохранить настройки переводов';
  } finally {
    saving.value = false;
  }
}

function addGlossaryEntry(): void {
  form.glossary.push({ behavior: 'TRANSLATE_AS', source: '', target: '' });
}

function removeGlossaryEntry(index: number): void {
  form.glossary.splice(index, 1);
}

function reloadDiscardingChanges(): void {
  if (
    dirty.value &&
    !window.confirm('Несохранённые настройки переводов будут сброшены. Продолжить?')
  ) {
    return;
  }
  void load();
}

onMounted(load);
watch(dirty, (value) => emit('dirtyChange', value), { immediate: true });
watch(
  () => props.projectVersion,
  (projectVersion) => {
    if (current.value && projectVersion) {
      current.value = { ...current.value, projectVersion };
    }
  },
);
</script>

<template>
  <section class="card card-pad settings-section">
    <ProjectSettingsSectionHeader
      v-model:expanded="expanded"
      title="Переводы"
      description="Единые правила для сценариев и диалогов поддержки."
      icon="pi pi-language"
      tone="accent"
      content-id="translation-settings"
    />
    <div id="translation-settings" v-show="expanded" class="translation-settings">
      <Skeleton v-if="loading" height="180px" />
      <Message v-else-if="error && !current" severity="error" :closable="false">
        <div class="translation-error">
          <span>{{ error }}</span>
          <Button label="Повторить" icon="pi pi-refresh" size="small" text @click="load" />
        </div>
      </Message>
      <template v-else-if="current">
        <Message v-if="error" severity="error" :closable="false">
          <div class="translation-error">
            <span>{{ error }}</span>
            <Button
              label="Перезагрузить и сбросить правки"
              icon="pi pi-refresh"
              size="small"
              text
              @click="reloadDiscardingChanges"
            />
          </div>
        </Message>
        <Message v-if="deploymentUnavailable" severity="warn" :closable="false">
          Переводы временно недоступны. Повторите попытку позже.
        </Message>
        <div class="translation-toggle">
          <div>
            <strong>Разрешить переводы</strong>
            <span>Оператор включает перевод отдельно для нужного диалога.</span>
          </div>
          <ToggleSwitch
            v-model="form.enabled"
            :disabled="saving || !editable"
            aria-label="Разрешить переводы проекта"
          />
        </div>
        <a class="translation-budget-link" href="#ai-usage-title">
          <i class="pi pi-chart-line" aria-hidden="true" />
          Расходы и фактически применённые модели — в AI Usage
        </a>
        <div class="translation-grid">
          <label>
            <span>Рабочий язык поддержки</span>
            <strong class="working-locale">
              {{ localeDisplayName(form.workingLocale) }} ·
              {{ form.workingLocale }}
            </strong>
          </label>
          <label>
            <span>Тон исходящих сообщений</span>
            <Select
              v-model="form.outgoingTone"
              :options="toneOptions"
              option-label="label"
              option-value="value"
              :disabled="saving || !editable"
            />
          </label>
          <label>
            <span>Формальность</span>
            <Select
              v-model="form.formality"
              :options="formalityOptions"
              option-label="label"
              option-value="value"
              :disabled="saving || !editable"
            />
          </label>
        </div>
        <section class="glossary" aria-label="Глоссарий переводов">
          <header>
            <div>
              <strong>Глоссарий проекта</strong>
              <span
                >Термины, бренды и обязательные варианты перевода для сценариев и поддержки.</span
              >
            </div>
            <Button
              label="Добавить термин"
              icon="pi pi-plus"
              size="small"
              text
              :disabled="saving || !editable || form.glossary.length >= 100"
              @click="addGlossaryEntry"
            />
          </header>
          <div v-for="(entry, index) in form.glossary" :key="index" class="glossary-row">
            <InputText
              v-model="entry.source"
              class="glossary-source"
              maxlength="200"
              placeholder="Исходный термин"
              :disabled="saving || !editable"
              :aria-label="`Исходный термин ${index + 1}`"
            />
            <Select
              v-model="entry.behavior"
              class="glossary-behavior"
              :options="[
                { label: 'Переводить как', value: 'TRANSLATE_AS' },
                { label: 'Не переводить', value: 'KEEP' },
              ]"
              option-label="label"
              option-value="value"
              :disabled="saving || !editable"
              :aria-label="`Правило термина ${index + 1}`"
            />
            <InputText
              v-if="entry.behavior === 'TRANSLATE_AS'"
              v-model="entry.target"
              class="glossary-target"
              maxlength="200"
              placeholder="Целевой вариант"
              :disabled="saving || !editable"
              :aria-label="`Перевод термина ${index + 1}`"
            />
            <span v-else class="glossary-keep">Сохранить без изменений</span>
            <Button
              class="glossary-remove"
              icon="pi pi-trash"
              severity="danger"
              text
              rounded
              :disabled="saving || !editable"
              :aria-label="`Удалить термин ${index + 1}`"
              @click="removeGlossaryEntry(index)"
            />
          </div>
          <span v-if="!form.glossary.length" class="glossary-empty"> Глоссарий пока пуст. </span>
        </section>
        <div class="translation-policy">
          <span
            ><i class="pi pi-download" /><strong>Входящие</strong> — перевод по запросу
            оператора</span
          >
          <span
            ><i class="pi pi-upload" /><strong>Исходящие</strong> — только после проверки перед
            отправкой</span
          >
        </div>
        <footer class="translation-footer">
          <span>Глоссарий проекта применяется сервером и сохраняется в revision настроек.</span>
          <Button
            data-testid="save-translation-settings"
            label="Сохранить переводы"
            icon="pi pi-check"
            :loading="saving"
            :disabled="!editable || !glossaryValid"
            @click="save"
          />
        </footer>
      </template>
    </div>
  </section>
</template>

<style scoped>
.translation-settings {
  display: grid;
  gap: 14px;
}
.translation-toggle,
.translation-footer,
.translation-error {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.translation-toggle {
  padding: 14px;
  border-radius: 14px;
  background: var(--surface-subtle);
}
.translation-toggle > div {
  display: grid;
  gap: 3px;
}
.translation-budget-link {
  display: inline-flex;
  align-items: center;
  width: fit-content;
  gap: 7px;
  color: var(--status-accent-text);
  font-size: 0.68rem;
  font-weight: 700;
  text-decoration: none;
}
.translation-budget-link:hover {
  text-decoration: underline;
}
.translation-toggle span,
.translation-footer > span,
.translation-grid label > span,
.translation-policy span {
  color: var(--text-secondary);
  font-size: 0.66rem;
}
.translation-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.translation-grid label {
  display: grid;
  min-width: 0;
  gap: 5px;
}
.translation-grid :deep(.p-select) {
  min-width: 0;
}
.translation-grid label > span {
  font-weight: 700;
}
.translation-policy {
  display: grid;
  gap: 7px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 13px;
}
.translation-policy i {
  width: 20px;
  color: var(--status-accent-text);
}
.working-locale {
  min-height: 42px;
  display: flex;
  align-items: center;
  padding: 0 12px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface-subtle);
  font-size: 0.78rem;
}
.glossary {
  container-type: inline-size;
  display: grid;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 13px;
}
.glossary header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.glossary header > div {
  display: grid;
  gap: 2px;
}
.glossary header span,
.glossary-empty,
.glossary-keep {
  color: var(--text-secondary);
  font-size: 0.64rem;
}
.glossary-row {
  display: grid;
  grid-template-columns:
    minmax(12rem, 1fr)
    minmax(11rem, 0.65fr)
    minmax(12rem, 1fr)
    auto;
  align-items: center;
  gap: 10px;
}
.glossary-source,
.glossary-behavior,
.glossary-target {
  min-width: 0;
}
.glossary-keep {
  min-width: 0;
}
@container (max-width: 900px) {
  .glossary-row {
    grid-template-columns: minmax(0, 1fr) minmax(11rem, 0.65fr) auto;
  }
  .glossary-target,
  .glossary-keep {
    grid-column: 1 / 3;
  }
}
@container (max-width: 520px) {
  .glossary header {
    align-items: flex-start;
    flex-wrap: wrap;
  }
  .glossary header > div {
    flex: 1 1 15rem;
  }
  .glossary header > .p-button {
    margin-left: auto;
  }
  .glossary-row {
    grid-template-columns: minmax(0, 1fr) auto;
    align-items: stretch;
  }
  .glossary-source {
    grid-column: 1;
    grid-row: 1;
  }
  .glossary-remove {
    grid-column: 2;
    grid-row: 1;
  }
  .glossary-behavior {
    grid-column: 1 / -1;
    grid-row: 2;
  }
  .glossary-target,
  .glossary-keep {
    grid-column: 1 / -1;
    grid-row: 3;
  }
}
.translation-footer {
  padding-top: 12px;
  border-top: 1px solid var(--line);
}
@media (max-width: 760px) {
  .translation-grid {
    grid-template-columns: 1fr;
  }
  .translation-footer {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
