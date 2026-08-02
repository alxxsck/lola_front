<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import {
  compareDecimalStrings,
  formatDecimalMoney,
  type DecimalString,
} from "@/shared/lib/decimal-money";
import { aiAllowanceRepository } from "../api/ai-allowance-repository";
import type {
  AiAllowanceProjectPolicyView,
  AiAllowanceUserBalance,
} from "../model/ai-allowance";
import { pluralizeRu } from "@/features/ai-usage/ai-usage.model";

const props = defineProps<{
  projectId: string;
  endUserId: string;
  canGrant: boolean;
  canManage: boolean;
  canReconcile: boolean;
  refreshKey: number;
}>();

const emit = defineEmits<{
  openDetails: [mode: "summary" | "grant" | "assignment"];
  openJournal: [];
}>();

const balance = ref<AiAllowanceUserBalance | null>(null);
const projectPolicy = ref<AiAllowanceProjectPolicyView | null>(null);
const loading = ref(true);
const error = ref("");
let generation = 0;
const DECIMAL_SCALE = 1_000_000_000_000n;

const allowanceStatus = computed(() => {
  const current = balance.value;
  if (!current)
    return { code: "POLICY_UNAVAILABLE", title: "Состояние недоступно" };
  if (nonZero(current.account.overageUsd))
    return { code: "OVERAGE", title: "Есть перерасход" };
  if (nonZero(current.account.unknownHeldUsd))
    return { code: "UNKNOWN_HELD", title: "Есть неизвестное удержание" };
  if (!current.currentPeriod && nonZero(current.pendingBaseAllocationUsd))
    return {
      code: "AVAILABLE",
      title: "Доступно после первого начисления",
    };

  const available = scaled(current.account.availableUsd);
  const recurring = scaled(
    current.currentPeriod?.baseAllocatedUsd ??
      current.pendingBaseAllocationUsd ??
      "0",
  );
  if (available <= 0n) return { code: "EXHAUSTED", title: "Лимит исчерпан" };

  const policy = projectPolicy.value?.policy;
  if (policy && recurring > 0n) {
    const threshold = scaled(policy.lowThresholdValue);
    const low =
      policy.lowThresholdMode === "ABSOLUTE_USD"
        ? available <= threshold
        : available * 100n * DECIMAL_SCALE <= recurring * threshold;
    if (low) return { code: "LOW", title: "Лимит почти исчерпан" };
  }
  return {
    code: "AVAILABLE",
    title: "Лимит доступен",
  };
});

const runtimeStatus = computed(() => {
  const mode = projectPolicy.value?.policy?.enforcementMode ?? "DISABLED";
  if (mode === "DISABLED") {
    return {
      tone: "neutral",
      title: "Контроль выключен",
      description: "AI доступен без блокировки по квоте.",
    };
  }
  if (mode === "SHADOW") {
    return {
      tone: "info",
      title: "Теневой режим",
      description: "Расход журналируется, AI не блокируется.",
    };
  }
  if (mode === "SOFT") {
    return {
      tone: "info",
      title: "Мягкий контроль",
      description: "Перерасход журналируется, AI не блокируется.",
    };
  }
  if (projectPolicy.value?.runtimeGates.emergencyDisabled) {
    return {
      tone: "warning",
      title: "HARD временно отключён",
      description: "Активен аварийный флаг; AI не блокируется квотой.",
    };
  }
  if (!projectPolicy.value?.runtimeGates.hardEnforcementApproved) {
    return {
      tone: "warning",
      title: "HARD не активирован",
      description: "Нет runtime-разрешения; действует мягкий контроль.",
    };
  }
  return {
    tone: "success",
    title: "HARD-контроль активен",
    description: "Блокировка применяется по состоянию квоты.",
  };
});

const assignmentLabel = computed(() => {
  const personal = balance.value?.endUserAssignment;
  if (personal)
    return `Персональный план · ${personal.plan?.name ?? personal.planId}`;
  const projectDefault = projectPolicy.value?.defaultAssignment;
  if (projectDefault)
    return `Базовый план проекта настроен · ${projectDefault.plan?.name ?? projectDefault.planId} · точный источник текущего плана API не сообщает`;
  return "Персональный план не назначен · применяются правила проекта";
});

const grantsLabel = computed(() => {
  const count = balance.value?.activeGrants.length ?? 0;
  if (balance.value?.grantsPageInfo.hasMore)
    return `${count}+ активных начислений · есть ещё`;
  return `${count} ${pluralizeRu(
    count,
    "активное начисление",
    "активных начисления",
    "активных начислений",
  )}`;
});

async function load(): Promise<void> {
  const requestGeneration = ++generation;
  const requestProjectId = props.projectId;
  const requestEndUserId = props.endUserId;
  loading.value = true;
  error.value = "";
  try {
    const [nextBalance, nextPolicy] = await Promise.all([
      aiAllowanceRepository.endUserBalance(requestProjectId, requestEndUserId, {
        grantLimit: 1,
      }),
      aiAllowanceRepository.projectPolicy(requestProjectId, { planLimit: 1 }),
    ]);
    if (
      requestGeneration !== generation ||
      requestProjectId !== props.projectId ||
      requestEndUserId !== props.endUserId
    )
      return;
    if (nextBalance.projectPolicyVersion !== nextPolicy.projectPolicyVersion) {
      error.value =
        "Баланс и настройки лимита получены в разных версиях. Повторите загрузку.";
      return;
    }
    balance.value = nextBalance;
    projectPolicy.value = nextPolicy;
  } catch (cause) {
    if (requestGeneration !== generation) return;
    error.value =
      cause instanceof Error
        ? cause.message
        : "Не удалось загрузить лимит пользователя";
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}

function money(value: DecimalString | undefined): string {
  return formatDecimalMoney(value ?? "0", "USD");
}

function date(value: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("ru-RU", {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone,
    }).format(new Date(value));
  } catch {
    return value;
  }
}

function nonZero(value: DecimalString | undefined): boolean {
  return Boolean(value && compareDecimalStrings(value, "0") !== 0);
}

function scaled(value: DecimalString): bigint {
  const [whole, fraction = ""] = value.split(".");
  return (
    BigInt(whole ?? "0") * DECIMAL_SCALE +
    BigInt(`${fraction}000000000000`.slice(0, 12))
  );
}

watch(
  () => [props.projectId, props.endUserId, props.refreshKey] as const,
  () => {
    balance.value = null;
    projectPolicy.value = null;
    void load();
  },
);
onMounted(() => void load());
onBeforeUnmount(() => {
  generation += 1;
});
</script>

<template>
  <section
    class="allowance-card"
    data-testid="end-user-ai-allowance"
    aria-labelledby="end-user-ai-allowance-title"
  >
    <header class="allowance-heading">
      <div>
        <span class="allowance-kicker">AI allowance</span>
        <h3 id="end-user-ai-allowance-title">
          <i class="pi pi-wallet" aria-hidden="true" /> Лимит расходов
        </h3>
      </div>
      <Button
        label="Подробнее"
        icon="pi pi-arrow-right"
        icon-pos="right"
        outlined
        data-action="open-allowance-details"
        @click="emit('openDetails', 'summary')"
      />
    </header>

    <div v-if="loading && !balance" class="allowance-loading">
      <Skeleton v-for="index in 3" :key="index" height="82px" />
    </div>
    <Message v-else-if="error && !balance" severity="error" :closable="false">
      <span>{{ error }}</span>
      <Button label="Повторить" size="small" text @click="load" />
    </Message>
    <template v-else-if="balance && projectPolicy">
      <div
        class="runtime-status"
        :data-tone="runtimeStatus.tone"
        data-testid="allowance-runtime-status"
      >
        <i class="pi pi-shield" aria-hidden="true" />
        <div>
          <strong>{{ runtimeStatus.title }}</strong>
          <span>{{ runtimeStatus.description }}</span>
        </div>
      </div>

      <div class="allowance-metrics" :class="{ refreshing: loading }">
        <article>
          <small>Доступно сейчас</small>
          <strong>{{ money(balance.account.availableUsd) }}</strong>
        </article>
        <article>
          <small>Потрачено за период</small>
          <strong>{{ money(balance.currentPeriodSpend?.settledUsd) }}</strong>
        </article>
        <article>
          <small>В резерве</small>
          <strong>{{ money(balance.currentPeriodSpend?.reservedUsd) }}</strong>
        </article>
      </div>

      <dl class="allowance-facts">
        <div data-testid="allowance-balance-status">
          <dt>Состояние квоты</dt>
          <dd>{{ allowanceStatus.title }} · {{ allowanceStatus.code }}</dd>
        </div>
        <div>
          <dt>Назначение</dt>
          <dd>{{ assignmentLabel }}</dd>
        </div>
        <div>
          <dt>Текущий период</dt>
          <dd v-if="balance.currentPeriod">
            {{ money(balance.currentPeriod.baseAllocatedUsd) }} · до
            {{
              date(balance.currentPeriod.endsAt, balance.currentPeriod.timezone)
            }}
            ({{ balance.currentPeriod.timezone }})
          </dd>
          <dd v-else>
            Период ещё не создан · ожидаемое начисление
            {{ money(balance.pendingBaseAllocationUsd) }}
          </dd>
        </div>
        <div>
          <dt>Дополнительная квота</dt>
          <dd>{{ grantsLabel }}</dd>
        </div>
        <div>
          <dt>Unknown / перерасход</dt>
          <dd>
            {{ money(balance.account.unknownHeldUsd) }} /
            {{ money(balance.account.overageUsd) }}
          </dd>
        </div>
      </dl>

      <footer class="allowance-actions">
        <Button
          label="Журнал"
          icon="pi pi-list"
          text
          data-action="open-allowance-journal"
          @click="emit('openJournal')"
        />
        <span />
        <Button
          v-if="canManage"
          label="Назначить план"
          outlined
          data-action="assign-allowance-plan"
          @click="emit('openDetails', 'assignment')"
        />
        <Button
          v-if="canGrant"
          label="Начислить квоту"
          icon="pi pi-plus"
          data-action="grant-allowance"
          @click="emit('openDetails', 'grant')"
        />
        <Button
          v-if="canReconcile"
          label="Сверить"
          severity="warn"
          outlined
          @click="emit('openJournal')"
        />
      </footer>
    </template>
  </section>
</template>

<style scoped>
.allowance-card {
  display: grid;
  gap: 18px;
  padding: 20px;
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: var(--surface-card);
}
.allowance-heading,
.allowance-actions,
.runtime-status {
  display: flex;
  align-items: center;
  gap: 12px;
}
.allowance-heading {
  justify-content: space-between;
}
.allowance-kicker {
  color: var(--text-small-muted);
  font-size: 0.7rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.allowance-heading h3 {
  margin: 5px 0 0;
}
.runtime-status {
  padding: 13px 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
  background: var(--surface-soft);
}
.runtime-status[data-tone="success"] {
  color: var(--status-success-text);
}
.runtime-status[data-tone="warning"] {
  color: var(--status-warning-text);
}
.runtime-status[data-tone="danger"] {
  color: var(--status-danger-text);
}
.runtime-status div,
.allowance-metrics article,
.allowance-facts div {
  display: grid;
  gap: 5px;
}
.runtime-status span,
.allowance-metrics small,
.allowance-facts dt {
  color: var(--text-small-muted);
}
.allowance-loading,
.allowance-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.allowance-metrics article {
  padding: 14px;
  border: 1px solid var(--border-subtle);
  border-radius: 12px;
}
.allowance-metrics strong {
  font-size: 1.2rem;
}
.allowance-metrics.refreshing {
  opacity: 0.65;
}
.allowance-facts {
  display: grid;
  gap: 12px;
  margin: 0;
  padding: 0;
}
.allowance-facts div {
  grid-template-columns: minmax(120px, 0.35fr) 1fr;
  padding-top: 12px;
  border-top: 1px solid var(--border-subtle);
}
.allowance-facts dt,
.allowance-facts dd {
  margin: 0;
}
.allowance-actions {
  flex-wrap: wrap;
}
.allowance-actions > span {
  flex: 1;
}
@media (max-width: 650px) {
  .allowance-heading {
    align-items: stretch;
    flex-direction: column;
  }
  .allowance-loading,
  .allowance-metrics {
    grid-template-columns: 1fr;
  }
  .allowance-facts div {
    grid-template-columns: 1fr;
  }
  .allowance-actions {
    align-items: stretch;
    flex-direction: column;
  }
  .allowance-actions > span {
    display: none;
  }
}
</style>
