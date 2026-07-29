<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import type {
  EventQueryPolicyItemStateResponseDto,
  EventQueryPolicyItemDto,
} from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import type { EventCatalogDefinition } from "@/shared/api/repository/event-catalog";
import { eventQueryRepository } from "../api/event-query-repository";
import {
  eventQueryPolicyItemFromConfiguration,
  eventQueryPolicyItemPatch,
  flattenSchemaFields,
} from "../model/event-query-policy";
import EventQueryEventEditor from "./EventQueryEventEditor.vue";

const props = defineProps<{
  projectId: string;
  definition: EventCatalogDefinition;
  canManage: boolean;
}>();

const state = ref<EventQueryPolicyItemStateResponseDto | null>(null);
const item = ref<EventQueryPolicyItemDto | null>(null);
const enabled = ref(false);
const endUserConversationEnabled = ref(false);
const savedSnapshot = ref("");
const loading = ref(true);
const saving = ref(false);
const publishing = ref(false);
const error = ref("");
const success = ref("");
let generation = 0;

const archived = computed(
  () =>
    props.definition.lifecycle === "ARCHIVED" ||
    state.value?.lifecycle === "ARCHIVED",
);
const schemaFields = computed(() =>
  flattenSchemaFields(props.definition.currentSchema.payloadSchema),
);
const formSnapshot = computed(() =>
  JSON.stringify({
    enabled: enabled.value,
    endUserConversationEnabled: endUserConversationEnabled.value,
    item: item.value,
  }),
);
const dirty = computed(
  () => Boolean(item.value) && formSnapshot.value !== savedSnapshot.value,
);
const publishedSnapshot = computed(() => {
  const published = state.value?.published;
  if (!published) return "";
  const publishedItem = eventQueryPolicyItemFromConfiguration(
    state.value?.eventCode ?? props.definition.code,
    published.configuration,
  );
  return JSON.stringify({
    enabled: published.enabled,
    endUserConversationEnabled: published.endUserConversationEnabled,
    item: publishedItem,
  });
});
const canPublish = computed(
  () =>
    props.canManage &&
    !archived.value &&
    !dirty.value &&
    Boolean(item.value) &&
    (state.value?.draftVersion ?? 0) > 0 &&
    state.value?.diagnostics.length === 0 &&
    savedSnapshot.value !== publishedSnapshot.value &&
    !saving.value &&
    !publishing.value,
);

function isCurrent(
  requestGeneration: number,
  projectId: string,
  definitionKeyId: string,
) {
  return (
    requestGeneration === generation &&
    projectId === props.projectId &&
    definitionKeyId === props.definition.definitionKeyId
  );
}

function applyState(next: EventQueryPolicyItemStateResponseDto) {
  const nextItem = eventQueryPolicyItemFromConfiguration(
    next.eventCode,
    next.configured.configuration,
  );
  if (!nextItem) {
    throw new Error("Сервер вернул некорректную конфигурацию доступа AI");
  }
  state.value = next;
  item.value = nextItem;
  enabled.value = next.configured.enabled;
  endUserConversationEnabled.value = next.configured.endUserConversationEnabled;
  savedSnapshot.value = formSnapshot.value;
}

async function load() {
  const requestGeneration = ++generation;
  const projectId = props.projectId;
  const definitionKeyId = props.definition.definitionKeyId;
  loading.value = true;
  error.value = "";
  success.value = "";
  try {
    const next = await eventQueryRepository.getItem(projectId, definitionKeyId);
    if (!isCurrent(requestGeneration, projectId, definitionKeyId)) return;
    applyState(next);
  } catch (cause) {
    if (!isCurrent(requestGeneration, projectId, definitionKeyId)) return;
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить настройки доступа AI";
  } finally {
    if (isCurrent(requestGeneration, projectId, definitionKeyId)) {
      loading.value = false;
    }
  }
}

async function refreshConflict(
  projectId: string,
  definitionKeyId: string,
  requestGeneration: number,
) {
  const next = await eventQueryRepository.getItem(projectId, definitionKeyId);
  if (!isCurrent(requestGeneration, projectId, definitionKeyId)) return;
  state.value = next;
  error.value =
    "Настройки изменились на сервере. Ваши значения сохранены в форме; проверьте их и нажмите «Сохранить» ещё раз.";
}

async function save() {
  const currentState = state.value;
  const currentItem = item.value;
  if (
    !props.canManage ||
    archived.value ||
    !currentState ||
    !currentItem ||
    saving.value
  ) {
    return;
  }
  const requestGeneration = generation;
  const projectId = props.projectId;
  const definitionKeyId = props.definition.definitionKeyId;
  const patch = eventQueryPolicyItemPatch(
    currentItem,
    enabled.value,
    endUserConversationEnabled.value,
    currentState.draftVersion,
  );
  saving.value = true;
  error.value = "";
  success.value = "";
  try {
    const validation = await eventQueryRepository.validateItem(
      projectId,
      definitionKeyId,
      { patch: patch as unknown as Record<string, unknown> },
    );
    if (!isCurrent(requestGeneration, projectId, definitionKeyId)) return;
    state.value = { ...currentState, diagnostics: validation.errors };
    if (!validation.valid) return;
    await eventQueryRepository.patchItem(projectId, definitionKeyId, patch);
    if (!isCurrent(requestGeneration, projectId, definitionKeyId)) return;
    const next = await eventQueryRepository.getItem(projectId, definitionKeyId);
    if (!isCurrent(requestGeneration, projectId, definitionKeyId)) return;
    applyState(next);
    success.value = "Черновик настроек события сохранён.";
  } catch (cause) {
    if (!isCurrent(requestGeneration, projectId, definitionKeyId)) return;
    if (cause instanceof ApiError && cause.status === 409) {
      await refreshConflict(projectId, definitionKeyId, requestGeneration);
    } else {
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось сохранить настройки доступа AI";
    }
  } finally {
    if (isCurrent(requestGeneration, projectId, definitionKeyId)) {
      saving.value = false;
    }
  }
}

async function publish() {
  const currentState = state.value;
  if (!currentState || !canPublish.value) return;
  const requestGeneration = generation;
  const projectId = props.projectId;
  const definitionKeyId = props.definition.definitionKeyId;
  publishing.value = true;
  error.value = "";
  success.value = "";
  try {
    await eventQueryRepository.publishItem(projectId, definitionKeyId, {
      expectedVersion: currentState.draftVersion,
      expectedPolicyVersion:
        typeof currentState.publishedPolicyVersion === "number"
          ? currentState.publishedPolicyVersion
          : 0,
    });
    if (!isCurrent(requestGeneration, projectId, definitionKeyId)) return;
    const next = await eventQueryRepository.getItem(projectId, definitionKeyId);
    if (!isCurrent(requestGeneration, projectId, definitionKeyId)) return;
    applyState(next);
    success.value = "Настройки события опубликованы.";
  } catch (cause) {
    if (!isCurrent(requestGeneration, projectId, definitionKeyId)) return;
    if (cause instanceof ApiError && cause.status === 409) {
      await refreshConflict(projectId, definitionKeyId, requestGeneration);
    } else {
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось опубликовать настройки события";
    }
  } finally {
    if (isCurrent(requestGeneration, projectId, definitionKeyId)) {
      publishing.value = false;
    }
  }
}

onMounted(load);
watch(
  () => [props.projectId, props.definition.definitionKeyId],
  () => void load(),
);
</script>

<template>
  <section
    class="event-query-access"
    data-test="event-query-access-section"
    :data-event-code="definition.code"
  >
    <div v-if="loading" class="access-loading">
      <Skeleton height="5rem" />
      <Skeleton height="12rem" />
    </div>
    <Message v-else-if="error && !item" severity="error" :closable="false">
      {{ error }}
      <Button label="Повторить" text size="small" @click="load" />
    </Message>
    <template v-else-if="state && item">
      <Message v-if="archived" severity="warn" :closable="false">
        Архивное событие доступно только для чтения. Доступ AI и Chat/Voice
        отозван; восстановление не включает его автоматически.
      </Message>
      <Message v-if="error" severity="error" :closable="false">{{
        error
      }}</Message>
      <Message v-if="success" severity="success" :closable="false">{{
        success
      }}</Message>

      <div class="state-grid">
        <article>
          <span>Черновик</span>
          <strong>v{{ state.draftVersion }}</strong>
          <small>{{
            state.configured.enabled ? "AI включён" : "AI выключен"
          }}</small>
        </article>
        <article>
          <span>Опубликовано</span>
          <strong>{{
            state.publishedPolicyVersion
              ? `v${state.publishedPolicyVersion}`
              : "Нет"
          }}</strong>
          <small>
            {{
              state.published?.enabled
                ? state.published.endUserConversationEnabled
                  ? "AI + Chat/Voice"
                  : "Только внутренний AI"
                : "Выключено"
            }}
          </small>
        </article>
        <article>
          <span>Действует сейчас</span>
          <strong>{{
            state.effective.internalAi ? "AI включён" : "Выключено"
          }}</strong>
          <small>
            Chat/Voice:
            {{
              state.effective.endUserConversation ? "доступно" : "недоступно"
            }}
          </small>
        </article>
      </div>

      <div class="grant-list">
        <label class="grant-option">
          <input
            v-model="enabled"
            data-test="event-query-enabled"
            type="checkbox"
            :disabled="!canManage || archived || saving || publishing"
          />
          <span>
            <strong>Разрешить AI использовать событие</strong>
            <small>
              Для AI Analysis, проверки обращений и других внутренних
              AI-потребителей.
            </small>
          </span>
        </label>
        <label class="grant-option">
          <input
            v-model="endUserConversationEnabled"
            data-test="event-query-conversation-enabled"
            type="checkbox"
            :disabled="
              !canManage || archived || !enabled || saving || publishing
            "
          />
          <span>
            <strong
              >Разрешить пользователю спрашивать об этом событии в чате</strong
            >
            <small>
              Действует для Chat и Voice только вместе с основным разрешением.
              Сохранённое значение не стирается при выключении AI.
            </small>
          </span>
        </label>
      </div>

      <EventQueryEventEditor
        v-model="item"
        :schema-fields="schemaFields"
        :disabled="!canManage || archived || saving || publishing"
      />

      <Message
        v-for="diagnostic in state.diagnostics"
        :key="`${diagnostic.code}:${diagnostic.location}`"
        severity="error"
        :closable="false"
      >
        <strong>{{ diagnostic.location }}</strong> — {{ diagnostic.message }}
      </Message>

      <footer class="access-actions">
        <span v-if="dirty">Есть несохранённые изменения</span>
        <span v-else>Черновик сохранён</span>
        <Button
          data-test="save-event-query"
          label="Сохранить"
          severity="secondary"
          :loading="saving"
          :disabled="!canManage || archived || !dirty || publishing"
          @click="save"
        />
        <Button
          data-test="publish-event-query"
          label="Опубликовать"
          :loading="publishing"
          :disabled="!canPublish"
          @click="publish"
        />
      </footer>
    </template>
  </section>
</template>

<style scoped>
.event-query-access,
.access-loading,
.grant-list {
  display: grid;
  gap: 16px;
}
.state-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.state-grid article {
  display: grid;
  gap: 4px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-subtle);
}
.state-grid span,
.state-grid small,
.grant-option small,
.access-actions span {
  color: var(--text-secondary);
  font-size: 0.72rem;
}
.grant-option {
  display: flex;
  align-items: flex-start;
  gap: 12px;
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
}
.grant-option input {
  margin-top: 3px;
}
.grant-option span {
  display: grid;
  gap: 4px;
}
.access-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 10px;
}
.access-actions span {
  margin-right: auto;
}
@media (max-width: 760px) {
  .state-grid {
    grid-template-columns: 1fr;
  }
}
</style>
