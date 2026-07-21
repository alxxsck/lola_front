<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { useToast } from "primevue/usetoast";
import Button from "primevue/button";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import AiUsageSection from "@/features/ai-usage/AiUsageSection.vue";
import ActivitySettingsSection from "@/features/activity-settings/ActivitySettingsSection.vue";
import { useAuthStore } from "@/features/auth/auth.store";
import { attributeContractRepository } from "@/features/end-user-attributes/api/attribute-contract-repository";
import SpeechSynthesisSection from "@/features/speech-synthesis/SpeechSynthesisSection.vue";
import type {
  AttributeContractRevisionFieldResponseDto,
  RealtimeVoice,
} from "@/shared/api/generated/models";
import { repository } from "@/shared/api/repository";
import type { ActivitySettings, Project } from "@/shared/types/domain";
import { localeDisplayName } from "@/shared/lib/locale";

interface ProjectForm {
  name: string;
  description: string;
  assistantName: string;
  systemPrompt: string;
  apiBaseUrl: string;
  wsUrl: string;
  allowedOrigins: string;
  voiceEnabled: boolean;
  voiceTranscriptEnabled: boolean;
  voice: RealtimeVoice;
  voiceInstructions: string;
}

const voiceOptions: { label: string; value: RealtimeVoice }[] = [
  { label: "Ara", value: "ara" },
  { label: "Eve", value: "eve" },
  { label: "Leo", value: "leo" },
  { label: "Rex", value: "rex" },
  { label: "Sal", value: "sal" },
];

function isRealtimeVoice(value: unknown): value is RealtimeVoice {
  return voiceOptions.some((option) => option.value === value);
}

const auth = useAuthStore();
const toast = useToast();
const loading = ref(true);
const saving = ref(false);
const voiceSettingsExpanded = ref(false);
const error = ref("");
const validationError = ref("");
const project = ref<Project | null>(null);
const localeField = ref<AttributeContractRevisionFieldResponseDto | null>(null);
const activitySettings = ref<ActivitySettings | null>(null);
const initialSnapshot = ref("");
const systemPromptControl = ref<HTMLElement | null>(null);
let systemPromptResizeState: {
  pointerId: number;
  startY: number;
  startHeight: number;
  minHeight: number;
} | null = null;
const form = reactive<ProjectForm>({
  name: "",
  description: "",
  assistantName: "",
  systemPrompt: "",
  apiBaseUrl: "",
  wsUrl: "",
  allowedOrigins: "",
  voiceEnabled: false,
  voiceTranscriptEnabled: true,
  voice: "eve",
  voiceInstructions: "",
});

const formSnapshot = computed(() => JSON.stringify(form));
const isDirty = computed(
  () =>
    Boolean(initialSnapshot.value) &&
    formSnapshot.value !== initialSnapshot.value,
);
const assistantInitial = computed(
  () => form.assistantName.trim().slice(0, 1).toUpperCase() || "L",
);
const contentLocales = computed(() =>
  (localeField.value?.constraints.allowedValues ?? []).filter(
    (value): value is string => typeof value === "string",
  ),
);
const contentDefaultLocale = computed(
  () => localeField.value?.constraints.defaultLocale ?? "",
);

function fillForm(nextProject: Project) {
  project.value = nextProject;
  Object.assign(form, {
    name: nextProject.name,
    description: nextProject.settings.description ?? "",
    assistantName: nextProject.assistantName,
    systemPrompt: nextProject.systemPrompt,
    apiBaseUrl:
      typeof nextProject.settings.apiBaseUrl === "string"
        ? nextProject.settings.apiBaseUrl
        : "",
    wsUrl:
      typeof nextProject.settings.wsUrl === "string"
        ? nextProject.settings.wsUrl
        : "",
    allowedOrigins: Array.isArray(nextProject.settings.allowedOrigins)
      ? nextProject.settings.allowedOrigins.join("\n")
      : "",
    voiceEnabled: nextProject.settings.voiceEnabled === true,
    voiceTranscriptEnabled:
      nextProject.settings.voiceTranscriptEnabled !== false,
    voice: isRealtimeVoice(nextProject.settings.voice)
      ? nextProject.settings.voice
      : "eve",
    voiceInstructions: nextProject.voiceInstructions,
  });
  initialSnapshot.value = JSON.stringify(form);
}

async function loadProject() {
  const projectId = auth.project?.id;
  if (!projectId) {
    error.value = "Текущий проект не найден. Войдите заново.";
    loading.value = false;
    return;
  }

  loading.value = true;
  error.value = "";
  try {
    const [nextProject, workspace] = await Promise.all([
      repository.getProject(projectId),
      attributeContractRepository.workspace(projectId).catch(() => null),
    ]);
    fillForm(nextProject);
    localeField.value =
      workspace?.currentRevision?.fields.find(
        (field) =>
          field.semanticRole === "LOCALE" && field.lifecycle === "ACTIVE",
      ) ?? null;
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить настройки проекта";
  } finally {
    loading.value = false;
  }
}

function validate() {
  validationError.value = "";
  if (!form.name.trim()) validationError.value = "Укажите название проекта.";
  else if (!form.assistantName.trim())
    validationError.value = "Укажите имя ассистента.";
  else if (!form.systemPrompt.trim())
    validationError.value = "Добавьте системную инструкцию для ассистента.";
  else if (form.apiBaseUrl && !form.apiBaseUrl.startsWith("https://"))
    validationError.value = "API URL должен использовать HTTPS.";
  else if (form.wsUrl && !form.wsUrl.startsWith("wss://"))
    validationError.value = "WebSocket URL должен использовать WSS.";
  else if (form.voiceInstructions.length > 20_000)
    validationError.value =
      "Инструкция для голосовой модели не должна превышать 20 000 символов.";
  return !validationError.value;
}

async function saveProject() {
  if (!project.value || !validate()) return;

  saving.value = true;
  error.value = "";
  try {
    const savedProject = await repository.updateProject(project.value.id, {
      name: form.name.trim(),
      assistantName: form.assistantName.trim(),
      systemPrompt: form.systemPrompt.trim(),
      voiceInstructions: form.voiceInstructions,
      settings: {
        ...project.value.settings,
        ...(activitySettings.value
          ? { timezone: activitySettings.value.timezone }
          : {}),
        description: form.description.trim(),
        apiBaseUrl: form.apiBaseUrl.trim(),
        wsUrl: form.wsUrl.trim(),
        allowedOrigins: form.allowedOrigins
          .split("\n")
          .map((value) => value.trim())
          .filter(Boolean),
        voiceEnabled: form.voiceEnabled,
        voiceTranscriptEnabled: form.voiceTranscriptEnabled,
        voice: form.voice,
      },
    });
    fillForm(savedProject);
    auth.updateProject(savedProject);
    toast.add({
      severity: "success",
      summary: "Настройки сохранены",
      detail: "Проект и ассистент обновлены.",
      life: 3200,
    });
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось сохранить настройки проекта";
    toast.add({
      severity: "error",
      summary: "Ошибка сохранения",
      detail: error.value,
      life: 4500,
    });
  } finally {
    saving.value = false;
  }
}

function getSystemPromptTextarea() {
  return (
    systemPromptControl.value?.querySelector<HTMLTextAreaElement>("textarea") ??
    null
  );
}

function getTextareaMinHeight(textarea: HTMLTextAreaElement) {
  const styles = window.getComputedStyle(textarea);
  const lineHeight = Number.parseFloat(styles.lineHeight);
  const verticalSpacing = [
    "paddingTop",
    "paddingBottom",
    "borderTopWidth",
    "borderBottomWidth",
  ]
    .map(
      (property) =>
        Number.parseFloat(
          styles[property as keyof CSSStyleDeclaration] as string,
        ) || 0,
    )
    .reduce((total, value) => total + value, 0);

  return Number.isFinite(lineHeight)
    ? Math.ceil(lineHeight * textarea.rows + verticalSpacing)
    : textarea.offsetHeight;
}

function startSystemPromptResize(event: PointerEvent) {
  const textarea = getSystemPromptTextarea();
  if (!textarea) return;

  event.preventDefault();
  systemPromptResizeState = {
    pointerId: event.pointerId,
    startY: event.clientY,
    startHeight: textarea.offsetHeight,
    minHeight: getTextareaMinHeight(textarea),
  };
  window.addEventListener("pointermove", resizeSystemPrompt);
  window.addEventListener("pointerup", stopSystemPromptResize);
  window.addEventListener("pointercancel", stopSystemPromptResize);
}

function resizeSystemPrompt(event: PointerEvent) {
  const textarea = getSystemPromptTextarea();
  if (
    !textarea ||
    !systemPromptResizeState ||
    event.pointerId !== systemPromptResizeState.pointerId
  )
    return;

  const height = Math.max(
    systemPromptResizeState.minHeight,
    systemPromptResizeState.startHeight +
      event.clientY -
      systemPromptResizeState.startY,
  );
  textarea.style.height = `${height}px`;
}

function stopSystemPromptResize(event?: PointerEvent) {
  if (event && event.pointerId !== systemPromptResizeState?.pointerId) return;
  systemPromptResizeState = null;
  window.removeEventListener("pointermove", resizeSystemPrompt);
  window.removeEventListener("pointerup", stopSystemPromptResize);
  window.removeEventListener("pointercancel", stopSystemPromptResize);
}

function resizeSystemPromptBy(offset: number) {
  const textarea = getSystemPromptTextarea();
  if (!textarea) return;

  textarea.style.height = `${Math.max(getTextareaMinHeight(textarea), textarea.offsetHeight + offset)}px`;
}

function confirmDiscard() {
  return (
    !isDirty.value ||
    window.confirm("Есть несохранённые изменения. Покинуть страницу?")
  );
}

function beforeUnload(event: BeforeUnloadEvent) {
  if (!isDirty.value) return;
  event.preventDefault();
}

onBeforeRouteLeave(confirmDiscard);
onMounted(() => {
  window.addEventListener("beforeunload", beforeUnload);
  void loadProject();
});
onBeforeUnmount(() => {
  window.removeEventListener("beforeunload", beforeUnload);
  stopSystemPromptResize();
});
</script>

<template>
  <div class="page project-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Конфигурация</div>
        <h1>Настройки проекта</h1>
        <p class="subtitle">
          Основные данные, языки и характер ассистента для
          {{ project?.name ?? auth.project?.name }}.
        </p>
      </div>
      <div v-if="project" class="project-status">
        <span class="status-dot" /><span
          ><strong>Проект активен</strong
          ><small class="mono">{{ project.slug }}</small></span
        >
      </div>
    </header>

    <Message v-if="error" severity="error" class="page-message">
      <div class="message-row">
        <span>{{ error }}</span
        ><Button
          v-if="!project"
          label="Повторить"
          icon="pi pi-refresh"
          size="small"
          text
          @click="loadProject"
        />
      </div>
    </Message>

    <div v-if="loading" class="settings-layout">
      <div class="card card-pad skeleton-card">
        <Skeleton width="9rem" height="1.5rem" /><Skeleton
          v-for="item in 4"
          :key="item"
          height="3.1rem"
        />
      </div>
      <div class="card card-pad skeleton-card">
        <Skeleton width="10rem" height="1.5rem" /><Skeleton height="13rem" />
      </div>
    </div>

    <div v-else-if="project" class="settings-layout">
      <div class="settings-main stack">
        <form class="settings-main-form stack" @submit.prevent="saveProject">
          <section class="card card-pad settings-section">
            <div class="section-title">
              <span class="section-icon lime"
                ><i class="pi pi-building"
              /></span>
              <div>
                <h2>О проекте</h2>
                <p>Эти данные видны только администраторам.</p>
              </div>
            </div>
            <div class="form-grid">
              <div class="field full">
                <label for="project-name">Название проекта</label
                ><InputText
                  id="project-name"
                  v-model="form.name"
                  placeholder="Название продукта"
                  :disabled="saving"
                />
              </div>
              <div class="field full">
                <label for="project-description">Описание</label
                ><Textarea
                  id="project-description"
                  v-model="form.description"
                  rows="4"
                  maxlength="500"
                  auto-resize
                  placeholder="Коротко опишите назначение проекта"
                  :disabled="saving"
                /><small>{{ form.description.length }}/500</small>
              </div>
            </div>
          </section>

          <section class="card card-pad settings-section">
            <div class="section-title">
              <span class="section-icon violet"
                ><i class="pi pi-language"
              /></span>
              <div>
                <h2>Языки контента</h2>
                <p>Языки настраиваются единым Locale Attribute в полях пользователя.</p>
              </div>
            </div>
            <div v-if="localeField" class="content-locale-summary">
              <div>
                <small>Основной язык</small>
                <strong>{{ localeDisplayName(contentDefaultLocale) }} ({{ contentDefaultLocale }})</strong>
              </div>
              <div class="content-locale-chips">
                <span v-for="locale in contentLocales" :key="locale" :class="{ primary: locale === contentDefaultLocale }">
                  {{ localeDisplayName(locale) }} <code>{{ locale }}</code>
                </span>
              </div>
              <Button
                label="Изменить в полях пользователя"
                icon="pi pi-arrow-right"
                severity="secondary"
                outlined
                as="router-link"
                :to="`/profile-fields/${localeField.definitionId ?? localeField.key}`"
              />
            </div>
            <div v-else class="content-locale-empty">
              <i class="pi pi-language" />
              <div>
                <strong>Языки контента ещё не настроены</strong>
                <p>Создайте одно поле пользователя с назначением «Язык контента».</p>
              </div>
              <Button
                label="Настроить языки"
                icon="pi pi-plus"
                as="router-link"
                :to="{ name: 'profile-field-create', query: { semanticRole: 'LOCALE' } }"
              />
            </div>
          </section>

          <section class="card card-pad settings-section">
            <div class="section-title">
              <span class="section-icon green"><i class="pi pi-link" /></span>
              <div>
                <h2>Подключение продукта</h2>
                <p>
                  Публичные адреса SDK и разрешённые домены. Секреты здесь не
                  отображаются.
                </p>
              </div>
              <span class="integration-unknown"
                ><i class="pi pi-minus-circle" /> Не проверено</span
              >
            </div>
            <div class="form-grid columns">
              <div class="field">
                <label for="api-url">Public API URL</label
                ><InputText
                  id="api-url"
                  v-model="form.apiBaseUrl"
                  class="mono"
                  placeholder="https://api.example.com/api/v1"
                  :disabled="saving"
                />
              </div>
              <div class="field">
                <label for="ws-url">WebSocket URL</label
                ><InputText
                  id="ws-url"
                  v-model="form.wsUrl"
                  class="mono"
                  placeholder="wss://api.example.com/assistant"
                  :disabled="saving"
                />
              </div>
              <div class="field">
                <label for="allowed-origins"
                  >Разрешённые origins <span>по одному в строке</span></label
                ><Textarea
                  id="allowed-origins"
                  v-model="form.allowedOrigins"
                  rows="3"
                  class="mono"
                  placeholder="https://app.example.com"
                  :disabled="saving"
                />
              </div>
            </div>
            <RouterLink to="/profile-fields" class="contract-link surface-soft">
              <span class="contract-link-icon"
                ><i class="pi pi-id-card"
              /></span>
              <span
                ><strong>Поля профиля пользователей</strong
                ><small
                  >Какие данные получает Lola и где их можно использовать</small
                ></span
              >
              <i class="pi pi-arrow-right" />
            </RouterLink>
          </section>
        </form>

        <ActivitySettingsSection
          v-if="project"
          :project-id="project.id"
          :editable="auth.user?.role === 'OWNER' || auth.user?.role === 'ADMIN'"
          @change="activitySettings = $event"
        />

        <form
          id="project-settings-form"
          class="settings-main-form stack"
          @submit.prevent="saveProject"
        >
          <section class="card card-pad settings-section">
            <div class="section-title">
              <span class="section-icon coral"
                ><i class="pi pi-sparkles"
              /></span>
              <div>
                <h2>Ассистент</h2>
                <p>
                  Имя и базовая инструкция определяют голос Lola в этом проекте.
                </p>
              </div>
            </div>
            <div class="assistant-fields">
              <div class="assistant-preview">
                <div class="assistant-orbit">
                  <span>{{ assistantInitial }}</span>
                </div>
                <small>Предпросмотр</small
                ><strong>{{ form.assistantName || "Имя ассистента" }}</strong>
              </div>
              <div class="form-grid">
                <div class="field">
                  <label for="assistant-name">Имя ассистента</label
                  ><InputText
                    id="assistant-name"
                    v-model="form.assistantName"
                    placeholder="Lola"
                    :disabled="saving"
                  />
                </div>
                <div class="field">
                  <label for="system-prompt">Системная инструкция</label>
                  <div ref="systemPromptControl" class="system-prompt-control">
                    <Textarea
                      id="system-prompt"
                      v-model="form.systemPrompt"
                      class="system-prompt-textarea"
                      rows="3"
                      placeholder="Как ассистент должен общаться и помогать пользователю?"
                      :disabled="saving"
                    />
                    <button
                      type="button"
                      class="system-prompt-resizer"
                      aria-label="Изменить высоту системной инструкции"
                      title="Потяните, чтобы изменить высоту"
                      @pointerdown="startSystemPromptResize"
                      @keydown.up.prevent="resizeSystemPromptBy(-24)"
                      @keydown.down.prevent="resizeSystemPromptBy(24)"
                    >
                      <i class="pi pi-arrows-v" aria-hidden="true" />
                    </button>
                  </div>
                  <small>{{ form.systemPrompt.length }} символов</small>
                </div>
              </div>
            </div>
          </section>

          <section
            class="card card-pad settings-section"
            :class="{ collapsed: !voiceSettingsExpanded }"
          >
            <div class="section-title">
              <span class="section-icon blue"
                ><i class="pi pi-microphone"
              /></span>
              <div>
                <h2>Голосовой чат</h2>
                <p>Настройте голосовые диалоги, голос Lola и манеру её речи.</p>
              </div>
              <Button
                type="button"
                :icon="
                  voiceSettingsExpanded
                    ? 'pi pi-chevron-up'
                    : 'pi pi-chevron-down'
                "
                severity="secondary"
                text
                rounded
                :aria-label="
                  voiceSettingsExpanded
                    ? 'Свернуть настройки голосового чата'
                    : 'Развернуть настройки голосового чата'
                "
                :aria-expanded="voiceSettingsExpanded"
                aria-controls="voice-chat-settings"
                @click="voiceSettingsExpanded = !voiceSettingsExpanded"
              />
            </div>
            <div
              id="voice-chat-settings"
              v-show="voiceSettingsExpanded"
              class="voice-settings"
            >
              <div class="setting-toggle surface-soft">
                <div>
                  <strong>Разрешить голосовые диалоги</strong
                  ><span
                    >Пока настройка выключена, начать голосовой разговор
                    нельзя.</span
                  >
                </div>
                <ToggleSwitch
                  v-model="form.voiceEnabled"
                  input-id="voice-enabled"
                  :disabled="saving"
                  aria-label="Разрешить голосовые диалоги"
                />
              </div>
              <div class="form-grid columns">
                <div class="field">
                  <label for="voice">Голос по умолчанию</label
                  ><Select
                    id="voice"
                    v-model="form.voice"
                    :options="voiceOptions"
                    option-label="label"
                    option-value="value"
                    :disabled="saving || !form.voiceEnabled"
                  />
                </div>
                <div
                  class="setting-toggle compact surface-soft"
                  :class="{ disabled: !form.voiceEnabled }"
                >
                  <div>
                    <strong>Сохранять транскрипты</strong
                    ><span
                      >Реплики голосового диалога появятся в обычной истории
                      сообщений.</span
                    >
                  </div>
                  <ToggleSwitch
                    v-model="form.voiceTranscriptEnabled"
                    input-id="voice-transcripts"
                    :disabled="saving || !form.voiceEnabled"
                    aria-label="Сохранять транскрипты голосового чата"
                  />
                </div>
              </div>
              <div class="field">
                <label for="voice-instructions"
                  >Инструкция для голосовой модели</label
                >
                <Textarea
                  id="voice-instructions"
                  v-model="form.voiceInstructions"
                  rows="6"
                  maxlength="20000"
                  auto-resize
                  placeholder="Опишите тон, темп, эмоции и манеру речи"
                  :disabled="saving"
                />
                <small
                  >{{ form.voiceInstructions.length }}/20 000 символов</small
                >
              </div>
            </div>
          </section>
        </form>

        <SpeechSynthesisSection
          class="settings-main-tts"
          :project-id="project.id"
          :supported-locales="project.supportedLocales"
        />
      </div>

      <aside class="settings-aside stack">
        <section class="card card-pad meta-card">
          <div class="eyebrow">Идентификаторы</div>
          <div class="meta-row">
            <span>Project ID</span><code>{{ project.id }}</code>
          </div>
          <div class="meta-row">
            <span>Slug</span><code>{{ project.slug }}</code>
          </div>
          <div class="meta-row">
            <span>Public key</span><code>{{ project.publicKey }}</code>
          </div>
          <p>
            <i class="pi pi-info-circle" /> Идентификаторы назначаются при
            создании проекта и недоступны для редактирования.
          </p>
        </section>

        <section class="save-card">
          <div>
            <strong>{{
              isDirty
                ? "Есть несохранённые изменения"
                : "Все изменения сохранены"
            }}</strong
            ><span>{{
              isDirty
                ? "Сохраните настройки, чтобы применить их в проекте."
                : "Настройки проекта актуальны."
            }}</span>
          </div>
          <Message v-if="validationError" severity="warn" size="small">{{
            validationError
          }}</Message>
          <Button
            type="submit"
            form="project-settings-form"
            label="Сохранить настройки"
            icon="pi pi-check"
            :loading="saving"
            :disabled="!isDirty"
            fluid
          />
        </section>
      </aside>
    </div>

    <AiUsageSection v-if="!loading && project" :project-id="project.id" />
  </div>
</template>

<style scoped>
.project-status {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 11px 14px;
  background: var(--surface-card);
  border: 1px solid var(--line);
  border-radius: 14px;
}
.content-locale-summary,
.content-locale-empty {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-subtle);
}
.content-locale-summary > div:first-child { display: grid; gap: 3px; }
.content-locale-summary small { color: var(--muted); }
.content-locale-chips { display: flex; flex-wrap: wrap; gap: 6px; }
.content-locale-chips span { padding: 5px 8px; border-radius: 999px; background: var(--surface-card); font-size: .7rem; }
.content-locale-chips span.primary { background: var(--status-violet-soft); color: var(--status-violet-text); }
.content-locale-chips code { margin-left: 3px; }
.content-locale-empty { grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; }
.content-locale-empty > i { font-size: 1.3rem; color: var(--status-violet-text); }
.content-locale-empty p { margin: 3px 0 0; color: var(--muted); font-size: .7rem; }
.project-status > span:last-child {
  display: flex;
  flex-direction: column;
}
.project-status strong {
  font-size: 0.78rem;
}
.project-status small {
  font-size: 0.65rem;
  color: var(--muted);
  margin-top: 2px;
}
.page-message {
  margin-bottom: 18px;
}
.message-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  width: 100%;
}
.settings-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 310px;
  gap: 18px;
  align-items: start;
}
.settings-main-tts {
  margin-top: 0;
}
.settings-section {
  padding: 26px;
}
.section-title {
  display: flex;
  align-items: flex-start;
  gap: 13px;
  padding-bottom: 21px;
  margin-bottom: 21px;
  border-bottom: 1px solid var(--border-subtle);
}
.settings-section.collapsed .section-title {
  padding-bottom: 0;
  margin-bottom: 0;
  border-bottom: 0;
}
.section-title > div {
  min-width: 0;
  flex: 1;
}
.section-title > button {
  flex: 0 0 auto;
}
.section-title h2 {
  font-size: 1.08rem;
}
.section-title p {
  color: var(--muted);
  font-size: 0.76rem;
  margin: 4px 0 0;
}
.section-icon {
  display: grid;
  place-items: center;
  width: 39px;
  height: 39px;
  border-radius: 12px;
  flex: 0 0 auto;
}
.section-icon.lime {
  background: var(--project-tone-lime-soft);
  color: var(--project-tone-lime-foreground);
}
.section-icon.violet {
  background: var(--project-tone-violet-soft);
  color: var(--project-tone-violet-foreground);
}
.section-icon.coral {
  background: var(--project-tone-coral-soft);
  color: var(--project-tone-coral-foreground);
}
.form-grid {
  display: grid;
  gap: 18px;
}
.form-grid.columns {
  grid-template-columns: minmax(180px, 0.7fr) minmax(260px, 1.3fr);
}
.field small {
  font-size: 0.68rem;
  color: var(--text-small-muted);
  text-align: right;
}
.assistant-fields {
  display: grid;
  grid-template-columns: 140px minmax(0, 1fr);
  gap: 24px;
}
.assistant-preview {
  display: flex;
  flex-direction: column;
  align-items: center;
  padding: 22px 12px;
  background: var(--surface-subtle);
  border: 1px solid var(--border-subtle);
  border-radius: 17px;
}
.assistant-orbit {
  display: grid;
  place-items: center;
  width: 76px;
  height: 76px;
  border-radius: 50%;
  background: linear-gradient(
    145deg,
    var(--status-violet),
    var(--action-primary)
  );
  box-shadow:
    0 0 0 8px var(--status-violet-soft),
    0 13px 26px color-mix(in srgb, var(--status-violet) 24%, transparent);
  margin: 8px 0 20px;
}
.assistant-orbit span {
  font: 700 1.7rem var(--font-display);
  color: var(--project-assistant-on-orbit);
}
.assistant-preview small {
  font-size: 0.62rem;
  text-transform: uppercase;
  letter-spacing: 0.09em;
  color: var(--text-small-muted);
}
.assistant-preview strong {
  font-size: 0.84rem;
  margin-top: 4px;
  text-align: center;
}
.settings-aside {
  position: sticky;
  top: 24px;
}
.meta-card .eyebrow {
  margin-bottom: 14px;
}
.meta-row {
  padding: 12px 0;
  border-top: 1px solid var(--border-subtle);
}
.meta-row span,
.meta-row code {
  display: block;
}
.meta-row span {
  font-size: 0.68rem;
  color: var(--muted);
  margin-bottom: 5px;
}
.meta-row code {
  font-size: 0.72rem;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  color: var(--text-primary);
}
.meta-card p {
  display: flex;
  gap: 8px;
  margin: 14px 0 0;
  padding: 11px;
  background: var(--surface-subtle);
  border-radius: 11px;
  color: var(--text-small-muted);
  font-size: 0.68rem;
  line-height: 1.45;
}
.meta-card p i {
  margin-top: 2px;
}
.save-card {
  display: flex;
  flex-direction: column;
  gap: 14px;
  padding: 20px;
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
  border-radius: 18px;
}
.save-card strong,
.save-card span {
  display: block;
}
.save-card strong {
  font-size: 0.83rem;
}
.save-card span {
  font-size: 0.69rem;
  color: var(--text-on-emphasis-muted);
  line-height: 1.4;
  margin-top: 4px;
}
.save-card :deep(.p-message-text) {
  font-size: 0.72rem;
}
.skeleton-card {
  display: flex;
  flex-direction: column;
  gap: 20px;
}
.skeleton-card:nth-child(2) {
  min-height: 280px;
}
.system-prompt-control {
  position: relative;
}
.system-prompt-textarea {
  display: block;
  resize: none;
  overflow: auto;
  padding-bottom: 32px;
}
.system-prompt-resizer {
  position: absolute;
  right: 3px;
  bottom: 3px;
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  padding: 0;
  border: 0;
  border-radius: 9px;
  background: transparent;
  color: var(--text-secondary);
  cursor: ns-resize;
  touch-action: none;
  user-select: none;
}
.system-prompt-resizer:hover {
  background: var(--surface-hover);
  color: var(--text-primary);
}
.system-prompt-resizer:focus-visible {
  outline: 2px solid var(--focus-ring);
  outline-offset: -2px;
}
.system-prompt-resizer i {
  font-size: 0.82rem;
  pointer-events: none;
}
@media (max-width: 1050px) {
  .settings-layout {
    grid-template-columns: 1fr;
  }
  .settings-aside {
    position: static;
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .save-card {
    align-self: stretch;
    justify-content: center;
  }
}
@media (max-width: 700px) {
  .settings-section {
    padding: 20px;
  }
  .form-grid.columns,
  .assistant-fields,
  .settings-aside {
    grid-template-columns: 1fr;
  }
  .assistant-preview {
    display: grid;
    grid-template-columns: auto 1fr;
    grid-template-rows: auto auto;
    text-align: left;
    column-gap: 18px;
  }
  .assistant-orbit {
    grid-row: 1/3;
    margin: 4px 0;
  }
  .assistant-preview small,
  .assistant-preview strong {
    text-align: left;
  }
  .section-title {
    align-items: center;
  }
  .project-status {
    width: 100%;
  }
  .system-prompt-textarea {
    padding-bottom: 40px;
  }
  .system-prompt-resizer {
    right: 1px;
    bottom: 1px;
    width: 42px;
    height: 42px;
  }
}
.section-icon.green {
  background: var(--project-tone-green-soft);
  color: var(--project-tone-green-foreground);
}
.section-icon.blue {
  background: var(--project-tone-blue-soft);
  color: var(--project-tone-blue-foreground);
}
.integration-unknown {
  margin-left: auto;
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--text-small-muted);
  font-size: 0.68rem;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
}
.voice-settings {
  display: flex;
  flex-direction: column;
  gap: 18px;
}
.setting-toggle {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
  padding: 15px;
}
.setting-toggle strong,
.setting-toggle span {
  display: block;
}
.setting-toggle strong {
  font-size: 0.82rem;
}
.setting-toggle span {
  max-width: 620px;
  margin-top: 4px;
  color: var(--muted);
  font-size: 0.7rem;
  line-height: 1.45;
}
.setting-toggle.compact {
  min-height: 67px;
}
.setting-toggle.disabled {
  opacity: 0.6;
}
.contract-link {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-top: 18px;
  padding: 13px 14px;
  transition: 0.16s ease;
}
.contract-link:hover {
  border-color: color-mix(
    in srgb,
    var(--text-brand) 35%,
    var(--border-default)
  );
  background: var(--brand-soft);
}
.contract-link-icon {
  display: grid;
  place-items: center;
  width: 37px;
  height: 37px;
  border-radius: 11px;
  background: var(--brand-soft);
  color: var(--text-brand);
}
.contract-link > span:nth-child(2) {
  flex: 1;
}
.contract-link strong,
.contract-link small {
  display: block;
}
.contract-link strong {
  font-size: 0.78rem;
}
.contract-link small {
  font-size: 0.67rem;
  color: var(--text-small-muted);
  margin-top: 3px;
}
.contract-link > i {
  font-size: 0.75rem;
  color: var(--text-secondary);
}
</style>
