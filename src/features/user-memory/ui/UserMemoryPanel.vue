<script setup lang="ts">
import { onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import { userMemoryRepository } from "../api/user-memory-repository";
import type { UserMemoryCategory, UserMemoryFact } from "../model/user-memory";

const props = defineProps<{
  projectId: string;
  endUserId: string;
  userLabel: string;
  editable: boolean;
}>();
const loading = ref(true);
const mutating = ref(false);
const error = ref("");
const facts = ref<UserMemoryFact[]>([]);
const clearVisible = ref(false);
let loadGeneration = 0;
let mutationGeneration = 0;

const labels: Record<UserMemoryCategory, string> = {
  PREFERENCE: "Предпочтение",
  LOCATION: "Местоположение",
  COMMUNICATION_PREFERENCE: "Общение",
  INTEREST: "Интерес",
  PERSONAL_CONTEXT: "Личный контекст",
};

onMounted(load);
watch(() => [props.projectId, props.endUserId], load);

async function load() {
  const generation = ++loadGeneration;
  mutationGeneration += 1;
  const projectId = props.projectId;
  const endUserId = props.endUserId;
  mutating.value = false;
  clearVisible.value = false;
  loading.value = true;
  error.value = "";
  try {
    const response = await userMemoryRepository.listFacts(projectId, endUserId);
    if (
      generation !== loadGeneration ||
      projectId !== props.projectId ||
      endUserId !== props.endUserId
    )
      return;
    facts.value = response.items;
  } catch (cause) {
    if (generation !== loadGeneration) return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось загрузить память";
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function remove(factId: string) {
  if (!props.editable || mutating.value) return;
  const generation = ++mutationGeneration;
  const projectId = props.projectId;
  const endUserId = props.endUserId;
  mutating.value = true;
  try {
    await userMemoryRepository.deleteFact(projectId, endUserId, factId);
    if (
      generation !== mutationGeneration ||
      projectId !== props.projectId ||
      endUserId !== props.endUserId
    )
      return;
    facts.value = facts.value.filter((fact) => fact.id !== factId);
  } catch (cause) {
    if (generation !== mutationGeneration) return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось удалить факт";
  } finally {
    if (generation === mutationGeneration) mutating.value = false;
  }
}

async function clear() {
  if (!props.editable || mutating.value) return;
  const generation = ++mutationGeneration;
  const projectId = props.projectId;
  const endUserId = props.endUserId;
  mutating.value = true;
  try {
    await userMemoryRepository.clearFacts(projectId, endUserId);
    if (
      generation !== mutationGeneration ||
      projectId !== props.projectId ||
      endUserId !== props.endUserId
    )
      return;
    facts.value = [];
    clearVisible.value = false;
  } catch (cause) {
    if (generation !== mutationGeneration) return;
    error.value =
      cause instanceof Error ? cause.message : "Не удалось очистить память";
  } finally {
    if (generation === mutationGeneration) mutating.value = false;
  }
}

function date(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", { dateStyle: "medium" }).format(
    new Date(value),
  );
}
</script>

<template>
  <section class="memory-panel">
    <header>
      <div>
        <span>Память Lola</span>
        <small>Непроверенный контекст из сообщений пользователя</small>
      </div>
      <Button
        v-if="editable && facts.length"
        label="Очистить"
        severity="danger"
        text
        size="small"
        @click="clearVisible = true"
      />
    </header>
    <Message v-if="error" severity="error" :closable="false">
      {{ error }}
      <Button label="Повторить" text size="small" @click="load" />
    </Message>
    <p v-else-if="loading" class="state">
      <i class="pi pi-spin pi-spinner" /> Загружаем память…
    </p>
    <p v-else-if="!facts.length" class="state">
      Lola пока ничего не сохранила.
    </p>
    <article v-for="fact in facts" v-else :key="fact.id">
      <div>
        <span>{{ labels[fact.category] }}</span>
        <strong>{{ fact.value }}</strong>
        <small
          >Источник: {{ date(fact.sourceObservedAt) }} · до
          {{ date(fact.expiresAt) }}</small
        >
      </div>
      <Button
        v-if="editable"
        icon="pi pi-trash"
        aria-label="Удалить факт памяти"
        severity="danger"
        text
        rounded
        :loading="mutating"
        @click="remove(fact.id)"
      />
    </article>
  </section>
  <Dialog
    v-model:visible="clearVisible"
    modal
    :header="`Очистить память Lola для ${userLabel}?`"
    :style="{ width: 'min(440px, 94vw)' }"
  >
    <p>
      Все сохранённые факты пользователя «{{ userLabel }}» будут удалены без
      возможности восстановления.
    </p>
    <template #footer>
      <Button
        label="Отмена"
        severity="secondary"
        text
        @click="clearVisible = false"
      />
      <Button
        label="Очистить память"
        severity="danger"
        :loading="mutating"
        @click="clear"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.memory-panel {
  display: grid;
  gap: 9px;
  margin-top: 16px;
  padding-top: 16px;
  border-top: 1px solid var(--line);
}
header,
article {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
header > div,
article > div {
  display: grid;
  gap: 3px;
  min-width: 0;
}
header span {
  font-size: 0.76rem;
  font-weight: 800;
}
header small,
.state,
article small {
  color: var(--text-small-muted);
  font-size: 0.63rem;
  line-height: 1.4;
}
article {
  padding: 11px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--surface-subtle);
}
article span {
  color: var(--text-secondary);
  font-size: 0.6rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
article strong {
  font-size: 0.75rem;
  line-height: 1.4;
}
.state {
  margin: 0;
  padding: 12px;
  border: 1px dashed var(--border-subtle);
  border-radius: 12px;
}
</style>
