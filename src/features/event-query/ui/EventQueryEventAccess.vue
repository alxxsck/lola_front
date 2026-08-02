<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import ToggleSwitch from "primevue/toggleswitch";
import type {
  EventQueryPolicyItemStateResponseDto,
  EventQueryPolicyItemDto,
} from "@/shared/api/generated/models";
import type { EventCatalogDefinition } from "@/shared/api/repository/event-catalog";
import { eventQueryRepository } from "../api/event-query-repository";
import { eventPolicyConflictState } from "../model/event-query-conflict";
import {
  eventQueryPolicyItemFromConfiguration,
  eventQueryPolicyItemApply,
  flattenSchemaFields,
  mergeRecommendedSafeFields,
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
const applying = ref(false);
const error = ref("");
const success = ref("");
const recommendationNotice = ref("");
let generation = 0;

const archived = computed(
  () =>
    props.definition.lifecycle === "ARCHIVED" ||
    state.value?.lifecycle === "ARCHIVED" ||
    state.value?.lifecycleRestrictions.readOnly === true,
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
const canApply = computed(
  () =>
    props.canManage &&
    !archived.value &&
    state.value?.lifecycleRestrictions.canApply === true &&
    Boolean(item.value) &&
    dirty.value &&
    !applying.value,
);
const recommendedSafeFields = computed(() => {
  if (!state.value || !item.value) return [];
  const existing = new Set(item.value.safeFields.map((field) => field.path));
  return (state.value.safeFieldRecommendation?.fields ?? []).filter(
    (field) => !existing.has(field.path),
  );
});
const needsAnalysisPreparation = computed(() => {
  const current = item.value;
  return (
    current !== null &&
    (!current.allowedModes.includes("AGGREGATE") ||
      recommendedSafeFields.value.length > 0)
  );
});

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

function configuredSnapshot(next: EventQueryPolicyItemStateResponseDto) {
  const configuredItem = eventQueryPolicyItemFromConfiguration(
    next.eventCode,
    next.configured.configuration,
  );
  if (!configuredItem) {
    throw new Error("Сервер вернул некорректную конфигурацию доступа AI");
  }
  return JSON.stringify({
    enabled: next.configured.enabled,
    endUserConversationEnabled: next.configured.endUserConversationEnabled,
    item: configuredItem,
  });
}

async function load() {
  const requestGeneration = ++generation;
  const projectId = props.projectId;
  const definitionKeyId = props.definition.definitionKeyId;
  loading.value = true;
  error.value = "";
  success.value = "";
  recommendationNotice.value = "";
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

function prepareRecommendedSafeFields() {
  if (!item.value || !needsAnalysisPreparation.value) return;
  item.value = mergeRecommendedSafeFields(
    item.value,
    recommendedSafeFields.value,
  );
  recommendationNotice.value =
    "AI-анализ подготовлен в форме. Проверьте поля и нажмите «Применить настройки».";
}

async function apply() {
  const currentState = state.value;
  const currentItem = item.value;
  if (
    !props.canManage ||
    archived.value ||
    !currentState ||
    !currentItem ||
    !canApply.value
  ) {
    return;
  }
  const requestGeneration = generation;
  const projectId = props.projectId;
  const definitionKeyId = props.definition.definitionKeyId;
  applying.value = true;
  error.value = "";
  success.value = "";
  try {
    const next = await eventQueryRepository.applyItem(
      projectId,
      definitionKeyId,
      eventQueryPolicyItemApply(
        currentItem,
        enabled.value,
        endUserConversationEnabled.value,
        currentState.concurrencyToken,
      ),
    );
    if (!isCurrent(requestGeneration, projectId, definitionKeyId)) return;
    applyState(next);
    recommendationNotice.value = "";
    success.value = "Настройки доступа AI применены.";
  } catch (cause) {
    if (!isCurrent(requestGeneration, projectId, definitionKeyId)) return;
    const current = eventPolicyConflictState(cause);
    if (current) {
      state.value = current;
      savedSnapshot.value = configuredSnapshot(current);
      error.value =
        "Настройки изменил другой администратор. Ваши значения сохранены в форме; проверьте их и примените ещё раз.";
    } else {
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось применить настройки доступа AI";
    }
  } finally {
    if (isCurrent(requestGeneration, projectId, definitionKeyId)) {
      applying.value = false;
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
      <Message v-if="recommendationNotice" severity="info" :closable="false">
        {{ recommendationNotice }}
      </Message>

      <div
        class="effective-state"
        :class="{ enabled: state.effective.internalAi }"
      >
        <span class="effective-icon">
          <i
            :class="
              state.effective.internalAi ? 'pi pi-check-circle' : 'pi pi-lock'
            "
          />
        </span>
        <div>
          <strong>
            {{
              state.effective.internalAi
                ? "AI может использовать это событие"
                : "Доступ к событию выключен"
            }}
          </strong>
          <small>
            {{
              state.effective.endUserConversation
                ? "Пользователь также может спрашивать о нём в Chat и Voice."
                : "В Chat и Voice событие пользователю недоступно."
            }}
          </small>
        </div>
      </div>

      <div class="grant-list">
        <div class="grant-option">
          <span>
            <strong>Доступно для AI</strong>
            <small>
              Lola сможет использовать событие в AI-анализах и при проверке
              обращений.
            </small>
          </span>
          <ToggleSwitch
            v-model="enabled"
            input-id="event-query-enabled"
            data-test="event-query-enabled"
            :disabled="
              !canManage ||
              archived ||
              (!state.lifecycleRestrictions.canEnable && !enabled) ||
              applying
            "
            aria-label="Разрешить AI использовать событие"
          />
        </div>
        <div class="grant-option" :class="{ disabled: !enabled }">
          <span>
            <strong>Доступно пользователю в Chat и Voice</strong>
            <small>
              Пользователь сможет спрашивать Lola о факте этого события.
              Работает только вместе с доступом для AI.
            </small>
          </span>
          <ToggleSwitch
            v-model="endUserConversationEnabled"
            input-id="event-query-conversation-enabled"
            data-test="event-query-conversation-enabled"
            :disabled="!canManage || archived || !enabled || applying"
            aria-label="Разрешить пользователю спрашивать о событии"
          />
        </div>
      </div>

      <section class="data-access-editor">
        <header>
          <strong>Какие данные получит AI</strong>
          <p>
            Настройте понятное описание события, допустимые режимы, период и
            безопасные поля payload.
          </p>
        </header>
        <Message
          v-if="needsAnalysisPreparation"
          severity="info"
          :closable="false"
        >
          <div class="recommendation-message">
            <span>
              <template v-if="recommendedSafeFields.length">
                Сервер нашёл типизированные поля, по которым AI сможет
                фильтровать, группировать и считать метрики:
                {{
                  recommendedSafeFields.map((field) => field.path).join(", ")
                }}.
              </template>
              <template v-else>
                Разрешите AI считать количество событий и уникальных
                пользователей без доступа к полям payload.
              </template>
            </span>
            <Button
              data-test="prepare-recommended-safe-fields"
              label="Подготовить AI-анализ"
              size="small"
              :disabled="!canManage || archived || applying"
              @click="prepareRecommendedSafeFields"
            />
          </div>
        </Message>
        <EventQueryEventEditor
          v-model="item"
          :schema-fields="schemaFields"
          :disabled="!canManage || archived || applying"
        />
      </section>

      <Message
        v-for="diagnostic in state.diagnostics"
        :key="`${diagnostic.code}:${diagnostic.location}`"
        severity="error"
        :closable="false"
      >
        <strong>{{ diagnostic.location }}</strong> — {{ diagnostic.message }}
      </Message>

      <footer class="access-actions">
        <span v-if="dirty">Настройки ещё не применены</span>
        <span v-else>Настройки применены</span>
        <Button
          data-test="apply-event-query"
          label="Применить настройки"
          icon="pi pi-check"
          :loading="applying"
          :disabled="!canApply"
          @click="apply"
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
.effective-state {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 15px 16px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-subtle);
}
.effective-state.enabled {
  border-color: var(--status-success-border);
  background: var(--status-success-soft);
}
.effective-icon {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  flex: 0 0 auto;
  border-radius: 11px;
  background: var(--surface-card);
  color: var(--text-secondary);
}
.effective-state.enabled .effective-icon {
  color: var(--status-success-text);
}
.effective-state > div,
.grant-option span {
  display: grid;
  gap: 4px;
}
.effective-state small,
.grant-option small,
.access-actions span {
  color: var(--text-secondary);
  font-size: 0.72rem;
}
.grant-option {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 18px;
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
}
.grant-option.disabled {
  background: var(--surface-subtle);
  opacity: 0.68;
}
.data-access-editor {
  display: grid;
  gap: 14px;
  padding-top: 4px;
}
.data-access-editor > header p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  font-size: 0.74rem;
}
.recommendation-message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
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
  .grant-option,
  .access-actions {
    align-items: flex-start;
    flex-direction: column;
  }
  .access-actions :deep(.p-button) {
    width: 100%;
  }
}
</style>
