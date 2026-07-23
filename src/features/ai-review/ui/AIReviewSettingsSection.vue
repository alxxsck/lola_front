<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import ToggleSwitch from "primevue/toggleswitch";
import { aiReviewRepository } from "../api/ai-review-repository";
import type { AIReviewSettings } from "../model/ai-review";

const props = defineProps<{
  projectId: string;
  editable: boolean;
}>();
const emit = defineEmits<{ changed: [projectVersion: number] }>();
const settings = ref<AIReviewSettings | null>(null);
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const form = reactive({ enabled: false, dailyRunLimit: 25 });

onMounted(load);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    settings.value = await aiReviewRepository.getSettings(props.projectId);
    form.enabled = settings.value.enabled;
    form.dailyRunLimit = settings.value.dailyRunLimit;
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось загрузить AI Review";
  } finally {
    loading.value = false;
  }
}

async function save() {
  if (!settings.value || !props.editable) return;
  saving.value = true;
  error.value = "";
  try {
    settings.value = await aiReviewRepository.updateSettings(props.projectId, {
      expectedVersion: settings.value.projectVersion,
      enabled: form.enabled,
      dailyRunLimit: form.dailyRunLimit,
    });
    emit("changed", settings.value.projectVersion);
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось сохранить AI Review";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="settings-section card review-settings">
    <header>
      <span class="icon"><i class="pi pi-sparkles" /></span>
      <div>
        <h2>AI Review событий</h2>
        <p>
          Отдельный лимит для ручного анализа выбранных событий. Функция
          выключена по умолчанию.
        </p>
      </div>
    </header>
    <Message v-if="error" severity="error" :closable="false">{{
      error
    }}</Message>
    <div v-if="loading" class="loading"><Skeleton height="64px" /></div>
    <form v-else-if="settings" @submit.prevent="save">
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
  </section>
</template>

<style scoped>
.review-settings {
  padding: 26px;
}
.review-settings header {
  display: flex;
  gap: 13px;
  align-items: flex-start;
  padding-bottom: 18px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--border-subtle);
}
.review-settings h2 {
  font-size: 1.08rem;
}
.review-settings p {
  margin: 4px 0 0;
  color: var(--muted);
  font-size: 0.76rem;
  line-height: 1.5;
}
.icon {
  display: grid;
  place-items: center;
  width: 39px;
  height: 39px;
  flex: 0 0 auto;
  border-radius: 12px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
form {
  display: grid;
  grid-template-columns: minmax(260px, 1.5fr) minmax(190px, 1fr) auto;
  gap: 14px;
  align-items: end;
}
label {
  display: grid;
  gap: 7px;
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-subtle);
  font-size: 0.74rem;
  font-weight: 700;
}
.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.switch-row span {
  display: grid;
  gap: 3px;
}
.switch-row small {
  color: var(--text-small-muted);
  font-size: 0.65rem;
  font-weight: 400;
}
.loading {
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 14px;
  background: var(--surface-subtle);
}
@media (max-width: 900px) {
  form {
    grid-template-columns: 1fr;
  }
  .review-settings :deep(.p-button) {
    width: 100%;
  }
}
</style>
