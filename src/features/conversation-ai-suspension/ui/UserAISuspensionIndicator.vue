<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import type { CmsConversationAISuspensionSummaryResponseDto } from '@/shared/api/generated/models'
import { russianCount } from '@/shared/lib/russian-count'
import { createServerClock } from '../model/suspension-state'

const props = defineProps<{ summary: CmsConversationAISuspensionSummaryResponseDto }>()
const emit = defineEmits<{ expired: [] }>()
const clock = computed(() => {
  try {
    return createServerClock(props.summary.serverTime)
  } catch {
    return null
  }
})
const clientNow = ref(Date.now())
let timer: ReturnType<typeof setInterval> | undefined
onMounted(() => { timer = setInterval(() => { clientNow.value = Date.now() }, 1_000) })
onBeforeUnmount(() => timer && clearInterval(timer))

const visible = computed(() => {
  if (!clock.value) return false
  if (props.summary.activeConversationCount <= 0) return false
  if (!props.summary.nearestSuspendedUntil) return true
  const deadline = Date.parse(props.summary.nearestSuspendedUntil)
  return Number.isFinite(deadline) && deadline > clock.value.now(clientNow.value)
})
const accessibleLabel = computed(() => `AI приостановлен в ${russianCount(props.summary.activeConversationCount, ['диалоге', 'диалогах', 'диалогах'])}`)
const tooltip = computed(() => {
  const count = accessibleLabel.value
  if (!props.summary.nearestSuspendedUntil) return count
  const deadline = new Intl.DateTimeFormat('ru-RU', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(props.summary.nearestSuspendedUntil))
  return `${count}. Ближайшее возобновление: ${deadline}`
})

watch(visible, (value, previous) => {
  if (previous && !value && props.summary.activeConversationCount > 0) emit('expired')
})
</script>

<template>
  <span v-if="visible" class="user-suspension" :aria-label="accessibleLabel" :title="tooltip">
    <i class="pi pi-pause-circle" aria-hidden="true" />
    <b v-if="summary.activeConversationCount > 1">{{ summary.activeConversationCount }}</b>
    <span class="sr-only">{{ accessibleLabel }}</span>
  </span>
</template>

<style scoped>
.user-suspension { display: inline-flex; align-items: center; gap: 3px; min-height: 24px; padding: 3px 6px; border: 1px solid color-mix(in srgb, var(--status-danger) 40%, transparent); border-radius: 999px; background: var(--status-danger-soft); color: var(--status-danger-text); }
.user-suspension i { font-size: .9rem; }
.user-suspension b { font-size: .68rem; }
.sr-only { position: absolute; width: 1px; height: 1px; padding: 0; margin: -1px; overflow: hidden; clip: rect(0, 0, 0, 0); white-space: nowrap; border: 0; }
</style>
