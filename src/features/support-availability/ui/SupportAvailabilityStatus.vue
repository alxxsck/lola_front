<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Tag from "primevue/tag";
import {
  SUPPORT_AVAILABILITY_SELF_REASONS,
  SUPPORT_AVAILABILITY_STATES,
  type SupportAvailabilityReasonCode,
  type SupportAvailabilitySnapshot,
  type SupportAvailabilityState,
} from "@/features/support-availability/api/support-availability-source";
import type { ChangeOwnAvailabilityInput } from "@/features/support-availability/model/use-support-availability";
import { relativeTime } from "@/shared/lib/format";

const props = defineProps<{
  availability: SupportAvailabilitySnapshot | null;
  loading: boolean;
  changing: boolean;
  error: string;
  canManage: boolean;
  unknownOutcome: boolean;
  needsReconcile: boolean;
  canRetryAfterReconcile: boolean;
  draft: ChangeOwnAvailabilityInput | null;
}>();

const emit = defineEmits<{
  refresh: [];
  change: [
    value: {
      state: SupportAvailabilityState;
      reasonCode: SupportAvailabilityReasonCode;
      reasonNote?: string;
    },
  ];
  retry: [];
  "retry-after-reconcile": [];
}>();

const recommendedReason: Record<
  SupportAvailabilityState,
  SupportAvailabilityReasonCode
> = {
  AVAILABLE: "RETURNED",
  BUSY: "FOCUS",
  AWAY: "BREAK",
  DRAINING: "WRAP_UP",
  OFFLINE: "SHIFT_END",
};

const selectedState = ref<SupportAvailabilityState>("AVAILABLE");
const selectedReason = ref<SupportAvailabilityReasonCode>("RETURNED");
const reasonNote = ref("");
const awayDurationMinutes = ref(15);
const validationError = ref("");
const availableReasons = computed(
  () => SUPPORT_AVAILABILITY_SELF_REASONS[selectedState.value],
);
const isAwayDurationValid = computed(
  () =>
    Number.isInteger(awayDurationMinutes.value) &&
    awayDurationMinutes.value >= 1 &&
    awayDurationMinutes.value <= 480,
);

watch(
  [() => props.availability, () => props.draft],
  ([snapshot, draft]) => {
    if (draft) {
      selectedState.value = draft.state;
      selectedReason.value = draft.reasonCode;
      reasonNote.value = draft.reasonNote ?? "";
      awayDurationMinutes.value = Math.max(
        1,
        Math.min(480, Math.round((draft.hardDurationSeconds ?? 900) / 60)),
      );
      return;
    }
    if (snapshot) {
      selectedState.value = snapshot.declaredState;
      selectedReason.value = recommendedReason[snapshot.declaredState];
      reasonNote.value = "";
      awayDurationMinutes.value = 15;
    }
  },
  { immediate: true },
);

function labelState(value: SupportAvailabilityState): string {
  return (
    {
      AVAILABLE: "Доступен",
      BUSY: "Занят",
      AWAY: "Отошёл",
      DRAINING: "Завершает работу",
      OFFLINE: "Офлайн",
    }[value] ?? "Неизвестный статус"
  );
}

function stateSeverity(value: SupportAvailabilityState): "success" | "info" | "warn" | "danger" | "secondary" {
  return (
    {
      AVAILABLE: "success",
      BUSY: "info",
      AWAY: "warn",
      DRAINING: "warn",
      OFFLINE: "secondary",
    }[value] ?? "danger"
  ) as "success" | "info" | "warn" | "danger" | "secondary";
}

function labelReason(value: string | null): string {
  return (
    {
      SHIFT_START: "Начало смены",
      RETURNED: "Вернулся к работе",
      FOCUS: "Нужен фокус",
      BREAK: "Перерыв",
      MEETING: "Встреча",
      TRAINING: "Обучение",
      WRAP_UP: "Завершение работы",
      SHIFT_END: "Конец смены",
      LEAD_INTERVENTION: "Решение лида",
      LEASE_EXPIRED: "Истёк lease",
    }[value ?? ""] ?? "Причина не указана"
  );
}

function labelSource(value: string | null): string {
  return (
    { SELF: "Вы выбрали", LEAD_OVERRIDE: "Изменил лид", LEASE_EXPIRY: "Истёк lease" }[
      value ?? ""
    ] ?? "Источник не указан"
  );
}

function selectState(): void {
  selectedReason.value = availableReasons.value[0]!;
  validationError.value = "";
}

function submit(): void {
  if (selectedState.value === "AWAY" && !isAwayDurationValid.value) {
    validationError.value = "Для статуса «Отошёл» укажите длительность от 1 минуты до 8 часов.";
    return;
  }
  validationError.value = "";
  emit("change", {
    state: selectedState.value,
    reasonCode: selectedReason.value,
    ...(reasonNote.value.trim() ? { reasonNote: reasonNote.value.trim() } : {}),
    ...(selectedState.value === "AWAY"
      ? { hardDurationSeconds: awayDurationMinutes.value * 60 }
      : {}),
  });
}
</script>

<template>
  <section class="availability-status card" aria-labelledby="availability-status-heading">
    <header class="availability-status__header">
      <div>
        <span class="eyebrow">Моя доступность</span>
        <h2 id="availability-status-heading">Статус для новых обращений</h2>
      </div>
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        text
        :loading="loading"
        @click="emit('refresh')"
      />
    </header>

    <p v-if="loading && !availability" class="availability-status__loading">
      Загружаем серверный статус…
    </p>
    <template v-else-if="availability">
      <div class="availability-status__overview">
        <Tag
          :value="labelState(availability.effectiveState)"
          :severity="stateSeverity(availability.effectiveState)"
        />
        <span>
          {{ availability.acceptsNewWork ? "Получаете новые обращения" : "Новые обращения не назначаются" }}
        </span>
      </div>
      <dl class="availability-status__facts">
        <div>
          <dt>Объявленный статус</dt>
          <dd>{{ labelState(availability.declaredState) }}</dd>
        </div>
        <div>
          <dt>Причина</dt>
          <dd>{{ labelReason(availability.reasonCode) }}</dd>
        </div>
        <div>
          <dt>Источник</dt>
          <dd>{{ labelSource(availability.source) }}</dd>
        </div>
        <div v-if="availability.transitionedAt">
          <dt>Изменён</dt>
          <dd>{{ relativeTime(availability.transitionedAt) }}</dd>
        </div>
        <div v-if="availability.effectiveUntil">
          <dt>Действует до</dt>
          <dd>{{ relativeTime(availability.effectiveUntil) }}</dd>
        </div>
        <div v-if="availability.leaseUntil">
          <dt>Lease до</dt>
          <dd>{{ relativeTime(availability.leaseUntil) }}</dd>
        </div>
      </dl>

      <form
        v-if="canManage"
        class="availability-status__form"
        @submit.prevent="submit"
      >
        <label>
          <span>Новый статус</span>
          <select
            v-model="selectedState"
            :disabled="changing || unknownOutcome"
            @change="selectState"
          >
            <option v-for="state in SUPPORT_AVAILABILITY_STATES" :key="state" :value="state">
              {{ labelState(state) }}
            </option>
          </select>
        </label>
        <label>
          <span>Причина</span>
          <select v-model="selectedReason" :disabled="changing || unknownOutcome">
            <option v-for="reason in availableReasons" :key="reason" :value="reason">
              {{ labelReason(reason) }}
            </option>
          </select>
        </label>
        <label v-if="selectedState === 'AWAY'">
          <span>Длительность отсутствия, мин.</span>
          <input
            v-model.number="awayDurationMinutes"
            type="number"
            min="1"
            max="480"
            step="1"
            inputmode="numeric"
            :disabled="changing || unknownOutcome"
          />
          <small>От 1 минуты до 8 часов.</small>
        </label>
        <label class="availability-status__note">
          <span>Комментарий <small>необязательно, без персональных данных</small></span>
          <textarea
            v-model="reasonNote"
            rows="2"
            maxlength="500"
            :disabled="changing || unknownOutcome"
          />
        </label>
        <small v-if="validationError" class="availability-status__validation">
          {{ validationError }}
        </small>
        <div class="availability-status__actions">
          <Button
            type="submit"
            label="Сохранить статус"
            icon="pi pi-check"
            :loading="changing"
            :disabled="unknownOutcome"
          />
        </div>
      </form>
    </template>

    <Message v-if="error" severity="error" :closable="false">
      {{ error }}
    </Message>
    <Button
      v-if="unknownOutcome"
      label="Повторить тот же запрос"
      severity="secondary"
      outlined
      :loading="changing"
      @click="emit('retry')"
    />
    <Button
      v-if="needsReconcile"
      label="Повторить черновик с новой версией"
      severity="secondary"
      outlined
      :disabled="!canRetryAfterReconcile"
      :loading="changing"
      @click="emit('retry-after-reconcile')"
    />
  </section>
</template>

<style scoped>
.availability-status {
  margin-bottom: 16px;
  padding: 18px;
}
.availability-status__header,
.availability-status__overview,
.availability-status__actions {
  display: flex;
  align-items: center;
}
.availability-status__header {
  justify-content: space-between;
  gap: 16px;
}
.availability-status__header h2 {
  margin: 0;
  font-size: 1rem;
}
.availability-status__overview {
  gap: 10px;
  margin: 14px 0;
  color: var(--text-muted);
  font-size: 0.82rem;
}
.availability-status__loading {
  margin: 14px 0 0;
  color: var(--text-muted);
  font-size: 0.82rem;
}
.availability-status__facts {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}
.availability-status__facts div {
  min-width: 0;
  padding: 10px;
  border-radius: 12px;
  background: var(--surface-ground);
}
.availability-status__facts dt,
.availability-status__facts dd {
  margin: 0;
}
.availability-status__facts dt,
.availability-status__form label > span {
  color: var(--text-muted);
  font-size: 0.74rem;
}
.availability-status__facts dd {
  margin-top: 4px;
  overflow-wrap: anywhere;
  font-size: 0.82rem;
  font-weight: 700;
}
.availability-status__form {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
  margin-top: 14px;
}
.availability-status__form label {
  display: grid;
  gap: 5px;
}
.availability-status__form select,
.availability-status__form input,
.availability-status__form textarea {
  width: 100%;
  min-height: 42px;
  padding: 8px 11px;
  border: 1px solid var(--line);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
}
.availability-status__form textarea {
  min-height: 64px;
  resize: vertical;
}
.availability-status__note,
.availability-status__actions,
.availability-status__validation {
  grid-column: 1 / -1;
}
.availability-status__validation {
  color: var(--red-700);
  font-size: 0.78rem;
}
.availability-status__form small {
  font: inherit;
}
.availability-status__actions {
  justify-content: flex-end;
}
@media (max-width: 720px) {
  .availability-status__header,
  .availability-status__overview {
    align-items: flex-start;
    flex-direction: column;
  }
  .availability-status__facts,
  .availability-status__form {
    grid-template-columns: 1fr;
  }
  .availability-status__note,
  .availability-status__actions,
  .availability-status__validation {
    grid-column: auto;
  }
  .availability-status__actions {
    justify-content: stretch;
  }
  .availability-status__actions :deep(.p-button) {
    width: 100%;
  }
}
</style>
