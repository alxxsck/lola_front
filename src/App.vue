<script setup lang="ts">
import { watch } from 'vue';
import Toast from 'primevue/toast';
import ConfirmDialog from 'primevue/confirmdialog';
import { useAuthStore } from '@/features/auth/auth.store';
import { productDocumentTitle } from '@/shared/config/product-brand';

const auth = useAuthStore();

watch(
  () => auth.project?.name,
  (projectName) => {
    document.title = productDocumentTitle(projectName);
  },
  { immediate: true },
);
</script>

<template>
  <RouterView />
  <Toast position="bottom-right" />
  <ConfirmDialog />
</template>
