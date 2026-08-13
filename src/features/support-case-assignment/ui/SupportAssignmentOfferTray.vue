<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import type { createSupportAssignmentController } from '@/features/support-case-assignment/model/use-support-assignment';
import { relativeTime } from '@/shared/lib/format';

const props = defineProps<{
  controller: ReturnType<typeof createSupportAssignmentController>;
}>();

const now = ref(Date.now());
const activeOffers = computed(() =>
  props.controller.offers.value.filter((offer) => Date.parse(offer.expiresAt) > now.value),
);
let expiryTimer: ReturnType<typeof setTimeout> | null = null;

function scheduleExpiry(): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
  now.value = Date.now();
  props.controller.expireOffers(now.value);
  const nextExpiry = Math.min(
    ...props.controller.offers.value
      .map((offer) => Date.parse(offer.expiresAt))
      .filter((value) => Number.isFinite(value) && value > now.value),
  );
  if (!Number.isFinite(nextExpiry)) return;
  expiryTimer = setTimeout(scheduleExpiry, Math.min(nextExpiry - now.value + 25, 2_147_483_647));
}

watch(() => props.controller.offers.value, scheduleExpiry, {
  immediate: true,
  deep: true,
});
onBeforeUnmount(() => {
  if (expiryTimer) clearTimeout(expiryTimer);
});
</script>

<template>
  <section
    v-if="
      activeOffers.length || controller.offerError.value || controller.offerUnknownOutcome.value
    "
    class="assignment-offer-tray"
    aria-label="Предложения назначений"
  >
    <header class="assignment-offer-tray__header">
      <span class="assignment-offer-tray__pulse" aria-hidden="true" />
      <div>
        <strong>Предложение из очереди</strong>
        <span>Только для текущего оператора</span>
      </div>
    </header>

    <ul class="assignment-offer-tray__list">
      <li
        v-for="offer in activeOffers"
        :key="offer.assignmentId"
        class="assignment-offer-tray__item"
      >
        <p>
          Примите работу до
          <time :datetime="offer.expiresAt">{{ relativeTime(offer.expiresAt) }}</time>
        </p>
        <div class="assignment-offer-tray__actions">
          <Button
            label="Принять"
            icon="pi pi-check"
            size="small"
            aria-label="Принять предложение назначения"
            :loading="controller.offerChangingId.value === offer.assignmentId"
            :disabled="
              Boolean(controller.offerChangingId.value) || controller.offerUnknownOutcome.value
            "
            @click="controller.actOnOffer(offer.assignmentId, 'ACCEPT')"
          />
          <Button
            label="Отклонить"
            severity="secondary"
            outlined
            size="small"
            aria-label="Отклонить предложение назначения"
            :disabled="
              Boolean(controller.offerChangingId.value) || controller.offerUnknownOutcome.value
            "
            @click="controller.actOnOffer(offer.assignmentId, 'DECLINE')"
          />
        </div>
      </li>
    </ul>

    <Message v-if="controller.offerError.value" severity="error" :closable="false">
      {{ controller.offerError.value }}
    </Message>
    <div class="assignment-offer-tray__tools">
      <Button
        v-if="controller.offerUnknownOutcome.value"
        label="Повторить тот же запрос"
        severity="secondary"
        outlined
        :disabled="!controller.offerCanRetry.value"
        @click="controller.retryUnknownOfferOutcome"
      />
      <Button
        icon="pi pi-refresh"
        aria-label="Обновить предложения назначений"
        severity="secondary"
        text
        rounded
        :loading="controller.offerLoading.value"
        :disabled="Boolean(controller.offerChangingId.value)"
        @click="controller.loadOffers()"
      />
    </div>
  </section>
</template>

<style scoped>
.assignment-offer-tray {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  margin: -2px 0 12px;
  padding: 10px 12px;
  border: 1px solid color-mix(in srgb, var(--brand) 20%, var(--line));
  border-radius: 14px;
  background: color-mix(in srgb, var(--brand-soft) 42%, var(--surface-card));
}
.assignment-offer-tray__header,
.assignment-offer-tray__item,
.assignment-offer-tray__actions,
.assignment-offer-tray__tools {
  display: flex;
  align-items: center;
}
.assignment-offer-tray__header {
  gap: 9px;
}
.assignment-offer-tray__header > div {
  display: grid;
  gap: 1px;
}
.assignment-offer-tray__header strong,
.assignment-offer-tray__header span,
.assignment-offer-tray__item p,
.assignment-offer-tray__status {
  margin: 0;
}
.assignment-offer-tray__header strong {
  color: var(--text-primary);
  font-size: 0.8rem;
}
.assignment-offer-tray__header span,
.assignment-offer-tray__item p,
.assignment-offer-tray__status {
  color: var(--text-muted);
  font-size: 0.72rem;
  line-height: 1.4;
}
.assignment-offer-tray__pulse {
  width: 8px;
  height: 8px;
  flex: 0 0 auto;
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--brand) 12%, transparent);
}
.assignment-offer-tray__list {
  display: grid;
  gap: 8px;
  min-width: 0;
  max-height: 112px;
  margin: 0;
  padding: 0;
  overflow: auto;
  overscroll-behavior: contain;
  list-style: none;
}
.assignment-offer-tray__item {
  justify-content: space-between;
  gap: 12px;
}
.assignment-offer-tray__item time {
  color: var(--text-primary);
  font-weight: 700;
}
.assignment-offer-tray__actions,
.assignment-offer-tray__tools {
  flex: 0 0 auto;
  gap: 6px;
}
.assignment-offer-tray__tools {
  justify-content: flex-end;
}
@media (max-width: 700px) {
  .assignment-offer-tray {
    grid-template-columns: minmax(0, 1fr) auto;
    gap: 10px;
  }
  .assignment-offer-tray__list,
  .assignment-offer-tray__status {
    grid-column: 1 / -1;
  }
  .assignment-offer-tray__item {
    align-items: flex-start;
    flex-direction: column;
  }
  .assignment-offer-tray__actions {
    width: 100%;
  }
  .assignment-offer-tray__actions :deep(.p-button) {
    min-height: 44px;
    flex: 1 1 0;
  }
}
</style>
