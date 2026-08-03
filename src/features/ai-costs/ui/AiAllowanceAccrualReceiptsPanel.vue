<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import { formatDecimalMoney } from "@/shared/lib/decimal-money";
import { aiAllowanceAccrualRepository } from "../api/ai-allowance-accrual-repository";
import type { AiAllowanceAccrualReceiptPage } from "../model/ai-allowance-accrual";

const props = defineProps<{ projectId: string }>();
const page = ref<AiAllowanceAccrualReceiptPage | null>(null);
const endUserId = ref("");
const status = ref<"" | "GRANTED" | "REJECTED">("");
const loading = ref(false);
const loadingMore = ref(false);
const error = ref("");
let generation = 0;

watch(
  () => props.projectId,
  () => {
    generation += 1;
    page.value = null;
    loadingMore.value = false;
    void load();
  },
  { immediate: true },
);
async function load(): Promise<void> {
  const current = ++generation;
  const projectId = props.projectId;
  loading.value = true;
  error.value = "";
  try {
    const next = await aiAllowanceAccrualRepository.listReceipts(
      projectId,
      query(),
    );
    if (current === generation && projectId === props.projectId)
      page.value = next;
  } catch (cause) {
    if (current === generation)
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить историю начислений";
  } finally {
    if (current === generation) loading.value = false;
  }
}
async function loadMore(): Promise<void> {
  const currentPage = page.value;
  const cursor = currentPage?.pageInfo.nextCursor;
  if (!cursor || loadingMore.value) return;
  const requestGeneration = generation;
  const projectId = props.projectId;
  loadingMore.value = true;
  try {
    const next = await aiAllowanceAccrualRepository.listReceipts(projectId, {
      ...query(),
      cursor,
    });
    if (
      requestGeneration === generation &&
      projectId === props.projectId &&
      page.value === currentPage
    )
      page.value = {
        items: [...currentPage.items, ...next.items],
        pageInfo: next.pageInfo,
      };
  } catch (cause) {
    if (requestGeneration === generation && projectId === props.projectId)
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить остальные начисления";
  } finally {
    if (requestGeneration === generation && projectId === props.projectId)
      loadingMore.value = false;
  }
}
function query() {
  return {
    limit: 50,
    ...(endUserId.value.trim() ? { endUserId: endUserId.value.trim() } : {}),
    ...(status.value ? { status: status.value } : {}),
  };
}
function date(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "short",
    timeStyle: "medium",
  }).format(new Date(value));
}
function statusLabel(value: "GRANTED" | "REJECTED"): string {
  return value === "GRANTED" ? "Начислено" : "Отклонено";
}
function sourceLabel(
  value: "SERVER" | "FRONTEND" | "INTERNAL" | "INTEGRATION",
): string {
  return {
    SERVER: "Сервер",
    FRONTEND: "Интерфейс",
    INTERNAL: "Внутренняя операция",
    INTEGRATION: "Интеграция",
  }[value];
}
</script>

<template>
  <section class="receipts card">
    <header>
      <div>
        <h3>История автоматических начислений</h3>
        <p>
          Показывает, какое правило сработало, по какому событию и какой лимит
          получил пользователь.
        </p>
      </div>
    </header>
    <form @submit.prevent="load">
      <label
        >ID пользователя<input
          v-model="endUserId"
          maxlength="160"
          placeholder="Оставьте пустым, чтобы показать всех" /></label
      ><label
        >Результат<select v-model="status">
          <option value="">Все результаты</option>
          <option value="GRANTED">Начислено</option>
          <option value="REJECTED">Отклонено</option>
        </select></label
      ><Button label="Показать" type="submit" outlined />
    </form>
    <Skeleton v-if="loading && !page" height="100px" />
    <Message v-if="error" severity="error" :closable="false">{{
      error
    }}</Message>
    <div v-if="page?.items.length" class="table">
      <table>
        <thead>
          <tr>
            <th>Время / пользователь</th>
            <th>Правило</th>
            <th>Событие</th>
            <th>Результат</th>
            <th>Сумма</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="item in page.items" :key="item.id">
            <td>
              <strong>{{ date(item.evaluatedAt) }}</strong
              ><small>{{ item.endUserId }}</small>
            </td>
            <td>
              <strong>{{ item.ruleRevision.rule.name }}</strong
              ><small
                >{{ item.ruleRevision.rule.key }} · версия
                {{ item.ruleRevision.revisionNumber }}</small
              >
            </td>
            <td>
              <strong>{{ item.eventLog.eventDefinitionKey.name }}</strong
              ><small
                >{{ item.eventLog.eventDefinitionKey.code }} ·
                {{ sourceLabel(item.eventLog.source) }} ·
                {{ item.eventLog.id }}</small
              >
            </td>
            <td>
              <strong
                :class="item.status === 'REJECTED' ? 'rejected' : 'granted'"
                >{{ statusLabel(item.status) }}</strong
              ><small>{{
                item.rejectionReason ??
                `Начисление ${item.grantId ?? "создано"}`
              }}</small>
            </td>
            <td>{{ formatDecimalMoney(item.rewardUsd, "USD") }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else-if="page && !loading">По выбранным фильтрам начислений нет.</p>
    <Button
      v-if="page?.pageInfo.hasMore"
      label="Показать ещё"
      outlined
      :loading="loadingMore"
      @click="loadMore"
    />
  </section>
</template>

<style scoped>
.receipts {
  display: grid;
  gap: 20px;
  padding: 24px;
}
.receipts h3,
.receipts p {
  margin: 0;
}
.receipts h3 {
  font-weight: 600;
}
.receipts header p,
.receipts > p,
small {
  color: var(--text-small-muted);
}
.receipts header p {
  max-width: 760px;
  margin-top: 6px;
  line-height: 1.45;
}
form {
  display: flex;
  align-items: end;
  gap: 10px;
  flex-wrap: wrap;
}
label {
  display: grid;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 400;
}
input,
select {
  box-sizing: border-box;
  min-width: 210px;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font-family: inherit;
  font-size: 0.875rem;
  font-weight: 400;
}
form :deep(.p-button) {
  min-height: 44px;
  background: var(--surface-card);
}
.table {
  overflow-x: auto;
  border: 1px solid var(--border-default);
  border-radius: 12px;
}
table {
  width: 100%;
  min-width: 900px;
  border-collapse: collapse;
}
th,
td {
  padding: 10px;
  border-bottom: 1px solid var(--border-subtle);
  text-align: left;
  font-size: 0.7rem;
  vertical-align: top;
}
th {
  color: var(--text-small-muted);
  font-size: 0.62rem;
  text-transform: uppercase;
}
td strong,
td small {
  display: block;
}
td small {
  margin-top: 4px;
}
.granted {
  color: var(--status-success-text);
}
.rejected {
  color: var(--status-danger-text);
}
@media (max-width: 560px) {
  .receipts {
    padding: 18px;
  }
  form,
  form label,
  form :deep(.p-button) {
    width: 100%;
  }
  input,
  select {
    min-width: 0;
    width: 100%;
  }
}
</style>
