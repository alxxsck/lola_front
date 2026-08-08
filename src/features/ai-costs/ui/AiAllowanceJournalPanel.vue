<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { endUserProfileRepository } from "@/features/end-user-profile/api/end-user-profile-repository";
import EndUserSelect from "@/features/end-user-profile/ui/EndUserSelect.vue";
import {
  formatDecimalMoney,
  type DecimalString,
} from "@/shared/lib/decimal-money";
import { aiAllowanceRepository } from "../api/ai-allowance-repository";
import { allowanceCostQualityLabel } from "../model/ai-allowance-presentation";
import { isAllowanceReauthenticationRequired } from "../model/allowance-reauthentication";
import AiAllowanceReconciliationQueue from "./AiAllowanceReconciliationQueue.vue";
import AiAllowanceReauthenticationAction from "./AiAllowanceReauthenticationAction.vue";
import {
  parseSignedDecimal,
  type AiAllowanceJournalEntry,
  type AiAllowanceJournalPage,
  type AiAllowanceUserBalance,
  type SignedDecimalString,
} from "../model/ai-allowance";

const props = defineProps<{
  projectId: string;
  canRead: boolean;
  canReconcile: boolean;
  endUserId: string;
  cursor: string;
  embedded?: boolean;
  canSearchUsers?: boolean;
}>();
const emit = defineEmits<{
  selectUser: [id: string];
  nextCursor: [cursor: string];
  changed: [];
  "fresh-login": [];
}>();
const input = ref(props.endUserId);
const page = ref<AiAllowanceJournalPage | null>(null);
const balance = ref<AiAllowanceUserBalance | null>(null);
const loadedContextKey = ref("");
const loading = ref(false);
const error = ref("");
const balanceError = ref("");
const notice = ref("");
const correctionTarget = ref<AiAllowanceJournalEntry | null>(null);
const correctionDelta = ref("");
const correctionExpiresAt = ref("");
const correctionReason = ref("");
const correctionIdempotencyKey = ref("");
const correctionAccountVersion = ref("");
const correcting = ref(false);
const selectingUser = ref(false);
const correctionError = ref("");
const reauthenticationRequired = ref(false);
let generation = 0;
const contextKey = computed(() =>
  JSON.stringify([
    props.canRead,
    props.canReconcile,
    props.projectId,
    props.endUserId,
    props.cursor,
  ]),
);
const visiblePage = computed(() =>
  loadedContextKey.value === contextKey.value ? page.value : null,
);
watch(
  () => props.endUserId,
  (value) => {
    input.value = value;
  },
);
watch(
  () => props.projectId,
  () => {
    correctionTarget.value = null;
    correcting.value = false;
    notice.value = "";
    reauthenticationRequired.value = false;
  },
);
watch(
  contextKey,
  () => {
    invalidatePage();
    if (props.canRead && props.endUserId) void load();
  },
  { immediate: true },
);
async function load(): Promise<void> {
  const requestGeneration = ++generation;
  const requestContextKey = contextKey.value;
  const requestProjectId = props.projectId;
  const requestEndUserId = props.endUserId;
  const requestCursor = props.cursor;
  loading.value = true;
  error.value = "";
  page.value = null;
  balance.value = null;
  loadedContextKey.value = "";
  balanceError.value = "";
  try {
    const [next, balanceResult] = await Promise.all([
      aiAllowanceRepository.journal(requestProjectId, requestEndUserId, {
        limit: 50,
        ...(requestCursor ? { cursor: requestCursor } : {}),
      }),
      props.canReconcile
        ? aiAllowanceRepository
            .endUserBalance(requestProjectId, requestEndUserId)
            .then((value) => ({ value, cause: null }))
            .catch((cause: unknown) => ({ value: null, cause }))
        : Promise.resolve(null),
    ]);
    if (
      requestGeneration === generation &&
      requestContextKey === contextKey.value &&
      props.canRead &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId &&
      requestCursor === props.cursor
    ) {
      page.value = next;
      if (
        balanceResult?.value?.account.projectId === requestProjectId &&
        balanceResult.value.account.endUserId === requestEndUserId
      )
        balance.value = balanceResult.value;
      else if (balanceResult?.cause)
        balanceError.value = message(
          balanceResult.cause,
          "Не удалось загрузить актуальную версию баланса",
        );
      loadedContextKey.value = requestContextKey;
    }
  } catch (cause) {
    if (requestGeneration === generation)
      error.value =
        cause instanceof Error ? cause.message : "Не удалось загрузить журнал";
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}
function invalidatePage(): void {
  generation += 1;
  page.value = null;
  balance.value = null;
  loadedContextKey.value = "";
  loading.value = false;
  error.value = "";
  balanceError.value = "";
  correctionTarget.value = null;
  correcting.value = false;
}
async function select(): Promise<void> {
  const value = input.value.trim();
  if (!value || value.length > 160) {
    error.value = "Укажите корректный ID пользователя.";
    return;
  }
  if (uuid(value)) {
    emit("selectUser", value);
    return;
  }
  selectingUser.value = true;
  error.value = "";
  try {
    const user = await endUserProfileRepository.resolveIdentity(
      props.projectId,
      value,
    );
    if (!user) {
      error.value = "Пользователь с таким ID не найден.";
      return;
    }
    emit("selectUser", user.endUserId);
  } catch (cause) {
    error.value =
      cause instanceof Error ? cause.message : "Не удалось найти пользователя";
  } finally {
    selectingUser.value = false;
  }
}
function openCorrection(item: AiAllowanceJournalEntry): void {
  if (
    !props.canReconcile ||
    !balance.value ||
    loadedContextKey.value !== contextKey.value
  )
    return;
  correctionTarget.value = item;
  correctionDelta.value = "";
  correctionExpiresAt.value = localTomorrow();
  correctionReason.value = "";
  correctionIdempotencyKey.value = commandKey();
  correctionAccountVersion.value = balance.value.account.version;
  correctionError.value = "";
  reauthenticationRequired.value = false;
}
async function submitCorrection(): Promise<void> {
  const target = correctionTarget.value;
  const exact = parseSignedDecimal(correctionDelta.value.trim());
  if (!target || !props.canReconcile)
    return correctionFail("Операция больше недоступна.");
  if (!exact || /^-?0(?:\.0+)?$/.test(exact))
    return correctionFail(
      "Укажите ненулевое число, не более 12 знаков после запятой.",
    );
  const positive = !exact.startsWith("-");
  const expiresAt = positive ? iso(correctionExpiresAt.value) : undefined;
  if (positive && (!expiresAt || new Date(expiresAt) <= new Date()))
    return correctionFail(
      "Для положительной корректировки укажите будущий срок действия.",
    );
  if (!/^(?:0|[1-9]\d{0,19})$/.test(correctionAccountVersion.value))
    return correctionFail("Версия баланса устарела или некорректна.");
  if (
    correctionReason.value.trim().length < 3 ||
    correctionReason.value.trim().length > 500
  )
    return correctionFail("Причина должна содержать от 3 до 500 символов.");
  if (
    !correctionIdempotencyKey.value.trim() ||
    correctionIdempotencyKey.value.length > 128
  )
    return correctionFail("Некорректный ключ защиты от повторной отправки.");

  const requestContextKey = contextKey.value;
  const requestProjectId = props.projectId;
  const requestEndUserId = props.endUserId;
  correcting.value = true;
  correctionError.value = "";
  reauthenticationRequired.value = false;
  notice.value = "";
  try {
    await aiAllowanceRepository.correct(
      requestProjectId,
      requestEndUserId,
      {
        correctsEntryId: target.id,
        deltaAvailableUsd: exact,
        expectedAccountVersion: correctionAccountVersion.value,
        ...(expiresAt ? { expiresAt } : {}),
        reason: correctionReason.value.trim(),
      },
      correctionIdempotencyKey.value.trim(),
    );
    if (
      requestContextKey !== contextKey.value ||
      requestProjectId !== props.projectId ||
      requestEndUserId !== props.endUserId
    )
      return;
    correctionTarget.value = null;
    notice.value = "Корректировка записана. Баланс и история обновлены.";
    await load();
    emit("changed");
  } catch (cause) {
    if (requestContextKey === contextKey.value) {
      reauthenticationRequired.value =
        isAllowanceReauthenticationRequired(cause);
      correctionError.value = reauthenticationRequired.value
        ? ""
        : message(cause, "Не удалось выполнить корректировку");
    }
  } finally {
    if (requestContextKey === contextKey.value) correcting.value = false;
  }
}
function correctionFail(value: string): void {
  correctionError.value = value;
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
function uuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value,
  );
}
function entryTypeLabel(value: AiAllowanceJournalEntry["entryType"]): string {
  return (
    {
      PLAN_ALLOCATED: "Начислен периодический лимит",
      GRANT_ALLOCATED: "Начислен дополнительный лимит",
      RESERVED: "Средства зарезервированы",
      RELEASED: "Резерв освобождён",
      SETTLED: "Расход подтверждён",
      UNKNOWN_HELD: "Сумма ожидает уточнения",
      EXPIRED: "Начисление истекло",
      CORRECTION: "Ручная корректировка",
    }[value] ?? value
  );
}
function actorLabel(value: string): string {
  return (
    { SYSTEM: "Система", USER: "Пользователь", CMS_USER: "Сотрудник" }[value] ??
    "Служебный источник"
  );
}
function iso(value: string): string | undefined {
  const result = new Date(value);
  return value && Number.isFinite(result.valueOf())
    ? result.toISOString()
    : undefined;
}
function localTomorrow(): string {
  const value = new Date(Date.now() + 24 * 60 * 60 * 1000);
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function commandKey(): string {
  return (
    globalThis.crypto?.randomUUID?.() ?? `allowance-correction-${Date.now()}`
  );
}
function message(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
function provenance(item: AiAllowanceJournalPage["items"][number]): string {
  return item.usageRecordId
    ? `расход ${item.usageRecordId}`
    : item.reservationId
      ? `резерв ${item.reservationId}`
      : item.grantId
        ? `начисление ${item.grantId}`
        : item.periodId
          ? `расчётный период ${item.periodId}`
          : item.correctsEntryId
            ? `исправляет запись ${item.correctsEntryId}`
            : "—";
}
</script>

<template>
  <section
    class="journal-panel"
    role="tabpanel"
    :aria-labelledby="embedded ? undefined : 'ai-cost-tab-journal'"
    :aria-label="embedded ? 'Журнал AI-квоты пользователя' : undefined"
  >
    <AiAllowanceReconciliationQueue
      v-if="!embedded"
      :project-id="projectId"
      :can-reconcile="canReconcile"
      @fresh-login="emit('fresh-login')"
    />
    <Message v-if="!canRead" severity="warn" :closable="false"
      >У вас нет доступа к истории лимита.</Message
    >
    <template v-else>
      <header>
        <div>
          <h2>История лимита пользователя</h2>
          <p>
            Здесь видно, когда лимит начислялся, резервировался и списывался.
            Суммы показаны с точностью, которую использует система.
          </p>
        </div>
      </header>
      <form v-if="!embedded" class="user-selector" @submit.prevent="select">
        <EndUserSelect
          v-if="canSearchUsers"
          v-model="input"
          :project-id="projectId"
          :disabled="selectingUser"
        />
        <label v-else for="allowance-user-id"
          >ID пользователя в вашем продукте<input
            id="allowance-user-id"
            v-model="input"
            autocomplete="off"
            placeholder="Например: user-123"
            maxlength="160"
        /></label>
        <Button
          label="Открыть историю"
          type="submit"
          :loading="selectingUser"
        />
      </form>
      <Message v-if="canReconcile" severity="warn" :closable="false"
        >Корректировка — служебная операция для исключительных случаев. Она
        всегда привязывается к существующей записи и проверяет, что баланс не
        изменился с момента открытия.</Message
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
      <Message
        v-if="balanceError"
        severity="warn"
        :closable="false"
        role="alert"
        >{{ balanceError }} Корректировки отключены до успешного повторного
        чтения. <Button label="Повторить" text size="small" @click="load"
      /></Message>
      <div
        v-if="loading"
        class="journal-loading"
        role="status"
        aria-label="Загрузка журнала пользователя"
      >
        <Skeleton v-for="index in 7" :key="index" height="44px" />
      </div>
      <div v-else-if="visiblePage?.items.length" class="journal-table">
        <table>
          <caption>
            История изменений лимита пользователя
          </caption>
          <thead>
            <tr>
              <th>Время и операция</th>
              <th>Доступно</th>
              <th>Резерв</th>
              <th>Потрачено</th>
              <th>Уточняется</th>
              <th>Перерасход</th>
              <th class="provenance-cell">Причина и источник</th>
              <th v-if="canReconcile">Действие</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in visiblePage.items" :key="item.id">
              <td>
                <span>{{ entryTypeLabel(item.entryType) }}</span
                ><small
                  >{{ date(item.occurredAt) }} ·
                  {{ allowanceCostQualityLabel(item.costQuality) }}</small
                >
              </td>
              <td>{{ delta(item.deltaAvailableUsd) }}</td>
              <td>{{ delta(item.deltaReservedUsd) }}</td>
              <td>{{ delta(item.deltaSettledUsd) }}</td>
              <td>{{ delta(item.deltaUnknownUsd) }}</td>
              <td>{{ delta(item.deltaOverageUsd) }}</td>
              <td class="provenance-cell">
                <span>{{ item.reason }}</span
                ><small
                  >{{ actorLabel(item.actorType) }}: {{ item.actorId }} ·
                  {{ provenance(item) }}</small
                >
              </td>
              <td v-if="canReconcile">
                <Button
                  label="Корректировать"
                  size="small"
                  outlined
                  severity="warn"
                  :disabled="!balance"
                  @click="openCorrection(item)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else-if="visiblePage" class="empty-state" role="status">
        Записей журнала у этого пользователя пока нет.
      </p>
      <div v-else-if="!endUserId" class="journal-empty">
        <i class="pi pi-user" aria-hidden="true" />
        <h3>Выберите пользователя</h3>
        <p>
          Найдите пользователя по внутреннему ID или откройте историю из таблицы
          пользователей.
        </p>
      </div>
      <footer v-if="visiblePage" class="journal-footer">
        <span>До 50 событий на страницу</span
        ><Button
          label="Следующая страница"
          icon="pi pi-chevron-right"
          icon-pos="right"
          outlined
          :disabled="
            !visiblePage.pageInfo.hasMore || !visiblePage.pageInfo.nextCursor
          "
          @click="emit('nextCursor', visiblePage.pageInfo.nextCursor ?? '')"
        />
      </footer>
    </template>
  </section>

  <Dialog
    :visible="Boolean(correctionTarget)"
    modal
    header="Корректировка лимита AI"
    :style="{ width: 'min(680px, 94vw)' }"
    @update:visible="!$event && (correctionTarget = null)"
  >
    <form class="correction-form" @submit.prevent="submitCorrection">
      <Message severity="warn" :closable="false">
        Новая запись исправит выбранное изменение лимита. Это не денежный
        перевод пользователю.
      </Message>
      <p v-if="correctionTarget">
        Выбрана запись от {{ date(correctionTarget.occurredAt) }}.
      </p>
      <label for="correction-delta">
        Изменение доступного лимита, USD
        <input
          id="correction-delta"
          v-model="correctionDelta"
          inputmode="decimal"
          autocomplete="off"
          placeholder="-1.250000000000 или 1.250000000000"
        />
      </label>
      <label
        v-if="!correctionDelta.trim().startsWith('-')"
        for="correction-expiry"
      >
        Срок действия добавленного лимита
        <input
          id="correction-expiry"
          v-model="correctionExpiresAt"
          type="datetime-local"
        />
      </label>
      <Message v-else severity="info" :closable="false">
        Для уменьшения лимита срок действия не нужен.
      </Message>
      <label for="correction-reason">
        Причина / доказательство
        <textarea
          id="correction-reason"
          v-model="correctionReason"
          rows="4"
          maxlength="500"
        />
      </label>
      <small v-if="correctionError" class="reconcile-error" role="alert">{{
        correctionError
      }}</small>
      <AiAllowanceReauthenticationAction
        :required="reauthenticationRequired"
        @fresh-login="emit('fresh-login')"
      />
      <footer>
        <Button
          label="Отмена"
          text
          type="button"
          :disabled="correcting"
          @click="correctionTarget = null"
        />
        <Button
          label="Записать корректировку"
          severity="warn"
          type="submit"
          :loading="correcting"
        />
      </footer>
    </form>
  </Dialog>
</template>

<style scoped>
.journal-panel,
.journal-loading,
.correction-form {
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
.user-selector {
  display: grid;
  grid-template-columns: minmax(220px, 1fr) auto;
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
caption {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
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
td > span,
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
.correction-form footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.journal-footer {
  color: var(--text-small-muted);
  font-size: 0.7rem;
}
.correction-form label {
  display: grid;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
}
.correction-form input,
.correction-form select,
.correction-form textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
}
.correction-form small {
  color: var(--text-small-muted);
  font-weight: 400;
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
