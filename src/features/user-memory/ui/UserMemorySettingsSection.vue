<script setup lang="ts">
import { reactive } from "vue";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import ToggleSwitch from "primevue/toggleswitch";
import { useToast } from "primevue/usetoast";
import { useSettingsResource } from "@/shared/lib/use-settings-resource";
import AISettingsSectionCard from "@/shared/ui/AISettingsSectionCard.vue";
import { userMemoryRepository } from "../api/user-memory-repository";
import type { UserMemorySettings } from "../model/user-memory";

const props = defineProps<{ projectId: string; editable: boolean }>();
const emit = defineEmits<{ changed: [projectVersion: number] }>();
const toast = useToast();
const form = reactive({
  enabled: false,
  dailyExtractionCallLimit: 1000,
  factTtlDays: 365,
});
const {
  resource: settings,
  loading,
  saving,
  error,
  save: persist,
} = useSettingsResource(async () => {
  const loaded = await userMemoryRepository.getSettings(props.projectId);
  fill(loaded);
  return loaded;
}, "Не удалось загрузить настройки памяти");

function fill(value: UserMemorySettings) {
  settings.value = value;
  Object.assign(form, {
    enabled: value.enabled,
    dailyExtractionCallLimit: value.dailyExtractionCallLimit,
    factTtlDays: value.factTtlDays,
  });
}

async function save() {
  const current = settings.value;
  if (!current || !props.editable) return;
  const saved = await persist(
    () =>
      userMemoryRepository.updateSettings(props.projectId, {
        expectedVersion: current.projectVersion,
        ...form,
      }),
    "Не удалось сохранить настройки памяти",
  );
  if (!saved) return;
  fill(saved);
  emit("changed", saved.projectVersion);
  toast.add({
    severity: "success",
    summary: "Настройки памяти сохранены",
    life: 2800,
  });
}
</script>

<template>
  <AISettingsSectionCard
    title="Память Lola"
    description="Короткие пользовательские предпочтения между диалогами с ограниченным AI-бюджетом."
    :loading="loading"
    :error="error"
    loading-label="Загружаем настройки памяти…"
    icon="pi pi-book"
  >
    <div v-if="settings" class="settings-editor">
      <div class="settings-fields">
        <label class="setting-card feature-toggle">
          <span>
            <strong>{{
              form.enabled ? "Память включена" : "Память приостановлена"
            }}</strong>
            <small>Сохранённые факты не удаляются при выключении.</small>
          </span>
          <ToggleSwitch v-model="form.enabled" :disabled="!editable" />
        </label>
        <label class="setting-card field-card">
          <span>Вызовов извлечения в день</span>
          <InputNumber
            v-model="form.dailyExtractionCallLimit"
            :min="settings.limits.dailyExtractionCallLimit.min"
            :max="settings.limits.dailyExtractionCallLimit.max"
            :use-grouping="false"
            :disabled="!editable"
          />
          <small class="field-hint"
            >Максимальное число AI-извлечений за сутки.</small
          >
        </label>
        <label class="setting-card field-card">
          <span>Срок хранения факта</span>
          <InputNumber
            v-model="form.factTtlDays"
            :min="settings.limits.factTtlDays.min"
            :max="settings.limits.factTtlDays.max"
            :use-grouping="false"
            suffix=" дней"
            :disabled="!editable"
          />
          <small class="field-hint"
            >После этого срока факт перестанет использоваться.</small
          >
        </label>
      </div>
      <footer class="settings-actions">
        <span class="settings-actions-copy">
          <strong>Настройки применяются ко всему проекту</strong>
          <small>Изменения вступят в силу после сохранения.</small>
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
