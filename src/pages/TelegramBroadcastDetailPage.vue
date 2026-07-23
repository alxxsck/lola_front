<script setup lang="ts">
import {
  computed,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { useRoute, useRouter } from "vue-router";
import { useAuthStore } from "@/features/auth/auth.store";
import { telegramBroadcastsApi } from "@/features/telegram-broadcasts/api/telegram-broadcasts.api";
import {
  telegramBroadcastPermissions,
  type TelegramBroadcastDraft,
} from "@/features/telegram-broadcasts/model/telegram-broadcast";
import { createTelegramBroadcastsController } from "@/features/telegram-broadcasts/model/use-telegram-broadcasts";
import TelegramBroadcastWorkspace from "@/features/telegram-broadcasts/ui/TelegramBroadcastWorkspace.vue";
import { useUnsavedChangesGuard } from "@/shared/lib/use-unsaved-changes-guard";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const controller = createTelegramBroadcastsController({
  api: telegramBroadcastsApi,
});
const documentVisible = ref(document.visibilityState === "visible");
const dirty = ref(false);
let activeAuthorityKey = "";

const permissions = computed(() =>
  telegramBroadcastPermissions(
    auth.project?.effectivePermissionCodes ?? [],
  ),
);
const protectedDirty = computed(
  () => dirty.value && controller.selected.value?.status === "DRAFT",
);

useUnsavedChangesGuard(
  protectedDirty,
  "Есть несохранённые изменения Telegram-рассылки. Покинуть страницу?",
);

function updateVisibility(): void {
  documentVisible.value = document.visibilityState === "visible";
}

async function synchronize(): Promise<void> {
  const projectId = auth.project?.id ?? "";
  const broadcastId =
    typeof route.params.broadcastId === "string"
      ? route.params.broadcastId
      : "";
  const authorityKey = `${projectId}:${broadcastId}:${Object.values(
    permissions.value,
  ).join(":")}`;
  const authorityChanged = authorityKey !== activeAuthorityKey;
  if (authorityChanged) {
    activeAuthorityKey = authorityKey;
    dirty.value = false;
  }
  controller.setContext({
    visible: documentVisible.value,
    projectId,
    permissions: permissions.value,
  });
  if (!permissions.value.read) {
    if (auth.isAuthenticated)
      await router.replace(auth.authenticatedLandingPath);
    return;
  }
  if (!projectId || !broadcastId || !documentVisible.value) return;
  const sameSelected =
    !authorityChanged && controller.selected.value?.id === broadcastId;
  if (sameSelected) {
    if (!dirty.value) await controller.refresh();
  } else {
    await controller.open(broadcastId);
  }
  if (
    controller.selected.value &&
    controller.selected.value.status !== "DRAFT"
  )
    await controller.loadDeliveries();
}

async function refresh(): Promise<void> {
  if (!(await controller.refresh())) return;
  if (controller.selected.value?.status !== "DRAFT")
    await controller.loadDeliveries();
}

async function saveDraft(draft: TelegramBroadcastDraft): Promise<void> {
  if (await controller.saveDraft(draft)) dirty.value = false;
}

async function mutate(
  operation: () => Promise<boolean>,
  loadOutcomes = true,
): Promise<void> {
  if (!(await operation())) return;
  await controller.refresh();
  if (loadOutcomes && controller.selected.value?.status !== "DRAFT")
    await controller.loadDeliveries();
}

async function retry(): Promise<void> {
  if (!(await controller.retryLastMutation())) return;
  await refresh();
}

async function requireFreshLogin(): Promise<void> {
  await auth.logout();
  controller.dispose();
  await router.replace({
    name: "login",
    query: { redirect: route.fullPath },
  });
}

onMounted(() => document.addEventListener("visibilitychange", updateVisibility));
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", updateVisibility);
  controller.dispose();
});

watch(
  () => ({
    projectId: auth.project?.id ?? "",
    broadcastId: String(route.params.broadcastId ?? ""),
    permissionSignature: Object.values(permissions.value).join(":"),
    visible: documentVisible.value,
  }),
  () => void synchronize(),
  { immediate: true },
);
</script>

<template>
  <TelegramBroadcastWorkspace
    v-if="controller.selected.value"
    :broadcast="controller.selected.value"
    :preview="controller.currentPreview.value"
    :latest-test-send="controller.latestTestSend.value"
    :deliveries="controller.deliveries.value"
    :delivery-total="controller.deliveryTotal.value"
    :next-delivery-cursor="controller.nextDeliveryCursor.value"
    :availability="controller.actionAvailability.value"
    :loading="
      controller.detailLoading.value || controller.deliveriesLoading.value
    "
    :mutating="controller.mutating.value"
    :error="controller.error.value"
    :retry-available="controller.transportRetryAvailable.value"
    @back="router.push({ name: 'telegram-broadcasts' })"
    @save-draft="saveDraft"
    @generate-preview="controller.generatePreview()"
    @test-send="controller.testSend"
    @approve="mutate(controller.approve)"
    @start="mutate(controller.start)"
    @schedule="mutate(() => controller.schedule($event))"
    @pause="mutate(controller.pause)"
    @resume="mutate(controller.resume)"
    @cancel="mutate(controller.cancel)"
    @refresh="refresh"
    @load-more-deliveries="controller.loadDeliveries(true)"
    @retry="retry"
    @fresh-login="requireFreshLogin"
    @dirty-change="dirty = $event"
  />
  <section v-else class="page broadcast-detail-state">
    <p
      v-if="controller.detailLoading.value"
      role="status"
      aria-live="polite"
    >
      Загружаем Telegram-рассылку…
    </p>
    <p v-else-if="controller.error.value" role="alert">
      {{ controller.error.value.message }}
    </p>
  </section>
</template>

<style scoped>
.broadcast-detail-state {
  padding: 24px;
}
</style>
