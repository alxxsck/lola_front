<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import {
  compareDecimalStrings,
  formatDecimalMoney,
} from "@/shared/lib/decimal-money";
import { aiAllowanceAccrualRepository } from "../api/ai-allowance-accrual-repository";
import { parseAllowanceUsd } from "../model/ai-allowance";
import type {
  AccrualLifecycle,
  AccrualSource,
  AiAllowanceAccrualRule,
} from "../model/ai-allowance-accrual";
const props = defineProps<{
  projectId: string;
  canRead: boolean;
  canManage: boolean;
}>();
const rules = ref<AiAllowanceAccrualRule[]>([]);
const pageInfo = ref<{ hasMore: boolean; nextCursor: string | null }>({
  hasMore: false,
  nextCursor: null,
});
const revisionHistoryLimit = ref(20);
const loadedProjectId = ref("");
const loadingMore = ref(false);
const loading = ref(false);
const saving = ref(false);
const error = ref("");
const dialog = ref(false);
const formError = ref("");
const key = ref("");
const name = ref("");
const lifecycle = ref<AccrualLifecycle>("ACTIVE");
const eventKeyId = ref("");
const revisionIds = ref("");
const sources = ref<AccrualSource[]>(["SERVER"]);
const timezone = ref("UTC");
const reward = ref("");
const userCap = ref("");
const projectCap = ref("");
const ttl = ref(86400);
const cooldown = ref(0);
const from = ref("");
const until = ref("");
const reason = ref("");
const idem = ref("");
let generation = 0;
watch(
  () => [props.projectId, props.canRead] as const,
  ([, read]) => {
    generation += 1;
    rules.value = [];
    loadedProjectId.value = "";
    loadingMore.value = false;
    dialog.value = false;
    if (read) void load();
  },
  { immediate: true },
);
watch(
  () => props.canManage,
  (canManage) => {
    if (canManage) return;
    dialog.value = false;
    saving.value = false;
  },
);
async function load() {
  const current = ++generation;
  const requestProjectId = props.projectId;
  loading.value = true;
  error.value = "";
  try {
    const page = await aiAllowanceAccrualRepository.listRules(requestProjectId);
    if (current === generation && requestProjectId === props.projectId) {
      rules.value = page.items;
      pageInfo.value = page.pageInfo;
      revisionHistoryLimit.value = page.revisionHistoryLimit;
      loadedProjectId.value = requestProjectId;
    }
  } catch (cause) {
    if (current === generation)
      error.value =
        cause instanceof Error ? cause.message : "Не удалось загрузить правила";
  } finally {
    if (current === generation) loading.value = false;
  }
}
async function loadMore() {
  const cursor = pageInfo.value.nextCursor;
  if (!cursor || loadingMore.value || loadedProjectId.value !== props.projectId)
    return;
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  loadingMore.value = true;
  try {
    const page = await aiAllowanceAccrualRepository.listRules(
      requestProjectId,
      {
        limit: 50,
        cursor,
      },
    );
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId &&
      loadedProjectId.value === requestProjectId
    ) {
      rules.value = [...rules.value, ...page.items];
      pageInfo.value = page.pageInfo;
    }
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось загрузить остальные правила";
  } finally {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      loadingMore.value = false;
  }
}
function open(rule?: AiAllowanceAccrualRule) {
  if (!props.canManage) return;
  if (rule && loadedProjectId.value !== props.projectId) return;
  const revision = rule?.revisions[0];
  key.value = rule?.key ?? "";
  name.value = rule?.name ?? "";
  lifecycle.value = rule?.lifecycle ?? "ACTIVE";
  eventKeyId.value = revision?.eventDefinitionKeyId ?? "";
  revisionIds.value =
    revision?.eventRevisionBindings
      .map((item) => item.eventDefinitionRevisionId)
      .join("\n") ?? "";
  sources.value = revision?.allowedSources ?? ["SERVER"];
  timezone.value = revision?.timezone ?? "UTC";
  reward.value = revision?.rewardUsd ?? "";
  userCap.value = revision?.perEndUserDailyCapUsd ?? "";
  projectCap.value = revision?.projectDailyCapUsd ?? "";
  ttl.value = revision?.grantTtlSeconds ?? 86400;
  cooldown.value = revision?.cooldownSeconds ?? 0;
  from.value = localInput(new Date());
  until.value =
    revision?.effectiveUntil && Date.parse(revision.effectiveUntil) > Date.now()
      ? localInput(new Date(revision.effectiveUntil))
      : "";
  reason.value = "";
  idem.value = globalThis.crypto?.randomUUID?.() ?? `accrual-${Date.now()}`;
  formError.value = "";
  dialog.value = true;
}
async function save() {
  if (!props.canManage) return fail("Операция больше недоступна.");
  const ruleKey = key.value.trim().toUpperCase();
  const rewardUsd = parseAllowanceUsd(reward.value.trim());
  const perEndUserDailyCapUsd = parseAllowanceUsd(userCap.value.trim());
  const projectDailyCapUsd = parseAllowanceUsd(projectCap.value.trim());
  const ids = [...new Set(revisionIds.value.split(/[\s,]+/).filter(Boolean))];
  const validUuid = (value: string) =>
    /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    );
  if (
    !/^[A-Z][A-Z0-9_]{1,99}$/.test(ruleKey) ||
    !validUuid(eventKeyId.value) ||
    ids.length < 1 ||
    ids.length > 50 ||
    ids.some((id) => !validUuid(id))
  )
    return fail("Проверьте ключ правила и UUID схемы/ревизий события.");
  if (
    !rewardUsd ||
    !perEndUserDailyCapUsd ||
    !projectDailyCapUsd ||
    compareDecimalStrings(rewardUsd, "0") <= 0 ||
    compareDecimalStrings(perEndUserDailyCapUsd, rewardUsd) < 0 ||
    compareDecimalStrings(projectDailyCapUsd, perEndUserDailyCapUsd) < 0
  )
    return fail(
      "Reward должен быть положительным, user cap ≥ reward, project cap ≥ user cap.",
    );
  const effectiveFrom = validInstant(from.value);
  const effectiveUntil = until.value ? validInstant(until.value) : undefined;
  if (
    !name.value.trim() ||
    sources.value.length < 1 ||
    new Set(sources.value).size !== sources.value.length ||
    reason.value.trim().length < 3 ||
    ttl.value < 60 ||
    ttl.value > 31_622_400 ||
    cooldown.value < 0 ||
    cooldown.value > 31_622_400 ||
    !Number.isSafeInteger(ttl.value) ||
    !Number.isSafeInteger(cooldown.value) ||
    !validTimezone(timezone.value.trim()) ||
    !effectiveFrom ||
    (Boolean(until.value) &&
      (!effectiveUntil || effectiveFrom >= effectiveUntil))
  )
    return fail("Заполните обязательные поля и причину.");
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  saving.value = true;
  try {
    await aiAllowanceAccrualRepository.putRule(
      requestProjectId,
      ruleKey,
      {
        name: name.value.trim(),
        lifecycle: lifecycle.value,
        eventDefinitionKeyId: eventKeyId.value,
        eventDefinitionRevisionIds: ids,
        allowedSources: sources.value,
        timezone: timezone.value.trim(),
        rewardUsd,
        perEndUserDailyCapUsd,
        projectDailyCapUsd,
        grantTtlSeconds: ttl.value,
        cooldownSeconds: cooldown.value,
        effectiveFrom,
        ...(effectiveUntil ? { effectiveUntil } : {}),
        reason: reason.value.trim(),
      },
      idem.value,
    );
    if (
      requestGeneration !== generation ||
      requestProjectId !== props.projectId ||
      !props.canManage
    )
      return;
    dialog.value = false;
    saving.value = false;
    await load();
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      formError.value =
        cause instanceof Error ? cause.message : "Не удалось сохранить";
  } finally {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      saving.value = false;
  }
}
function fail(value: string) {
  formError.value = value;
}
function localInput(value: Date) {
  const local = new Date(value.getTime() - value.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}
function validInstant(value: string): string | undefined {
  const instant = new Date(value);
  return value && Number.isFinite(instant.valueOf())
    ? instant.toISOString()
    : undefined;
}
function validTimezone(value: string): boolean {
  try {
    new Intl.DateTimeFormat("en", { timeZone: value }).format();
    return Boolean(value && value.length <= 100);
  } catch {
    return false;
  }
}
</script>
<template>
  <section class="loyalty">
    <header>
      <div>
        <h3>Правила лояльности</h3>
        <p>
          Событие начисляет временную USD-квоту с cap, cooldown и
          immutable-ревизией.
        </p>
      </div>
      <Button
        v-if="canManage"
        label="Новое правило"
        icon="pi pi-plus"
        outlined
        @click="open()"
      />
    </header>
    <Message v-if="!canRead" severity="warn" :closable="false"
      >Нет права чтения правил начисления.</Message
    ><Skeleton v-else-if="loading" height="100px" /><Message
      v-else-if="error"
      severity="error"
      :closable="false"
      >{{ error }} <Button label="Повторить" text @click="load"
    /></Message>
    <div v-else-if="rules.length" class="rules">
      <article v-for="rule in rules" :key="rule.id">
        <div>
          <strong>{{ rule.name }}</strong
          ><small>{{ rule.key }} · {{ rule.lifecycle }}</small>
        </div>
        <div v-if="rule.revisions[0]">
          <strong
            >{{ formatDecimalMoney(rule.revisions[0].rewardUsd, "USD") }} /
            событие</strong
          ><small
            >user cap
            {{
              formatDecimalMoney(rule.revisions[0].perEndUserDailyCapUsd, "USD")
            }}
            · rev {{ rule.revisions[0].revisionNumber }}</small
          >
        </div>
        <Button
          v-if="canManage && rule.lifecycle !== 'ARCHIVED'"
          label="Новая ревизия"
          text
          @click="open(rule)"
        />
      </article>
      <Message
        v-if="
          rules.some((rule) => rule.revisions.length >= revisionHistoryLimit)
        "
        severity="info"
        :closable="false"
      >
        Для каждого правила показаны последние
        {{ revisionHistoryLimit }} ревизий.
      </Message>
      <Button
        v-if="pageInfo.hasMore"
        label="Показать остальные правила"
        outlined
        :loading="loadingMore"
        @click="loadMore"
      />
    </div>
    <p v-else-if="canRead">Правил пока нет.</p>
  </section>
  <Dialog
    v-model:visible="dialog"
    modal
    header="Правило начисления"
    :style="{ width: 'min(820px,96vw)' }"
    ><form class="form" @submit.prevent="save">
      <div class="row">
        <label>Ключ<input v-model="key" maxlength="100" /></label
        ><label>Название<input v-model="name" maxlength="160" /></label
        ><label
          >Статус<select v-model="lifecycle">
            <option>ACTIVE</option>
            <option>PAUSED</option>
            <option>ARCHIVED</option>
          </select></label
        >
      </div>
      <label>Event Definition Key UUID<input v-model="eventKeyId" /></label
      ><label
        >Разрешённые Event Revision UUID (по одному в строке)<textarea
          v-model="revisionIds"
          rows="3"
        />
      </label>
      <fieldset>
        <legend>Источники</legend>
        <label
          v-for="source in ['SERVER', 'FRONTEND', 'INTERNAL'] as const"
          :key="source"
          ><input v-model="sources" type="checkbox" :value="source" />
          {{ source }}</label
        >
      </fieldset>
      <div class="row">
        <label>Reward USD<input v-model="reward" /></label
        ><label>User daily cap<input v-model="userCap" /></label
        ><label>Project daily cap<input v-model="projectCap" /></label>
      </div>
      <div class="row">
        <label>Timezone<input v-model="timezone" /></label
        ><label
          >TTL, sec<input
            v-model.number="ttl"
            type="number"
            min="60"
            max="31622400" /></label
        ><label
          >Cooldown, sec<input
            v-model.number="cooldown"
            type="number"
            min="0"
            max="31622400"
        /></label>
      </div>
      <div class="row">
        <label>С<input v-model="from" type="datetime-local" /></label
        ><label>До<input v-model="until" type="datetime-local" /></label>
      </div>
      <label
        >Причина<textarea v-model="reason" rows="2" maxlength="500" /></label
      ><label>Idempotency-Key<input v-model="idem" readonly /></label
      ><small v-if="formError" class="error" role="alert">{{
        formError
      }}</small>
      <footer>
        <Button
          label="Отмена"
          text
          type="button"
          @click="dialog = false"
        /><Button label="Сохранить ревизию" type="submit" :loading="saving" />
      </footer></form
  ></Dialog>
</template>
<style scoped>
.loyalty,
.rules,
.form {
  display: grid;
  gap: 14px;
}
.loyalty {
  padding: 20px;
  border: 1px solid var(--border-default);
  border-radius: 14px;
  background: var(--surface-card);
}
header,
.rules article,
footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
h3,
p {
  margin: 0;
}
p,
small {
  color: var(--text-small-muted);
}
.rules article {
  padding-top: 10px;
  border-top: 1px solid var(--border-subtle);
}
.rules article > div {
  display: grid;
  gap: 4px;
}
.form label {
  display: grid;
  gap: 5px;
  font-size: 0.75rem;
  font-weight: 700;
}
.form input,
.form select,
.form textarea {
  padding: 9px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--text-primary);
}
.row {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 10px;
}
fieldset {
  display: flex;
  gap: 16px;
}
.error {
  color: var(--status-danger-text);
}
@media (max-width: 700px) {
  header,
  .rules article {
    align-items: stretch;
    flex-direction: column;
  }
  .row {
    grid-template-columns: 1fr;
  }
}
</style>
