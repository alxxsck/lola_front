<script setup lang="ts">
import { ref, watch } from 'vue'

import {
  deliveryPolicySummary,
  serializeDeliveryPolicy,
  type DeliveryPolicyDraft,
  type DeliveryPolicyKind,
} from '../model'

type DurationUnit = 'second' | 'minute' | 'hour' | 'day'

const props = defineProps<{ modelValue: DeliveryPolicyDraft }>()
const emit = defineEmits<{
  'update:modelValue': [value: DeliveryPolicyDraft]
  'validity-change': [valid: boolean]
}>()

const cards: Array<{ kind: DeliveryPolicyKind; title: string; description: string }> = [
  { kind: 'IMMEDIATE', title: 'Выполнить сразу', description: 'Действие запускается сразу; отсутствие пользователя в сети само по себе его не отменяет.' },
  { kind: 'SKIP_IF_OFFLINE', title: 'Пропустить, если пользователь не в сети', description: 'Сценарий продолжится без этого действия.' },
  { kind: 'FAIL_IF_OFFLINE', title: 'Завершить ошибкой, если пользователь не в сети', description: 'Run явно зафиксирует неуспешную доставку.' },
  { kind: 'WAIT_UNTIL_ONLINE', title: 'Подождать появления в сети', description: 'Ожидание всегда ограничено отдельным сроком.' },
]
const units = [
  { value: 'second', label: 'секунд', multiplier: 1_000 },
  { value: 'minute', label: 'минут', multiplier: 60_000 },
  { value: 'hour', label: 'часов', multiplier: 3_600_000 },
  { value: 'day', label: 'дней', multiplier: 86_400_000 },
] as const
const kind = ref<DeliveryPolicyKind>('IMMEDIATE')
const duration = ref(1)
const durationUnit = ref<DurationUnit>('day')
const recheckEligibility = ref(false)

function periodFromMs(milliseconds: number): [number, DurationUnit] {
  for (const unit of [...units].reverse()) {
    if (milliseconds >= unit.multiplier && milliseconds % unit.multiplier === 0) return [milliseconds / unit.multiplier, unit.value]
  }
  return [Math.max(1, milliseconds / 1_000), 'second']
}

watch(() => props.modelValue, (value) => {
  kind.value = value.kind
  if (value.kind === 'WAIT_UNTIL_ONLINE') {
    ;[duration.value, durationUnit.value] = periodFromMs(value.expiryMs)
    recheckEligibility.value = value.recheckEligibility
  }
}, { immediate: true })

function current(): DeliveryPolicyDraft {
  if (kind.value !== 'WAIT_UNTIL_ONLINE') return { kind: kind.value }
  const multiplier = units.find((unit) => unit.value === durationUnit.value)?.multiplier ?? 1_000
  return { kind: kind.value, expiryMs: Number(duration.value) * multiplier, recheckEligibility: recheckEligibility.value }
}

function commit() {
  const value = current()
  emit('update:modelValue', value)
  emit('validity-change', serializeDeliveryPolicy(value).ok)
}

function focusIssue(path: string) {
  const selector = path.includes('expiryMs')
    ? '[aria-label="Срок ожидания появления в сети"]'
    : path.includes('recheckEligibility')
      ? '[aria-label="Повторно проверить условия перед доставкой"]'
      : 'input[name="delivery-policy"]'
  document.querySelector<HTMLElement>(selector)?.focus()
}

defineExpose({ focusIssue })
</script>

<template>
  <section class="delivery-editor" aria-labelledby="delivery-title">
    <div class="delivery-head"><span>Политика доставки</span><h2 id="delivery-title">Что делать, если пользователь не в сети</h2><p>Доставка настраивается отдельно от условий и срока цели.</p></div>
    <div class="policy-cards">
      <label v-for="card in cards" :key="card.kind" class="policy-card" :class="{ selected: kind === card.kind }">
        <input v-model="kind" type="radio" name="delivery-policy" :value="card.kind" @change="commit">
        <span><strong>{{ card.title }}</strong><small>{{ card.description }}</small></span>
      </label>
    </div>
    <div v-if="kind === 'WAIT_UNTIL_ONLINE'" class="online-controls">
      <div><strong>Срок ожидания появления в сети</strong><p>По истечении этого срока действие больше не ждёт. Ожидание не продлевает срок цели.</p></div>
      <div class="duration-row"><input v-model.number="duration" type="number" min="1" aria-label="Срок ожидания появления в сети" @input="commit"><select v-model="durationUnit" aria-label="Единица срока ожидания появления в сети" @change="commit"><option v-for="unit in units" :key="unit.value" :value="unit.value">{{ unit.label }}</option></select></div>
      <label class="recheck"><input v-model="recheckEligibility" type="checkbox" aria-label="Повторно проверить условия перед доставкой" @change="commit"><span><strong>Повторно проверить условия перед доставкой</strong><small>Backend повторно применит pinned V2 rule; новый draft сценария на активный Run не влияет.</small></span></label>
    </div>
    <div class="delivery-summary"><i class="pi pi-info-circle" /><span>{{ deliveryPolicySummary(current()) }}</span></div>
  </section>
</template>

<style scoped>
.delivery-editor{display:grid;gap:18px;width:min(760px,100%)}.delivery-head span{color:var(--muted);font-size:.63rem;text-transform:uppercase;letter-spacing:.1em}.delivery-head h2{margin:5px 0 0;font-size:1.15rem}.delivery-head p,.online-controls p{margin:5px 0 0;color:var(--muted);font-size:.72rem}.policy-cards{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.policy-card{display:flex;gap:10px;padding:14px;border:1px solid #dfe2da;border-radius:14px;background:#fff;cursor:pointer}.policy-card.selected{border-color:#8b75ea;background:#f4f1ff;box-shadow:0 0 0 1px #8b75ea}.policy-card input{margin-top:3px}.policy-card strong,.policy-card small,.recheck strong,.recheck small{display:block}.policy-card strong,.recheck strong{font-size:.75rem}.policy-card small,.recheck small{margin-top:4px;color:var(--muted);font-size:.65rem;line-height:1.45}.online-controls{display:grid;gap:12px;padding:15px;border-radius:15px;background:#fff}.duration-row{display:grid;grid-template-columns:1fr 1fr;gap:8px}.duration-row input,.duration-row select{min-height:40px;border:1px solid #d9dcd4;border-radius:9px;background:#fff;padding:8px}.recheck{display:flex;align-items:flex-start;gap:9px}.recheck input{margin-top:3px}.delivery-summary{display:flex;gap:9px;padding:12px;border-radius:12px;background:#eef3e7;color:#58634b;font-size:.7rem}@media(max-width:560px){.policy-cards{grid-template-columns:1fr}}
</style>
