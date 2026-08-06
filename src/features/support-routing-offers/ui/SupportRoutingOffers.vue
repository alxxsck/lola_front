<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Tag from "primevue/tag";
import type {
  SupportRoutingOffer,
  SupportRoutingOfferActionKind,
} from "@/features/support-routing-offers/api/support-routing-offer-source";
import { relativeTime } from "@/shared/lib/format";

const props = defineProps<{
  offers: SupportRoutingOffer[];
  loading: boolean;
  changingOfferId: string | null;
  error: string;
  unknownOutcome: boolean;
  lastOutcome: SupportRoutingOfferActionKind | null;
  canRetry: boolean;
}>();

const emit = defineEmits<{
  refresh: [];
  action: [assignmentId: string, kind: SupportRoutingOfferActionKind];
  retry: [];
}>();

const pendingDeclineOfferId = ref<string | null>(null);
const declineDialogVisible = computed({
  get: () => pendingDeclineOfferId.value !== null,
  set: (visible: boolean) => {
    if (!visible) pendingDeclineOfferId.value = null;
  },
});

function isChanging(assignmentId: string): boolean {
  return props.changingOfferId === assignmentId;
}

function requestDecline(assignmentId: string): void {
  pendingDeclineOfferId.value = assignmentId;
}

function confirmDecline(): void {
  const assignmentId = pendingDeclineOfferId.value;
  pendingDeclineOfferId.value = null;
  if (assignmentId) emit("action", assignmentId, "DECLINE");
}
</script>

<template>
  <section class="routing-offers card" aria-labelledby="routing-offers-heading">
    <header class="routing-offers__header">
      <div>
        <span class="eyebrow">Назначения</span>
        <h2 id="routing-offers-heading">Предложения из очереди</h2>
      </div>
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        text
        :loading="loading"
        :disabled="loading || Boolean(changingOfferId)"
        @click="emit('refresh')"
      />
    </header>

    <p v-if="loading && !offers.length" class="routing-offers__empty">
      Проверяем предложения сервера…
    </p>
    <p v-else-if="!offers.length" class="routing-offers__empty">
      Активных предложений сейчас нет.
    </p>
    <ul v-else class="routing-offers__list" aria-label="Активные предложения назначений">
      <li v-for="offer in offers" :key="offer.assignmentId" class="routing-offers__item">
        <div class="routing-offers__summary">
          <Tag value="Новое назначение" severity="info" />
          <p>
            Подтвердите или отклоните предложение до
            <time :datetime="offer.expiresAt">{{ relativeTime(offer.expiresAt) }}</time>.
          </p>
        </div>
        <div class="routing-offers__actions">
          <Button
            label="Принять"
            icon="pi pi-check"
            :loading="isChanging(offer.assignmentId)"
            :disabled="loading || Boolean(changingOfferId) || unknownOutcome"
            @click="emit('action', offer.assignmentId, 'ACCEPT')"
          />
          <Button
            label="Отклонить"
            icon="pi pi-times"
            severity="secondary"
            outlined
            :disabled="loading || Boolean(changingOfferId) || unknownOutcome"
            @click="requestDecline(offer.assignmentId)"
          />
        </div>
      </li>
    </ul>

    <Message v-if="lastOutcome === 'ACCEPT'" severity="success" :closable="false">
      Назначение принято. Контекст диалога обновлён по серверному снимку.
    </Message>
    <Message v-else-if="lastOutcome === 'DECLINE'" severity="info" :closable="false">
      Предложение отклонено.
    </Message>
    <Message v-if="error" severity="error" :closable="false">
      {{ error }}
    </Message>
    <Button
      v-if="unknownOutcome"
      label="Повторить тот же запрос"
      severity="secondary"
      outlined
      :disabled="!canRetry"
      @click="emit('retry')"
    />

    <Dialog
      v-model:visible="declineDialogVisible"
      modal
      header="Отклонить предложение?"
      :style="{ width: 'min(420px, calc(100vw - 32px))' }"
    >
      <p>Предложение вернётся в серверный routing-процесс. Это действие нельзя отменить в этом окне.</p>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="declineDialogVisible = false" />
        <Button label="Подтвердить отказ" severity="danger" @click="confirmDecline" />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.routing-offers {
  margin-bottom: 16px;
  padding: 18px;
}
.routing-offers__header,
.routing-offers__actions,
.routing-offers__summary {
  display: flex;
  align-items: center;
}
.routing-offers__header {
  justify-content: space-between;
  gap: 16px;
}
.routing-offers__header h2 {
  margin: 0;
  font-size: 1rem;
}
.routing-offers__empty {
  margin: 14px 0 0;
  color: var(--text-muted);
  font-size: 0.82rem;
}
.routing-offers__list {
  display: grid;
  gap: 10px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}
.routing-offers__item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-ground);
}
.routing-offers__summary {
  min-width: 0;
  gap: 10px;
}
.routing-offers__summary p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.8rem;
  line-height: 1.45;
}
.routing-offers__summary time {
  color: var(--text-primary);
  font-weight: 700;
}
.routing-offers__actions {
  flex: 0 0 auto;
  gap: 8px;
}
@media (max-width: 720px) {
  .routing-offers__header,
  .routing-offers__item,
  .routing-offers__summary {
    align-items: flex-start;
    flex-direction: column;
  }
  .routing-offers__item {
    gap: 12px;
  }
  .routing-offers__actions,
  .routing-offers__actions :deep(.p-button) {
    width: 100%;
  }
}
</style>
