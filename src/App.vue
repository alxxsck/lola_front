<script setup lang="ts">
import { watch } from 'vue'
import Toast from 'primevue/toast'
import ConfirmDialog from 'primevue/confirmdialog'
import { useAuthStore } from '@/features/auth/auth.store'

const auth = useAuthStore()

watch(
  () => auth.project?.name,
  (projectName) => {
    document.title = projectName ? `Lo | ${projectName}` : 'Lo | CMS'
  },
  { immediate: true },
)
</script>

<template>
  <RouterView />
  <Toast position="bottom-right" />
  <ConfirmDialog />
</template>
