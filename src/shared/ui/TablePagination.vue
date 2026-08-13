<script setup lang="ts">
import { computed } from 'vue';

const props = withDefaults(
  defineProps<{
    page: number;
    pageSize?: number;
    total: number;
    previousLabel?: string;
    nextLabel?: string;
  }>(),
  {
    pageSize: 10,
    previousLabel: 'Предыдущая страница',
    nextLabel: 'Следующая страница',
  },
);

const emit = defineEmits<{
  'update:page': [page: number];
}>();

const pageCount = computed(() => Math.max(1, Math.ceil(props.total / props.pageSize)));
const firstItem = computed(() => (props.page - 1) * props.pageSize + 1);
const lastItem = computed(() => Math.min(props.total, props.page * props.pageSize));
</script>

<template>
  <nav v-if="total" class="table-pagination" aria-label="Навигация по таблице">
    <span>{{ firstItem }}–{{ lastItem }} из {{ total }}</span>
    <div v-if="pageCount > 1" class="table-pagination__actions">
      <button
        type="button"
        class="table-pagination__button"
        :aria-label="previousLabel"
        :disabled="page <= 1"
        @click="emit('update:page', page - 1)"
      >
        <span aria-hidden="true">←</span>
        Назад
      </button>
      <span aria-current="page">{{ page }} / {{ pageCount }}</span>
      <button
        type="button"
        class="table-pagination__button"
        :aria-label="nextLabel"
        :disabled="page >= pageCount"
        @click="emit('update:page', page + 1)"
      >
        Дальше
        <span aria-hidden="true">→</span>
      </button>
    </div>
  </nav>
</template>

<style scoped>
.table-pagination,
.table-pagination__actions,
.table-pagination__button {
  display: flex;
  align-items: center;
}
.table-pagination {
  justify-content: space-between;
  gap: 12px;
  padding-top: 12px;
  color: var(--text-secondary);
  font-size: var(--font-size-body-small);
}
.table-pagination__actions {
  gap: 8px;
}
.table-pagination__button {
  gap: 6px;
  min-height: 34px;
  padding: 6px 10px;
  border-color: var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
  font-size: var(--font-size-body-small);
}
.table-pagination__button:hover:not(:disabled) {
  background: var(--surface-hover);
}
@media (max-width: 560px) {
  .table-pagination {
    align-items: stretch;
    flex-direction: column;
  }
  .table-pagination__actions {
    justify-content: space-between;
  }
}
</style>
