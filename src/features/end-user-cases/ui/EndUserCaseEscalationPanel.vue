<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import type { EndUserCaseEscalationResponseDto } from "@/shared/api/generated/models";
import { formatDate } from "@/shared/lib/format";
import {
  activeEndUserCaseEscalation,
  endUserCaseEscalationReasonLabel,
  endUserCaseEscalationSourceLabel,
  endUserCaseEscalationStatusLabel,
  type EndUserCaseEscalationAction,
} from "../model/end-user-case-escalation";

const props = defineProps<{
  items: EndUserCaseEscalationResponseDto[];
  terminal: boolean;
  currentCmsUserId?: string;
  canEscalate?: boolean;
  canAssign?: boolean;
  canManage?: boolean;
  mutating?: boolean;
}>();

defineEmits<{
  action: [action: EndUserCaseEscalationAction];
}>();

const active = computed(() => activeEndUserCaseEscalation(props.items));
const isClaimant = computed(
  () => active.value?.claimant?.id === props.currentCmsUserId,
);
const canRelease = computed(() => props.canAssign === true || isClaimant.value);
const canClose = computed(() => props.canManage === true || isClaimant.value);
const history = computed(() =>
  props.items.filter(({ id }) => id !== active.value?.id),
);
</script>

<template>
  <section
    class="escalation-card"
    :class="{ active: Boolean(active) }"
    aria-labelledby="case-escalation-title"
  >
    <div class="escalation-heading">
      <div>
        <span class="eyebrow">Помощь специалиста</span>
        <h3 id="case-escalation-title">
          {{
            active
              ? endUserCaseEscalationStatusLabel(active.status)
              : "Эскалация не требуется"
          }}
        </h3>
      </div>
      <span v-if="active" class="signal">
        <i class="pi pi-exclamation-circle" />
        {{
          active.status === "REQUESTED"
            ? "Нужно забрать"
            : "Специалист подключён"
        }}
      </span>
    </div>

    <template v-if="active">
      <p class="summary">{{ active.summary }}</p>
      <div class="escalation-meta">
        <div>
          <span>Основание</span>
          <strong>{{
            endUserCaseEscalationReasonLabel(active.reasonCode)
          }}</strong>
        </div>
        <div>
          <span>Источник</span>
          <strong>{{ endUserCaseEscalationSourceLabel(active.source) }}</strong>
        </div>
        <div>
          <span>Запрошено</span>
          <strong>{{ formatDate(active.requestedAt) }}</strong>
        </div>
        <div>
          <span>Специалист</span>
          <strong>{{
            active.claimant?.displayName ?? "Ещё не назначен"
          }}</strong>
        </div>
      </div>

      <div class="actions">
        <Button
          v-if="active.status === 'REQUESTED' && canAssign"
          label="Взять в работу"
          icon="pi pi-user-plus"
          :loading="mutating"
          @click="$emit('action', 'CLAIM')"
        />
        <Button
          v-if="active.status === 'CLAIMED' && canClose"
          label="Завершить помощь"
          icon="pi pi-check"
          severity="success"
          :loading="mutating"
          @click="$emit('action', 'CLOSE')"
        />
        <Button
          v-if="active.status === 'CLAIMED' && canAssign"
          label="Передать"
          icon="pi pi-arrow-right-arrow-left"
          severity="secondary"
          outlined
          :disabled="mutating"
          @click="$emit('action', 'TRANSFER')"
        />
        <Button
          v-if="active.status === 'CLAIMED' && canRelease"
          label="Вернуть в очередь"
          severity="secondary"
          text
          :disabled="mutating"
          @click="$emit('action', 'RELEASE')"
        />
        <Button
          v-if="canManage"
          label="Отменить запрос"
          severity="danger"
          text
          :disabled="mutating"
          @click="$emit('action', 'CANCEL')"
        />
      </div>
    </template>

    <template v-else>
      <p class="summary">
        Обращение остаётся в обычном workflow. Запрашивайте специалиста только
        когда требуется реальное вмешательство человека.
      </p>
      <Button
        v-if="canEscalate && !terminal"
        label="Позвать специалиста"
        icon="pi pi-user-plus"
        severity="secondary"
        outlined
        :loading="mutating"
        @click="$emit('action', 'REQUEST')"
      />
    </template>

    <details v-if="history.length" class="history">
      <summary>История эскалаций · {{ history.length }}</summary>
      <ol>
        <li v-for="item in history" :key="item.id">
          <strong>{{ endUserCaseEscalationStatusLabel(item.status) }}</strong>
          <span>
            № {{ item.occurrenceNumber }} ·
            {{ endUserCaseEscalationReasonLabel(item.reasonCode) }} ·
            {{ formatDate(item.requestedAt) }}
          </span>
          <small v-if="item.closeReason || item.cancellationReason">
            {{ item.closeReason ?? item.cancellationReason }}
          </small>
        </li>
      </ol>
    </details>
  </section>
</template>

<style scoped>
.escalation-card {
  padding: 18px;
  border: 1px solid var(--border-default);
  border-radius: 18px;
  background: var(--surface-card);
}
.escalation-card.active {
  border-color: color-mix(in srgb, var(--brand) 38%, var(--border-default));
  background:
    radial-gradient(circle at 100% 0, var(--brand-soft), transparent 45%),
    var(--surface-card);
  box-shadow: var(--shadow-raised);
}
.escalation-heading,
.actions {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}
.eyebrow {
  color: var(--brand);
  font-size: 0.65rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
h3 {
  margin: 4px 0 0;
  font-size: 1.08rem;
}
.signal {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  padding: 7px 10px;
  border-radius: 999px;
  background: var(--brand);
  color: var(--on-brand);
  font-size: 0.7rem;
  font-weight: 800;
}
.summary {
  margin: 14px 0;
  color: var(--text-secondary);
  font-size: 0.82rem;
  line-height: 1.55;
}
.escalation-meta {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin-bottom: 14px;
}
.escalation-meta > div {
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--surface-subtle);
}
.escalation-meta span,
.escalation-meta strong {
  display: block;
}
.escalation-meta span {
  margin-bottom: 3px;
  color: var(--text-tertiary);
  font-size: 0.65rem;
}
.escalation-meta strong {
  font-size: 0.76rem;
}
.actions {
  justify-content: flex-start;
}
.history {
  margin-top: 16px;
  border-top: 1px solid var(--border-default);
  padding-top: 12px;
  color: var(--text-secondary);
  font-size: 0.76rem;
}
.history summary {
  cursor: pointer;
  font-weight: 700;
}
.history ol {
  display: grid;
  gap: 8px;
  margin: 10px 0 0;
  padding-left: 20px;
}
.history li span,
.history li small {
  display: block;
  margin-top: 2px;
}
@media (max-width: 620px) {
  .escalation-meta {
    grid-template-columns: 1fr;
  }
  .actions :deep(.p-button) {
    width: 100%;
  }
}
</style>
