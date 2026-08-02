<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import { compareDecimalStrings } from "@/shared/lib/decimal-money";
import { aiAllowanceRepository } from "../api/ai-allowance-repository";
import { parseAllowanceUsd } from "../model/ai-allowance";

const props = defineProps<{ projectId: string }>();
const endUserId = ref("");
const amount = ref("");
const validFrom = ref(localInput(new Date()));
const expiresAt = ref(localInput(new Date(Date.now() + 86_400_000)));
const reason = ref("");
const saving = ref(false);
const error = ref("");
const notice = ref("");
const commandFingerprint = ref("");
const commandIdempotencyKey = ref("");
let generation = 0;

watch(
  () => props.projectId,
  () => {
    generation += 1;
    endUserId.value = "";
    amount.value = "";
    reason.value = "";
    error.value = "";
    notice.value = "";
    saving.value = false;
    resetCommand();
    validFrom.value = localInput(new Date());
    expiresAt.value = localInput(new Date(Date.now() + 86_400_000));
  },
);

async function submit(): Promise<void> {
  if (saving.value) return;
  const requestGeneration = generation;
  const requestProjectId = props.projectId;
  const requestEndUserId = endUserId.value.trim();
  const amountUsd = parseAllowanceUsd(amount.value.trim());
  const from = instant(validFrom.value);
  const until = instant(expiresAt.value);
  if (!requestEndUserId || requestEndUserId.length > 160)
    return fail("Укажите корректный End User ID.");
  if (!amountUsd || compareDecimalStrings(amountUsd, "0") <= 0)
    return fail("Сумма должна быть больше нуля.");
  if (!from || !until || from >= until)
    return fail("Проверьте период действия начисления.");
  if (reason.value.trim().length < 3 || reason.value.trim().length > 500)
    return fail("Причина должна содержать от 3 до 500 символов.");
  const command = {
    amountUsd,
    validFrom: from,
    expiresAt: until,
    reason: reason.value.trim(),
  };
  const fingerprint = JSON.stringify([
    requestProjectId,
    requestEndUserId,
    command.amountUsd,
    command.validFrom,
    command.expiresAt,
    command.reason,
  ]);
  if (commandFingerprint.value !== fingerprint) {
    commandFingerprint.value = fingerprint;
    commandIdempotencyKey.value = newIdempotencyKey();
  }
  saving.value = true;
  error.value = "";
  notice.value = "";
  try {
    await aiAllowanceRepository.createGrant(
      requestProjectId,
      requestEndUserId,
      command,
      commandIdempotencyKey.value,
    );
    if (
      requestGeneration !== generation ||
      requestProjectId !== props.projectId
    )
      return;
    notice.value = "Начисление создано и записано в allowance ledger.";
    amount.value = "";
    reason.value = "";
    resetCommand();
  } catch (cause) {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      error.value =
        cause instanceof Error
          ? cause.message
          : "Не удалось создать начисление";
  } finally {
    if (
      requestGeneration === generation &&
      requestProjectId === props.projectId
    )
      saving.value = false;
  }
}
function fail(message: string): void {
  error.value = message;
}
function resetCommand(): void {
  commandFingerprint.value = "";
  commandIdempotencyKey.value = "";
}
function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `grant-${Date.now()}`;
}
function instant(value: string): string | undefined {
  const parsed = new Date(value);
  return value && Number.isFinite(parsed.valueOf())
    ? parsed.toISOString()
    : undefined;
}
function localInput(value: Date): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16);
}
</script>

<template>
  <section class="direct-grant card">
    <header>
      <div>
        <h3>Ручное начисление квоты</h3>
        <p>Audited операция доступна отдельно от чтения баланса.</p>
      </div>
    </header>
    <form @submit.prevent="submit">
      <label
        >End User ID<input
          v-model="endUserId"
          maxlength="160"
          autocomplete="off"
      /></label>
      <label
        >Сумма, USD<input
          v-model="amount"
          inputmode="decimal"
          autocomplete="off"
      /></label>
      <label
        >Действует с<input v-model="validFrom" type="datetime-local"
      /></label>
      <label>Истекает<input v-model="expiresAt" type="datetime-local" /></label>
      <label class="reason"
        >Причина<textarea v-model="reason" rows="2" maxlength="500" />
      </label>
      <Button label="Начислить" type="submit" :loading="saving" />
    </form>
    <Message v-if="error" severity="error" :closable="false">{{
      error
    }}</Message>
    <Message v-if="notice" severity="success" :closable="false">{{
      notice
    }}</Message>
  </section>
</template>

<style scoped>
.direct-grant {
  display: grid;
  gap: 14px;
  padding: 20px;
}
.direct-grant h3,
.direct-grant p {
  margin: 0;
}
.direct-grant p {
  margin-top: 5px;
  color: var(--text-small-muted);
}
form {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1fr auto;
  align-items: end;
  gap: 10px;
}
label {
  display: grid;
  gap: 5px;
  font-size: 0.72rem;
  font-weight: 700;
}
input,
textarea {
  width: 100%;
  padding: 9px;
  border: 1px solid var(--border-default);
  border-radius: 8px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
}
.reason {
  grid-column: 1/-1;
}
@media (max-width: 900px) {
  form {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 560px) {
  form {
    grid-template-columns: 1fr;
  }
}
</style>
