<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from 'vue';
import Button from 'primevue/button';
import Message from 'primevue/message';
import Skeleton from 'primevue/skeleton';
import Tag from 'primevue/tag';
import ToggleSwitch from 'primevue/toggleswitch';
import { useAuthStore } from '@/features/auth/auth.store';
import { hasProjectPermission } from '@/features/auth/permission-access';
import { supportCaseNotificationPolicySource } from '@/features/support-case-notifications/api/support-case-notification-policy-source';
import {
  policyModeLabel,
  policyStatusLabel,
} from '@/features/support-case-notifications/model/support-case-notification-policy';
import { createSupportCaseNotificationPolicyController } from '@/features/support-case-notifications/model/use-support-case-notification-policy';
import { canManagePersonalSupportNotifications } from '@/features/support-workspace/model/support-workspace-access';
import {
  supportNotificationsSource,
  type SupportNotificationTopic,
} from '@/features/support-notifications/api/support-notifications-source';
import { createBrowserPushAdapter } from '@/features/support-notifications/model/browser-push-adapter';
import { createSupportNotificationsController } from '@/features/support-notifications/model/use-support-notifications';

const auth = useAuthStore();
const accessDenied = ref(false);
const policyAccessDenied = ref(false);
const permissionSignature = computed(() =>
  [...(auth.project?.effectivePermissionCodes ?? [])].sort().join('\u0000'),
);
const canRead = computed(
  () =>
    !accessDenied.value &&
    canManagePersonalSupportNotifications(auth.project?.effectivePermissionCodes ?? []),
);
const canManagePolicy = computed(
  () =>
    !policyAccessDenied.value &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      'project.support.notification_policy.manage',
    ),
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
const policyController = createSupportCaseNotificationPolicyController(
  {
    projectId: () => auth.project?.id,
    actorId: () => auth.user?.id,
    canManage: () => canManagePolicy.value,
    async onForbidden() {
      policyAccessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        /* Protected policy is already purged. */
      }
    },
  },
  supportCaseNotificationPolicySource,
);

const topics: ReadonlyArray<{
  topic: SupportNotificationTopic;
  icon: string;
  title: string;
  description: string;
  defaultLabel: string;
}> = [
  {
    topic: 'SUPPORT_CASE_CREATED',
    icon: 'pi pi-inbox',
    title: 'Новые обращения',
    description:
      'Личный сигнал о создании или повторном открытии обращения, если политика проекта включает его в доставку.',
    defaultLabel: 'По умолчанию выключено',
  },
  {
    topic: 'SUPPORT_CASE_ATTENTION',
    icon: 'pi pi-exclamation-circle',
    title: 'Обращения, требующие внимания',
    description:
      'Сигнал, когда обращение перешло в состояние, где нужен ответ или вмешательство поддержки.',
    defaultLabel: 'По умолчанию выключено',
  },
  {
    topic: 'SUPPORT_CASE_ASSIGNED_TO_ME',
    icon: 'pi pi-user-plus',
    title: 'Назначенные мне обращения',
    description: 'Персональный сигнал, когда именно вы стали ответственным оператором обращения.',
    defaultLabel: 'По умолчанию включено',
  },
];

function permissionLabel(): string {
  const state = controller.browserState.value;
  if (state.permission === 'GRANTED') return 'Разрешено браузером';
  if (state.permission === 'DENIED') return 'Заблокировано браузером';
  if (state.permission === 'DEFAULT') return 'Разрешение ещё не запрошено';
  return state.requiresInstalledApp
    ? 'Нужно установить на экран «Домой»'
    : 'Веб-уведомления не поддерживаются';
}

function browserRecoveryCopy(): string {
  const state = controller.browserState.value;
  const registrationCapability = controller.configuration.value?.capabilities.deviceRegistration;
  if (registrationCapability !== 'AVAILABLE') {
    return 'Регистрация новых браузеров временно недоступна. Проверьте конфигурацию доставки; после восстановления кнопка запросит разрешение браузера.';
  }
  if (state.permission === 'DENIED')
    return (
      state.permissionRecoveryPath ??
      'Откройте разрешения сайта в настройках браузера и включите уведомления для Retenive CMS.'
    );
  if (state.requiresInstalledApp)
    return 'На iOS/iPadOS сначала добавьте Retenive CMS на экран «Домой», затем откройте установленное приложение.';
  if (state.permission === 'UNSUPPORTED')
    return (
      state.unsupportedMessage ??
      'Этот браузер или режим не поддерживает веб-уведомления. Обновите браузер и проверьте снова.'
    );
  return 'Запрос системного разрешения появляется только после вашего нажатия.';
}

function preferenceStatus(topic: SupportNotificationTopic): string {
  const item = controller.preference(topic);
  if (!item?.subscribed) return 'Выключено';
  if (controller.capability(topic) !== 'AVAILABLE') return 'Сохранено, но доставка ещё не запущена';
  if (!controller.browserReady.value) return 'Выбрано, но нет подтверждённого устройства';
  if (topic === 'SUPPORT_CASE_CREATED') return 'Личная доставка готова';
  return 'Доставка активна';
}

const personalNewCaseSubscriptionCopy = computed(() => {
  if (!canRead.value) return 'Недоступно для этой учётной записи';
  return controller.preference('SUPPORT_CASE_CREATED')?.subscribed ? 'Включена' : 'Выключена';
});
const personalBrowserCopy = computed(() => {
  if (!canRead.value) return 'Недоступно для этой учётной записи';
  return controller.browserReady.value ? 'Подключён' : 'Не подключён';
});
const personalDeliveryCopy = computed(() => {
  if (!canRead.value) return 'Не проверено';
  return policyController.current.value?.effectiveStatus === 'ACTIVE' &&
    controller.capability('SUPPORT_CASE_CREATED') === 'AVAILABLE' &&
    controller.preference('SUPPORT_CASE_CREATED')?.subscribed &&
    controller.browserReady.value
    ? 'Работает'
    : 'Не работает';
});

function preferenceSeverity(topic: SupportNotificationTopic) {
  const item = controller.preference(topic);
  if (!item?.subscribed) return 'secondary';
  return controller.browserReady.value && controller.capability(topic) === 'AVAILABLE'
    ? 'success'
    : 'warn';
}

function capabilityCopy(topic: SupportNotificationTopic): string {
  const value = controller.capability(topic);
  if (value === 'DISABLE_ONLY')
    return 'Можно только отключить: новые подписки больше не принимаются.';
  if (value === 'UNAVAILABLE')
    return 'Этот тип недоступен для текущей роли или конфигурации доставки.';
  return 'Настройка доступна для выбранного проекта.';
}

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function refreshAll(): void {
  if (canRead.value) void controller.load();
  if (canManagePolicy.value) void policyController.load();
}

watch(
  () => [auth.project?.id, auth.user?.id, permissionSignature.value] as const,
  () => {
    accessDenied.value = false;
    policyAccessDenied.value = false;
    if (canRead.value) void controller.load();
    else controller.reset();
    if (canManagePolicy.value) void policyController.load();
    else policyController.reset({ forgetPending: true });
  },
  { flush: 'sync' },
);
onMounted(() => {
  void controller.load();
  if (canManagePolicy.value) void policyController.load();
});
onBeforeUnmount(() => {
  controller.dispose();
  policyController.reset();
});
</script>

<template>
  <section class="page support-notification-settings">
    <header class="page-header notification-header">
      <div>
        <div class="eyebrow"><i class="pi pi-bell" /> Настройки поддержки</div>
        <h1>Уведомления поддержки</h1>
        <p class="subtitle">
          Личные уведомления для выбранного проекта. Разрешение браузера, выбранные события и
          регистрация устройства проверяются отдельно.
        </p>
      </div>
      <div class="header-actions">
        <Button
          label="Обновить"
          icon="pi pi-refresh"
          severity="secondary"
          outlined
          :loading="controller.loading.value || policyController.loading.value"
          @click="refreshAll"
        />
      </div>
    </header>

    <Message v-if="!canRead && !canManagePolicy" severity="warn" :closable="false">
      Настройки уведомлений недоступны для текущего проекта или роли.
    </Message>
    <Message v-else-if="!canRead" severity="info" :closable="false">
      Вы можете управлять политикой проекта, но личные подписки и браузеры для этой роли недоступны.
    </Message>
    <Message v-if="controller.error.value" severity="error" :closable="false">
      {{ controller.error.value }}
    </Message>
    <Message v-if="controller.success.value" severity="success" :closable="false">
      {{ controller.success.value }}
    </Message>

    <section
      v-if="canManagePolicy"
      class="notification-section policy-summary"
      aria-labelledby="policy-title"
    >
      <div class="section-heading">
        <div>
          <span class="section-kicker">Для всего проекта</span>
          <h2 id="policy-title">Уведомления о новых обращениях</h2>
        </div>
        <Tag
          v-if="policyController.current.value"
          :value="policyStatusLabel(policyController.current.value.effectiveStatus)"
          :severity="
            policyController.current.value.effectiveStatus === 'ACTIVE'
              ? 'success'
              : policyController.current.value.effectiveStatus === 'SCHEDULED'
                ? 'info'
                : 'secondary'
          "
        />
      </div>
      <Skeleton
        v-if="policyController.loading.value && !policyController.current.value"
        height="112px"
        border-radius="16px"
      />
      <div v-else class="policy-summary-body">
        <div class="policy-equation" aria-label="Условия доставки уведомления">
          <div>
            <small>Политика проекта</small
            ><strong>{{
              policyController.current.value?.current
                ? policyModeLabel(policyController.current.value.current.mode)
                : 'Не настроена'
            }}</strong>
          </div>
          <i class="pi pi-times" aria-hidden="true" />
          <div>
            <small>Личная подписка</small><strong>{{ personalNewCaseSubscriptionCopy }}</strong>
          </div>
          <i class="pi pi-times" aria-hidden="true" />
          <div>
            <small>Этот браузер</small><strong>{{ personalBrowserCopy }}</strong>
          </div>
          <i class="pi pi-equals" aria-hidden="true" />
          <div class="policy-equation-result">
            <small>Доставка вам</small><strong>{{ personalDeliveryCopy }}</strong>
          </div>
        </div>
        <div class="policy-summary-copy">
          <p>
            Руководитель задаёт события, круг получателей и срок действия. Каждый сотрудник сам
            включает личную подписку и подключает свой браузер.
          </p>
          <a class="policy-editor-link" href="/support/settings/notifications/new-cases">
            Настроить политику <i class="pi pi-arrow-right" />
          </a>
        </div>
      </div>
    </section>

    <template v-if="canRead && controller.loading.value && !controller.configuration.value">
      <div class="readiness-grid" aria-label="Загрузка готовности уведомлений">
        <Skeleton v-for="index in 3" :key="index" height="128px" border-radius="18px" />
      </div>
    </template>

    <template v-else-if="canRead && controller.configuration.value">
      <section class="notification-section" aria-labelledby="readiness-title">
        <div class="section-heading">
          <div>
            <span class="section-kicker">Три независимых состояния</span>
            <h2 id="readiness-title">Готовность этого браузера</h2>
          </div>
          <span class="evaluated-at">
            Проверено
            {{ formatDate(controller.configuration.value.evaluatedAt) }}
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
              <strong>{{
                controller.browserState.value.locallySubscribed ? 'Создана' : 'Не создана'
              }}</strong>
              <span>Зашифрованный канал доставки уведомлений в этот браузер.</span>
            </div>
          </article>
          <article :class="['readiness-card', { ready: controller.browserReady.value }]">
            <span class="step-number">3</span>
            <i class="pi pi-shield" />
            <div>
              <small>Регистрация на сервере</small>
              <strong>{{
                controller.currentDeviceId.value ? 'Подтверждена' : 'Не подтверждена'
              }}</strong>
              <span>Только это состояние разрешает считать устройство подключённым.</span>
            </div>
          </article>
        </div>

        <div class="browser-action-row">
          <div>
            <strong>
              {{
                controller.browserReady.value
                  ? 'Этот браузер зарегистрирован'
                  : 'Подключите этот браузер'
              }}
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
              controller.configuration.value.capabilities.deviceRegistration !== 'AVAILABLE'
            "
            @click="controller.connectBrowser"
          />
          <Tag v-else-if="!controller.browserReady.value" value="Недоступно" severity="secondary" />
          <Tag v-else value="Подключён" severity="success" icon="pi pi-check" />
        </div>
      </section>

      <section class="notification-section" aria-labelledby="topics-title">
        <div class="section-heading">
          <div>
            <span class="section-kicker">Что присылать</span>
            <h2 id="topics-title">Типы уведомлений</h2>
          </div>
          <span class="section-note"
            >Настройки действуют только в {{ auth.project?.name ?? 'этом проекте' }}</span
          >
        </div>
        <div class="topic-list">
          <article v-for="item in topics" :key="item.topic" class="topic-row">
            <span class="topic-icon"><i :class="item.icon" /></span>
            <div class="topic-copy">
              <div class="topic-title-row">
                <strong>{{ item.title }}</strong>
                <Tag
                  :value="preferenceStatus(item.topic)"
                  :severity="preferenceSeverity(item.topic)"
                />
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
            «Новые обращения» и «Требует внимания» — разные события. Создание обращения не
            повторяется при обычном сообщении, а последующая эскалация приходит отдельным
            уведомлением.
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
                Последняя связь {{ formatDate(device.lastSeenAt) }} · добавлено
                {{ formatDate(device.createdAt) }}
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
.support-notification-settings {
  width: min(1120px, calc(100% - 48px));
  margin: 0 auto;
  padding-bottom: 64px;
}
.support-notification-settings :deep(.p-message-success) {
  border-color: color-mix(in srgb, var(--status-success) 38%, var(--line));
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.notification-header > div:first-child {
  min-width: 0;
}
.notification-header h1 {
  font-size: clamp(1.7rem, 3.2vw, 2.45rem);
}
.notification-header .subtitle {
  max-width: 760px;
}
.notification-header,
.header-actions,
.section-heading,
.browser-action-row,
.topic-title-row,
.device-title-row {
  display: flex;
  align-items: center;
}
.notification-header,
.section-heading,
.browser-action-row {
  justify-content: space-between;
}
.header-actions {
  gap: 10px;
  flex-wrap: wrap;
}
.notification-section {
  margin-top: 18px;
  padding: 22px;
  border: 1px solid var(--line);
  border-radius: 20px;
  background: var(--surface-card);
  box-shadow: var(--shadow-sm);
}
.policy-summary {
  overflow: hidden;
  background: linear-gradient(
    135deg,
    var(--surface-card),
    color-mix(in srgb, var(--brand-soft) 32%, var(--surface-card))
  );
}
.policy-summary-body {
  display: grid;
  gap: 16px;
}
.policy-equation {
  display: grid;
  grid-template-columns:
    minmax(0, 1fr) auto minmax(0, 1fr) auto minmax(0, 1fr)
    auto minmax(0, 1fr);
  align-items: stretch;
  gap: 8px;
}
.policy-equation > div {
  display: grid;
  align-content: center;
  gap: 4px;
  min-height: 76px;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}
.policy-equation > i {
  align-self: center;
  color: var(--text-muted);
  font-size: 0.65rem;
}
.policy-equation small {
  color: var(--text-muted);
  font-size: 0.62rem;
}
.policy-equation strong {
  font-size: 0.76rem;
}
.policy-equation-result {
  border-color: color-mix(in srgb, var(--brand) 30%, var(--line)) !important;
}
.policy-summary-copy {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 20px;
}
.policy-summary-copy p {
  max-width: 720px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.72rem;
  line-height: 1.55;
}
.policy-editor-link {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  min-height: 44px;
  padding: 0 15px;
  border-radius: 12px;
  background: var(--brand);
  color: var(--on-action-primary);
  font-size: 0.72rem;
  font-weight: 800;
  text-decoration: none;
  transition:
    transform 0.18s ease,
    box-shadow 0.18s ease;
}
.policy-editor-link:hover {
  transform: translateY(-1px);
  box-shadow: var(--shadow-sm);
}
.section-heading {
  gap: 20px;
  margin-bottom: 18px;
}
.section-heading h2 {
  margin: 3px 0 0;
  font-size: 1.1rem;
}
.section-kicker {
  color: var(--text-muted);
  font-size: 0.62rem;
  font-weight: 800;
  letter-spacing: 0.14em;
  text-transform: uppercase;
}
.evaluated-at,
.section-note {
  color: var(--text-muted);
  font-size: 0.7rem;
}
.readiness-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}
.readiness-card {
  position: relative;
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 12px;
  min-height: 126px;
  padding: 18px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface-subtle);
}
.readiness-card.ready {
  border-color: color-mix(in srgb, var(--status-success) 40%, var(--line));
  background: color-mix(in srgb, var(--status-success-soft) 48%, var(--surface-card));
}
.readiness-card > i {
  display: grid;
  width: 38px;
  height: 38px;
  place-items: center;
  border-radius: 12px;
  background: var(--surface-card);
  color: var(--status-info-text);
}
.readiness-card > div {
  display: grid;
  align-content: start;
  gap: 4px;
}
.readiness-card small {
  color: var(--text-muted);
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.readiness-card strong {
  font-size: 0.82rem;
}
.readiness-card span:not(.step-number) {
  color: var(--text-muted);
  font-size: 0.69rem;
  line-height: 1.45;
}
.step-number {
  position: absolute;
  right: 12px;
  top: 9px;
  color: color-mix(in srgb, var(--text-muted) 34%, transparent);
  font: 800 1.35rem/1 var(--font-display);
}
.browser-action-row {
  gap: 20px;
  margin-top: 14px;
  padding: 14px 16px;
  border-radius: 14px;
  background: var(--surface-subtle);
}
.browser-action-row > div {
  display: grid;
  gap: 4px;
}
.browser-action-row strong {
  font-size: 0.78rem;
}
.browser-action-row span {
  color: var(--text-muted);
  font-size: 0.7rem;
  line-height: 1.4;
}
.topic-list,
.device-list {
  display: grid;
  gap: 10px;
}
.topic-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 16px;
  border: 1px solid var(--line);
  border-radius: 15px;
  transition:
    border-color 0.18s ease,
    transform 0.18s ease,
    background 0.18s ease;
}
.topic-row:hover {
  transform: translateY(-1px);
  border-color: var(--line-strong);
  background: var(--surface-subtle);
}
.topic-icon,
.device-icon {
  display: grid;
  width: 42px;
  height: 42px;
  place-items: center;
  border-radius: 13px;
  background: var(--brand-soft);
  color: var(--text-brand);
}
.topic-copy {
  min-width: 0;
}
.topic-title-row {
  justify-content: flex-start;
  gap: 8px;
  flex-wrap: wrap;
}
.topic-title-row strong {
  font-size: 0.82rem;
}
.topic-copy p {
  margin: 5px 0 4px;
  color: var(--text-secondary);
  font-size: 0.73rem;
  line-height: 1.45;
}
.topic-copy small,
.device-row small {
  color: var(--text-muted);
  font-size: 0.65rem;
  line-height: 1.4;
}
.scope-note {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  margin-top: 12px;
  padding: 11px 13px;
  border-radius: 12px;
  background: var(--status-info-soft);
  color: var(--status-info-text);
  font-size: 0.7rem;
  line-height: 1.45;
}
.scope-note i {
  margin-top: 2px;
}
.device-row {
  display: grid;
  grid-template-columns: 42px minmax(0, 1fr) auto;
  align-items: center;
  gap: 14px;
  padding: 14px 16px;
  border-bottom: 1px solid var(--line);
}
.device-row:last-child {
  border-bottom: 0;
}
.device-icon.revoked {
  background: var(--surface-subtle);
  color: var(--text-muted);
}
.device-title-row {
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 4px;
}
.device-title-row strong {
  font-size: 0.78rem;
}
.current-device {
  padding: 3px 7px;
  border-radius: 999px;
  background: var(--brand-soft);
  color: var(--text-brand);
  font-size: 0.58rem;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.05em;
}
.empty-devices {
  display: grid;
  justify-items: center;
  gap: 7px;
  padding: 28px;
  border: 1px dashed var(--line);
  border-radius: 15px;
  color: var(--text-muted);
  text-align: center;
}
.empty-devices i {
  font-size: 1.2rem;
}
.empty-devices strong {
  color: var(--text-primary);
  font-size: 0.8rem;
}
.empty-devices span {
  font-size: 0.7rem;
}
@media (max-width: 800px) {
  .readiness-grid {
    grid-template-columns: 1fr;
  }
  .notification-section {
    padding: 18px;
  }
  .notification-header,
  .section-heading,
  .browser-action-row,
  .policy-summary-copy {
    align-items: flex-start;
    flex-direction: column;
  }
  .policy-equation {
    grid-template-columns: 1fr;
  }
  .policy-equation > i {
    display: none;
  }
  .policy-editor-link {
    width: 100%;
    justify-content: center;
  }
  .browser-action-row :deep(.p-button) {
    width: 100%;
    justify-content: center;
  }
  .topic-row {
    grid-template-columns: 38px minmax(0, 1fr) auto;
    padding: 14px;
  }
  .topic-icon {
    width: 38px;
    height: 38px;
  }
  .device-row {
    grid-template-columns: 38px minmax(0, 1fr);
  }
  .device-row > :deep(.p-button) {
    grid-column: 2;
    width: max-content;
  }
  .section-note,
  .evaluated-at {
    max-width: 100%;
  }
}
@media (max-width: 480px) {
  .support-notification-settings {
    width: auto;
    margin-inline: 0;
    padding-inline: 14px;
  }
  .notification-section {
    margin-top: 14px;
    padding: 15px;
    border-radius: 17px;
  }
  .topic-row {
    grid-template-columns: 34px minmax(0, 1fr);
  }
  .topic-row > :deep(.p-toggleswitch) {
    grid-column: 2;
    justify-self: end;
  }
  .topic-icon {
    width: 34px;
    height: 34px;
    border-radius: 11px;
  }
  .topic-title-row {
    align-items: flex-start;
    flex-direction: column;
  }
  .header-actions {
    width: 100%;
  }
  .header-actions :deep(.p-button) {
    flex: 1;
  }
  .device-row {
    padding: 12px 4px;
  }
  .device-row > :deep(.p-button) {
    grid-column: 1/-1;
    width: 100%;
    justify-content: center;
  }
}
@media (prefers-reduced-motion: reduce) {
  .topic-row {
    transition: none;
  }
  .topic-row:hover {
    transform: none;
  }
}
</style>
