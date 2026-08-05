<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import ToggleSwitch from "primevue/toggleswitch";
import { useToast } from "primevue/usetoast";
import type {
  ScenarioAdmissionSettingsResponseDto,
  UpdateScenarioAdmissionSettingsDto,
} from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import ProjectSettingsSectionHeader from "@/shared/ui/ProjectSettingsSectionHeader.vue";
import { scenarioAdmissionApi } from "./scenario-admission.api";
import {
  formatAdmissionSummary,
  formatQuietHoursPreview,
} from "./scenario-admission.model";

const props = defineProps<{
  projectId: string;
  editable: boolean;
  fallbackTimeZone: string;
}>();

const toast = useToast();
const loading = ref(true);
const saving = ref(false);
const expanded = ref(false);
const error = ref("");
const settings = ref<ScenarioAdmissionSettingsResponseDto | null>(null);
const acknowledgeOpen = ref(false);
const acknowledgeChecked = ref(false);
const impactedScenarios = ref(0);
const form = reactive({
  mode: "LEGACY_PER_SCENARIO" as UpdateScenarioAdmissionSettingsDto["mode"],
  maxStartsPerLocalDay: null as number | null,
  maxStartsPerVisit: null as number | null,
  minimumIntervalSeconds: 0,
  quietHoursEnabled: false,
  quietHoursStart: "00:00",
  quietHoursEnd: "08:00",
});

const modeOptions = [
  {
    value: "PROJECT_GLOBAL_V1",
    label: "Общие ограничения",
  },
  {
    value: "LEGACY_PER_SCENARIO",
    label: "По каждому сценарию (legacy)",
  },
];
const summary = computed(() => formatAdmissionSummary(form));
const quietPreview = computed(() =>
  formatQuietHoursPreview(form.quietHoursStart, form.quietHoursEnd),
);
const quietHoursValid = computed(
  () =>
    /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(form.quietHoursStart) &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$/u.test(form.quietHoursEnd) &&
    (!form.quietHoursEnabled || form.quietHoursStart !== form.quietHoursEnd),
);

onMounted(load);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    fill(await scenarioAdmissionApi.get(props.projectId));
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить ограничения сценариев";
  } finally {
    loading.value = false;
  }
}

function fill(value: ScenarioAdmissionSettingsResponseDto) {
  settings.value = value;
  Object.assign(form, {
    mode: value.mode,
    maxStartsPerLocalDay: value.maxStartsPerLocalDay,
    maxStartsPerVisit: value.maxStartsPerVisit,
    minimumIntervalSeconds: value.minimumIntervalSeconds,
    quietHoursEnabled: value.quietHours.enabled,
    quietHoursStart: value.quietHours.startLocalTime,
    quietHoursEnd: value.quietHours.endLocalTime,
  });
}

function body(
  acknowledgeLegacyScenarioLimits = false,
): UpdateScenarioAdmissionSettingsDto {
  if (!settings.value) throw new Error("Настройки ещё не загружены");
  return {
    expectedVersion: settings.value.projectVersion,
    mode: form.mode,
    maxStartsPerLocalDay: form.maxStartsPerLocalDay,
    maxStartsPerVisit: form.maxStartsPerVisit,
    minimumIntervalSeconds: form.minimumIntervalSeconds,
    quietHours: {
      enabled: form.quietHoursEnabled,
      startLocalTime: form.quietHoursStart,
      endLocalTime: form.quietHoursEnd,
    },
    ...(acknowledgeLegacyScenarioLimits
      ? { acknowledgeLegacyScenarioLimits: true }
      : {}),
    reason: "Update Scenario Admission settings from CMS",
  };
}

async function save(acknowledge = false) {
  if (!props.editable || !settings.value || !quietHoursValid.value) {
    if (!quietHoursValid.value) {
      error.value =
        "Проверьте время: нужен формат HH:mm, начало и конец должны отличаться.";
    }
    return;
  }
  saving.value = true;
  error.value = "";
  try {
    fill(await scenarioAdmissionApi.update(props.projectId, body(acknowledge)));
    acknowledgeOpen.value = false;
    acknowledgeChecked.value = false;
    toast.add({
      severity: "success",
      summary: "Ограничения сценариев сохранены",
      life: 2800,
    });
  } catch (cause) {
    if (
      cause instanceof ApiError ||
      (cause && typeof cause === "object" && "code" in cause)
    ) {
      const candidate = cause as { code?: string; details?: unknown };
      if (candidate.code === "PROJECT_VERSION_CONFLICT") {
        error.value =
          "Настройки уже изменили в другом окне. Ваши значения сохранены в форме; откройте актуальную версию в другой вкладке и сравните изменения перед повторным сохранением.";
        return;
      }
      if (candidate.code === "LEGACY_SCENARIO_LIMITS_REQUIRE_ACKNOWLEDGEMENT") {
        const details =
          candidate.details && typeof candidate.details === "object"
            ? (candidate.details as { activeScenarioCount?: unknown })
            : {};
        impactedScenarios.value =
          typeof details.activeScenarioCount === "number"
            ? details.activeScenarioCount
            : 0;
        acknowledgeOpen.value = true;
        return;
      }
    }
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось сохранить ограничения";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section
    class="settings-section card admission-settings"
    :class="{ collapsed: !expanded }"
  >
    <ProjectSettingsSectionHeader
      v-model:expanded="expanded"
      title="Частота и тихие часы"
      description="Общие ограничения запусков Retenive для одного игрока во всех сценариях."
      icon="pi pi-stopwatch"
      tone="accent"
      content-id="scenario-admission-settings"
    />
    <div
      id="scenario-admission-settings"
      v-show="expanded"
      class="admission-content"
    >
      <Message v-if="error" severity="error" :closable="false">{{
        error
      }}</Message>
      <p v-if="loading" class="loading">
        <i class="pi pi-spin pi-spinner" /> Загружаем правила запуска…
      </p>
      <template v-else-if="settings">
        <div class="settings-grid">
          <article class="setting-card">
            <header>
              <span class="card-icon"><i class="pi pi-chart-bar" /></span>
              <div>
                <h3>Общая частота</h3>
                <p>Лимиты считаются только по реально начатым сценариям.</p>
              </div>
            </header>
            <label>
              <span>Режим ограничений</span>
              <Select
                v-model="form.mode"
                :options="modeOptions"
                option-label="label"
                option-value="value"
                :disabled="!editable"
              />
            </label>
            <div class="two-columns frequency-limits">
              <label>
                <span>Максимум за локальные сутки</span>
                <InputNumber
                  v-model="form.maxStartsPerLocalDay"
                  :min="1"
                  :use-grouping="false"
                  placeholder="Без ограничения"
                  :disabled="!editable || form.mode !== 'PROJECT_GLOBAL_V1'"
                />
              </label>
              <label>
                <span>Максимум за визит</span>
                <InputNumber
                  v-model="form.maxStartsPerVisit"
                  :min="1"
                  :use-grouping="false"
                  placeholder="Без ограничения"
                  :disabled="!editable || form.mode !== 'PROJECT_GLOBAL_V1'"
                />
              </label>
            </div>
            <label>
              <span>Минимальная пауза</span>
              <InputNumber
                v-model="form.minimumIntervalSeconds"
                :min="0"
                :step="60"
                suffix=" сек."
                :use-grouping="false"
                :disabled="!editable || form.mode !== 'PROJECT_GLOBAL_V1'"
              />
              <small
                >Визит — непрерывный период активности. Новая вкладка и короткое
                переподключение не создают новый визит.</small
              >
            </label>
            <p class="summary">
              <i class="pi pi-check-circle" /> {{ summary }}
            </p>
          </article>

          <article class="setting-card">
            <header>
              <span class="card-icon moon"><i class="pi pi-moon" /></span>
              <div>
                <h3>Тихие часы</h3>
                <p>Применяются только к сценариям, где включено соблюдение.</p>
              </div>
            </header>
            <label class="switch-row">
              <span
                ><strong>Использовать тихие часы</strong
                ><small>Сообщения безопасности всегда проходят.</small></span
              >
              <ToggleSwitch
                v-model="form.quietHoursEnabled"
                :disabled="!editable"
              />
            </label>
            <div class="two-columns">
              <label>
                <span>Начало</span>
                <InputText
                  v-model="form.quietHoursStart"
                  placeholder="00:00"
                  :disabled="!editable || !form.quietHoursEnabled"
                />
              </label>
              <label>
                <span>Окончание</span>
                <InputText
                  v-model="form.quietHoursEnd"
                  placeholder="08:00"
                  :disabled="!editable || !form.quietHoursEnabled"
                />
              </label>
            </div>
            <p class="summary"><i class="pi pi-clock" /> {{ quietPreview }}</p>
            <small class="helper"
              >Событие будет записано, но сценарий не запустится и не
              израсходует лимит. После окончания тихих часов автоматического
              запуска не будет.</small
            >
          </article>

          <article class="setting-card timezone-card">
            <header>
              <span class="card-icon zone"><i class="pi pi-globe" /></span>
              <div>
                <h3>Локальное время игрока</h3>
                <p>Сервер определяет его в фиксированном порядке.</p>
              </div>
            </header>
            <ol>
              <li>
                <strong>Time Zone профиля</strong
                ><small>Формат IANA, например Europe/Madrid.</small>
              </li>
              <li>
                <strong>Time Zone проекта</strong
                ><small>Настройка активности: {{ fallbackTimeZone }}</small>
              </li>
              <li>
                <strong>UTC</strong
                ><small>Безопасный fallback для legacy-конфигурации.</small>
              </li>
            </ol>
            <RouterLink
              :to="{
                path: '/profile-fields',
                query: { semanticRole: 'TIME_ZONE' },
              }"
              class="profile-link"
            >
              Настроить Time Zone в профиле <i class="pi pi-arrow-right" />
            </RouterLink>
          </article>
        </div>
        <footer v-if="editable" class="actions">
          <p>
            <i class="pi pi-info-circle" /> Изменение версионируется и влияет на
            все активные сценарии проекта.
          </p>
          <Button
            data-testid="admission-save"
            label="Сохранить частоту"
            icon="pi pi-check"
            :loading="saving"
            :disabled="!quietHoursValid"
            @click="save(false)"
          />
        </footer>
      </template>
    </div>

    <Dialog
      v-model:visible="acknowledgeOpen"
      modal
      header="Перейти на общие ограничения?"
      :style="{ width: 'min(540px, calc(100vw - 24px))' }"
    >
      <p class="dialog-copy">
        <strong>{{ impactedScenarios }} активных сценария</strong> содержат
        индивидуальные cooldown или максимум запусков. В общем режиме они
        перестанут применяться.
      </p>
      <label class="confirm-row">
        <Checkbox
          v-model="acknowledgeChecked"
          binary
          input-id="acknowledge-legacy-limits"
        />
        <span
          >Я понимаю, что индивидуальные ограничения будут заменены
          общими.</span
        >
      </label>
      <template #footer>
        <Button
          label="Отмена"
          severity="secondary"
          text
          @click="acknowledgeOpen = false"
        />
        <Button
          label="Подтвердить и сохранить"
          :disabled="!acknowledgeChecked"
          :loading="saving"
          @click="save(true)"
        />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.admission-settings {
  padding: 26px;
}
.admission-content {
  display: flex;
  flex-direction: column;
  gap: 20px;
  container-type: inline-size;
}
.loading {
  display: flex;
  align-items: center;
  gap: 9px;
  margin: 0;
  padding: 15px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-subtle);
  color: var(--text-small-muted);
  font-size: 0.72rem;
}
.settings-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 14px;
}
.setting-card {
  display: flex;
  min-width: 0;
  flex-direction: column;
  gap: 16px;
  padding: 18px;
  border: 1px solid var(--border-subtle);
  border-radius: 16px;
  background: var(--surface-subtle);
}
.setting-card header {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.setting-card h3,
.setting-card p {
  margin: 0;
}
.setting-card h3 {
  font: 700 0.9rem var(--font-display);
  color: var(--text-primary);
}
.setting-card header p {
  margin-top: 4px;
  color: var(--text-small-muted);
  font-size: 0.68rem;
  line-height: 1.45;
}
.card-icon {
  display: grid;
  place-items: center;
  flex: 0 0 34px;
  height: 34px;
  border-radius: 11px;
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
}
.card-icon.moon {
  background: var(--status-info-soft);
  color: var(--status-info-text);
}
.card-icon.zone {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.setting-card label {
  display: flex;
  flex-direction: column;
  gap: 7px;
}
.setting-card label > span {
  font-size: 0.74rem;
  font-weight: 700;
  color: var(--text-primary);
}
.setting-card label small,
.helper {
  color: var(--text-small-muted);
  font-size: 0.65rem;
  line-height: 1.5;
}
.two-columns {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.switch-row {
  flex-direction: row !important;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--surface-card);
}
.switch-row span {
  display: flex;
  flex-direction: column;
  gap: 3px;
}
.switch-row small {
  font-weight: 400;
}
.summary {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 11px 12px;
  border-radius: 11px;
  background: var(--surface-card);
  color: var(--text-secondary);
  font-size: 0.7rem;
  line-height: 1.45;
}
.summary i {
  margin-top: 2px;
  color: var(--accent);
}
.timezone-card {
  grid-column: 1/-1;
}
.timezone-card ol {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
  padding: 0;
  list-style: none;
  counter-reset: zone;
}
.timezone-card li {
  position: relative;
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 12px 12px 12px 42px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--surface-card);
  counter-increment: zone;
}
.timezone-card li:before {
  content: counter(zone);
  position: absolute;
  left: 12px;
  top: 12px;
  display: grid;
  place-items: center;
  width: 21px;
  height: 21px;
  border-radius: 7px;
  background: var(--surface-emphasis);
  font: 700 0.65rem var(--font-display);
}
.timezone-card li strong {
  font-size: 0.72rem;
}
.timezone-card li small {
  color: var(--text-small-muted);
  font-size: 0.64rem;
}
.profile-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  align-self: flex-start;
  padding: 8px 10px;
  border-radius: 9px;
  background: var(--status-accent-soft);
  color: var(--status-accent-text);
  font-size: 0.7rem;
  font-weight: 700;
  text-decoration: none;
}
.profile-link:hover {
  text-decoration: underline;
}
.admission-settings :deep(.p-disabled),
.admission-settings :deep(.p-component:disabled) {
  opacity: 1;
}
.admission-settings :deep(.p-inputtext:disabled) {
  background: var(--surface-card);
  color: var(--text-secondary);
  -webkit-text-fill-color: var(--text-secondary);
}
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding-top: 18px;
  border-top: 1px solid var(--border-subtle);
}
.actions p {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  margin: 0;
  color: var(--text-small-muted);
  font-size: 0.68rem;
}
.dialog-copy {
  color: var(--text-secondary);
  line-height: 1.55;
}
.confirm-row {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-top: 18px;
  padding: 13px;
  border-radius: 12px;
  background: var(--surface-subtle);
  font-size: 0.75rem;
  line-height: 1.45;
}
@media (max-width: 800px) {
  .admission-settings {
    padding: 20px;
  }
  .settings-grid {
    grid-template-columns: 1fr;
  }
  .timezone-card {
    grid-column: auto;
  }
  .timezone-card ol {
    grid-template-columns: 1fr;
  }
  .actions {
    align-items: stretch;
    flex-direction: column;
  }
  .actions :deep(.p-button) {
    width: 100%;
  }
}
@container (max-width: 1240px) {
  .settings-grid {
    grid-template-columns: 1fr;
  }
  .timezone-card {
    grid-column: auto;
  }
}
@container (max-width: 760px) {
  .frequency-limits,
  .timezone-card ol {
    grid-template-columns: 1fr;
  }
}
@media (max-width: 520px) {
  .two-columns {
    grid-template-columns: 1fr;
  }
}
</style>
