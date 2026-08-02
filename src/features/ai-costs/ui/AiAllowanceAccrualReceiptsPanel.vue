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
          : "Не удалось загрузить receipts";
  } finally {
    if (current === generation) loading.value = false;
  }
}
async function loadMore(): Promise<void> {
  const cursor = page.value?.pageInfo.nextCursor;
  if (!cursor || loadingMore.value) return;
  const projectId = props.projectId;
  loadingMore.value = true;
  try {
    const next = await aiAllowanceAccrualRepository.listReceipts(projectId, {
      ...query(),
      cursor,
    });
    if (projectId === props.projectId && page.value)
      page.value = {
        items: [...page.value.items, ...next.items],
        pageInfo: next.pageInfo,
      };
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить остальные receipts";
  } finally {
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
</script>

<template>
  <section class="receipts card">
    <header>
      <div>
        <h3>Receipts начислений</h3>
        <p>
          Решение правила, событие-источник и созданный grant для аудита
          лояльности.
        </p>
      </div>
    </header>
    <form @submit.prevent="load">
      <label>End User ID<input v-model="endUserId" maxlength="160" /></label
      ><label
        >Результат<select v-model="status">
          <option value="">Все</option>
          <option value="GRANTED">GRANTED</option>
          <option value="REJECTED">REJECTED</option>
        </select></label
      ><Button label="Применить" type="submit" outlined />
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
            <th>Квота</th>
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
                >{{ item.ruleRevision.rule.key }} · rev
                {{ item.ruleRevision.revisionNumber }}</small
              >
            </td>
            <td>
              <strong>{{ item.eventLog.eventDefinitionKey.name }}</strong
              ><small
                >{{ item.eventLog.eventDefinitionKey.code }} ·
                {{ item.eventLog.source }} · {{ item.eventLog.id }}</small
              >
            </td>
            <td>
              <strong
                :class="item.status === 'REJECTED' ? 'rejected' : 'granted'"
                >{{ item.status }}</strong
              ><small>{{
                item.rejectionReason ?? `grant ${item.grantId}`
              }}</small>
            </td>
            <td>{{ formatDecimalMoney(item.rewardUsd, "USD") }}</td>
          </tr>
        </tbody>
      </table>
    </div>
    <p v-else-if="page && !loading">
      Receipts по выбранному фильтру отсутствуют.
    </p>
    <Button
      v-if="page?.pageInfo.hasMore"
      label="Показать остальные receipts"
      outlined
      :loading="loadingMore"
      @click="loadMore"
    />
  </section>
</template>

<style scoped>
.receipts {
  display: grid;
  gap: 14px;
  padding: 20px;
}
.receipts h3,
.receipts p {
  margin: 0;
}
.receipts header p,
.receipts > p,
small {
  color: var(--text-small-muted);
}
form {
  display: flex;
  align-items: end;
  gap: 10px;
  flex-wrap: wrap;
}
label {
  display: grid;
  gap: 5px;
  font-size: 0.72rem;
  font-weight: 700;
}
input,
select {
  min-width: 210px;
  padding: 9px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--text-primary);
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
</style>
