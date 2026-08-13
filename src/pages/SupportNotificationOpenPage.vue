<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import { useAuthStore } from '@/features/auth/auth.store';
import { supportNotificationsSource } from '@/features/support-notifications/api/support-notifications-source';
import {
  clearSupportNotificationCapability,
  readSupportNotificationCapability,
} from '@/features/support-notifications/model/support-notification-capability';
import { ApiError } from '@/shared/api/http/api-error';

const auth = useAuthStore();
const router = useRouter();
const failed = ref(false);
const abort = new AbortController();

async function resolve(): Promise<void> {
  failed.value = false;
  const capability = readSupportNotificationCapability() ?? '';
  if (!/^[A-Za-z0-9_-]{43}$/u.test(capability)) {
    failed.value = true;
    return;
  }
  try {
    const target = await supportNotificationsSource.resolveDeepLink(capability, abort.signal);
    const project = auth.projects.find((item) => item.id === target.projectId);
    if (
      !project ||
      target.target !== 'SUPPORT_OPERATOR_WORKSPACE' ||
      target.selection.kind !== 'CASE'
    ) {
      clearSupportNotificationCapability();
      failed.value = true;
      return;
    }
    clearSupportNotificationCapability();
    if (auth.project?.id !== project.id) auth.selectProject(project.id);
    await router.replace({
      name: 'support-inbox-case',
      params: { caseId: target.selection.caseId },
      query: { projectId: project.id },
    });
  } catch (cause) {
    if (cause instanceof ApiError && cause.status === 401) {
      await router.replace({
        name: 'login',
        query: { redirect: '/support/notifications/open' },
      });
      return;
    }
    clearSupportNotificationCapability();
    failed.value = true;
  }
}

onMounted(resolve);
onBeforeUnmount(() => abort.abort());
</script>

<template>
  <section class="notification-open-page">
    <div v-if="!failed" class="open-card" aria-live="polite">
      <span class="open-icon"><i class="pi pi-spin pi-spinner" /></span>
      <h1>Открываем обращение</h1>
      <p>Проверяем доступ и открываем нужное обращение поддержки.</p>
    </div>
    <div v-else class="open-card" role="alert">
      <span class="open-icon muted"><i class="pi pi-link" /></span>
      <h1>Ссылка больше недоступна</h1>
      <p>Она могла истечь, уже использоваться или доступ к обращению изменился.</p>
      <Button
        label="Открыть входящие"
        icon="pi pi-inbox"
        @click="router.replace('/support/inbox')"
      />
    </div>
  </section>
</template>

<style scoped>
.notification-open-page {
  display: grid;
  min-height: calc(100dvh - 90px);
  place-items: center;
  padding: 24px;
}
.open-card {
  display: grid;
  justify-items: center;
  width: min(440px, 100%);
  padding: 34px;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--surface-card);
  box-shadow: var(--shadow-dialog);
  text-align: center;
}
.open-icon {
  display: grid;
  width: 52px;
  height: 52px;
  place-items: center;
  margin-bottom: 12px;
  border-radius: 16px;
  background: var(--brand-soft);
  color: var(--text-brand);
  font-size: 1.1rem;
}
.open-icon.muted {
  background: var(--surface-subtle);
  color: var(--text-muted);
}
.open-card h1 {
  margin: 0;
  font-size: 1.4rem;
}
.open-card p {
  margin: 10px 0 20px;
  color: var(--text-muted);
  font-size: 0.76rem;
  line-height: 1.55;
}
</style>
