<script setup lang="ts">
import { ref, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import { compareDecimalStrings } from '@/shared/lib/decimal-money';
import { aiAllowanceRepository } from '../api/ai-allowance-repository';
import { parseAllowanceUsd } from '../model/ai-allowance';
import { isAllowanceReauthenticationRequired } from '../model/allowance-reauthentication';
import AiAllowanceReauthenticationAction from './AiAllowanceReauthenticationAction.vue';

const props = defineProps<{ projectId: string }>();
const emit = defineEmits<{ 'fresh-login': [] }>();
const endUserId = ref('');
const amount = ref('');
const validFrom = ref(localInput(new Date()));
const expiresAt = ref(localInput(new Date(Date.now() + 86_400_000)));
const reason = ref('');
const saving = ref(false);
const error = ref('');
const notice = ref('');
const reauthenticationRequired = ref(false);
const commandFingerprint = ref('');
const commandIdempotencyKey = ref('');
let generation = 0;

watch(
  () => props.projectId,
  () => {
    generation += 1;
    endUserId.value = '';
    amount.value = '';
    reason.value = '';
    error.value = '';
    notice.value = '';
    reauthenticationRequired.value = false;
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
    return fail('Укажите корректный ID пользователя.');
  if (!amountUsd || compareDecimalStrings(amountUsd, '0') <= 0)
    return fail('Сумма должна быть больше нуля.');
  if (!from || !until || from >= until) return fail('Проверьте период действия начисления.');
  if (reason.value.trim().length < 3 || reason.value.trim().length > 500)
    return fail('Причина должна содержать от 3 до 500 символов.');
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
  error.value = '';
  notice.value = '';
  reauthenticationRequired.value = false;
  try {
    await aiAllowanceRepository.createGrant(
      requestProjectId,
      requestEndUserId,
      command,
      commandIdempotencyKey.value,
    );
    if (requestGeneration !== generation || requestProjectId !== props.projectId) return;
    notice.value = 'Дополнительный лимит начислен и сохранён в истории.';
    amount.value = '';
    reason.value = '';
    resetCommand();
  } catch (cause) {
    if (requestGeneration === generation && requestProjectId === props.projectId) {
      reauthenticationRequired.value = isAllowanceReauthenticationRequired(cause);
      error.value = reauthenticationRequired.value
        ? ''
        : cause instanceof Error
          ? cause.message
          : 'Не удалось создать начисление';
    }
  } finally {
    if (requestGeneration === generation && requestProjectId === props.projectId)
      saving.value = false;
  }
}
function fail(message: string): void {
  error.value = message;
}
function resetCommand(): void {
  commandFingerprint.value = '';
  commandIdempotencyKey.value = '';
}
function newIdempotencyKey(): string {
  return globalThis.crypto?.randomUUID?.() ?? `grant-${Date.now()}`;
}
function instant(value: string): string | undefined {
  const parsed = new Date(value);
  return value && Number.isFinite(parsed.valueOf()) ? parsed.toISOString() : undefined;
}
function localInput(value: Date): string {
  return new Date(value.getTime() - value.getTimezoneOffset() * 60_000).toISOString().slice(0, 16);
}
</script>

<template>
  <section class="direct-grant card">
    <header>
      <div>
        <h3>Начислить дополнительный лимит</h3>
        <p>
          Добавляет пользователю временную сумму сверх обычного лимита. Операция сохраняется в
          истории.
        </p>
      </div>
    </header>
    <form @submit.prevent="submit">
      <div class="grant-grid">
        <label
          ><span>ID пользователя</span
          ><input
            v-model="endUserId"
            maxlength="160"
            autocomplete="off"
            placeholder="Например: 8f4b2c..."
        /></label>
        <label
          ><span>Сумма</span
          ><span class="input-with-suffix"
            ><input
              v-model="amount"
              inputmode="decimal"
              autocomplete="off"
              placeholder="0,00"
            /><span>$</span></span
          ></label
        >
        <label
          ><span>Начало действия</span><input v-model="validFrom" type="datetime-local"
        /></label>
        <label
          ><span>Дата окончания</span><input v-model="expiresAt" type="datetime-local"
        /></label>
      </div>
      <label class="reason"
        ><span>Причина начисления</span
        ><textarea
          v-model="reason"
          rows="2"
          maxlength="500"
          placeholder="Например: компенсация за недоступность сервиса"
        />
      </label>
      <div class="form-actions">
        <Button label="Начислить лимит" type="submit" :loading="saving" />
      </div>
    </form>
    <Message v-if="error" severity="error" :closable="false">{{ error }}</Message>
    <AiAllowanceReauthenticationAction
      :required="reauthenticationRequired"
      @fresh-login="emit('fresh-login')"
    />
    <Message v-if="notice" severity="success" :closable="false">{{ notice }}</Message>
  </section>
</template>

<style scoped>
.direct-grant {
  display: grid;
  gap: 20px;
  padding: 24px;
}
.direct-grant h3,
.direct-grant p {
  margin: 0;
}
.direct-grant p {
  max-width: 720px;
  margin-top: 6px;
  color: var(--text-small-muted);
  line-height: 1.45;
}
form {
  display: grid;
  gap: 16px;
}
.grant-grid {
  display: grid;
  grid-template-columns: 1.6fr 0.8fr 1fr 1fr;
  gap: 12px;
}
label {
  display: grid;
  align-content: start;
  gap: 7px;
  color: var(--text-secondary);
  font-size: 0.8125rem;
  font-weight: 400;
}
input,
textarea {
  box-sizing: border-box;
  width: 100%;
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
textarea {
  min-height: 72px;
  padding-block: 10px;
  line-height: 1.4;
  resize: vertical;
}
.input-with-suffix {
  display: flex;
  height: 44px;
}
.input-with-suffix input {
  border-radius: 10px 0 0 10px;
}
.input-with-suffix > span {
  display: grid;
  place-items: center;
  min-width: 42px;
  border: 1px solid var(--border-default);
  border-left: 0;
  border-radius: 0 10px 10px 0;
  background: var(--surface-subtle);
  color: var(--text-secondary);
}
.form-actions {
  display: flex;
  justify-content: flex-start;
}
@media (max-width: 900px) {
  .grant-grid {
    grid-template-columns: 1fr 1fr;
  }
}
@media (max-width: 560px) {
  .direct-grant {
    padding: 18px;
  }
  .grant-grid {
    grid-template-columns: 1fr;
  }
  .form-actions :deep(.p-button) {
    width: 100%;
  }
}
</style>
