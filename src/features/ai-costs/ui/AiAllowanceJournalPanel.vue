<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import {
  formatDecimalMoney,
  type DecimalString,
} from "@/shared/lib/decimal-money";
import { aiAllowanceRepository } from "../api/ai-allowance-repository";
import type {
  AiAllowanceJournalPage,
  AiAllowanceReconciliationResolution,
  SignedDecimalString,
} from "../model/ai-allowance";

const props = defineProps<{
  projectId: string;
  canRead: boolean;
  canReconcile: boolean;
  endUserId: string;
  cursor: string;
}>();
const emit = defineEmits<{
  selectUser: [id: string];
  nextCursor: [cursor: string];
}>();
const input = ref(props.endUserId);
const page = ref<AiAllowanceJournalPage | null>(null);
const loading = ref(false);
const error = ref("");
const notice = ref("");
const reconcileOpen = ref(false);
const reconciling = ref(false);
const reconcileError = ref("");
const reservationId = ref("");
const resolution =
  ref<AiAllowanceReconciliationResolution>("SETTLE_FROM_USAGE");
const reason = ref("");
const idempotencyKey = ref("");
const releaseConfirmed = ref(false);
let generation = 0;
watch(
  () => props.endUserId,
  (value) => {
    input.value = value;
  },
);
watch(
  () => props.projectId,
  () => {
    reconcileOpen.value = false;
    reservationId.value = "";
    notice.value = "";
  },
);
watch(
  () =>
    [props.canRead, props.projectId, props.endUserId, props.cursor] as const,
  () => {
    if (props.canRead && props.endUserId) void load();
    else {
      generation += 1;
      page.value = null;
    }
  },
  { immediate: true },
);
async function load(): Promise<void> {
  const requestGeneration = ++generation;
  const requestProjectId = props.projectId;
  const requestEndUserId = props.endUserId;
  const requestCursor = props.cursor;
  loading.value = true;
  error.value = "";
  try {
    const next = await aiAllowanceRepository.journal(
      requestProjectId,
      requestEndUserId,
      { limit: 50, ...(requestCursor ? { cursor: requestCursor } : {}) },
    );
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId &&
      requestCursor === props.cursor
    )
      page.value = next;
  } catch (cause) {
    if (requestGeneration === generation)
      error.value =
        cause instanceof Error ? cause.message : "Не удалось загрузить журнал";
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}
function select(): void {
  const value = input.value.trim();
  if (!value || value.length > 160) {
    error.value = "Укажите корректный End User ID.";
    return;
  }
  emit("selectUser", value);
}
function openReconcile(id = ""): void {
  reservationId.value = id;
  resolution.value = "SETTLE_FROM_USAGE";
  reason.value = "";
  idempotencyKey.value =
    globalThis.crypto?.randomUUID?.() ?? `reconcile-${Date.now()}`;
  releaseConfirmed.value = false;
  reconcileError.value = "";
  reconcileOpen.value = true;
}
async function submitReconcile(): Promise<void> {
  if (
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      reservationId.value,
    )
  )
    return reconcileFail("Некорректный reservationId.");
  if (reason.value.trim().length < 3 || reason.value.trim().length > 500)
    return reconcileFail("Причина должна содержать от 3 до 500 символов.");
  if (!idempotencyKey.value.trim() || idempotencyKey.value.length > 128)
    return reconcileFail("Укажите Idempotency-Key длиной до 128 символов.");
  if (
    resolution.value === "RELEASE_PROVEN_NON_BILLABLE" &&
    !releaseConfirmed.value
  )
    return reconcileFail(
      "Подтвердите доказанный non-billable результат перед освобождением резерва.",
    );
  reconciling.value = true;
  reconcileError.value = "";
  notice.value = "";
  try {
    await aiAllowanceRepository.reconcile(
      props.projectId,
      {
        reservationId: reservationId.value,
        resolution: resolution.value,
        reason: reason.value.trim(),
      },
      idempotencyKey.value.trim(),
    );
    reconcileOpen.value = false;
    notice.value = "Сверка принята. Журнал обновлён.";
    await load();
  } catch (cause) {
    reconcileError.value =
      cause instanceof Error ? cause.message : "Не удалось выполнить сверку";
  } finally {
    reconciling.value = false;
  }
}
function reconcileFail(value: string): void {
  reconcileError.value = value;
}
function delta(value: SignedDecimalString): string {
  const negative = value.startsWith("-");
  const absolute = (negative ? value.slice(1) : value) as DecimalString;
  const formatted = formatDecimalMoney(absolute, "USD");
  return `${negative ? "−" : value === "0" || /^0\.0+$/.test(value) ? "" : "+"}${formatted}`;
}
function date(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}
function provenance(item: AiAllowanceJournalPage["items"][number]): string {
  return item.usageRecordId
    ? `usage ${item.usageRecordId}`
    : item.reservationId
      ? `reservation ${item.reservationId}`
      : item.grantId
        ? `grant ${item.grantId}`
        : item.periodId
          ? `period ${item.periodId}`
          : item.correctsEntryId
            ? `corrects ${item.correctsEntryId}`
            : "—";
}
</script>

<template>
  <section
    class="journal-panel"
    role="tabpanel"
    aria-labelledby="ai-cost-tab-journal"
  >
    <Button
      v-if="canReconcile"
      label="Ручная сверка reservation"
      severity="warn"
      outlined
      icon="pi pi-wrench"
      @click="openReconcile()"
    />
    <Message v-if="!canRead" severity="warn" :closable="false"
      >Нет права <code>project.ai_allowance.read</code>. Журнал скрыт.</Message
    >
    <template v-else>
      <header>
        <div>
          <span class="eyebrow">Immutable allowance ledger</span>
          <h2>Журнал квоты пользователя</h2>
          <p>
            Backend публикует журнал только в контексте End User. Дельты
            показаны без округления в расчётах.
          </p>
        </div>
      </header>
      <form class="user-selector" @submit.prevent="select">
        <label for="allowance-user-id">End User ID</label
        ><input
          id="allowance-user-id"
          v-model="input"
          autocomplete="off"
          placeholder="UUID пользователя"
          maxlength="160"
        /><Button label="Открыть журнал" type="submit" />
      </form>
      <Message v-if="canReconcile" severity="warn" :closable="false"
        >Ручная сверка — audited break-glass mutation. Выполняйте её только по
        подтверждённому reservation и сохраняйте доказательную причину.</Message
      >
      <Message v-if="notice" severity="success" :closable="false">{{
        notice
      }}</Message>
      <Message v-if="error" severity="error" :closable="false"
        >{{ error }}
        <Button
          v-if="endUserId"
          label="Повторить"
          text
          size="small"
          @click="load"
      /></Message>
      <div v-if="loading" class="journal-loading">
        <Skeleton v-for="index in 7" :key="index" height="44px" />
      </div>
      <div v-else-if="page?.items.length" class="journal-table">
        <table>
          <thead>
            <tr>
              <th>Время / тип</th>
              <th>Доступно</th>
              <th>Резерв</th>
              <th>Потрачено</th>
              <th>Unknown</th>
              <th>Перерасход</th>
              <th class="provenance-cell">Причина / provenance</th>
              <th v-if="canReconcile">Действие</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in page.items" :key="item.id">
              <td>
                <strong>{{ item.entryType }}</strong
                ><small
                  >{{ date(item.occurredAt) }} ·
                  {{ item.costQuality ?? "N/A" }}</small
                >
              </td>
              <td>{{ delta(item.deltaAvailableUsd) }}</td>
              <td>{{ delta(item.deltaReservedUsd) }}</td>
              <td>{{ delta(item.deltaSettledUsd) }}</td>
              <td>{{ delta(item.deltaUnknownUsd) }}</td>
              <td>{{ delta(item.deltaOverageUsd) }}</td>
              <td class="provenance-cell">
                <strong>{{ item.reason }}</strong
                ><small
                  >{{ item.actorType }}:{{ item.actorId }} ·
                  {{ provenance(item) }}</small
                >
              </td>
              <td v-if="canReconcile">
                <Button
                  v-if="item.reservationId"
                  label="Сверить"
                  size="small"
                  outlined
                  severity="warn"
                  @click="openReconcile(item.reservationId)"
                /><span v-else>—</span>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else-if="page" class="empty-state">
        Записей журнала у этого пользователя пока нет.
      </p>
      <div v-else-if="!endUserId" class="journal-empty">
        <i class="pi pi-user" aria-hidden="true" />
        <h3>Выберите пользователя</h3>
        <p>
          Можно открыть журнал кнопкой из таблицы пользователей или вставить
          точный End User ID.
        </p>
      </div>
      <footer v-if="page" class="journal-footer">
        <span>До 50 событий на страницу</span
        ><Button
          label="Следующая страница"
          icon="pi pi-chevron-right"
          icon-pos="right"
          outlined
          :disabled="!page.pageInfo.hasMore || !page.pageInfo.nextCursor"
          @click="emit('nextCursor', page.pageInfo.nextCursor ?? '')"
        />
      </footer>
    </template>
  </section>

  <Dialog
    v-model:visible="reconcileOpen"
    modal
    header="Ручная сверка reservation"
    :style="{ width: 'min(680px, 94vw)' }"
  >
    <form class="reconcile-form" @submit.prevent="submitReconcile">
      <Message severity="warn" :closable="false"
        >Операция меняет allowance ledger и журналируется как break-glass
        mutation. Это квота AI, не денежный возврат.</Message
      >
      <label>Reservation ID<input v-model="reservationId" /></label>
      <label
        >Результат<select v-model="resolution">
          <option value="SETTLE_FROM_USAGE">
            Списать по terminal AI Usage
          </option>
          <option value="HOLD_UNKNOWN">Перенести в unknown hold</option>
          <option value="RELEASE_PROVEN_NON_BILLABLE">
            Освободить доказанный non-billable резерв
          </option>
        </select></label
      >
      <Message
        v-if="resolution === 'SETTLE_FROM_USAGE'"
        severity="info"
        :closable="false"
        >Backend потребует terminal AI Usage с допустимым качеством
        стоимости.</Message
      >
      <Message
        v-else-if="resolution === 'HOLD_UNKNOWN'"
        severity="warn"
        :closable="false"
        >Сумма останется удержанной до появления доказательств.</Message
      >
      <Message v-else severity="error" :closable="false"
        >Освобождайте резерв только при доказанном non-billable исходе.<label
          class="release-confirm"
          ><input v-model="releaseConfirmed" type="checkbox" /> Доказательства
          проверены</label
        ></Message
      >
      <label
        >Причина / доказательство<textarea
          v-model="reason"
          rows="4"
          maxlength="500"
        />
      </label>
      <label
        >Idempotency-Key<input
          v-model="idempotencyKey"
          maxlength="128"
          autocomplete="off"
        /><small>Не меняйте ключ при повторе того же запроса.</small></label
      >
      <small v-if="reconcileError" class="reconcile-error" role="alert">{{
        reconcileError
      }}</small>
      <footer>
        <Button
          label="Отмена"
          text
          type="button"
          :disabled="reconciling"
          @click="reconcileOpen = false"
        /><Button
          label="Выполнить сверку"
          severity="warn"
          type="submit"
          :loading="reconciling"
        />
      </footer>
    </form>
  </Dialog>
</template>

<style scoped>
.journal-panel,
.journal-loading,
.reconcile-form {
  display: grid;
  gap: 16px;
}
.journal-panel header h2 {
  margin: 3px 0 0;
}
.journal-panel header p {
  margin: 7px 0 0;
  color: var(--text-secondary);
}
.eyebrow {
  color: var(--text-small-muted);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.user-selector {
  display: grid;
  grid-template-columns: auto minmax(220px, 1fr) auto;
  align-items: center;
  gap: 10px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-card);
}
.user-selector label {
  font-size: 0.72rem;
  font-weight: 750;
}
.user-selector input {
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-primary);
}
.journal-table {
  overflow-x: auto;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-card);
}
table {
  width: 100%;
  min-width: 1240px;
  border-collapse: collapse;
}
th,
td {
  padding: 11px 9px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: right;
  font-size: 0.7rem;
  vertical-align: top;
}
th {
  color: var(--text-small-muted);
  font-size: 0.62rem;
  text-transform: uppercase;
}
th:first-child,
td:first-child,
.provenance-cell {
  text-align: left;
}
td strong,
td small {
  display: block;
}
td small {
  max-width: 340px;
  margin-top: 4px;
  overflow: hidden;
  color: var(--text-small-muted);
  text-overflow: ellipsis;
}
.journal-empty {
  display: grid;
  justify-items: center;
  padding: 42px;
  border: 1px dashed var(--border-default);
  border-radius: 14px;
  color: var(--text-small-muted);
  text-align: center;
}
.journal-empty i {
  font-size: 1.5rem;
}
.journal-empty h3,
.journal-empty p {
  margin: 4px;
}
.journal-footer,
.reconcile-form footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.journal-footer {
  color: var(--text-small-muted);
  font-size: 0.7rem;
}
.reconcile-form label {
  display: grid;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
}
.reconcile-form input,
.reconcile-form select,
.reconcile-form textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
}
.reconcile-form small {
  color: var(--text-small-muted);
  font-weight: 400;
}
.release-confirm {
  display: flex !important;
  align-items: center;
  margin-top: 10px;
}
.release-confirm input {
  width: auto;
}
.reconcile-error {
  color: var(--status-danger-text) !important;
}
.empty-state {
  text-align: center;
  color: var(--text-small-muted);
}
@media (max-width: 650px) {
  .user-selector {
    grid-template-columns: 1fr;
  }
  .journal-footer {
    align-items: stretch;
    flex-direction: column;
    gap: 10px;
  }
}
</style>
