<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import {
  canManageSupportWorkspaceRollout,
  canReadSupportWorkspace,
} from "@/features/support-workspace/model/support-workspace-access";
import { supportWorkspaceRolloutSource } from "@/features/support-workspace/api/support-workspace-rollout-source";
import {
  createSupportWorkspaceRolloutController,
  type SupportWorkspaceRolloutPreset,
} from "@/features/support-workspace/model/use-support-workspace-rollout";
import {
  reportSupportWorkspaceTelemetry,
  supportWorkspaceViewportBucket,
} from "@/features/support-workspace/model/support-workspace-telemetry";
import {
  clearSupportWorkspaceShellAdmission,
  ensureSupportWorkspaceShellAdmission,
} from "@/features/support-workspace/model/support-workspace-shell-admission";

const auth = useAuthStore();
const router = useRouter();
const accessDenied = ref(false);
const reason = ref("");
const confirmationVisible = ref(false);
const pendingPreset = ref<SupportWorkspaceRolloutPreset | null>(null);
const confirmationTrigger = ref<HTMLElement | null>(null);
const permissionSignature = computed(() =>
  [...(auth.project?.effectivePermissionCodes ?? [])].sort().join("\u0000"),
);
const canManage = computed(
  () =>
    !accessDenied.value &&
    canManageSupportWorkspaceRollout(
      auth.project?.effectivePermissionCodes ?? [],
    ),
);
const canReadAdmission = computed(() =>
  canReadSupportWorkspace(auth.project?.effectivePermissionCodes ?? []),
);

const controller = createSupportWorkspaceRolloutController(
  {
    actorId: () => auth.user?.id,
    projectId: () => auth.project?.id,
    effectivePermissionCodes: () =>
      auth.project?.effectivePermissionCodes ?? [],
    canManage: () => canManage.value,
    canReadAdmission: () => canReadAdmission.value,
    async refreshAdmission() {
      const actorId = auth.user?.id;
      const projectId = auth.project?.id;
      const permissions = auth.project?.effectivePermissionCodes ?? [];
      if (!actorId || !projectId || !canReadAdmission.value) return null;
      clearSupportWorkspaceShellAdmission();
      return ensureSupportWorkspaceShellAdmission({
        actorId,
        projectId,
        effectivePermissionCodes: permissions,
      });
    },
    async onForbidden() {
      accessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // The protected rollout state is already purged.
      }
      if (
        !canManageSupportWorkspaceRollout(
          auth.project?.effectivePermissionCodes ?? [],
        )
      )
        await router.replace("/overview");
    },
    async onUnauthorized() {
      await router.replace("/login");
    },
    recordTelemetry(name, payload) {
      reportSupportWorkspaceTelemetry(name, {
        ...payload,
        viewport: supportWorkspaceViewportBucket(),
      });
    },
  },
  supportWorkspaceRolloutSource,
);

const rolloutState = computed(() => {
  const root = controller.rollout.value;
  if (!root) return { label: "Нет authoritative state", severity: "secondary" as const };
  if (root.hardOff) return { label: "Emergency hard-off", severity: "danger" as const };
  if (root.shellEnabled) return { label: "Pilot включён", severity: "success" as const };
  return { label: "Legacy launcher", severity: "warn" as const };
});
const admissionState = computed(() => {
  const value = controller.admission.value;
  if (!canReadAdmission.value)
    return "Не читается этой ролью — вывод по rollout-флагам не делается";
  if (!value) return "Не подтверждён";
  return `${value.entryPointMode} · ${value.rolloutState}`;
});
const presetCopy: Record<
  SupportWorkspaceRolloutPreset,
  { title: string; description: string; icon: string; danger?: boolean }
> = {
  ENABLE_PILOT: {
    title: "Включить pilot",
    description: "Открыть canonical shell, только если глобальный rollout уже разрешён.",
    icon: "pi pi-play",
  },
  ROLLBACK_SHELL: {
    title: "Вернуть launcher",
    description: "Закрыть shell без изменения hard-off и без отката domain records.",
    icon: "pi pi-replay",
  },
  EMERGENCY_HARD_OFF: {
    title: "Emergency hard-off",
    description: "Немедленно закрыть shell и оставить только read-only launcher.",
    icon: "pi pi-ban",
    danger: true,
  },
  CLEAR_HARD_OFF: {
    title: "Снять hard-off безопасно",
    description: "Снять аварийный запрет, но не включать shell автоматически.",
    icon: "pi pi-lock-open",
  },
};
const presets = Object.keys(presetCopy) as SupportWorkspaceRolloutPreset[];
const confirmation = computed(() =>
  pendingPreset.value ? presetCopy[pendingPreset.value] : null,
);

function presetDisabled(preset: SupportWorkspaceRolloutPreset): boolean {
  const root = controller.rollout.value;
  if (!root || controller.mutating.value || Boolean(controller.recovery.value))
    return true;
  if (preset === "ENABLE_PILOT")
    return !root.enabled || root.hardOff || root.shellEnabled;
  if (preset === "ROLLBACK_SHELL") return !root.shellEnabled;
  if (preset === "EMERGENCY_HARD_OFF") return root.hardOff;
  return !root.hardOff;
}

function openConfirmation(
  preset: SupportWorkspaceRolloutPreset,
  event: Event,
): void {
  pendingPreset.value = preset;
  confirmationTrigger.value =
    event.currentTarget instanceof HTMLElement ? event.currentTarget : null;
  confirmationVisible.value = true;
}

async function confirmPreset(): Promise<void> {
  const preset = pendingPreset.value;
  if (!preset) return;
  confirmationVisible.value = false;
  await controller.submit(preset, reason.value);
  if (controller.success.value) reason.value = "";
}

function restoreConfirmationFocus(): void {
  confirmationTrigger.value?.focus({ preventScroll: true });
}

watch(
  () => [auth.user?.id, auth.project?.id, permissionSignature.value] as const,
  () => {
    accessDenied.value = false;
    confirmationVisible.value = false;
    pendingPreset.value = null;
    reason.value = "";
    controller.reset();
    if (canManage.value) void controller.load();
  },
  { flush: "sync" },
);
onMounted(() => {
  if (canManage.value) void controller.load();
});
onBeforeUnmount(controller.reset);
</script>

<template>
  <main class="rollout-page">
    <header class="rollout-header">
      <div>
        <div class="eyebrow"><i class="pi pi-shield" /> Support operations</div>
        <h1>Pilot и rollback</h1>
        <p>
          Управление canonical Support shell для текущего Project. Команды меняют
          только routing admission и не откатывают сообщения, назначения или SLA.
        </p>
      </div>
      <div class="header-actions">
        <Tag :value="rolloutState.label" :severity="rolloutState.severity" />
        <Button
          label="Перечитать"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="controller.loading.value"
          :disabled="
            controller.mutating.value ||
            Boolean(controller.recovery.value) ||
            controller.quarantined.value
          "
          @click="controller.load"
        />
      </div>
    </header>

    <Message v-if="!canManage" severity="warn" :closable="false">
      Rollout недоступен для текущего Project или роли.
    </Message>
    <div class="live-region" aria-live="polite" aria-atomic="true">
      <Message v-if="controller.error.value" severity="error" :closable="false">
        {{ controller.error.value }}
      </Message>
      <Message v-if="controller.success.value" severity="success" :closable="false">
        {{ controller.success.value }}
      </Message>
    </div>

    <template v-if="controller.loading.value && !controller.rollout.value">
      <section class="state-grid" aria-label="Загрузка authoritative rollout">
        <Skeleton v-for="index in 2" :key="index" height="164px" border-radius="14px" />
      </section>
      <Skeleton height="312px" border-radius="14px" />
    </template>

    <template v-else-if="controller.rollout.value">
      <section class="state-grid" aria-label="Authoritative rollout state">
        <article class="state-panel">
          <div class="panel-heading">
            <div>
              <span class="section-kicker">Server root</span>
              <h2>Project rollout</h2>
            </div>
            <span class="version">Version {{ controller.rollout.value.version }}</span>
          </div>
          <dl class="state-list">
            <div><dt>Global eligibility</dt><dd>{{ controller.rollout.value.enabled ? "Enabled" : "Disabled" }}</dd></div>
            <div><dt>Canonical shell</dt><dd>{{ controller.rollout.value.shellEnabled ? "Enabled" : "Launcher only" }}</dd></div>
            <div><dt>Emergency gate</dt><dd>{{ controller.rollout.value.hardOff ? "Hard-off" : "Clear" }}</dd></div>
          </dl>
        </article>

        <article class="state-panel">
          <div class="panel-heading">
            <div>
              <span class="section-kicker">Separate authority</span>
              <h2>Admission</h2>
            </div>
            <i class="pi pi-verified" aria-hidden="true" />
          </div>
          <p class="admission-value">{{ admissionState }}</p>
          <p class="panel-note">
            Canonical route определяется admission contract, а не локальной
            интерпретацией трёх rollout-флагов.
          </p>
        </article>
      </section>

      <section class="command-panel" aria-labelledby="safe-action-title">
        <div class="command-intro">
          <div>
            <span class="section-kicker">One audited OCC command</span>
            <h2 id="safe-action-title">Выберите безопасный preset</h2>
          </div>
          <p>
            Каждое действие требует причины и отдельного подтверждения. После
            конфликта состояние перечитывается, а подтверждение начинается заново.
          </p>
        </div>

        <label class="reason-field">
          <span>Причина изменения</span>
          <textarea
            v-model="reason"
            rows="3"
            maxlength="500"
            placeholder="Например: Pilot window approved by release owner"
            :disabled="controller.mutating.value"
          />
          <small>3–500 символов; не добавляйте имена, End User ID или content.</small>
        </label>

        <div class="preset-grid">
          <article
            v-for="preset in presets"
            :key="preset"
            class="preset-card"
            :class="{ 'preset-card--danger': presetCopy[preset].danger }"
          >
            <i :class="presetCopy[preset].icon" aria-hidden="true" />
            <div>
              <h3>{{ presetCopy[preset].title }}</h3>
              <p>{{ presetCopy[preset].description }}</p>
            </div>
            <Button
              :label="presetCopy[preset].title"
              :severity="presetCopy[preset].danger ? 'danger' : 'secondary'"
              :outlined="!presetCopy[preset].danger"
              :disabled="presetDisabled(preset)"
              @click="openConfirmation(preset, $event)"
            />
          </article>
        </div>
      </section>

      <section
        v-if="controller.recovery.value"
        class="recovery-panel"
        aria-labelledby="recovery-title"
      >
        <div>
          <span class="section-kicker">Exact attempt retained for this session</span>
          <h2 id="recovery-title">Нужна authoritative recovery</h2>
          <p>
            Новый ключ не создаётся. Разрешён только точный повтор прежних ETag,
            body и idempotency intent.
          </p>
        </div>
        <Button
          label="Повторить ту же попытку"
          icon="pi pi-refresh"
          :loading="controller.mutating.value"
          @click="controller.retryPending"
        />
      </section>

      <Message v-if="controller.quarantined.value" severity="warn" :closable="false">
        Команда помещена в ручную проверку. Не включайте pilot до сверки audit и
        authoritative root.
      </Message>
    </template>

    <Dialog
      v-model:visible="confirmationVisible"
      modal
      :header="confirmation?.title ?? 'Подтверждение rollout'"
      class="rollout-confirmation"
      :style="{ width: 'min(520px, calc(100vw - 24px))' }"
      @hide="restoreConfirmationFocus"
    >
      <div v-if="confirmation" class="confirmation-copy">
        <div class="confirmation-icon" :class="{ danger: confirmation.danger }">
          <i :class="confirmation.icon" aria-hidden="true" />
        </div>
        <div>
          <strong>{{ confirmation.title }}</strong>
          <p>{{ confirmation.description }}</p>
        </div>
      </div>
      <div class="confirmation-reason">
        <span>Зафиксированная причина</span>
        <strong>{{ reason.trim() || "Причина не указана" }}</strong>
      </div>
      <template #footer>
        <Button label="Отмена" severity="secondary" text @click="confirmationVisible = false" />
        <Button
          :label="confirmation?.danger ? 'Подтвердить hard-off' : 'Подтвердить команду'"
          :severity="confirmation?.danger ? 'danger' : undefined"
          :disabled="reason.trim().length < 3"
          @click="confirmPreset"
        />
      </template>
    </Dialog>
  </main>
</template>

<style scoped>
.rollout-page {
  min-height: 100%;
  padding: 24px;
  background: var(--surface-canvas);
  color: var(--text-primary);
}
.rollout-header,
.panel-heading,
.command-intro,
.recovery-panel {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 16px;
}
.rollout-header { margin-bottom: 20px; }
.rollout-header h1 { margin: 4px 0 8px; font-size: clamp(1.65rem, 3vw, 2.3rem); letter-spacing: -0.035em; }
.rollout-header p,
.command-intro p { max-width: 68ch; margin: 0; color: var(--text-secondary); line-height: 1.55; }
.eyebrow,
.section-kicker { color: var(--text-secondary); font-size: .75rem; font-weight: 700; letter-spacing: .08em; text-transform: uppercase; }
.eyebrow { display: flex; align-items: center; gap: 8px; }
.header-actions { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; }
.live-region { min-height: 0; }
.state-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; margin-bottom: 12px; }
.state-panel,
.command-panel,
.recovery-panel { border: 1px solid var(--border-default); border-radius: 14px; background: var(--surface-card); }
.state-panel { min-width: 0; padding: 16px; }
.panel-heading h2,
.command-intro h2,
.recovery-panel h2 { margin: 4px 0 0; font-size: 1.1rem; }
.version { color: var(--text-secondary); font-size: .8rem; font-variant-numeric: tabular-nums; }
.state-list { margin: 16px 0 0; }
.state-list > div { display: flex; justify-content: space-between; gap: 16px; padding: 10px 0; border-top: 1px solid var(--border-default); }
.state-list dt { color: var(--text-secondary); }
.state-list dd { margin: 0; font-weight: 700; text-align: right; }
.admission-value { margin: 20px 0 8px; font-weight: 700; overflow-wrap: anywhere; }
.panel-note { margin: 0; color: var(--text-secondary); line-height: 1.5; }
.command-panel { padding: 16px; }
.command-intro { align-items: end; }
.command-intro > p { max-width: 48ch; font-size: .9rem; }
.reason-field { display: grid; gap: 6px; margin: 20px 0 16px; font-weight: 700; }
.reason-field textarea { width: 100%; min-height: 88px; resize: vertical; padding: 12px; border: 1px solid var(--border-default); border-radius: 10px; background: var(--surface-raised); color: var(--text-primary); font: inherit; line-height: 1.45; }
.reason-field textarea:focus-visible { outline: 3px solid color-mix(in srgb, var(--brand) 28%, transparent); outline-offset: 2px; border-color: var(--brand); }
.reason-field small { color: var(--text-secondary); font-weight: 400; }
.preset-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 8px; }
.preset-card { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 8px 12px; align-items: start; padding: 14px; border: 1px solid var(--border-default); border-radius: 12px; background: var(--surface-subtle); }
.preset-card > i { display: grid; place-items: center; width: 36px; height: 36px; border-radius: 10px; background: var(--surface-active); color: var(--brand); }
.preset-card--danger > i { color: var(--status-danger); }
.preset-card h3 { margin: 2px 0 4px; font-size: .98rem; }
.preset-card p { margin: 0; color: var(--text-secondary); font-size: .86rem; line-height: 1.45; }
.preset-card :deep(.p-button) { grid-column: 2; justify-self: start; min-height: 40px; }
.preset-card--danger :deep(.p-button-danger) {
  border-color: var(--status-danger);
  background: var(--status-danger);
  color: var(--on-status-danger);
}
:global(.rollout-confirmation .p-button-danger) {
  border-color: var(--status-danger);
  background: var(--status-danger);
  color: var(--on-status-danger);
}
.recovery-panel { align-items: center; margin-top: 12px; padding: 16px; border-color: var(--status-warning); }
.recovery-panel p { margin: 6px 0 0; color: var(--text-secondary); }
.confirmation-copy { display: flex; gap: 12px; align-items: flex-start; }
.confirmation-copy p { margin: 4px 0 0; color: var(--text-secondary); line-height: 1.5; }
.confirmation-icon { display: grid; place-items: center; flex: 0 0 44px; height: 44px; border-radius: 12px; background: var(--surface-active); color: var(--brand); }
.confirmation-icon.danger { color: var(--status-danger); }
.confirmation-reason { display: grid; gap: 6px; margin-top: 16px; padding: 12px; border-radius: 10px; background: var(--surface-subtle); }
.confirmation-reason span { color: var(--text-secondary); font-size: .8rem; }
.confirmation-reason strong { overflow-wrap: anywhere; }
@media (max-width: 900px) {
  .state-grid,
  .preset-grid { grid-template-columns: 1fr; }
  .command-intro { align-items: flex-start; }
}
@media (max-width: 640px) {
  .rollout-page { padding: 12px; }
  .rollout-header,
  .command-intro,
  .recovery-panel { flex-direction: column; }
  .header-actions,
  .header-actions :deep(.p-button),
  .recovery-panel :deep(.p-button) { width: 100%; }
  .preset-card { grid-template-columns: 44px minmax(0, 1fr); padding: 12px; }
  .preset-card > i { width: 44px; height: 44px; }
  .preset-card :deep(.p-button) { grid-column: 1 / -1; width: 100%; min-height: 44px; }
}
@media (prefers-reduced-motion: reduce) {
  .rollout-page *,
  .rollout-page *::before,
  .rollout-page *::after { scroll-behavior: auto !important; transition-duration: .01ms !important; animation-duration: .01ms !important; }
}
</style>
