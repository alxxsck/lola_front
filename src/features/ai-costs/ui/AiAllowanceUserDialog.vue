<script setup lang="ts">
import { computed, ref, watch } from 'vue';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import { ApiError } from '@/shared/api/http/api-error';
import {
  addDecimalStrings,
  compareDecimalStrings,
  formatDecimalMoney,
  type DecimalString,
} from '@/shared/lib/decimal-money';
import { aiAllowanceRepository } from '../api/ai-allowance-repository';
import { isAllowanceReauthenticationRequired } from '../model/allowance-reauthentication';
import AiAllowanceReauthenticationAction from './AiAllowanceReauthenticationAction.vue';
import {
  parseAllowanceUsd,
  type AiAllowanceAssignment,
  type AiAllowancePlan,
  type AiAllowancePlanRevision,
  type AiAllowanceUserBalance,
} from '../model/ai-allowance';

const props = defineProps<{
  visible: boolean;
  projectId: string;
  endUserId: string;
  identity: string;
  initialMode?: 'summary' | 'grant' | 'assignment';
  plans?: AiAllowancePlan[];
  canRead: boolean;
  canGrant: boolean;
  canManage: boolean;
  canReconcile: boolean;
}>();
const emit = defineEmits<{
  'update:visible': [value: boolean];
  openJournal: [endUserId: string];
  changed: [];
  'fresh-login': [];
}>();
const balance = ref<AiAllowanceUserBalance | null>(null);
const loadedContext = ref('');
const grantsLoading = ref(false);
const loading = ref(false);
const mutationLoading = ref(false);
const error = ref('');
const formError = ref('');
const mode = ref<'summary' | 'grant' | 'assignment'>('summary');
const amount = ref('');
const validFrom = ref('');
const expiresAt = ref('');
const reason = ref('');
const idempotencyKey = ref('');
const grantExpiryPreset = ref<'PERIOD_END' | '24H' | 'CUSTOM'>('24H');
const planId = ref('');
const effectiveFrom = ref('');
const effectiveUntil = ref('');
const loadedPlans = ref<AiAllowancePlan[]>([]);
const plansPageInfo = ref<{ hasMore: boolean; nextCursor: string | null }>({
  hasMore: false,
  nextCursor: null,
});
const plansLoading = ref(false);
const projectPolicyVersion = ref('');
const defaultAssignment = ref<AiAllowanceAssignment | null>(null);
const configurationConflict = ref(false);
const reauthenticationRequired = ref(false);
const projectTimezone = ref('UTC');
const pinnedPlanRevision = ref<AiAllowancePlanRevision | null>(null);
interface GrantReceipt {
  id: string;
  amountUsd: DecimalString;
  validFrom: string;
  expiresAt: string;
  reason: string;
  actor: string;
  formOpenedAvailableUsd: DecimalString;
  newAvailableUsd: DecimalString;
  replayed: boolean;
}
const grantReceipt = ref<GrantReceipt | null>(null);
let initialModeApplied = false;
let generation = 0;
let mutationGeneration = 0;
const activePlans = computed(() =>
  (loadedPlans.value.length ? loadedPlans.value : (props.plans ?? [])).filter(
    (plan) => plan.status === 'ACTIVE',
  ),
);
const currentPlanRevision = computed(() => {
  const revisionId = balance.value?.currentPeriod?.planRevision?.id;
  if (!revisionId) return null;
  if (pinnedPlanRevision.value?.id === revisionId) return pinnedPlanRevision.value;
  for (const plan of loadedPlans.value) {
    const revision = plan.revisions.find((item) => item.id === revisionId);
    if (revision) return revision;
  }
  return null;
});
const grantPreview = computed(() => {
  const exact = parseAllowanceUsd(amount.value.trim());
  const available = balance.value?.account.availableUsd;
  const overage = balance.value?.account.overageUsd;
  return exact && available && overage
    ? addDecimalStrings([available, nonNegativeDifference(exact, overage)])
    : null;
});

watch(
  () => [props.visible, props.projectId, props.endUserId, props.canRead] as const,
  ([visible, , , canRead]) => {
    generation += 1;
    mutationGeneration += 1;
    balance.value = null;
    loadedPlans.value = [];
    plansPageInfo.value = { hasMore: false, nextCursor: null };
    plansLoading.value = false;
    loadedContext.value = '';
    projectPolicyVersion.value = '';
    defaultAssignment.value = null;
    configurationConflict.value = false;
    reauthenticationRequired.value = false;
    pinnedPlanRevision.value = null;
    grantReceipt.value = null;
    projectTimezone.value = 'UTC';
    initialModeApplied = false;
    grantsLoading.value = false;
    mutationLoading.value = false;
    loading.value = false;
    error.value = '';
    formError.value = '';
    mode.value = 'summary';
    amount.value = '';
    validFrom.value = '';
    expiresAt.value = '';
    reason.value = '';
    idempotencyKey.value = '';
    grantExpiryPreset.value = '24H';
    planId.value = '';
    effectiveFrom.value = '';
    effectiveUntil.value = '';
    if (visible && !canRead) {
      emit('update:visible', false);
      return;
    }
    if (visible && canRead && props.endUserId) {
      void load();
    }
  },
  { immediate: true },
);
watch(
  () => [props.canGrant, props.canManage] as const,
  ([canGrant, canManage]) => {
    if ((mode.value === 'grant' && !canGrant) || (mode.value === 'assignment' && !canManage)) {
      mutationGeneration += 1;
      mutationLoading.value = false;
      formError.value = '';
      mode.value = 'summary';
    }
  },
);
async function load(): Promise<boolean> {
  if (!props.visible || !props.canRead || !props.endUserId) return false;
  const requestGeneration = ++generation;
  const requestProjectId = props.projectId;
  const requestEndUserId = props.endUserId;
  loadedContext.value = '';
  projectPolicyVersion.value = '';
  pinnedPlanRevision.value = null;
  loading.value = true;
  error.value = '';
  try {
    const [nextBalance, projectPolicy] = await Promise.all([
      aiAllowanceRepository.endUserBalance(requestProjectId, requestEndUserId, {
        grantLimit: 50,
      }),
      aiAllowanceRepository.projectPolicy(requestProjectId),
    ]);
    if (
      requestGeneration !== generation ||
      requestProjectId !== props.projectId ||
      requestEndUserId !== props.endUserId ||
      nextBalance.account.projectId !== requestProjectId ||
      nextBalance.account.endUserId !== requestEndUserId
    )
      return false;
    if (nextBalance.projectPolicyVersion !== projectPolicy.projectPolicyVersion) {
      error.value = 'Баланс и конфигурация получены в разных версиях. Повторите загрузку.';
      return false;
    }
    balance.value = nextBalance;
    projectPolicyVersion.value = projectPolicy.projectPolicyVersion;
    defaultAssignment.value = projectPolicy.defaultAssignment;
    projectTimezone.value =
      projectPolicy.policy?.timezone ?? nextBalance.currentPeriod?.timezone ?? 'UTC';
    loadedContext.value = `${requestProjectId}:${requestEndUserId}`;
    loadedPlans.value = projectPolicy.plans;
    plansPageInfo.value = projectPolicy.plansPageInfo;
    pinnedPlanRevision.value = nextBalance.currentPeriod?.planRevision ?? null;
    if (requestGeneration !== generation) return false;
    applyInitialMode();
    return true;
  } catch (cause) {
    if (requestGeneration === generation)
      error.value = text(cause, 'Не удалось загрузить баланс пользователя');
    return false;
  } finally {
    if (requestGeneration === generation) loading.value = false;
  }
}
function applyInitialMode(): void {
  if (initialModeApplied) return;
  initialModeApplied = true;
  if (props.initialMode === 'grant') beginGrant();
  if (props.initialMode === 'assignment') beginAssignment();
}
async function loadMorePlans(): Promise<void> {
  const cursor = plansPageInfo.value.nextCursor;
  if (
    !props.canRead ||
    !cursor ||
    plansLoading.value ||
    loadedContext.value !== `${props.projectId}:${props.endUserId}` ||
    !projectPolicyVersion.value
  )
    return;
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  const requestEndUserId = props.endUserId;
  const requestPolicyVersion = projectPolicyVersion.value;
  plansLoading.value = true;
  formError.value = '';
  try {
    const next = await aiAllowanceRepository.projectPolicy(requestProjectId, {
      planCursor: cursor,
      planLimit: 50,
      revisionLimit: 1,
    });
    if (
      requestGeneration !== generation ||
      requestProjectId !== props.projectId ||
      requestEndUserId !== props.endUserId ||
      loadedContext.value !== `${requestProjectId}:${requestEndUserId}`
    )
      return;
    if (next.projectPolicyVersion !== requestPolicyVersion) {
      projectPolicyVersion.value = '';
      configurationConflict.value = true;
      formError.value =
        'Конфигурация планов изменилась во время загрузки. Загрузите актуальную версию.';
      return;
    }
    const plansById = new Map([...loadedPlans.value, ...next.plans].map((plan) => [plan.id, plan]));
    loadedPlans.value = [...plansById.values()];
    plansPageInfo.value = next.plansPageInfo;
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId
    )
      formError.value = text(cause, 'Не удалось загрузить остальные планы');
  } finally {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId
    )
      plansLoading.value = false;
  }
}
async function loadMoreGrants(): Promise<void> {
  const current = balance.value;
  const cursor = current?.grantsPageInfo.nextCursor;
  if (
    !current ||
    !cursor ||
    !props.canRead ||
    grantsLoading.value ||
    loadedContext.value !== `${props.projectId}:${props.endUserId}`
  )
    return;
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  const requestEndUserId = props.endUserId;
  grantsLoading.value = true;
  try {
    const next = await aiAllowanceRepository.endUserBalance(requestProjectId, requestEndUserId, {
      grantLimit: 50,
      grantCursor: cursor,
    });
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId &&
      loadedContext.value === `${requestProjectId}:${requestEndUserId}` &&
      balance.value === current &&
      next.account.projectId === requestProjectId &&
      next.account.endUserId === requestEndUserId &&
      next.projectPolicyVersion === current.projectPolicyVersion
    ) {
      balance.value = {
        ...current,
        activeGrants: [...current.activeGrants, ...next.activeGrants],
        grantsPageInfo: next.grantsPageInfo,
      };
    } else if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId
    ) {
      grantsLoading.value = false;
      await load();
    }
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId
    )
      error.value = text(cause, 'Не удалось загрузить остальные начисления');
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
  emit('update:visible', false);
}
function beginGrant(): void {
  if (!props.canRead || !props.canGrant) return;
  if (loadedContext.value !== `${props.projectId}:${props.endUserId}`) return;
  mode.value = 'grant';
  amount.value = '';
  validFrom.value = localNow();
  grantExpiryPreset.value = balance.value?.currentPeriod ? 'PERIOD_END' : '24H';
  applyGrantExpiryPreset();
  reason.value = '';
  idempotencyKey.value = key();
  formError.value = '';
  configurationConflict.value = false;
  reauthenticationRequired.value = false;
}
function beginAssignment(): void {
  if (!props.canRead || !props.canManage) return;
  if (loadedContext.value !== `${props.projectId}:${props.endUserId}`) return;
  if (!projectPolicyVersion.value) return;
  mode.value = 'assignment';
  planId.value = balance.value?.endUserAssignment?.planId ?? activePlans.value[0]?.id ?? '';
  effectiveFrom.value = localNow();
  effectiveUntil.value = '';
  reason.value = '';
  idempotencyKey.value = key();
  formError.value = '';
  configurationConflict.value = false;
  reauthenticationRequired.value = false;
}
async function submitGrant(): Promise<void> {
  if (!props.canRead || !props.canGrant) return fail('Операция больше недоступна.');
  const exact = parseAllowanceUsd(amount.value.trim());
  const from = iso(validFrom.value);
  const until = iso(expiresAt.value);
  if (!exact || compareDecimalStrings(exact, '0') <= 0)
    return fail('Сумма должна быть положительной decimal-строкой.');
  if (!from || !until || from >= until)
    return fail('Дата окончания должна быть позже даты начала.');
  if (!validCommon()) return;
  if (reason.value.trim().length < 10 || reason.value.trim().length > 500)
    return fail('Причина начисления должна содержать от 10 до 500 символов.');
  const previousAvailableUsd = balance.value?.account.availableUsd ?? '0';
  await mutate(
    () =>
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
    (result) => {
      grantReceipt.value = parseGrantReceipt(result, previousAvailableUsd);
    },
  );
}
async function submitAssignment(): Promise<void> {
  if (!props.canRead || !props.canManage) return fail('Операция больше недоступна.');
  if (!projectPolicyVersion.value)
    return fail('Сначала загрузите актуальную конфигурацию проекта.');
  const from = iso(effectiveFrom.value);
  const until = effectiveUntil.value ? iso(effectiveUntil.value) : undefined;
  if (!planId.value || !activePlans.value.some((plan) => plan.id === planId.value))
    return fail('Выберите активный план.');
  if (!from || (effectiveUntil.value && (!until || from >= until)))
    return fail('Проверьте срок назначения.');
  if (!validCommon()) return;
  await mutate(
    () =>
      aiAllowanceRepository.putEndUserAssignment(
        props.projectId,
        props.endUserId,
        {
          expectedProjectPolicyVersion: projectPolicyVersion.value,
          planId: planId.value,
          effectiveFrom: from,
          ...(until ? { effectiveUntil: until } : {}),
          reason: reason.value.trim(),
        },
        idempotencyKey.value.trim(),
      ),
    (result) => {
      projectPolicyVersion.value = result.projectPolicyVersion;
    },
  );
}
function validCommon(): boolean {
  if (reason.value.trim().length < 3 || reason.value.trim().length > 500) {
    fail('Причина должна содержать от 3 до 500 символов.');
    return false;
  }
  if (!idempotencyKey.value.trim() || idempotencyKey.value.length > 128) {
    fail('Укажите Idempotency-Key длиной до 128 символов.');
    return false;
  }
  return true;
}
async function mutate<T>(
  action: () => Promise<T>,
  acceptResult?: (result: T) => void,
): Promise<void> {
  const requestGeneration = mutationGeneration;
  const requestProjectId = props.projectId;
  const requestEndUserId = props.endUserId;
  mutationLoading.value = true;
  formError.value = '';
  configurationConflict.value = false;
  reauthenticationRequired.value = false;
  try {
    const result = await action();
    if (
      requestGeneration !== mutationGeneration ||
      requestProjectId !== props.projectId ||
      requestEndUserId !== props.endUserId
    )
      return;
    acceptResult?.(result);
    mutationLoading.value = false;
    mode.value = 'summary';
    await load();
    emit('changed');
  } catch (cause) {
    if (
      requestGeneration === mutationGeneration &&
      requestProjectId === props.projectId &&
      requestEndUserId === props.endUserId
    ) {
      configurationConflict.value = isConfigurationConflict(cause);
      reauthenticationRequired.value = isAllowanceReauthenticationRequired(cause);
      formError.value = reauthenticationRequired.value
        ? ''
        : mutationMessage(cause, 'Операция не выполнена');
    }
  } finally {
    if (
      requestGeneration === mutationGeneration &&
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
  return formatDecimalMoney(value, 'USD');
}
function nonZero(value: DecimalString | undefined): boolean {
  return Boolean(value && compareDecimalStrings(value, '0') !== 0);
}
function date(value: string): string {
  try {
    return new Intl.DateTimeFormat('ru-RU', {
      dateStyle: 'medium',
      timeStyle: 'short',
      timeZone: projectTimezone.value,
    }).format(new Date(value));
  } catch {
    return value;
  }
}
function iso(value: string): string | undefined {
  const result = new Date(value);
  return value && Number.isFinite(result.valueOf()) ? result.toISOString() : undefined;
}
function localNow(): string {
  return localInput(new Date());
}
function localTomorrow(): string {
  return localInput(new Date(Date.now() + 24 * 60 * 60 * 1000));
}
function applyGrantExpiryPreset(): void {
  if (grantExpiryPreset.value === 'CUSTOM') return;
  if (grantExpiryPreset.value === 'PERIOD_END' && balance.value?.currentPeriod) {
    expiresAt.value = localInput(new Date(balance.value.currentPeriod.endsAt));
    return;
  }
  expiresAt.value = localTomorrow();
}
function parseGrantReceipt(
  value: unknown,
  formOpenedAvailableUsd: DecimalString,
): GrantReceipt | null {
  if (!value || typeof value !== 'object') return null;
  const source = value as Record<string, unknown>;
  const grant = source.grant;
  const account = source.account;
  if (!grant || typeof grant !== 'object' || !account || typeof account !== 'object') return null;
  const grantValue = grant as Record<string, unknown>;
  const accountValue = account as Record<string, unknown>;
  const amountUsd = parseAllowanceUsd(grantValue.amountUsd);
  const newAvailableUsd = parseAllowanceUsd(accountValue.availableUsd);
  if (
    typeof grantValue.id !== 'string' ||
    !amountUsd ||
    typeof grantValue.validFrom !== 'string' ||
    typeof grantValue.expiresAt !== 'string' ||
    typeof grantValue.reason !== 'string' ||
    typeof grantValue.actorType !== 'string' ||
    typeof grantValue.actorId !== 'string' ||
    !newAvailableUsd ||
    typeof source.replayed !== 'boolean'
  )
    return null;
  return {
    id: grantValue.id,
    amountUsd,
    validFrom: grantValue.validFrom,
    expiresAt: grantValue.expiresAt,
    reason: grantValue.reason,
    actor: `${grantValue.actorType}:${grantValue.actorId}`,
    formOpenedAvailableUsd,
    newAvailableUsd,
    replayed: source.replayed,
  };
}
function nonNegativeDifference(left: DecimalString, right: DecimalString): DecimalString {
  const scale = Math.max(left.split('.')[1]?.length ?? 0, right.split('.')[1]?.length ?? 0);
  const coefficient = (value: DecimalString) => {
    const [whole = '0', fraction = ''] = value.split('.');
    return BigInt(`${whole}${fraction.padEnd(scale, '0')}`);
  };
  const difference = coefficient(left) - coefficient(right);
  if (difference <= 0n) return '0';
  if (scale === 0) return difference.toString();
  const padded = difference.toString().padStart(scale + 1, '0');
  const whole = padded.slice(0, -scale);
  const fraction = padded.slice(-scale).replace(/0+$/, '');
  return fraction ? `${whole}.${fraction}` : whole;
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
function mutationMessage(cause: unknown, fallback: string): string {
  return isConfigurationConflict(cause)
    ? 'Конфигурация лимитов уже изменилась. Форма сохранена — загрузите актуальную версию и повторите проверку.'
    : text(cause, fallback);
}
function isConfigurationConflict(cause: unknown): boolean {
  return (
    cause instanceof ApiError &&
    cause.status === 409 &&
    cause.code === 'AI_ALLOWANCE_CONFIGURATION_VERSION_CONFLICT'
  );
}
async function refreshAssignmentDraft(): Promise<void> {
  const refreshed = await load();
  if (!refreshed) return;
  if (loadedContext.value !== `${props.projectId}:${props.endUserId}`) return;
  configurationConflict.value = false;
  formError.value = '';
}
</script>

<template>
  <Dialog
    :visible="visible && canRead"
    modal
    :header="canRead ? `AI-квота · ${identity}` : 'AI-квота'"
    :style="{ width: 'min(820px, 96vw)' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="user-allowance">
      <Message severity="info" :closable="false"
        >Это внутренняя квота потребления AI в USD, не денежный кошелёк пользователя.</Message
      >
      <div v-if="loading && !balance" class="loading">
        <Skeleton v-for="index in 3" :key="index" height="80px" />
      </div>
      <Message v-if="error" severity="error" :closable="false"
        >{{ error }} <Button label="Повторить" text size="small" @click="load"
      /></Message>
      <template v-if="balance && mode === 'summary'">
        <Message
          v-if="grantReceipt"
          severity="success"
          :closable="false"
          data-testid="grant-receipt"
        >
          <strong>Начисление записано</strong>
          <span>
            {{ grantReceipt.id }} · {{ money(grantReceipt.amountUsd) }} ·
            {{ date(grantReceipt.validFrom) }} —
            {{ date(grantReceipt.expiresAt) }}
          </span>
          <span>
            Доступно после команды: {{ money(grantReceipt.newAvailableUsd) }} ·
            {{ grantReceipt.actor }} · {{ grantReceipt.reason }}
          </span>
          <span>
            При открытии формы было
            {{ money(grantReceipt.formOpenedAvailableUsd) }}. Это справочное значение, не часть
            атомарного command receipt.
          </span>
          <span v-if="grantReceipt.replayed"
            >Безопасный повтор: существующее начисление, дубликат не создан.</span
          >
        </Message>
        <div class="balance-grid">
          <article>
            <small>Доступно сейчас</small><strong>{{ money(balance.account.availableUsd) }}</strong
            ><span v-if="nonZero(balance.pendingBaseAllocationUsd)"
              >включая ожидаемые {{ money(balance.pendingBaseAllocationUsd ?? '0') }}</span
            >
          </article>
          <article>
            <small>Текущий период: резерв</small
            ><strong>{{ money(balance.currentPeriodSpend?.reservedUsd ?? '0') }}</strong>
          </article>
          <article>
            <small>Текущий период: settled</small
            ><strong>{{ money(balance.currentPeriodSpend?.settledUsd ?? '0') }}</strong>
          </article>
          <article>
            <small>За всё время: settled</small
            ><strong>{{ money(balance.account.settledUsd) }}</strong>
          </article>
          <article>
            <small>Текущий период: unknown / overage</small
            ><strong
              >{{ money(balance.currentPeriodSpend?.unknownHeldUsd ?? '0') }} /
              {{ money(balance.currentPeriodSpend?.overageUsd ?? '0') }}</strong
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
            <span>{{ balance.currentPeriod.status }} · {{ projectTimezone }}</span>
          </p>
          <p v-else>
            Период ещё не создан. При первом применении будет начислено
            {{ money(balance.pendingBaseAllocationUsd ?? '0') }}.
          </p>
        </section>
        <section class="details">
          <h3>Персональное назначение</h3>
          <p v-if="balance.endUserAssignment">
            {{ balance.endUserAssignment.plan?.name ?? balance.endUserAssignment.planId }}
            · с {{ date(balance.endUserAssignment.effectiveFrom) }}
          </p>
          <p v-else-if="defaultAssignment">
            Персональный план не назначен. Базовый план проекта настроен:
            {{ defaultAssignment.plan?.name ?? defaultAssignment.planId }}. Точный источник текущего
            плана API пока не сообщает.
          </p>
          <p v-else>
            Персональный план не назначен. Действуют правила проекта; источник группового плана API
            пока не сообщает.
          </p>
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
        <section v-if="currentPlanRevision" class="details">
          <div class="details-heading">
            <h3>Правила категорий текущего периода</h3>
            <Button label="Обновить правила" text size="small" :loading="loading" @click="load" />
          </div>
          <div class="category-rules">
            <p v-for="rule in currentPlanRevision.categoryRules" :key="rule.category">
              <strong>{{ rule.category }}</strong>
              <span>
                {{
                  rule.responsibility === 'END_USER_ALLOWANCE'
                    ? 'Квота пользователя'
                    : 'Оплачивает проект'
                }}
                · лимит
                {{ rule.capUsd ? money(rule.capUsd) : 'без ограничения' }}
              </span>
            </p>
          </div>
        </section>
        <section
          v-else-if="balance.currentPeriod"
          class="details"
          data-testid="category-rules-unavailable"
        >
          <h3>Правила категорий текущего периода</h3>
          <p>
            Наблюдательный период работает без закреплённого плана; правила категорий появятся после
            назначения совместимого плана.
          </p>
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
          /><Button v-if="canGrant" label="Начислить квоту" icon="pi pi-plus" @click="beginGrant" />
        </footer>
      </template>
      <form v-else-if="mode === 'grant'" class="mutation-form" @submit.prevent="submitGrant">
        <h3>Ручное начисление</h3>
        <label>Сумма, USD<input v-model="amount" inputmode="decimal" autocomplete="off" /></label>
        <div class="form-row">
          <label
            >Действует с<input
              v-model="validFrom"
              type="datetime-local"
              @input="grantExpiryPreset = 'CUSTOM'" /></label
          ><label
            >Истекает<input
              v-model="expiresAt"
              type="datetime-local"
              :readonly="grantExpiryPreset !== 'CUSTOM'"
          /></label>
        </div>
        <label
          >Срок начисления<select v-model="grantExpiryPreset" @change="applyGrantExpiryPreset">
            <option value="PERIOD_END" :disabled="!balance?.currentPeriod">
              До конца текущего периода
            </option>
            <option value="24H">24 часа</option>
            <option value="CUSTOM">Выбранная дата</option>
          </select></label
        >
        <small>Даты вводятся в часовом поясе браузера; проект: {{ projectTimezone }}.</small>
        <Message v-if="grantPreview" severity="info" :closable="false">
          Предварительно доступно после начисления:
          <strong>{{ money(grantPreview) }}</strong>
          <span v-if="nonZero(balance?.account.overageUsd)">
            Сначала начисление погасит текущий перерасход
            {{ money(balance?.account.overageUsd ?? '0') }}.
          </span>
        </Message>
        <label>Причина<textarea v-model="reason" rows="3" maxlength="500" /></label
        ><label
          >Idempotency-Key<input
            v-model="idempotencyKey"
            maxlength="128"
            autocomplete="off"
          /><small>Не меняйте ключ при повторе того же запроса.</small></label
        ><small v-if="formError" class="error" role="alert">{{ formError }}</small>
        <AiAllowanceReauthenticationAction
          :required="reauthenticationRequired"
          @fresh-login="emit('fresh-login')"
        />
        <footer>
          <Button
            label="Назад"
            text
            type="button"
            :disabled="mutationLoading"
            @click="mode = 'summary'"
          /><Button label="Начислить" type="submit" :loading="mutationLoading" />
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
        <Button
          v-if="plansPageInfo.hasMore"
          label="Показать остальные планы"
          type="button"
          outlined
          :loading="plansLoading"
          :disabled="mutationLoading"
          @click="loadMorePlans"
        />
        <div class="form-row">
          <label>Действует с<input v-model="effectiveFrom" type="datetime-local" /></label
          ><label>До (необязательно)<input v-model="effectiveUntil" type="datetime-local" /></label>
        </div>
        <small>Даты вводятся в часовом поясе браузера; проект: {{ projectTimezone }}.</small>
        <label>Причина<textarea v-model="reason" rows="3" maxlength="500" /></label
        ><label
          >Idempotency-Key<input
            v-model="idempotencyKey"
            maxlength="128"
            autocomplete="off" /></label
        ><small v-if="formError" class="error" role="alert">{{ formError }}</small>
        <AiAllowanceReauthenticationAction
          :required="reauthenticationRequired"
          @fresh-login="emit('fresh-login')"
        />
        <Button
          v-if="configurationConflict"
          label="Загрузить актуальную версию"
          type="button"
          outlined
          severity="warn"
          :loading="loading"
          @click="refreshAssignmentDraft"
        />
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
.details-heading {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}
.details span {
  margin-left: 6px;
}
.category-rules {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}
.category-rules p {
  display: grid;
  gap: 3px;
  padding: 10px;
  border: 1px solid var(--border-subtle);
  border-radius: 10px;
}
.category-rules span {
  margin: 0;
  font-size: 0.78rem;
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
  .form-row,
  .category-rules {
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
