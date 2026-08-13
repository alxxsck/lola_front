<script setup lang="ts">
import { computed } from 'vue';

const props = defineProps<{
  expanded: boolean;
  filters: object;
}>();
const emit = defineEmits<{
  'update:expanded': [value: boolean];
}>();

const activeFilterCount = computed(
  () =>
    Object.values(props.filters).filter(
      (value) => value !== null && value !== undefined && value !== '',
    ).length,
);
</script>

<template>
  <button
    type="button"
    class="ai-filter-toggle"
    :aria-expanded="expanded"
    @click="emit('update:expanded', !expanded)"
  >
    <span><i class="pi pi-sliders-h" /> Фильтры</span>
    <strong v-if="activeFilterCount">{{ activeFilterCount }}</strong>
    <i class="pi" :class="expanded ? 'pi-chevron-up' : 'pi-chevron-down'" />
  </button>
</template>
