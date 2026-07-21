<script setup lang="ts">
import { ref } from 'vue'
import Button from 'primevue/button'
import Dialog from 'primevue/dialog'

const props = defineProps<{
  secret: string
  expiresAt: string
  status: string
}>()

const emit = defineEmits<{ acknowledged: [] }>()
const acknowledged = ref(false)
const copyState = ref<'IDLE' | 'COPIED' | 'FAILED'>('IDLE')

async function copySecret(): Promise<void> {
  try {
    await navigator.clipboard.writeText(props.secret)
    copyState.value = 'COPIED'
  } catch {
    copyState.value = 'FAILED'
  }
}

function finish(): void {
  if (acknowledged.value) emit('acknowledged')
}

function expiryLabel(value: string): string {
  const date = new Date(value)
  return Number.isFinite(date.getTime())
    ? new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(date)
    : 'срок не указан'
}
</script>

<template>
  <Dialog
    visible
    modal
    :closable="false"
    :close-on-escape="false"
    header="Секрет первоначального доступа"
    :style="{ width: 'min(560px, calc(100vw - 28px))' }"
  >
    <div class="secret-dialog">
      <div class="warning">
        <i class="pi pi-shield" />
        <div>
          <strong>Сохраните секрет сейчас</strong>
          <span>После закрытия это значение нельзя будет открыть повторно.</span>
        </div>
      </div>

      <div class="secret-box">
        <code data-testid="secret-value" tabindex="0">{{ secret }}</code>
        <Button
          data-testid="copy-secret"
          label="Скопировать"
          icon="pi pi-copy"
          severity="secondary"
          @click="copySecret"
        />
      </div>

      <p class="meta">
        Действует до {{ expiryLabel(expiresAt) }}.
        <template v-if="status === 'SUSPENDED' || status === 'DEACTIVATED'">
          Доступ останется заблокирован, пока CMS User не будет реактивирован.
        </template>
      </p>
      <p class="copy-result" aria-live="polite">
        <template v-if="copyState === 'COPIED'">Секрет скопирован.</template>
        <template v-else-if="copyState === 'FAILED'">
          Не удалось скопировать. Выделите и скопируйте секрет вручную.
        </template>
      </p>

      <label class="acknowledgement">
        <input v-model="acknowledged" type="checkbox" />
        <span>Я сохранил секрет и понимаю, что повторно открыть его нельзя.</span>
      </label>
    </div>

    <template #footer>
      <Button
        data-testid="acknowledge-secret"
        label="Секрет сохранён"
        :disabled="!acknowledged"
        @click="finish"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.secret-dialog { display: grid; gap: 18px; }
.warning { display: flex; gap: 12px; padding: 14px; border-radius: 14px; background: var(--status-warning-soft); color: var(--status-warning-text); }
.warning i { margin-top: 3px; }
.warning strong, .warning span { display: block; }
.warning span { margin-top: 4px; font-size: .74rem; line-height: 1.45; }
.secret-box { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 10px; align-items: center; }
.secret-box code { overflow: auto; padding: 14px; border: 1px solid var(--border-default); border-radius: 11px; background: var(--surface-subtle); font-size: .8rem; user-select: all; }
.meta, .copy-result { margin: 0; color: var(--muted); font-size: .72rem; line-height: 1.5; }
.copy-result { min-height: 1.1rem; color: var(--text-secondary); }
.acknowledgement { display: flex; align-items: flex-start; gap: 9px; font-size: .75rem; line-height: 1.45; }
.acknowledgement input { margin-top: 2px; }
@media (max-width: 560px) { .secret-box { grid-template-columns: 1fr; } }
</style>
