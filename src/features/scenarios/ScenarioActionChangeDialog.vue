<script lang="ts">
import type {
  ScenarioActionTypeReplacementPlan,
  ScenarioEntryPointChangePlan,
} from './model/scenario-action-change';

export type ScenarioActionChangePreview =
  | {
      kind: 'entry-point';
      currentNodeKey: string;
      targetNodeKey: string;
      plan: ScenarioEntryPointChangePlan;
      sourceFingerprint: string;
      refreshed?: boolean;
    }
  | {
      kind: 'type-replacement';
      currentName: string;
      targetName: string;
      targetType: string;
      plan: ScenarioActionTypeReplacementPlan;
      sourceFingerprint: string;
      refreshed?: boolean;
    };
</script>

<script setup lang="ts">
import { computed } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';

const props = defineProps<{
  visible: boolean;
  preview: ScenarioActionChangePreview | null;
}>();

const emit = defineEmits<{
  apply: [];
  cancel: [];
}>();

const canApply = computed(
  () =>
    Boolean(props.preview) &&
    !(props.preview?.kind === 'entry-point' && props.preview.plan.status === 'blocked'),
);

const title = computed(() =>
  props.preview?.kind === 'entry-point' ? 'Изменить точку входа' : 'Заменить действие',
);

function transitionResetText(count: number) {
  const lastTwo = count % 100;
  const last = count % 10;
  const noun =
    lastTwo >= 11 && lastTwo <= 14
      ? 'переходов'
      : last === 1
        ? 'переход'
        : last >= 2 && last <= 4
          ? 'перехода'
          : 'переходов';
  return count % 10 === 1 && !(lastTwo >= 11 && lastTwo <= 14)
    ? `${count} ${noun} будет сброшен`
    : `${count} ${noun} будут сброшены`;
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="title"
    class="scenario-action-change-dialog"
    :style="{ width: 'min(560px, calc(100vw - 24px))' }"
    @update:visible="!$event && emit('cancel')"
  >
    <div v-if="preview" class="change-preview">
      <div class="change-route" aria-label="Изменение">
        <span>
          {{ preview.kind === 'entry-point' ? preview.currentNodeKey : preview.currentName }}
        </span>
        <i class="pi pi-arrow-right" aria-hidden="true" />
        <strong>
          {{ preview.kind === 'entry-point' ? preview.targetNodeKey : preview.targetName }}
        </strong>
      </div>

      <div v-if="preview.refreshed" class="impact-card impact-card--warning" role="status">
        <i class="pi pi-refresh" aria-hidden="true" />
        <div>
          <strong>Данные изменились после открытия preview</strong>
          <p>План пересчитан по актуальному графу. Проверьте его и подтвердите ещё раз.</p>
        </div>
      </div>

      <template v-if="preview.kind === 'entry-point'">
        <div
          v-if="preview.plan.status === 'blocked'"
          class="impact-card impact-card--danger"
          role="alert"
        >
          <i class="pi pi-ban" aria-hidden="true" />
          <div>
            <strong>Изменение пока невозможно</strong>
            <p>{{ preview.plan.reason }}</p>
          </div>
        </div>
        <template v-else>
          <div class="impact-card impact-card--warning">
            <i class="pi pi-directions" aria-hidden="true" />
            <div>
              <strong>Маршрут будет переподключён атомарно</strong>
              <p v-if="preview.plan.removedIncomingTransitions.length">
                Входящие связи к новой точке будут удалены. Скрытых переходов в конец сценария не
                появится.
              </p>
              <p v-else>Связи между остальными действиями сохранятся.</p>
            </div>
          </div>
          <p v-if="preview.plan.unreachableNodeKeys.length" class="impact-list">
            <strong>Будут удалены из черновика как недостижимые:</strong>
            {{ preview.plan.unreachableNodeKeys.join(', ') }}
          </p>
          <p v-else class="impact-list impact-list--safe">
            <i class="pi pi-check" aria-hidden="true" /> Все действия останутся достижимыми.
          </p>
        </template>
      </template>

      <template v-else>
        <div
          v-if="preview.plan.transitionImpact === 'reset-required'"
          class="impact-card impact-card--danger"
          role="alert"
        >
          <i class="pi pi-share-alt" aria-hidden="true" />
          <div>
            <strong>{{ transitionResetText(preview.plan.removedTransitionCount) }}</strong>
            <p>У нового типа другой контракт переходов. После замены настройте маршрут заново.</p>
          </div>
        </div>
        <div v-else class="impact-card impact-card--safe">
          <i class="pi pi-check-circle" aria-hidden="true" />
          <div>
            <strong>
              {{
                preview.plan.transitionImpact === 'preserved'
                  ? 'Переход сохранится'
                  : 'Исходящих переходов нет'
              }}
            </strong>
            <p>Ключ узла и его место в сценарии останутся прежними.</p>
          </div>
        </div>
        <p v-if="preview.plan.preservedConfigKeys.length" class="impact-list">
          <strong>Сохранятся совместимые поля:</strong>
          {{ preview.plan.preservedConfigKeys.join(', ') }}
        </p>
        <p v-if="preview.plan.removedConfigKeys.length" class="impact-list">
          <strong>Будут очищены поля:</strong>
          {{ preview.plan.removedConfigKeys.join(', ') }}
        </p>
        <p v-if="preview.plan.requiredConfigKeys.length" class="impact-list">
          <strong>После замены нужно заполнить:</strong>
          {{ preview.plan.requiredConfigKeys.join(', ') }}
        </p>
      </template>
    </div>

    <template #footer>
      <div class="dialog-actions">
        <Button label="Отмена" severity="secondary" text @click="emit('cancel')" />
        <Button
          :label="preview?.kind === 'entry-point' ? 'Изменить точку входа' : 'Заменить действие'"
          :severity="
            preview?.kind === 'type-replacement' &&
            preview.plan.transitionImpact === 'reset-required'
              ? 'danger'
              : 'primary'
          "
          :disabled="!canApply"
          @click="emit('apply')"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.change-preview {
  display: grid;
  gap: 16px;
}

.change-route {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto minmax(0, 1fr);
  align-items: center;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
}

.change-route span,
.change-route strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.change-route strong {
  color: var(--text-primary);
}

.impact-card {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  gap: 12px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--impact-color) 42%, var(--border-default));
  border-radius: 14px;
  background: var(--impact-soft);
}

.impact-card > i {
  margin-top: 2px;
  color: var(--impact-text);
}

.impact-card strong {
  color: var(--text-primary);
}

.impact-card p {
  margin: 4px 0 0;
  color: var(--text-secondary);
  line-height: 1.5;
}

.impact-card--danger {
  --impact-color: var(--status-danger);
  --impact-soft: var(--status-danger-soft);
  --impact-text: var(--status-danger-text);
}
.impact-card--warning {
  --impact-color: var(--status-warning);
  --impact-soft: var(--status-warning-soft);
  --impact-text: var(--status-warning-text);
}
.impact-card--safe {
  --impact-color: var(--status-success);
  --impact-soft: var(--status-success-soft);
  --impact-text: var(--status-success-text);
}

.impact-list {
  margin: 0;
  color: var(--text-secondary);
  line-height: 1.5;
}

.impact-list strong {
  color: var(--text-primary);
}

.impact-list--safe i {
  margin-right: 6px;
  color: var(--status-success-text);
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 520px) {
  .change-route {
    grid-template-columns: minmax(0, 1fr) auto;
  }

  .change-route span {
    grid-column: 1 / -1;
  }

  .dialog-actions {
    display: grid;
    grid-template-columns: 1fr;
  }

  .dialog-actions :deep(.p-button) {
    width: 100%;
    min-height: 44px;
  }
}
</style>
