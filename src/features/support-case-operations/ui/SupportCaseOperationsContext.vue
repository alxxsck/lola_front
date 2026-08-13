<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type {
  SupportRoutingContext,
  SupportRoutingExclusion,
  SupportSlaContext,
} from '@/features/support-workspace/api/support-workspace-source';
import {
  assignmentStateLabel,
  formatBusinessDuration,
  routingReasonLabel,
  slaClockStatus,
} from '@/features/support-case-operations/model/support-case-operations';

const props = defineProps<{
  caseId: string;
  sla: SupportSlaContext | null;
  routing: SupportRoutingContext | null;
  reservationReconcileAttempt: number;
  reservationReconcileInFlight: boolean;
}>();

const emit = defineEmits<{ reconcile: [expiresAt: string] }>();

const exclusionLabels: Record<SupportRoutingExclusion, string> = {
  ASSIGNMENT_CONFLICT: 'Конфликт назначения',
  AVAILABILITY_NOT_ROUTABLE: 'Недоступны для маршрутизации',
  CAPACITY_EXHAUSTED: 'Нет ёмкости',
  CASE_COOLDOWN: 'Пауза после обращения',
  DATA_SCOPE_DENIED: 'Нет доступа к данным',
  FACT_STALE: 'Устаревшие данные',
  LANGUAGE_REQUIRED: 'Не хватает языка',
  LEASE_EXPIRED: 'Резерв истёк',
  MEMBERSHIP_INACTIVE: 'Неактивны в команде',
  RECEIVE_PERMISSION_MISSING: 'Нет права получать обращения',
  SKILL_REQUIRED: 'Не хватает навыка',
  TEAM_NOT_ELIGIBLE: 'Команда не подходит',
};

const availableRouting = computed(() =>
  props.routing?.state === 'AVAILABLE' ? props.routing : null,
);

const orderedExclusions = computed(() => {
  if (!availableRouting.value) return [];
  return (
    Object.entries(availableRouting.value.exclusions) as Array<[SupportRoutingExclusion, number]>
  )
    .filter(([, count]) => count > 0)
    .map(([code, count]) => ({ code, count, label: exclusionLabels[code] }));
});

const reservationPending = ref(false);
const reservationReconcileExhausted = ref(false);
let expiryTimer: ReturnType<typeof setTimeout> | null = null;
const maxReservationReconcileAttempts = 3;

function clearExpiryTimer(): void {
  if (expiryTimer) clearTimeout(expiryTimer);
  expiryTimer = null;
}

function scheduleReservationReconcile(expiresAt: string | null): void {
  clearExpiryTimer();
  reservationPending.value = false;
  reservationReconcileExhausted.value = false;
  if (!expiresAt) return;
  if (props.reservationReconcileInFlight) {
    reservationPending.value = true;
    return;
  }
  if (props.reservationReconcileAttempt >= maxReservationReconcileAttempts) {
    reservationReconcileExhausted.value = true;
    return;
  }
  const expiresIn = new Date(expiresAt).getTime() - Date.now();
  const retryBackoff =
    props.reservationReconcileAttempt > 0
      ? 1_000 * 2 ** (props.reservationReconcileAttempt - 1)
      : 0;
  const delay = Number.isFinite(expiresIn)
    ? Math.min(Math.max(retryBackoff, expiresIn), 2_147_000_000)
    : 0;
  expiryTimer = setTimeout(() => {
    reservationPending.value = true;
    emit('reconcile', expiresAt);
  }, delay);
}

watch(
  () =>
    [
      props.routing?.state === 'AVAILABLE' ? (props.routing.reservation?.expiresAt ?? null) : null,
      props.reservationReconcileAttempt,
      props.reservationReconcileInFlight,
      props.caseId,
    ] as const,
  ([expiresAt]) => scheduleReservationReconcile(expiresAt),
  { immediate: true },
);

onBeforeUnmount(clearExpiryTimer);

function clockTone(clock: SupportSlaContext['clocks'][number]): string {
  if (clock.outcome !== 'OPEN') return 'neutral';
  if (clock.risk === 'BREACHED') return 'danger';
  if (clock.risk === 'AT_RISK') return 'warning';
  if (clock.timing === 'PAUSED') return 'paused';
  return 'success';
}

function clockKindTitle(kind: SupportSlaContext['clocks'][number]['kind']): string {
  return {
    FIRST_HUMAN_RESPONSE: 'Первый ответ',
    NEXT_HUMAN_RESPONSE: 'Следующий ответ',
    RESOLUTION: 'Решение',
  }[kind];
}

function dateTime(value: string | null): string {
  if (!value) return 'Срок не рассчитан';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return 'Срок не рассчитан';
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(parsed);
}

function routingModeLabel(value: 'SHADOW' | 'LIVE_PROPOSAL' | null): string {
  if (value === 'SHADOW') return 'Теневой подбор';
  if (value === 'LIVE_PROPOSAL') return 'Рабочий подбор';
  return 'Режим не указан';
}
</script>

<template>
  <section class="operations-context" aria-labelledby="case-operations-title">
    <header class="operations-heading">
      <div>
        <span class="operations-kicker">Операционный контекст</span>
        <h3 id="case-operations-title">SLA и маршрутизация</h3>
      </div>
    </header>

    <div class="operations-block" aria-label="SLA обращения">
      <div class="block-heading">
        <span class="block-icon"><i class="pi pi-stopwatch" aria-hidden="true" /></span>
        <div>
          <strong>SLA</strong>
          <span>Снимок серверного рабочего времени</span>
        </div>
      </div>

      <div v-if="!sla" class="quiet-state">
        <i class="pi pi-lock" aria-hidden="true" />
        <span>SLA недоступен для этой роли</span>
      </div>
      <div v-else-if="!sla.clocks.length" class="quiet-state">
        <i class="pi pi-check-circle" aria-hidden="true" />
        <span>Активных SLA-часов нет</span>
      </div>
      <ul v-else class="sla-clocks">
        <li v-for="clock in sla.clocks" :key="clock.kind" :class="clockTone(clock)">
          <span class="clock-status" aria-hidden="true" />
          <div class="clock-copy">
            <strong>{{ clockKindTitle(clock.kind) }}</strong>
            <span>{{ slaClockStatus(clock) }}</span>
          </div>
          <div class="clock-time">
            <strong>{{ formatBusinessDuration(clock.remainingBusinessMs) }}</strong>
            <span>{{ dateTime(clock.currentDeadlineAt) }}</span>
          </div>
        </li>
      </ul>
    </div>

    <div class="operations-block" aria-label="Маршрутизация обращения">
      <div class="block-heading">
        <span class="block-icon"><i class="pi pi-sitemap" aria-hidden="true" /></span>
        <div>
          <strong>Маршрутизация</strong>
          <span>Очередь, подбор и ограничения</span>
        </div>
      </div>

      <div v-if="!routing || routing.state === 'REDACTED'" class="quiet-state">
        <i class="pi pi-lock" aria-hidden="true" />
        <span>Маршрутизация скрыта для этой роли</span>
      </div>
      <div v-else-if="routing.state === 'NOT_EVALUATED'" class="quiet-state">
        <i class="pi pi-hourglass" aria-hidden="true" />
        <span>Маршрутизация ещё не оценивалась</span>
      </div>
      <template v-else-if="availableRouting">
        <div class="routing-summary">
          <div>
            <span>Очередь</span>
            <strong>{{ availableRouting.queue?.name ?? 'Не определена' }}</strong>
          </div>
          <div>
            <span>Назначение</span>
            <strong>{{ assignmentStateLabel(availableRouting.assignmentState) }}</strong>
          </div>
        </div>

        <div class="routing-reason" role="status">
          <i
            :class="
              availableRouting.outcome === 'DEGRADED' || availableRouting.outcome === 'STALE_INPUT'
                ? 'pi pi-exclamation-triangle'
                : 'pi pi-directions'
            "
            aria-hidden="true"
          />
          <div>
            <strong>{{ routingReasonLabel(availableRouting.reasonCode) }}</strong>
            <span>{{ routingModeLabel(availableRouting.mode) }}</span>
          </div>
        </div>

        <div class="eligibility">
          <div class="eligibility-heading">
            <span>Подбор операторов</span>
            <strong v-if="availableRouting.eligibleCandidateCount !== null">
              {{ availableRouting.eligibleCandidateCount }} из
              {{ availableRouting.candidateCount }} подходят
            </strong>
            <strong v-else
              >{{ availableRouting.candidateCount }} кандидатов · неполный список</strong
            >
          </div>
          <ul v-if="orderedExclusions.length" class="exclusion-list">
            <li v-for="item in orderedExclusions" :key="item.code">
              <span>{{ item.label }} ·</span><strong>{{ item.count }}</strong>
            </li>
          </ul>
          <p v-else class="context-note">
            Сервер не вернул ограничений. Детализация навыков и языков не показана.
          </p>
        </div>

        <div v-if="availableRouting.reservation" class="reservation-row">
          <i class="pi pi-bookmark" aria-hidden="true" />
          <div>
            <strong>{{
              reservationPending
                ? 'Проверяем актуальность…'
                : reservationReconcileExhausted
                  ? 'Нужно обновить статус'
                  : 'Оператор зарезервирован'
            }}</strong>
            <span>
              {{
                reservationPending
                  ? 'Обновляем назначение и доступные действия'
                  : reservationReconcileExhausted
                    ? 'Сервер пока подтверждает резерв — обновите рабочее место'
                    : `Резерв до ${dateTime(availableRouting.reservation.expiresAt)}`
              }}
            </span>
          </div>
        </div>

        <div v-if="availableRouting.fallback" class="fallback-row">
          <i class="pi pi-refresh" aria-hidden="true" />
          <span>
            Повторный подбор · попытка
            {{ availableRouting.fallback.candidateAttempt }} ·
            {{ dateTime(availableRouting.fallback.availableAt) }}
          </span>
        </div>
      </template>
    </div>
  </section>
</template>

<style scoped>
.operations-context {
  display: grid;
  gap: 12px;
  margin-top: 20px;
  padding-top: 20px;
  border-top: 1px solid var(--line);
}
.operations-heading,
.block-heading,
.routing-reason,
.reservation-row,
.fallback-row {
  display: flex;
  align-items: center;
}
.operations-heading {
  justify-content: space-between;
  gap: 12px;
}
.operations-heading h3 {
  margin: 3px 0 0;
  color: var(--text-primary);
  font-size: 0.92rem;
  line-height: 1.35;
}
.operations-kicker {
  color: var(--text-muted);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.operations-block {
  min-width: 0;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-card);
}
.block-heading {
  gap: 9px;
  margin-bottom: 12px;
}
.block-icon {
  width: 30px;
  height: 30px;
  flex: 0 0 auto;
  display: grid;
  place-items: center;
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--text-secondary);
}
.block-heading > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.block-heading strong,
.routing-reason strong,
.reservation-row strong {
  color: var(--text-primary);
  font-size: 0.75rem;
}
.block-heading span,
.routing-reason span,
.reservation-row span {
  color: var(--text-muted);
  font-size: 0.66rem;
  line-height: 1.35;
}
.quiet-state {
  min-height: 46px;
  padding: 10px;
  display: flex;
  align-items: center;
  gap: 8px;
  border-radius: 8px;
  background: var(--surface-muted);
  color: var(--text-muted);
  font-size: 0.72rem;
}
.sla-clocks,
.exclusion-list {
  margin: 0;
  padding: 0;
  list-style: none;
}
.sla-clocks {
  display: grid;
  gap: 1px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--line);
}
.sla-clocks li {
  min-width: 0;
  padding: 9px 10px;
  display: grid;
  grid-template-columns: 7px minmax(0, 1fr) auto;
  align-items: center;
  gap: 8px;
  background: var(--surface-card);
}
.clock-status {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--text-muted);
}
.sla-clocks li.success .clock-status {
  background: var(--status-success-text);
}
.sla-clocks li.warning .clock-status,
.sla-clocks li.paused .clock-status {
  background: var(--status-warning-text);
}
.sla-clocks li.danger .clock-status {
  background: var(--status-danger-text);
}
.clock-copy,
.clock-time {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.clock-copy strong,
.clock-time strong {
  font-size: 0.72rem;
}
.clock-copy span,
.clock-time span {
  color: var(--text-muted);
  font-size: 0.64rem;
}
.clock-time {
  text-align: right;
  font-variant-numeric: tabular-nums;
}
.routing-summary {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.routing-summary > div {
  min-width: 0;
  padding: 9px 10px;
  display: grid;
  gap: 3px;
  border-radius: 8px;
  background: var(--surface-muted);
}
.routing-summary span,
.eligibility-heading span {
  color: var(--text-muted);
  font-size: 0.64rem;
}
.routing-summary strong,
.eligibility-heading strong {
  overflow-wrap: anywhere;
  font-size: 0.72rem;
}
.routing-reason,
.reservation-row {
  gap: 9px;
  margin-top: 8px;
  padding: 9px 10px;
  border-left: 2px solid var(--brand);
  background: color-mix(in srgb, var(--brand-soft) 45%, var(--surface-card));
}
.routing-reason > div,
.reservation-row > div {
  min-width: 0;
  display: grid;
  gap: 2px;
}
.eligibility {
  margin-top: 12px;
}
.eligibility-heading {
  display: flex;
  align-items: baseline;
  justify-content: space-between;
  gap: 8px;
}
.exclusion-list {
  display: grid;
  gap: 5px;
  margin-top: 8px;
}
.exclusion-list li {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  color: var(--text-secondary);
  font-size: 0.68rem;
}
.exclusion-list strong {
  min-width: 22px;
  min-height: 20px;
  display: inline-grid;
  place-items: center;
  border-radius: 999px;
  background: var(--surface-muted);
  font-size: 0.65rem;
}
.context-note {
  margin: 8px 0 0;
  color: var(--text-muted);
  font-size: 0.64rem;
  line-height: 1.45;
}
.reservation-row {
  border-left-color: var(--status-warning-text);
  background: var(--status-warning-soft);
}
.fallback-row {
  gap: 7px;
  margin-top: 8px;
  color: var(--text-muted);
  font-size: 0.66rem;
  line-height: 1.4;
}
@media (max-width: 420px) {
  .operations-heading {
    align-items: flex-start;
    flex-direction: column;
  }
  .routing-summary {
    grid-template-columns: 1fr;
  }
  .sla-clocks li {
    grid-template-columns: 7px minmax(0, 1fr);
  }
  .clock-time {
    grid-column: 2;
    text-align: left;
  }
}
</style>
