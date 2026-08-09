<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import Button from "primevue/button";
import Message from "primevue/message";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import ToggleSwitch from "primevue/toggleswitch";
import { useAuthStore } from "@/features/auth/auth.store";
import { canManagePersonalSupportNotifications } from "@/features/support-workspace/model/support-workspace-access";
import { supportNotificationsSource, type SupportNotificationTopic } from "@/features/support-notifications/api/support-notifications-source";
import { createBrowserPushAdapter } from "@/features/support-notifications/model/browser-push-adapter";
import { createSupportNotificationsController } from "@/features/support-notifications/model/use-support-notifications";

const auth = useAuthStore();
const accessDenied = ref(false);
const permissionSignature = computed(() =>
  [...(auth.project?.effectivePermissionCodes ?? [])].sort().join("\u0000"),
);
const canRead = computed(
  () =>
    !accessDenied.value &&
    canManagePersonalSupportNotifications(auth.project?.effectivePermissionCodes ?? []),
);
const controller = createSupportNotificationsController(
  {
    projectId: () => auth.project?.id,
    actorId: () => auth.user?.id,
    canRead: () => canRead.value,
    async onForbidden() {
      accessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        // Sensitive Project preferences were already purged.
      }
    },
  },
  supportNotificationsSource,
  createBrowserPushAdapter(),
);

const topics: ReadonlyArray<{
  topic: SupportNotificationTopic;
  icon: string;
  title: string;
  description: string;
  defaultLabel: string;
}> = [
  {
    topic: "SUPPORT_CASE_ATTENTION",
    icon: "pi pi-exclamation-circle",
    title: "Обращения, требующие внимания",
    description: "Сигнал, когда обращение перешло в состояние, где нужен ответ или вмешательство поддержки.",
    defaultLabel: "По умолчанию выключено",
  },
  {
    topic: "SUPPORT_CASE_ASSIGNED_TO_ME",
    icon: "pi pi-user-plus",
    title: "Назначенные мне обращения",
    description: "Персональный сигнал, когда именно вы стали ответственным оператором обращения.",
    defaultLabel: "По умолчанию включено",
  },
];

const rolloutLabel = computed(() => {
  const state = controller.admission.value?.rolloutState;
  if (state === "ATTENTION_ENABLED") return "Требующие внимания и назначения";
  if (state === "ASSIGNMENT_ONLY") return "Только назначения";
  return "Доставка выключена";
});
const rolloutSeverity = computed(() =>
  controller.admission.value?.rolloutState === "DISABLED" ? "secondary" : "success",
);

function permissionLabel(): string {
  const state = controller.browserState.value;
  if (state.permission === "GRANTED") return "Разрешено браузером";
  if (state.permission === "DENIED") return "Заблокировано браузером";
  if (state.permission === "DEFAULT") return "Разрешение ещё не запрошено";
  return state.requiresInstalledApp ? "Нужно установить на экран «Домой»" : "Веб-уведомления не поддерживаются";
}

function browserRecoveryCopy(): string {
  const state = controller.browserState.value;
  const registrationCapability =
    controller.admission.value?.capabilities.deviceRegistration;
  if (registrationCapability !== "AVAILABLE") {
    if (controller.admission.value?.rolloutState === "DISABLED")
      return "Проект пока не принимает новые подключения браузеров. Владелец серверной конфигурации должен сначала включить доставку уведомлений; после этого кнопка запросит разрешение браузера.";
    return "Регистрация новых браузеров сейчас недоступна для этого проекта. Обратитесь к администратору проекта; после включения регистрации кнопка запросит разрешение браузера.";
  }
  if (state.permission === "DENIED")
    return state.permissionRecoveryPath ??
      "Откройте разрешения сайта в настройках браузера и включите уведомления для Retenive CMS.";
  if (state.requiresInstalledApp)
    return "На iOS/iPadOS сначала добавьте Retenive CMS на экран «Домой», затем откройте установленное приложение.";
  if (state.permission === "UNSUPPORTED")
    return state.unsupportedMessage ??
      "Этот браузер или режим не поддерживает веб-уведомления. Обновите браузер и проверьте снова.";
  return "Запрос системного разрешения появляется только после вашего нажатия.";
}

function preferenceStatus(topic: SupportNotificationTopic): string {
  const item = controller.preference(topic);
  if (!item?.subscribed) return "Выключено";
  if (controller.capability(topic) !== "AVAILABLE") return "Сохранено, но доставка ещё не запущена";
  if (!controller.browserReady.value) return "Выбрано, но нет подтверждённого устройства";
  return "Доставка активна";
}

function preferenceSeverity(topic: SupportNotificationTopic) {
  const item = controller.preference(topic);
  if (!item?.subscribed) return "secondary";
  return controller.browserReady.value && controller.capability(topic) === "AVAILABLE" ? "success" : "warn";
}

function capabilityCopy(topic: SupportNotificationTopic): string {
  const value = controller.capability(topic);
  if (value === "DISABLE_ONLY") return "Можно только отключить: новые подписки больше не принимаются.";
  if (value === "UNAVAILABLE") return "Этот тип недоступен для текущей роли или этапа запуска.";
  return "Настройка доступна для выбранного проекта.";
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

watch(
  () => [auth.project?.id, auth.user?.id, permissionSignature.value] as const,
  () => {
    accessDenied.value = false;
    if (canRead.value) void controller.load();
    else controller.reset();
  },
  { flush: "sync" },
);
onMounted(() => void controller.load());
onBeforeUnmount(controller.dispose);
</script>

<template>
  <section class="page support-notification-settings">
    <header class="page-header notification-header">
      <div>
        <div class="eyebrow"><i class="pi pi-bell" /> Настройки поддержки</div>
        <h1>Уведомления поддержки</h1>
        <p class="subtitle">
          Личные уведомления для выбранного проекта. Разрешение браузера, выбранные
          события и регистрация устройства проверяются отдельно.
        </p>
      </div>
      <div class="header-actions">
        <Tag :value="rolloutLabel" :severity="rolloutSeverity" />
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="controller.loading.value"
          @click="controller.load"
        />
      </div>
    </header>

    <Message v-if="!canRead" severity="warn" :closable="false">
      Настройки уведомлений недоступны для текущего проекта или роли.
    </Message>
    <Message v-if="controller.error.value" severity="error" :closable="false">
      {{ controller.error.value }}
    </Message>
    <Message v-if="controller.success.value" severity="success" :closable="false">
      {{ controller.success.value }}
    </Message>

    <template v-if="controller.loading.value && !controller.admission.value">
      <div class="readiness-grid" aria-label="Загрузка готовности уведомлений">
        <Skeleton v-for="index in 3" :key="index" height="128px" border-radius="18px" />
      </div>
    </template>

    <template v-else-if="controller.admission.value">
      <section class="notification-section" aria-labelledby="readiness-title">
        <div class="section-heading">
          <div>
            <span class="section-kicker">Три независимых состояния</span>
            <h2 id="readiness-title">Готовность этого браузера</h2>
          </div>
          <span class="evaluated-at">
            Проверено {{ formatDate(controller.admission.value.evaluatedAt) }}
          </span>
        </div>

        <div class="readiness-grid">
          <article class="readiness-card">
            <span class="step-number">1</span>
            <i class="pi pi-globe" />
            <div>
              <small>Разрешение браузера</small>
              <strong>{{ permissionLabel() }}</strong>
              <span>Системное разрешение сайта показывать уведомления.</span>
            </div>
          </article>
          <article class="readiness-card">
            <span class="step-number">2</span>
            <i class="pi pi-wifi" />
            <div>
              <small>Подписка этого браузера</small>
              <strong>{{ controller.browserState.value.locallySubscribed ? "Создана" : "Не создана" }}</strong>
              <span>Зашифрованный канал доставки уведомлений в этот браузер.</span>
            </div>
          </article>
          <article :class="['readiness-card', { ready: controller.browserReady.value }]">
            <span class="step-number">3</span>
            <i class="pi pi-shield" />
            <div>
              <small>Регистрация на сервере</small>
              <strong>{{ controller.currentDeviceId.value ? "Подтверждена" : "Не подтверждена" }}</strong>
              <span>Только это состояние разрешает считать устройство подключённым.</span>
            </div>
          </article>
        </div>

        <div class="browser-action-row">
          <div>
            <strong>
              {{ controller.browserReady.value ? "Этот браузер зарегистрирован" : "Подключите этот браузер" }}
            </strong>
            <span>{{ browserRecoveryCopy() }}</span>
          </div>
          <Button
            v-if="controller.browserState.value.permission === 'DENIED'"
            label="Проверить снова"
            icon="pi pi-refresh"
            outlined
            @click="controller.checkBrowser"
          />
          <Button
            v-else-if="
              !controller.browserReady.value &&
              controller.browserState.value.permission !== 'UNSUPPORTED' &&
              !controller.browserState.value.requiresInstalledApp
            "
            label="Подключить этот браузер"
            icon="pi pi-bell"
            :loading="controller.connecting.value"
            :disabled="
              controller.deviceBusy.value ||
              controller.admission.value.capabilities.deviceRegistration !== 'AVAILABLE'
            "
            @click="controller.connectBrowser"
          />
          <Tag
            v-else-if="!controller.browserReady.value"
            value="Недоступно"
            severity="secondary"
          />
          <Tag v-else value="Подключён" severity="success" icon="pi pi-check" />
        </div>
      </section>

      <section class="notification-section" aria-labelledby="topics-title">
        <div class="section-heading">
          <div>
            <span class="section-kicker">Что присылать</span>
            <h2 id="topics-title">Типы уведомлений</h2>
          </div>
          <span class="section-note">Настройки действуют только в {{ auth.project?.name ?? "этом проекте" }}</span>
        </div>
        <div class="topic-list">
          <article v-for="item in topics" :key="item.topic" class="topic-row">
            <span class="topic-icon"><i :class="item.icon" /></span>
            <div class="topic-copy">
              <div class="topic-title-row">
                <strong>{{ item.title }}</strong>
                <Tag :value="preferenceStatus(item.topic)" :severity="preferenceSeverity(item.topic)" />
              </div>
              <p>{{ item.description }}</p>
              <small>{{ item.defaultLabel }} · {{ capabilityCopy(item.topic) }}</small>
            </div>
            <ToggleSwitch
              :model-value="Boolean(controller.preference(item.topic)?.subscribed)"
              :aria-label="`${item.title}: ${controller.preference(item.topic)?.subscribed ? 'включено' : 'выключено'}`"
              :disabled="
                controller.savingTopic.value !== null ||
                controller.loading.value ||
                !controller.canSet(item.topic, !controller.preference(item.topic)?.subscribed)
              "
              @update:model-value="controller.setPreference(item.topic, $event)"
            />
          </article>
        </div>
        <div class="scope-note" role="note">
          <i class="pi pi-info-circle" />
          <span>
            Уведомления о каждом новом обычном обращении здесь не настраиваются. Это отдельная
            политика проекта для будущего запуска, а не подмена состояния «требует внимания».
          </span>
        </div>
      </section>

      <section class="notification-section" aria-labelledby="devices-title">
        <div class="section-heading">
          <div>
            <span class="section-kicker">Личные устройства</span>
            <h2 id="devices-title">Зарегистрированные браузеры</h2>
          </div>
          <span class="section-note">Активных: {{ controller.activeDevices.value.length }}</span>
        </div>
        <div v-if="controller.devices.value.length" class="device-list">
          <article v-for="device in controller.devices.value" :key="device.id" class="device-row">
            <span :class="['device-icon', { revoked: device.status === 'REVOKED' }]">
              <i class="pi pi-desktop" />
            </span>
            <div>
              <div class="device-title-row">
                <strong>{{ device.userAgentClass }}</strong>
                <Tag
                  :value="device.status === 'ACTIVE' ? 'Активно' : 'Отключено'"
                  :severity="device.status === 'ACTIVE' ? 'success' : 'secondary'"
                />
                <span v-if="controller.currentDeviceId.value === device.id" class="current-device">
                  Этот браузер
                </span>
              </div>
              <small>
                Последняя связь {{ formatDate(device.lastSeenAt) }} · добавлено {{ formatDate(device.createdAt) }}
              </small>
            </div>
            <Button
              v-if="device.status === 'ACTIVE'"
              label="Отключить"
              icon="pi pi-trash"
              severity="danger"
              text
              :loading="controller.revokingDeviceId.value === device.id"
              :disabled="controller.deviceBusy.value"
              @click="controller.revokeDevice(device)"
            />
          </article>
        </div>
        <div v-else class="empty-devices">
          <i class="pi pi-bell-slash" />
          <strong>Подтверждённых устройств пока нет</strong>
          <span>Подключите текущий браузер в блоке выше.</span>
        </div>
      </section>
    </template>
  </section>
</template>

<style scoped>
.support-notification-settings { width:min(1120px,calc(100% - 48px)); margin:0 auto; padding-bottom:64px; }
.support-notification-settings :deep(.p-message-success) { border-color:color-mix(in srgb,var(--status-success) 38%,var(--line)); background:var(--status-success-soft); color:var(--status-success-text); }
.notification-header>div:first-child { min-width:0; }
.notification-header h1 { font-size:clamp(1.7rem,3.2vw,2.45rem); }
.notification-header .subtitle { max-width:760px; }
.notification-header, .header-actions, .section-heading, .browser-action-row, .topic-title-row, .device-title-row { display:flex; align-items:center; }
.notification-header, .section-heading, .browser-action-row { justify-content:space-between; }
.header-actions { gap:10px; flex-wrap:wrap; }
.notification-section { margin-top:18px; padding:22px; border:1px solid var(--line); border-radius:20px; background:var(--surface-card); box-shadow:var(--shadow-sm); }
.section-heading { gap:20px; margin-bottom:18px; }
.section-heading h2 { margin:3px 0 0; font-size:1.1rem; }
.section-kicker { color:var(--text-muted); font-size:.62rem; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
.evaluated-at, .section-note { color:var(--text-muted); font-size:.7rem; }
.readiness-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
.readiness-card { position:relative; display:grid; grid-template-columns:38px minmax(0,1fr); gap:12px; min-height:126px; padding:18px; overflow:hidden; border:1px solid var(--line); border-radius:16px; background:var(--surface-subtle); }
.readiness-card.ready { border-color:color-mix(in srgb,var(--status-success) 40%,var(--line)); background:color-mix(in srgb,var(--status-success-soft) 48%,var(--surface-card)); }
.readiness-card>i { display:grid; width:38px; height:38px; place-items:center; border-radius:12px; background:var(--surface-card); color:var(--status-info-text); }
.readiness-card>div { display:grid; align-content:start; gap:4px; }
.readiness-card small { color:var(--text-muted); font-size:.6rem; font-weight:800; letter-spacing:.08em; text-transform:uppercase; }
.readiness-card strong { font-size:.82rem; }
.readiness-card span:not(.step-number) { color:var(--text-muted); font-size:.69rem; line-height:1.45; }
.step-number { position:absolute; right:12px; top:9px; color:color-mix(in srgb,var(--text-muted) 34%,transparent); font:800 1.35rem/1 var(--font-display); }
.browser-action-row { gap:20px; margin-top:14px; padding:14px 16px; border-radius:14px; background:var(--surface-subtle); }
.browser-action-row>div { display:grid; gap:4px; }
.browser-action-row strong { font-size:.78rem; }
.browser-action-row span { color:var(--text-muted); font-size:.7rem; line-height:1.4; }
.topic-list, .device-list { display:grid; gap:10px; }
.topic-row { display:grid; grid-template-columns:42px minmax(0,1fr) auto; align-items:center; gap:14px; padding:16px; border:1px solid var(--line); border-radius:15px; transition:border-color .18s ease,transform .18s ease,background .18s ease; }
.topic-row:hover { transform:translateY(-1px); border-color:var(--line-strong); background:var(--surface-subtle); }
.topic-icon,.device-icon { display:grid; width:42px; height:42px; place-items:center; border-radius:13px; background:var(--brand-soft); color:var(--text-brand); }
.topic-copy { min-width:0; }
.topic-title-row { justify-content:flex-start; gap:8px; flex-wrap:wrap; }
.topic-title-row strong { font-size:.82rem; }
.topic-copy p { margin:5px 0 4px; color:var(--text-secondary); font-size:.73rem; line-height:1.45; }
.topic-copy small,.device-row small { color:var(--text-muted); font-size:.65rem; line-height:1.4; }
.scope-note { display:flex; align-items:flex-start; gap:9px; margin-top:12px; padding:11px 13px; border-radius:12px; background:var(--status-info-soft); color:var(--status-info-text); font-size:.7rem; line-height:1.45; }
.scope-note i { margin-top:2px; }
.device-row { display:grid; grid-template-columns:42px minmax(0,1fr) auto; align-items:center; gap:14px; padding:14px 16px; border-bottom:1px solid var(--line); }
.device-row:last-child { border-bottom:0; }
.device-icon.revoked { background:var(--surface-subtle); color:var(--text-muted); }
.device-title-row { gap:8px; flex-wrap:wrap; margin-bottom:4px; }
.device-title-row strong { font-size:.78rem; }
.current-device { padding:3px 7px; border-radius:999px; background:var(--brand-soft); color:var(--text-brand); font-size:.58rem; font-weight:800; text-transform:uppercase; letter-spacing:.05em; }
.empty-devices { display:grid; justify-items:center; gap:7px; padding:28px; border:1px dashed var(--line); border-radius:15px; color:var(--text-muted); text-align:center; }
.empty-devices i { font-size:1.2rem; }
.empty-devices strong { color:var(--text-primary); font-size:.8rem; }
.empty-devices span { font-size:.7rem; }
@media(max-width:800px){ .readiness-grid{grid-template-columns:1fr}.notification-section{padding:18px}.notification-header,.section-heading,.browser-action-row{align-items:flex-start;flex-direction:column}.browser-action-row :deep(.p-button){width:100%;justify-content:center}.topic-row{grid-template-columns:38px minmax(0,1fr) auto;padding:14px}.topic-icon{width:38px;height:38px}.device-row{grid-template-columns:38px minmax(0,1fr)}.device-row>:deep(.p-button){grid-column:2;width:max-content}.section-note,.evaluated-at{max-width:100%}}
@media(max-width:480px){ .support-notification-settings{width:auto;margin-inline:0;padding-inline:14px}.notification-section{margin-top:14px;padding:15px;border-radius:17px}.topic-row{grid-template-columns:34px minmax(0,1fr)}.topic-row>:deep(.p-toggleswitch){grid-column:2;justify-self:end}.topic-icon{width:34px;height:34px;border-radius:11px}.topic-title-row{align-items:flex-start;flex-direction:column}.header-actions{width:100%}.header-actions :deep(.p-button){flex:1}.device-row{padding:12px 4px}.device-row>:deep(.p-button){grid-column:1/-1;width:100%;justify-content:center}}
@media(prefers-reduced-motion:reduce){.topic-row{transition:none}.topic-row:hover{transform:none}}
</style>
