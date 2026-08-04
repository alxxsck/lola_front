<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { formatDecimalMoney } from "@/shared/lib/decimal-money";
import { aiAllowanceRepository } from "../api/ai-allowance-repository";
import {
  allowanceCategoryLabel,
  allowanceCostQualityLabel,
} from "../model/ai-allowance-presentation";
import { isAllowanceReauthenticationRequired } from "../model/allowance-reauthentication";
import AiAllowanceReauthenticationAction from "./AiAllowanceReauthenticationAction.vue";
import type {
  AiAllowanceReconciliationItem,
  AiAllowanceReconciliationPage,
  AiAllowanceReconciliationResolution,
} from "../model/ai-allowance";

const props = defineProps<{
  projectId: string;
  canReconcile: boolean;
}>();
const emit = defineEmits<{ "fresh-login": [] }>();

const status = ref<"" | "RESERVED" | "UNKNOWN_HELD">("");
const cursor = ref("");
const page = ref<AiAllowanceReconciliationPage | null>(null);
const loadedContextKey = ref("");
const loading = ref(false);
const error = ref("");
const notice = ref("");
const selected = ref<AiAllowanceReconciliationItem | null>(null);
const resolution =
  ref<AiAllowanceReconciliationResolution>("SETTLE_FROM_USAGE");
const reason = ref("");
const idempotencyKey = ref("");
const confirmed = ref(false);
const formError = ref("");
const resolving = ref(false);
const reauthenticationRequired = ref(false);
let generation = 0;

const contextKey = computed(() =>
  JSON.stringify([
    props.canReconcile,
    props.projectId,
    status.value,
    cursor.value,
  ]),
);
const visiblePage = computed(() =>
  loadedContextKey.value === contextKey.value ? page.value : null,
);

watch(
  () => props.projectId,
  () => {
    cursor.value = "";
    selected.value = null;
    resolving.value = false;
    notice.value = "";
    reauthenticationRequired.value = false;
  },
);
watch(
  contextKey,
  () => {
    invalidate();
    if (props.canReconcile && props.projectId) void load();
  },
  { immediate: true },
);

async function load(): Promise<void> {
  const requestGeneration = ++generation;
  const requestContextKey = contextKey.value;
  const requestProjectId = props.projectId;
  loading.value = true;
  error.value = "";
  page.value = null;
  loadedContextKey.value = "";
  try {
    const next = await aiAllowanceRepository.reconciliationQueue(
      requestProjectId,
      {
        limit: 50,
        ...(cursor.value ? { cursor: cursor.value } : {}),
        ...(status.value ? { status: status.value } : {}),
      },
    );
    if (
      requestGeneration === generation &&
      requestContextKey === contextKey.value &&
      requestProjectId === props.projectId &&
      props.canReconcile
    ) {
      page.value = next;
      loadedContextKey.value = requestContextKey;
    }
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestContextKey === contextKey.value
    )
      error.value = message(cause, "Не удалось загрузить очередь сверки");
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

function invalidate(): void {
  generation += 1;
  page.value = null;
  loadedContextKey.value = "";
  loading.value = false;
  error.value = "";
  selected.value = null;
  resolving.value = false;
}

function resetPagination(): void {
  cursor.value = "";
}

function nextPage(): void {
  const next = visiblePage.value?.pageInfo.nextCursor;
  if (next) cursor.value = next;
}

function openResolve(item: AiAllowanceReconciliationItem): void {
  if (!props.canReconcile || loadedContextKey.value !== contextKey.value)
    return;
  selected.value = item;
  resolution.value = "SETTLE_FROM_USAGE";
  reason.value = "";
  idempotencyKey.value = commandKey();
  confirmed.value = false;
  formError.value = "";
  reauthenticationRequired.value = false;
}

async function submitResolve(): Promise<void> {
  const item = selected.value;
  if (!item || !props.canReconcile) return fail("Операция больше недоступна.");
  if (reason.value.trim().length < 3 || reason.value.trim().length > 500)
    return fail("Причина должна содержать от 3 до 500 символов.");
  if (!idempotencyKey.value || idempotencyKey.value.length > 128)
    return fail("Некорректный ключ защиты от повторной отправки.");
  if (!confirmed.value)
    return fail("Подтвердите проверку данных и выбранного результата.");

  const requestContextKey = contextKey.value;
  const requestProjectId = props.projectId;
  resolving.value = true;
  formError.value = "";
  reauthenticationRequired.value = false;
  notice.value = "";
  try {
    await aiAllowanceRepository.resolveAttempt(
      requestProjectId,
      item.modelAttemptId,
      { resolution: resolution.value, reason: reason.value.trim() },
      idempotencyKey.value,
    );
    if (
      requestContextKey !== contextKey.value ||
      requestProjectId !== props.projectId
    )
      return;
    selected.value = null;
    notice.value = "Операция завершена. Очередь обновлена.";
    if (cursor.value) cursor.value = "";
    else await load();
  } catch (cause) {
    if (requestContextKey === contextKey.value) {
      reauthenticationRequired.value =
        isAllowanceReauthenticationRequired(cause);
      formError.value = reauthenticationRequired.value
        ? ""
        : message(cause, "Не удалось завершить операцию");
    }
  } finally {
    if (requestContextKey === contextKey.value) resolving.value = false;
  }
}

function fail(value: string): void {
  formError.value = value;
}

function money(value: AiAllowanceReconciliationItem["reservedUsd"]): string {
  return formatDecimalMoney(value, "USD");
}

function date(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value));
}

function statusLabel(value: AiAllowanceReconciliationItem["status"]): string {
  return value === "RESERVED"
    ? "Средства зарезервированы"
    : "Сумма ожидает уточнения";
}

function commandKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `attempt-resolve-${Date.now()}`;
}

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
</script>

<template>
  <section
    class="reconciliation-queue"
    aria-labelledby="reconciliation-heading"
  >
    <header>
      <div>
        <h2 id="reconciliation-heading">Незавершённые операции AI</h2>
        <p>
          Здесь собраны операции, для которых итоговое списание ещё не
          определено. Сначала показаны самые старые.
        </p>
      </div>
      <label for="reconciliation-status"
        >Статус
        <select
          id="reconciliation-status"
          v-model="status"
          :disabled="!canReconcile || loading"
          @change="resetPagination"
        >
          <option value="">Все незавершённые</option>
          <option value="RESERVED">Средства зарезервированы</option>
          <option value="UNKNOWN_HELD">Сумма ожидает уточнения</option>
        </select></label
      >
    </header>

    <Message v-if="!canReconcile" severity="warn" :closable="false">
      Нет доступа к сверке незавершённых операций.
    </Message>
    <template v-else>
      <Message
        v-if="notice"
        severity="success"
        :closable="false"
        aria-live="polite"
        >{{ notice }}</Message
      >
      <Message v-if="error" severity="error" :closable="false" role="alert">
        {{ error }} <Button label="Повторить" text size="small" @click="load" />
      </Message>
      <div
        v-if="loading"
        class="queue-loading"
        role="status"
        aria-label="Загрузка очереди"
      >
        <Skeleton v-for="index in 4" :key="index" height="52px" />
      </div>
      <div v-else-if="visiblePage?.items.length" class="queue-table">
        <table>
          <caption>
            Незавершённые операции — сначала самые старые
          </caption>
          <thead>
            <tr>
              <th>Создана и статус</th>
              <th>Пользователь и категория</th>
              <th>Зарезервировано и уточняется</th>
              <th>Основание</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in visiblePage.items" :key="item.id">
              <td>
                <span>{{ date(item.reservedAt) }}</span
                ><small>{{ statusLabel(item.status) }}</small>
              </td>
              <td>
                <span>{{ item.endUserId }}</span
                ><small>{{ allowanceCategoryLabel(item.category) }}</small>
              </td>
              <td>
                <span>{{ money(item.reservedUsd) }}</span>
                <small>уточняется {{ money(item.unknownHeldUsd) }}</small>
              </td>
              <td>
                <span>{{
                  item.outcomeReason ?? "Причина пока не указана"
                }}</span>
                <small>{{ allowanceCostQualityLabel(item.costQuality) }}</small>
              </td>
              <td>
                <Button
                  label="Завершить"
                  size="small"
                  severity="warn"
                  @click="openResolve(item)"
                />
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <p v-else-if="visiblePage" class="empty-state" role="status">
        В выбранном статусе незавершённых операций нет.
      </p>
      <footer v-if="visiblePage" class="queue-footer">
        <Button
          v-if="cursor"
          label="К началу"
          text
          :disabled="loading"
          @click="cursor = ''"
        />
        <span />
        <Button
          label="Следующие 50"
          icon="pi pi-chevron-right"
          icon-pos="right"
          outlined
          :disabled="
            !visiblePage.pageInfo.hasMore ||
            !visiblePage.pageInfo.nextCursor ||
            loading
          "
          @click="nextPage"
        />
      </footer>
    </template>
  </section>

  <Dialog
    :visible="Boolean(selected)"
    modal
    header="Завершить операцию AI"
    :style="{ width: 'min(680px, 94vw)' }"
    @update:visible="!$event && (selected = null)"
  >
    <form class="resolve-form" @submit.prevent="submitResolve">
      <Message severity="warn" :closable="false">
        Служебная операция изменит баланс пользователя. Завершить можно только
        операцию из этой очереди.
      </Message>
      <p v-if="selected">Пользователь: {{ selected.endUserId }}</p>
      <label for="attempt-resolution"
        >Результат
        <select id="attempt-resolution" v-model="resolution">
          <option value="SETTLE_FROM_USAGE">
            Списать подтверждённую стоимость
          </option>
          <option value="HOLD_UNKNOWN">Оставить сумму на уточнении</option>
          <option value="RELEASE_PROVEN_NON_BILLABLE">
            Освободить резерв без списания
          </option>
        </select></label
      >
      <label for="attempt-reason"
        >Причина и подтверждающие данные
        <textarea
          id="attempt-reason"
          v-model="reason"
          rows="4"
          maxlength="500"
        />
      </label>
      <label class="confirmation">
        <input v-model="confirmed" type="checkbox" />
        {{
          resolution === "RELEASE_PROVEN_NON_BILLABLE"
            ? "Подтверждаю, что списание не требуется"
            : "Подтверждаю проверку данных об использовании и стоимости"
        }}
      </label>
      <small v-if="formError" class="form-error" role="alert">{{
        formError
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
          :disabled="resolving"
          @click="selected = null"
        />
        <Button
          label="Подтвердить результат"
          severity="warn"
          type="submit"
          :loading="resolving"
        />
      </footer>
    </form>
  </Dialog>
</template>

<style scoped>
.reconciliation-queue,
.queue-loading,
.resolve-form {
  display: grid;
  gap: 14px;
}
.reconciliation-queue {
  padding: 16px;
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: var(--surface-card);
}
.reconciliation-queue > header,
.queue-footer,
.resolve-form footer {
  display: flex;
  align-items: end;
  justify-content: space-between;
  gap: 16px;
}
h2,
p {
  margin: 4px 0;
}
label {
  display: grid;
  gap: 6px;
  font-weight: 700;
}
select,
input,
textarea {
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-primary);
}
.queue-table {
  overflow-x: auto;
}
table {
  width: 100%;
  min-width: 880px;
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
  padding: 10px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
  vertical-align: top;
}
td > span,
td small {
  display: block;
}
td small {
  margin-top: 4px;
  color: var(--text-small-muted);
}
.confirmation {
  grid-template-columns: auto 1fr;
  align-items: center;
}
.form-error {
  color: var(--status-error);
}
@media (max-width: 700px) {
  .reconciliation-queue > header,
  .queue-footer,
  .resolve-form footer {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
