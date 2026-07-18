<script setup lang="ts">
import { computed } from 'vue'
import { setTheme, useTheme } from '@/shared/theme/theme'

const theme = useTheme()
const isDark = computed(() => theme.value === 'dark')

function changeTheme(event: Event) {
  setTheme((event.target as HTMLInputElement).checked ? 'dark' : 'light')
}
</script>

<template>
  <label class="theme-switch">
    <input type="checkbox" :checked="isDark" @change="changeTheme">
    <i :class="isDark ? 'pi pi-moon' : 'pi pi-sun'" aria-hidden="true" />
    <span class="theme-copy"><strong>Тема</strong><small>{{ isDark ? 'Тёмная' : 'Светлая' }}</small></span>
    <span class="theme-track" aria-hidden="true"><span /></span>
  </label>
</template>

<style scoped>
.theme-switch { position:relative; display:flex; align-items:center; gap:10px; padding:10px 11px; border-radius:12px; background:var(--sidebar-surface-hover); color:var(--sidebar-text); cursor:pointer; }
.theme-switch:has(input:focus-visible) { outline:3px solid color-mix(in srgb,var(--focus-ring) 55%,transparent); outline-offset:2px; }
.theme-switch input { position:absolute; z-index:1; inset:0; width:100%; height:100%; margin:0; opacity:0; cursor:pointer; }
.theme-switch>i { width:18px; color:var(--brand); text-align:center; font-size:.82rem; }
.theme-copy { display:flex; min-width:0; flex:1; flex-direction:column; }
.theme-copy strong { font-size:.74rem; }
.theme-copy small { margin-top:3px; color:var(--sidebar-text-muted); font-size:.66rem; }
.theme-track { display:flex; width:30px; padding:3px; border-radius:999px; background:var(--sidebar-text-subtle); transition:background .18s ease; }
.theme-track span { width:12px; height:12px; border-radius:50%; background:var(--sidebar-text); transition:transform .18s ease; }
.theme-switch input:checked~.theme-track { background:var(--brand); }
.theme-switch input:checked~.theme-track span { background:var(--on-brand); transform:translateX(12px); }
</style>
