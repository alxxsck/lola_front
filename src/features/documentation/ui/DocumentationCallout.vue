<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  text: string
  icon?: string
  routeName?: string
}>(), {
  title: 'Как это работает',
  icon: 'pi pi-book',
  routeName: 'scenario-guide',
})
</script>

<template>
  <RouterLink :to="{ name: routeName }" class="documentation-callout" :aria-label="`Открыть руководство «${title}»`">
    <span class="callout-icon"><i :class="icon" /></span>
    <span class="callout-copy"><small>Руководство</small><strong>{{ title }}</strong><span>{{ text }}</span></span>
    <span class="callout-link">Читать <i class="pi pi-arrow-right" /></span>
  </RouterLink>
</template>

<style scoped>
.documentation-callout{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:14px;padding:16px 18px;border:1px solid color-mix(in srgb,var(--status-violet) 28%,var(--border-default));border-radius:17px;background:linear-gradient(120deg,var(--surface-card) 0%,var(--status-violet-soft) 58%,var(--brand-soft) 135%);box-shadow:var(--shadow-raised);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.documentation-callout:hover{transform:translateY(-1px);border-color:color-mix(in srgb,var(--status-violet) 48%,var(--border-default));box-shadow:var(--shadow-raised)}.callout-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:var(--surface-emphasis);color:var(--accent)}.callout-copy{min-width:0}.callout-copy small,.callout-copy strong,.callout-copy>span{display:block}.callout-copy small{color:var(--status-violet-text);font-size:.61rem;font-weight:800;text-transform:uppercase;letter-spacing:.11em}.callout-copy strong{margin-top:3px;font:700 .85rem var(--font-display)}.callout-copy>span{margin-top:3px;color:var(--documentation-callout-text);font-size:.7rem;line-height:1.4}.callout-link{display:flex;align-items:center;gap:7px;color:var(--text-link);font-size:.72rem;font-weight:700}.callout-link i{font-size:.66rem}@media(max-width:620px){.documentation-callout{grid-template-columns:38px minmax(0,1fr)}.callout-icon{width:38px;height:38px}.callout-link{grid-column:2}}
</style>
