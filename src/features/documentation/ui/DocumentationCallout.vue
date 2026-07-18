<script setup lang="ts">
withDefaults(defineProps<{
  title?: string
  text: string
  icon?: string
}>(), {
  title: 'Как это работает',
  icon: 'pi pi-book',
})
</script>

<template>
  <RouterLink :to="{ name: 'scenario-guide' }" class="documentation-callout" aria-label="Открыть руководство «Как работают сценарии Lola»">
    <span class="callout-icon"><i :class="icon" /></span>
    <span class="callout-copy"><small>Руководство</small><strong>{{ title }}</strong><span>{{ text }}</span></span>
    <span class="callout-link">Читать <i class="pi pi-arrow-right" /></span>
  </RouterLink>
</template>

<style scoped>
.documentation-callout{display:grid;grid-template-columns:42px minmax(0,1fr) auto;align-items:center;gap:14px;padding:16px 18px;border:1px solid #ddd8f7;border-radius:17px;background:linear-gradient(120deg,#fbfaff 0%,#f1efff 58%,#f5ffd9 135%);box-shadow:0 8px 28px rgba(94,75,173,.07);transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease}.documentation-callout:hover{transform:translateY(-1px);border-color:#c9c0f1;box-shadow:0 13px 34px rgba(94,75,173,.11)}.callout-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:#25281f;color:var(--accent)}.callout-copy{min-width:0}.callout-copy small,.callout-copy strong,.callout-copy>span{display:block}.callout-copy small{color:#7865cc;font-size:.61rem;font-weight:800;text-transform:uppercase;letter-spacing:.11em}.callout-copy strong{margin-top:3px;font:700 .85rem Manrope}.callout-copy>span{margin-top:3px;color:var(--muted);font-size:.7rem;line-height:1.4}.callout-link{display:flex;align-items:center;gap:7px;color:#604db7;font-size:.72rem;font-weight:700}.callout-link i{font-size:.66rem}@media(max-width:620px){.documentation-callout{grid-template-columns:38px minmax(0,1fr)}.callout-icon{width:38px;height:38px}.callout-link{grid-column:2}}
</style>
