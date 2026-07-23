<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Dialog from "primevue/dialog";
import { useAuthStore } from "@/features/auth/auth.store";
import { telegramBroadcastsApi } from "@/features/telegram-broadcasts/api/telegram-broadcasts.api";
import {
  createEmptyBroadcastDraft,
  telegramBroadcastPermissions,
  type TelegramBroadcastDraft,
} from "@/features/telegram-broadcasts/model/telegram-broadcast";
import { createTelegramBroadcastsController } from "@/features/telegram-broadcasts/model/use-telegram-broadcasts";
import TelegramBroadcastDraftForm from "@/features/telegram-broadcasts/ui/TelegramBroadcastDraftForm.vue";
import TelegramBroadcastList from "@/features/telegram-broadcasts/ui/TelegramBroadcastList.vue";
import { useUnsavedChangesGuard } from "@/shared/lib/use-unsaved-changes-guard";

const auth = useAuthStore();
const router = useRouter();
const controller = createTelegramBroadcastsController({
  api: telegramBroadcastsApi,
});
const documentVisible = ref(document.visibilityState === "visible");
const createVisible = ref(false);
const createDirty = ref(false);
const createProjectId = ref("");
const emptyDraft = ref(createEmptyBroadcastDraft());
const protectedCreateDirty = computed(
  () => createVisible.value && createDirty.value,
);
const permissions = computed(() =>
  telegramBroadcastPermissions(
    auth.project?.effectivePermissionCodes ?? [],
  ),
);
const createAuthorityValid = computed(
  () =>
    auth.isAuthenticated &&
    Boolean(createProjectId.value) &&
    createProjectId.value === auth.project?.id &&
    permissions.value.read &&
    permissions.value.draft,
);
const { confirmDiscard } = useUnsavedChangesGuard(
  protectedCreateDirty,
  "Есть несохранённый черновик Telegram-рассылки. Покинуть страницу?",
);

function updateVisibility(): void {
  documentVisible.value = document.visibilityState === "visible";
}

async function synchronize(): Promise<void> {
  const projectId = auth.project?.id ?? "";
  if (createVisible.value && !createAuthorityValid.value) resetCreate();
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
  if (projectId && documentVisible.value) await controller.loadList();
}

async function createBroadcast(draft: TelegramBroadcastDraft): Promise<void> {
  if (!createAuthorityValid.value) return;
  if (!(await controller.create(draft))) return;
  const broadcastId = controller.selected.value?.id;
  if (!broadcastId) return;
  resetCreate();
  await router.push({
    name: "telegram-broadcast-detail",
    params: { broadcastId },
  });
}

function openCreate(): void {
  emptyDraft.value = createEmptyBroadcastDraft();
  createDirty.value = false;
  createProjectId.value = auth.project?.id ?? "";
  createVisible.value = true;
}

function resetCreate(): void {
  createVisible.value = false;
  createDirty.value = false;
  createProjectId.value = "";
  emptyDraft.value = createEmptyBroadcastDraft();
}

function requestCreateVisible(visible: boolean): void {
  if (visible) {
    createVisible.value = true;
    return;
  }
  if (!confirmDiscard()) return;
  resetCreate();
}

onMounted(() => document.addEventListener("visibilitychange", updateVisibility));
onBeforeUnmount(() => {
  document.removeEventListener("visibilitychange", updateVisibility);
  controller.dispose();
});

watch(
  () => ({
    projectId: auth.project?.id ?? "",
    permissionSignature: Object.values(permissions.value).join(":"),
    visible: documentVisible.value,
  }),
  () => void synchronize(),
  { immediate: true },
);
</script>

<template>
  <section class="page telegram-broadcasts-page">
    <TelegramBroadcastList
      :items="controller.items.value"
      :total="controller.listTotal.value"
      :loading="controller.listLoading.value"
      :permissions="permissions"
      :next-cursor="controller.nextListCursor.value"
      :error="controller.error.value?.message"
      @create="openCreate"
      @open="
        router.push({
          name: 'telegram-broadcast-detail',
          params: { broadcastId: $event },
        })
      "
      @refresh="controller.loadList()"
      @load-more="controller.loadList({ append: true })"
    />

    <Dialog
      :visible="createVisible"
      modal
      :draggable="false"
      header="Новая Telegram-рассылка"
      :style="{ width: 'min(680px, calc(100vw - 28px))' }"
      @update:visible="requestCreateVisible"
    >
      <TelegramBroadcastDraftForm
        :draft="emptyDraft"
        :disabled="controller.mutating.value || !createAuthorityValid"
        @save="createBroadcast"
        @dirty-change="createDirty = $event"
      />
      <p
        v-if="controller.error.value"
        class="create-error"
        role="alert"
      >
        {{ controller.error.value.message }}
      </p>
    </Dialog>
  </section>
</template>

<style scoped>
.create-error {
  color: var(--status-danger);
}
</style>
