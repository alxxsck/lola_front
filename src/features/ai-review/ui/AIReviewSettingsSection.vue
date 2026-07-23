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
    columns="minmax(260px, 1.5fr) minmax(190px, 1fr) auto"
  >
    <form v-if="settings" @submit.prevent="save">
      <label class="switch-row">
        <span>
          <strong>{{
            form.enabled ? "AI Review включён" : "AI Review выключен"
          }}</strong>
          <small>При выключении новые платные запуски недоступны.</small>
        </span>
        <ToggleSwitch v-model="form.enabled" :disabled="!editable" />
      </label>
      <label>
        <span>Запусков в день</span>
        <InputNumber
          v-model="form.dailyRunLimit"
          :min="settings.limits.dailyRunLimit.min"
          :max="settings.limits.dailyRunLimit.max"
          :use-grouping="false"
          :disabled="!editable"
        />
      </label>
      <Button
        v-if="editable"
        type="submit"
        label="Сохранить AI Review"
        icon="pi pi-check"
        :loading="saving"
      />
    </form>
  </AISettingsSectionCard>
</template>
