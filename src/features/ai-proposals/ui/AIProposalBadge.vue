<script setup lang="ts">
defineProps<{ count: number }>();
</script>

<template>
  <span
    v-if="count > 0"
    class="proposal-badge"
    :aria-label="`${count} непрочитанных предложений Lola`"
  >
    {{ count > 99 ? "99+" : count }}
  </span>
</template>

<style scoped>
.proposal-badge {
  min-width: 22px;
  height: 20px;
  margin-left: auto;
  padding: 0 6px;
  border-radius: 999px;
  display: inline-grid;
  place-items: center;
  background: var(--brand);
  color: var(--on-brand);
  font-size: 0.67rem;
  font-weight: 800;
  line-height: 1;
}
</style>
