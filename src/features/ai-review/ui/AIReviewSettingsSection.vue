<script setup lang="ts">
import { reactive } from "vue";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import ToggleSwitch from "primevue/toggleswitch";
import { useSettingsResource } from "@/shared/lib/use-settings-resource";
import AISettingsSectionCard from "@/shared/ui/AISettingsSectionCard.vue";
import { aiReviewRepository } from "../api/ai-review-repository";

const props = defineProps<{
  projectId: string;
  editable: boolean;
}>();
const emit = defineEmits<{ changed: [projectVersion: number] }>();
const form = reactive({ enabled: false, dailyRunLimit: 25 });
const {
  resource: settings,
  loading,
  saving,
  error,
  save: persist,
} = useSettingsResource(async () => {
  const loaded = await aiReviewRepository.getSettings(props.projectId);
  form.enabled = loaded.enabled;
  form.dailyRunLimit = loaded.dailyRunLimit;
  return loaded;
}, "Не удалось загрузить AI Review");

async function save() {
  const current = settings.value;
  if (!current || !props.editable) return;
  const saved = await persist(
    () =>
      aiReviewRepository.updateSettings(props.projectId, {
        expectedVersion: current.projectVersion,
        enabled: form.enabled,
        dailyRunLimit: form.dailyRunLimit,
      }),
    "Не удалось сохранить AI Review",
  );
  if (saved) emit("changed", saved.projectVersion);
}
</script>

<template>
  <AISettingsSectionCard
    title="AI Review событий"
    description="Отдельный лимит для ручного анализа выбранных событий. Функция выключена по умолчанию."
    :loading="loading"
    :error="error"
    icon="pi pi-sparkles"
  >
    <div v-if="settings" class="settings-editor">
      <div class="settings-fields single-column">
        <label class="setting-card feature-toggle">
          <span>
            <strong>{{
              form.enabled ? "AI Review включён" : "AI Review выключен"
            }}</strong>
            <small>При выключении новые платные запуски недоступны.</small>
          </span>
          <ToggleSwitch v-model="form.enabled" :disabled="!editable" />
        </label>
        <label class="setting-card field-card">
          <span>Запусков в день</span>
          <InputNumber
            v-model="form.dailyRunLimit"
            :min="settings.limits.dailyRunLimit.min"
            :max="settings.limits.dailyRunLimit.max"
            :use-grouping="false"
            :disabled="!editable"
          />
          <small class="field-hint"
            >Общий суточный лимит ручных AI-анализов событий.</small
          >
        </label>
      </div>
      <footer class="settings-actions">
        <span class="settings-actions-copy">
          <strong>Контроль платных запусков</strong>
          <small>Лимит применяется сразу после сохранения.</small>
        </span>
        <Button
          v-if="editable"
          type="button"
          label="Сохранить настройки"
          icon="pi pi-check"
          :loading="saving"
          @click="save"
        />
      </footer>
    </div>
  </AISettingsSectionCard>
</template>
