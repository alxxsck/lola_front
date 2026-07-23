<script setup lang="ts">
import { onMounted, reactive, ref } from "vue";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import Message from "primevue/message";
import ToggleSwitch from "primevue/toggleswitch";
import { useToast } from "primevue/usetoast";
import { userMemoryRepository } from "../api/user-memory-repository";
import type { UserMemorySettings } from "../model/user-memory";

const props = defineProps<{ projectId: string; editable: boolean }>();
const emit = defineEmits<{ changed: [projectVersion: number] }>();
const toast = useToast();
const loading = ref(true);
const saving = ref(false);
const error = ref("");
const settings = ref<UserMemorySettings | null>(null);
const form = reactive({
  enabled: false,
  dailyExtractionCallLimit: 1000,
  factTtlDays: 365,
});

onMounted(load);

async function load() {
  loading.value = true;
  error.value = "";
  try {
    fill(await userMemoryRepository.getSettings(props.projectId));
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить настройки памяти";
  } finally {
    loading.value = false;
  }
}

function fill(value: UserMemorySettings) {
  settings.value = value;
  Object.assign(form, {
    enabled: value.enabled,
    dailyExtractionCallLimit: value.dailyExtractionCallLimit,
    factTtlDays: value.factTtlDays,
  });
}

async function save() {
  if (!settings.value || !props.editable) return;
  saving.value = true;
  error.value = "";
  try {
    const saved = await userMemoryRepository.updateSettings(props.projectId, {
      expectedVersion: settings.value.projectVersion,
      ...form,
    });
    fill(saved);
    emit("changed", saved.projectVersion);
    toast.add({
      severity: "success",
      summary: "Настройки памяти сохранены",
      life: 2800,
    });
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось сохранить настройки памяти";
  } finally {
    saving.value = false;
  }
}
</script>

<template>
  <section class="settings-section card memory-settings">
    <header>
      <span class="icon"><i class="pi pi-sparkles" /></span>
      <div>
        <h2>Память Lola</h2>
        <p>
          Короткие пользовательские предпочтения между диалогами с ограниченным
          AI-бюджетом.
        </p>
      </div>
    </header>
    <Message v-if="error" severity="error" :closable="false">{{
      error
    }}</Message>
    <p v-if="loading" class="loading">
      <i class="pi pi-spin pi-spinner" /> Загружаем настройки памяти…
    </p>
    <form v-else-if="settings" @submit.prevent="save">
      <label class="switch-row">
        <span>
          <strong>{{
            form.enabled ? "Память включена" : "Память приостановлена"
          }}</strong>
          <small>Сохранённые факты не удаляются при выключении.</small>
        </span>
        <ToggleSwitch v-model="form.enabled" :disabled="!editable" />
      </label>
      <label>
        <span>Вызовов извлечения в день</span>
        <InputNumber
          v-model="form.dailyExtractionCallLimit"
          :min="settings.limits.dailyExtractionCallLimit.min"
          :max="settings.limits.dailyExtractionCallLimit.max"
          :use-grouping="false"
          :disabled="!editable"
        />
      </label>
      <label>
        <span>Хранить факт, дней</span>
        <InputNumber
          v-model="form.factTtlDays"
          :min="settings.limits.factTtlDays.min"
          :max="settings.limits.factTtlDays.max"
          :use-grouping="false"
          :disabled="!editable"
        />
      </label>
      <Button
        v-if="editable"
        type="submit"
        label="Сохранить память"
        icon="pi pi-check"
        :loading="saving"
      />
    </form>
  </section>
</template>

<style scoped>
.memory-settings {
  padding: 26px;
}
.memory-settings header {
  display: flex;
  gap: 13px;
  align-items: flex-start;
  padding-bottom: 18px;
  margin-bottom: 18px;
  border-bottom: 1px solid var(--border-subtle);
}
.memory-settings h2 {
  font-size: 1.08rem;
}
.memory-settings p {
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
  grid-template-columns: minmax(240px, 1.4fr) repeat(
      2,
      minmax(180px, 1fr)
    ) auto;
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
  .memory-settings :deep(.p-button) {
    width: 100%;
  }
}
</style>
