<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import {
  compareDecimalStrings,
  formatDecimalMoney,
  type DecimalString,
} from "@/shared/lib/decimal-money";
import { aiAllowanceRepository } from "../api/ai-allowance-repository";
import {
  parseAllowanceUsd,
  type AiAllowancePlan,
  type AiAllowanceUserBalance,
} from "../model/ai-allowance";

const props = defineProps<{
  visible: boolean;
  projectId: string;
  endUserId: string;
  identity: string;
  plans?: AiAllowancePlan[];
  canGrant: boolean;
  canManage: boolean;
  canReconcile: boolean;
}>();
const emit = defineEmits<{
  "update:visible": [value: boolean];
  openJournal: [endUserId: string];
}>();
const balance = ref<AiAllowanceUserBalance | null>(null);
const loadedContext = ref("");
const grantsLoading = ref(false);
const loading = ref(false);
const mutationLoading = ref(false);
const error = ref("");
const formError = ref("");
const mode = ref<"summary" | "grant" | "assignment">("summary");
const amount = ref("");
const validFrom = ref("");
const expiresAt = ref("");
const reason = ref("");
const idempotencyKey = ref("");
const planId = ref("");
const effectiveFrom = ref("");
const effectiveUntil = ref("");
const loadedPlans = ref<AiAllowancePlan[]>([]);
let generation = 0;
const activePlans = computed(() =>
  (props.plans?.length ? props.plans : loadedPlans.value).filter(
    (plan) => plan.status === "ACTIVE",
  ),
);

watch(
  () => [props.visible, props.projectId, props.endUserId] as const,
  ([visible]) => {
    generation += 1;
    balance.value = null;
    loadedContext.value = "";
    grantsLoading.value = false;
    mutationLoading.value = false;
    formError.value = "";
    if (visible && props.endUserId) {
      mode.value = "summary";
      void load();
    }
  },
  { immediate: true },
);
watch(
  () => [props.canGrant, props.canManage] as const,
  ([canGrant, canManage]) => {
    if (
      (mode.value === "grant" && !canGrant) ||
      (mode.value === "assignment" && !canManage)
    ) {
      generation += 1;
      mutationLoading.value = false;
      formError.value = "";
      mode.value = "summary";
    }
  },
);
async function load(): Promise<void> {
  const requestGeneration = ++generation;
  const requestProjectId = props.projectId;
  const requestEndUserId = props.endUserId;
  loading.value = true;
  error.value = "";
  try {
    const [nextBalance, projectPolicy] = await Promise.all([
      aiAllowanceRepository.endUserBalance(requestProjectId, requestEndUserId, {
        grantLimit: 50,
      }),
      props.plans?.length
        ? Promise.resolve(null)
        : aiAllowanceRepository.projectPolicy(requestProjectId),
    ]);
    if (
      requestGeneration !== generation ||
      requestProjectId !== props.projectId ||
      requestEndUserId !== props.endUserId ||
      nextBalance.account.projectId !== requestProjectId ||
      nextBalance.account.endUserId !== requestEndUserId
    )
      return;
    balance.value = nextBalance;
    loadedContext.value = `${requestProjectId}:${requestEndUserId}`;
    if (projectPolicy) loadedPlans.value = projectPolicy.plans;
  } catch (cause) {
    if (requestGeneration === generation)
      error.value = text(cause, "Не удалось загрузить баланс пользователя");
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}
async function loadMoreGrants(): Promise<void> {
  const current = balance.value;
  const cursor = current?.grantsPageInfo.nextCursor;
  if (
    !current ||
    !cursor ||
    grantsLoading.value ||
    loadedContext.value !== `${props.projectId}:${props.endUserId}`
  )
    return;
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  const requestEndUserId = props.endUserId;
  grantsLoading.value = true;
  try {
    const next = await aiAllowanceRepository.endUserBalance(
      requestProjectId,
      requestEndUserId,
      { grantLimit: 50, grantCursor: cursor },
    );
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId &&
      loadedContext.value === `${requestProjectId}:${requestEndUserId}` &&
      balance.value === current
    ) {
      balance.value = {
        ...current,
        activeGrants: [...current.activeGrants, ...next.activeGrants],
        grantsPageInfo: next.grantsPageInfo,
      };
    }
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId
    )
      error.value = text(cause, "Не удалось загрузить остальные начисления");
  } finally {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId
    )
      grantsLoading.value = false;
  }
}
function close(): void {
  emit("update:visible", false);
}
function beginGrant(): void {
  if (!props.canGrant) return;
  if (loadedContext.value !== `${props.projectId}:${props.endUserId}`) return;
  mode.value = "grant";
  amount.value = "";
  validFrom.value = localNow();
  expiresAt.value = localTomorrow();
  reason.value = "";
  idempotencyKey.value = key();
  formError.value = "";
}
function beginAssignment(): void {
  if (!props.canManage) return;
  if (loadedContext.value !== `${props.projectId}:${props.endUserId}`) return;
  mode.value = "assignment";
  planId.value =
    balance.value?.endUserAssignment?.planId ?? activePlans.value[0]?.id ?? "";
  effectiveFrom.value = localNow();
  effectiveUntil.value = "";
  reason.value = "";
  idempotencyKey.value = key();
  formError.value = "";
}
async function submitGrant(): Promise<void> {
  if (!props.canGrant) return fail("Операция больше недоступна.");
  const exact = parseAllowanceUsd(amount.value.trim());
  const from = iso(validFrom.value);
  const until = iso(expiresAt.value);
  if (!exact || compareDecimalStrings(exact, "0") <= 0)
    return fail("Сумма должна быть положительной decimal-строкой.");
  if (!from || !until || from >= until)
    return fail("Дата окончания должна быть позже даты начала.");
  if (!validCommon()) return;
  await mutate(() =>
    aiAllowanceRepository.createGrant(
      props.projectId,
      props.endUserId,
      {
        amountUsd: exact,
        validFrom: from,
        expiresAt: until,
        reason: reason.value.trim(),
      },
      idempotencyKey.value.trim(),
    ),
  );
}
async function submitAssignment(): Promise<void> {
  if (!props.canManage) return fail("Операция больше недоступна.");
  const from = iso(effectiveFrom.value);
  const until = effectiveUntil.value ? iso(effectiveUntil.value) : undefined;
  if (
    !planId.value ||
    !activePlans.value.some((plan) => plan.id === planId.value)
  )
    return fail("Выберите активный план.");
  if (!from || (effectiveUntil.value && (!until || from >= until)))
    return fail("Проверьте срок назначения.");
  if (!validCommon()) return;
  await mutate(() =>
    aiAllowanceRepository.putEndUserAssignment(
      props.projectId,
      props.endUserId,
      {
        planId: planId.value,
        effectiveFrom: from,
        ...(until ? { effectiveUntil: until } : {}),
        reason: reason.value.trim(),
      },
      idempotencyKey.value.trim(),
    ),
  );
}
function validCommon(): boolean {
  if (reason.value.trim().length < 3 || reason.value.trim().length > 500) {
    fail("Причина должна содержать от 3 до 500 символов.");
    return false;
  }
  if (!idempotencyKey.value.trim() || idempotencyKey.value.length > 128) {
    fail("Укажите Idempotency-Key длиной до 128 символов.");
    return false;
  }
  return true;
}
async function mutate(action: () => Promise<unknown>): Promise<void> {
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  const requestEndUserId = props.endUserId;
  mutationLoading.value = true;
  formError.value = "";
  try {
    await action();
    if (
      requestGeneration !== generation ||
      requestProjectId !== props.projectId ||
      requestEndUserId !== props.endUserId
    )
      return;
    mode.value = "summary";
    await load();
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId
    )
      formError.value = text(cause, "Операция не выполнена");
  } finally {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId
    )
      mutationLoading.value = false;
  }
}
function fail(value: string): void {
  formError.value = value;
}
function money(value: DecimalString): string {
  return formatDecimalMoney(value, "USD");
}
function nonZero(value: DecimalString | undefined): boolean {
  return Boolean(value && compareDecimalStrings(value, "0") !== 0);
}
function date(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}
function iso(value: string): string | undefined {
  const result = new Date(value);
  return value && Number.isFinite(result.valueOf())
    ? result.toISOString()
    : undefined;
}
function localNow(): string {
  return localInput(new Date());
}
function localTomorrow(): string {
  return localInput(new Date(Date.now() + 24 * 60 * 60 * 1000));
}
function localInput(value: Date): string {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}
function key(): string {
  return globalThis.crypto?.randomUUID?.() ?? `allowance-${Date.now()}`;
}
function text(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    :header="`AI-квота · ${identity}`"
    :style="{ width: 'min(820px, 96vw)' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="user-allowance">
      <Message severity="info" :closable="false"
        >Это внутренняя квота потребления AI в USD, не денежный кошелёк
        пользователя.</Message
      >
      <div v-if="loading && !balance" class="loading">
        <Skeleton v-for="index in 3" :key="index" height="80px" />
      </div>
      <Message v-if="error" severity="error" :closable="false"
        >{{ error }} <Button label="Повторить" text size="small" @click="load"
      /></Message>
      <template v-if="balance && mode === 'summary'">
        <div class="balance-grid">
          <article>
            <small>Доступно сейчас</small
            ><strong>{{ money(balance.account.availableUsd) }}</strong
            ><span v-if="nonZero(balance.pendingBaseAllocationUsd)"
              >включая ожидаемые
              {{ money(balance.pendingBaseAllocationUsd ?? "0") }}</span
            >
          </article>
          <article>
            <small>Текущий период: резерв</small
            ><strong>{{
              money(balance.currentPeriodSpend?.reservedUsd ?? "0")
            }}</strong>
          </article>
          <article>
            <small>Текущий период: settled</small
            ><strong>{{
              money(balance.currentPeriodSpend?.settledUsd ?? "0")
            }}</strong>
          </article>
          <article>
            <small>За всё время: settled</small
            ><strong>{{ money(balance.account.settledUsd) }}</strong>
          </article>
          <article>
            <small>Текущий период: unknown / overage</small
            ><strong
              >{{ money(balance.currentPeriodSpend?.unknownHeldUsd ?? "0") }} /
              {{ money(balance.currentPeriodSpend?.overageUsd ?? "0") }}</strong
            >
          </article>
          <article>
            <small>За всё время: unknown / overage</small
            ><strong
              >{{ money(balance.account.unknownHeldUsd) }} /
              {{ money(balance.account.overageUsd) }}</strong
            >
          </article>
        </div>
        <section class="details">
          <h3>Текущий период</h3>
          <p v-if="balance.currentPeriod">
            <strong>{{ money(balance.currentPeriod.baseAllocatedUsd) }}</strong>
            · {{ balance.currentPeriod.kind }} · до
            {{ date(balance.currentPeriod.endsAt) }}
            <span>{{ balance.currentPeriod.status }}</span>
          </p>
          <p v-else>
            Период ещё не создан. При первом применении будет начислено
            {{ money(balance.pendingBaseAllocationUsd ?? "0") }}.
          </p>
        </section>
        <section class="details">
          <h3>Персональное назначение</h3>
          <p v-if="balance.endUserAssignment">
            {{
              balance.endUserAssignment.plan?.name ??
              balance.endUserAssignment.planId
            }}
            · с {{ date(balance.endUserAssignment.effectiveFrom) }}
          </p>
          <p v-else>Используется проектный план по умолчанию.</p>
        </section>
        <section class="details">
          <h3>Активные начисления</h3>
          <div v-if="balance.activeGrants.length" class="grants">
            <article v-for="grant in balance.activeGrants" :key="grant.id">
              <strong>{{ money(grant.amountUsd) }}</strong
              ><span>{{ grant.reason }} · до {{ date(grant.expiresAt) }}</span>
            </article>
          </div>
          <p v-else>Активных дополнительных начислений нет.</p>
          <Button
            v-if="balance.grantsPageInfo.hasMore"
            label="Показать остальные начисления"
            outlined
            size="small"
            :loading="grantsLoading"
            @click="loadMoreGrants"
          />
        </section>
        <footer>
          <Button
            label="Журнал пользователя"
            outlined
            icon="pi pi-list"
            @click="emit('openJournal', endUserId)"
          />
          <Button
            v-if="canReconcile"
            label="Корректировать по журналу"
            severity="warn"
            outlined
            icon="pi pi-wrench"
            @click="emit('openJournal', endUserId)"
          /><span /><Button
            v-if="canManage"
            label="Назначить план"
            outlined
            @click="beginAssignment"
          /><Button
            v-if="canGrant"
            label="Начислить квоту"
            icon="pi pi-plus"
            @click="beginGrant"
          />
        </footer>
      </template>
      <form
        v-else-if="mode === 'grant'"
        class="mutation-form"
        @submit.prevent="submitGrant"
      >
        <h3>Ручное начисление</h3>
        <label
          >Сумма, USD<input
            v-model="amount"
            inputmode="decimal"
            autocomplete="off"
        /></label>
        <div class="form-row">
          <label
            >Действует с<input
              v-model="validFrom"
              type="datetime-local" /></label
          ><label
            >Истекает<input v-model="expiresAt" type="datetime-local"
          /></label>
        </div>
        <label
          >Причина<textarea v-model="reason" rows="3" maxlength="500" /></label
        ><label
          >Idempotency-Key<input
            v-model="idempotencyKey"
            maxlength="128"
            autocomplete="off"
          /><small>Не меняйте ключ при повторе того же запроса.</small></label
        ><small v-if="formError" class="error" role="alert">{{
          formError
        }}</small>
        <footer>
          <Button
            label="Назад"
            text
            type="button"
            :disabled="mutationLoading"
            @click="mode = 'summary'"
          /><Button
            label="Начислить"
            type="submit"
            :loading="mutationLoading"
          />
        </footer>
      </form>
      <form
        v-else-if="mode === 'assignment'"
        class="mutation-form"
        @submit.prevent="submitAssignment"
      >
        <h3>Персональный план</h3>
        <Message v-if="!activePlans.length" severity="warn" :closable="false"
          >В проекте нет активных планов для назначения.</Message
        ><label
          >План<select v-model="planId">
            <option value="" disabled>Выберите план</option>
            <option v-for="plan in activePlans" :key="plan.id" :value="plan.id">
              {{ plan.name }}
            </option>
          </select></label
        >
        <div class="form-row">
          <label
            >Действует с<input
              v-model="effectiveFrom"
              type="datetime-local" /></label
          ><label
            >До (необязательно)<input
              v-model="effectiveUntil"
              type="datetime-local"
          /></label>
        </div>
        <label
          >Причина<textarea v-model="reason" rows="3" maxlength="500" /></label
        ><label
          >Idempotency-Key<input
            v-model="idempotencyKey"
            maxlength="128"
            autocomplete="off" /></label
        ><small v-if="formError" class="error" role="alert">{{
          formError
        }}</small>
        <footer>
          <Button
            label="Назад"
            text
            type="button"
            :disabled="mutationLoading"
            @click="mode = 'summary'"
          /><Button
            label="Назначить"
            type="submit"
            :disabled="!activePlans.length"
            :loading="mutationLoading"
          />
        </footer>
      </form>
    </div>
    <template #footer
      ><Button v-if="mode === 'summary'" label="Закрыть" text @click="close"
    /></template>
  </Dialog>
</template>

<style scoped>
.user-allowance,
.mutation-form,
.details,
.grants {
  display: grid;
  gap: 14px;
}
.loading,
.balance-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}
.loading {
  grid-template-columns: repeat(3, 1fr);
}
.balance-grid article {
  display: grid;
  gap: 7px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
}
.balance-grid small,
.details p,
.grants span,
.mutation-form small {
  color: var(--text-small-muted);
}
.balance-grid strong {
  font-size: 1rem;
  overflow-wrap: anywhere;
}
.details {
  gap: 6px;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}
.details h3,
.details p,
.mutation-form h3 {
  margin: 0;
}
.details span {
  margin-left: 6px;
}
.grants article {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.user-allowance footer,
.mutation-form footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 8px;
}
.user-allowance footer span {
  flex: 1;
}
.mutation-form label {
  display: grid;
  gap: 6px;
  font-size: 0.75rem;
  font-weight: 700;
}
.mutation-form input,
.mutation-form select,
.mutation-form textarea {
  width: 100%;
  padding: 10px;
  border: 1px solid var(--border-default);
  border-radius: 9px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
}
.form-row {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.error {
  color: var(--status-danger-text) !important;
}
@media (max-width: 650px) {
  .balance-grid,
  .loading,
  .form-row {
    grid-template-columns: 1fr;
  }
  .user-allowance footer {
    align-items: stretch;
    flex-direction: column;
  }
  .user-allowance footer span {
    display: none;
  }
  .grants article {
    flex-direction: column;
  }
}
</style>
