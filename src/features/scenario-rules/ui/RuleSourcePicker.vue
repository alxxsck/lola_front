<script setup lang="ts">
import type { PartialRuleLeaf } from '../model'

defineProps<{ groupLabel: string; aggregateLimitReached?: boolean }>()
const emit = defineEmits<{
  select: [kind: PartialRuleLeaf['kind']]
  close: []
}>()
</script>

<template>
  <section class="source-picker" role="dialog" aria-modal="false" :aria-label="`Выберите источник условия для ${groupLabel}`">
    <header>
      <div><small>Новое условие</small><h3>Какие данные проверить?</h3></div>
      <button type="button" class="icon-button" aria-label="Закрыть выбор источника" @click="emit('close')"><i class="pi pi-times" /></button>
    </header>
    <div class="source-list">
      <button type="button" data-source="eventField" @click="emit('select', 'eventField')">
        <i class="pi pi-bolt" /><span><strong>Поле события запуска</strong><small>Проверить данные события, которое запускает сценарий.</small></span><i class="pi pi-chevron-right" />
      </button>
      <button type="button" data-source="eventAggregate" :disabled="aggregateLimitReached" :title="aggregateLimitReached ? 'Достигнут лимит условий истории и активных дней' : undefined" @click="emit('select', 'eventAggregate')">
        <i class="pi pi-history" /><span><strong>История событий</strong><small>Посчитать события пользователя за выбранный период.</small></span><i class="pi pi-chevron-right" />
      </button>
      <button type="button" data-source="activityDayStreak" :disabled="aggregateLimitReached" :title="aggregateLimitReached ? 'Достигнут лимит условий истории и активных дней' : undefined" @click="emit('select', 'activityDayStreak')">
        <i class="pi pi-calendar" /><span><strong>Активные дни</strong><small>Проверить серию последовательных Activity Day.</small></span><i class="pi pi-chevron-right" />
      </button>
    </div>
  </section>
</template>

<style scoped>
.source-picker{margin:14px 0;padding:16px;border:1px solid #dcdde7;border-radius:16px;background:#fff;box-shadow:0 14px 38px rgba(35,39,31,.09)}header{display:flex;align-items:flex-start;justify-content:space-between;gap:12px}header small{color:var(--muted);font-size:.64rem;text-transform:uppercase;letter-spacing:.1em}h3{margin:3px 0 0;font-size:.92rem}.icon-button{display:grid;place-items:center;width:36px;height:36px;border:0;border-radius:10px;background:transparent;color:var(--muted);cursor:pointer}.source-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:9px;margin-top:14px}.source-list button{display:grid;grid-template-columns:34px minmax(0,1fr) 16px;align-items:center;gap:9px;min-width:0;padding:12px;border:1px solid var(--line);border-radius:13px;background:#fafaf8;color:var(--ink);text-align:left;cursor:pointer}.source-list button:hover{border-color:#bcb2ec;background:#f8f6ff}.source-list button:disabled{opacity:.5;cursor:not-allowed}.source-list button:disabled:hover{border-color:var(--line);background:#fafaf8}.source-list button>i:first-child{display:grid;place-items:center;width:34px;height:34px;border-radius:10px;background:#eeeaff;color:#6d57d3}.source-list button>i:last-child{font-size:.65rem;color:#9b9f97}.source-list strong,.source-list small{display:block}.source-list strong{font-size:.75rem}.source-list small{margin-top:3px;color:var(--muted);font-size:.64rem;line-height:1.35}@container rule-builder (max-width:768px){.source-list{grid-template-columns:1fr}}@container rule-builder (max-width:390px){.source-picker{padding:12px}.source-list button{padding:10px}}@container rule-builder (max-width:320px){.source-picker{margin-inline:0}.source-list button{grid-template-columns:30px minmax(0,1fr) 12px}}
</style>
