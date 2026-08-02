<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { formatDecimalMoney } from "@/shared/lib/decimal-money";
import { aiAllowanceRepository } from "../api/ai-allowance-repository";
import type {
  AiAllowanceReconciliationItem,
  AiAllowanceReconciliationPage,
  AiAllowanceReconciliationResolution,
} from "../model/ai-allowance";

const props = defineProps<{
  projectId: string;
  canReconcile: boolean;
}>();

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
}

async function submitResolve(): Promise<void> {
  const item = selected.value;
  if (!item || !props.canReconcile) return fail("Операция больше недоступна.");
  if (reason.value.trim().length < 3 || reason.value.trim().length > 500)
    return fail("Причина должна содержать от 3 до 500 символов.");
  if (!idempotencyKey.value || idempotencyKey.value.length > 128)
    return fail("Некорректный Idempotency-Key.");
  if (!confirmed.value)
    return fail("Подтвердите проверку evidence и выбранного результата.");

  const requestContextKey = contextKey.value;
  const requestProjectId = props.projectId;
  resolving.value = true;
  formError.value = "";
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
    notice.value = "Attempt разрешён. Очередь перечитана с backend.";
    if (cursor.value) cursor.value = "";
    else await load();
  } catch (cause) {
    if (requestContextKey === contextKey.value)
      formError.value = message(cause, "Не удалось разрешить attempt");
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
        <span class="eyebrow">Oldest-first operator queue</span>
        <h2 id="reconciliation-heading">Очередь незавершённых AI attempts</h2>
        <p>
          До 50 записей на страницу. Порядок и keyset cursor задаёт backend.
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
          <option value="RESERVED">RESERVED</option>
          <option value="UNKNOWN_HELD">UNKNOWN_HELD</option>
        </select></label
      >
    </header>

    <Message v-if="!canReconcile" severity="warn" :closable="false">
      Нет права <code>project.ai_allowance.reconcile</code>. Operator queue
      скрыта.
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
            Незавершённые попытки — сначала самые старые
          </caption>
          <thead>
            <tr>
              <th>Создан / статус</th>
              <th>Пользователь / категория</th>
              <th>Резерв / unknown</th>
              <th>Evidence</th>
              <th>Действие</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="item in visiblePage.items" :key="item.id">
              <td>
                <strong>{{ date(item.reservedAt) }}</strong
                ><small>{{ item.status }}</small>
              </td>
              <td>
                <strong>{{ item.endUserId }}</strong
                ><small>{{ item.category }}</small>
              </td>
              <td>
                <strong>{{ money(item.reservedUsd) }}</strong>
                <small>unknown {{ money(item.unknownHeldUsd) }}</small>
              </td>
              <td>
                <strong>{{
                  item.outcomeReason ?? "Нет outcome reason"
                }}</strong>
                <small
                  >{{ item.costQuality }} · {{ item.modelAttemptId }}</small
                >
              </td>
              <td>
                <Button
                  label="Разрешить"
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
        В выбранном статусе незавершённых attempts нет.
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
    header="Разрешить AI attempt"
    :style="{ width: 'min(680px, 94vw)' }"
    @update:visible="!$event && (selected = null)"
  >
    <form class="resolve-form" @submit.prevent="submitResolve">
      <Message severity="warn" :closable="false">
        Audited break-glass операция изменит allowance ledger. Attempt
        выбирается только из server-side очереди.
      </Message>
      <p v-if="selected">
        <strong>{{ selected.modelAttemptId }}</strong> ·
        {{ selected.endUserId }}
      </p>
      <label for="attempt-resolution"
        >Результат
        <select id="attempt-resolution" v-model="resolution">
          <option value="SETTLE_FROM_USAGE">
            Списать по terminal AI Usage
          </option>
          <option value="HOLD_UNKNOWN">Оставить в unknown hold</option>
          <option value="RELEASE_PROVEN_NON_BILLABLE">
            Освободить non-billable резерв
          </option>
        </select></label
      >
      <label for="attempt-reason"
        >Причина / evidence
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
            ? "Подтверждаю доказанный non-billable результат"
            : "Подтверждаю проверку usage и provider evidence"
        }}
      </label>
      <label for="attempt-idempotency"
        >Idempotency-Key
        <input id="attempt-idempotency" :value="idempotencyKey" readonly />
      </label>
      <small v-if="formError" class="form-error" role="alert">{{
        formError
      }}</small>
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
.eyebrow {
  color: var(--text-small-muted);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
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
td strong,
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
