<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Avatar from "primevue/avatar";
import Menu from "primevue/menu";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { useConversationAISuspensionStore } from "@/features/conversation-ai-suspension/model/conversation-ai-suspension.store";
import { useProjectActionsStore } from "@/features/project-actions/model/project-actions.store";
import {
  hasProjectPermission,
  PROJECT_SETTINGS_SURFACE_READ_PERMISSIONS,
} from "@/features/auth/permission-access";
import { canReadProjectMemberships } from "@/features/project-memberships/model/project-membership-permissions";
import { canReadProjectRoles } from "@/features/project-roles/model/project-role-permissions";
import { repository } from "@/shared/api/repository";
import { cmsRealtimeClient } from "@/shared/realtime/cms-realtime-client";
import { conversationAISuspensionEnabled } from "@/shared/config/features";
import {
  canReadSupportControl as canReadSupportControlAccess,
  canManagePersonalSupportNotifications,
  canReadSupportWorkspace as canReadSupportWorkspaceAccess,
} from "@/features/support-workspace/model/support-workspace-access";
import {
  clearSupportWorkspaceShellAdmission,
  ensureSupportWorkspaceShellAdmission,
  supportWorkspaceShellAdmissionState,
} from "@/features/support-workspace/model/support-workspace-shell-admission";
import { isCanonicalSupportWorkspaceAdmission } from "@/features/support-workspace/model/support-workspace-entry-point";
import { productBrand } from "@/shared/config/product-brand";
import { openProjectInNewTab } from "@/features/project-switching/open-project-tab";
import { reportingMvpEnabled } from "@/features/reporting/model/reporting-feature";
import ThemeSwitch from "./ThemeSwitch.vue";

const route = useRoute();
const router = useRouter();
const supportFocus = computed(
  () => route.meta.supportWorkspacePresentation === true,
);
const auth = useAuthStore();
const projectActions = useProjectActionsStore();
const suspensions = useConversationAISuspensionStore();
const profileMenu = ref<InstanceType<typeof Menu> | null>(null);
const sidebarOpen = ref(false);
const navigationIntentPath = ref("");
const sidebarCollapsedStorageKey = "retenive-cms-sidebar-collapsed-v1";

function readSidebarCollapsedPreference(): boolean | null {
  if (typeof window === "undefined") return null;
  try {
    const value = window.localStorage.getItem(sidebarCollapsedStorageKey);
    return value === "true" ? true : value === "false" ? false : null;
  } catch {
    return null;
  }
}

const sidebarCollapsedPreference = ref<boolean | null>(
  readSidebarCollapsedPreference(),
);
const sidebarCollapsed = computed(
  () => sidebarCollapsedPreference.value ?? supportFocus.value,
);

function toggleSidebarCollapsed() {
  const next = !sidebarCollapsed.value;
  sidebarCollapsedPreference.value = next;
  try {
    window.localStorage.setItem(sidebarCollapsedStorageKey, String(next));
  } catch {
    // The visible preference remains active for this session.
  }
}
const canReadProjectSettings = computed(() =>
  PROJECT_SETTINGS_SURFACE_READ_PERMISSIONS.some((permission) =>
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      permission,
    ),
  ),
);
const canReadMemberships = computed(() =>
  canReadProjectMemberships(
    auth.user?.platformPermissionCodes ?? [],
    auth.project?.effectivePermissionCodes ?? [],
  ),
);
const canReadRoles = computed(() =>
  canReadProjectRoles(
    auth.user?.platformPermissionCodes ?? [],
    auth.project?.effectivePermissionCodes ?? [],
  ),
);
const canReadProjectIntegrations = computed(() =>
  ["project.notifications.read", "project.integrations.read"].some(
    (permission) =>
      hasProjectPermission(
        auth.project?.effectivePermissionCodes ?? [],
        permission as Parameters<typeof hasProjectPermission>[1],
      ),
  ),
);
const canReadSupportWorkspace = computed(
  () =>
    canReadSupportWorkspaceAccess(
      auth.project?.effectivePermissionCodes ?? [],
    ) &&
    supportWorkspaceShellAdmissionState.value.scope?.actorId ===
      auth.user?.id &&
    supportWorkspaceShellAdmissionState.value.scope?.projectId ===
      auth.project?.id &&
    (isCanonicalSupportWorkspaceAdmission(
      supportWorkspaceShellAdmissionState.value.admission,
      "CASES",
    ) ||
      isCanonicalSupportWorkspaceAdmission(
        supportWorkspaceShellAdmissionState.value.admission,
        "CONVERSATIONS",
      )),
);
const supportWorkspacePath = computed(() => {
  const permissions = auth.project?.effectivePermissionCodes ?? [];
  const canReadCases = hasProjectPermission(permissions, "project.cases.read");
  const canReadConversations = hasProjectPermission(
    permissions,
    "project.conversations.read",
  );
  return canReadCases && !canReadConversations
    ? "/support/inbox?mode=cases"
    : "/support/inbox";
});
const canReadSupportControl = computed(() =>
  canReadSupportControlAccess(auth.project?.effectivePermissionCodes ?? []),
);
const canReadSupportNotificationSettings = computed(() =>
  canManagePersonalSupportNotifications(
    auth.project?.effectivePermissionCodes ?? [],
  ),
);
watch(
  () => [
    auth.user?.id ?? "",
    auth.project?.id ?? "",
    [...(auth.project?.effectivePermissionCodes ?? [])].sort().join(","),
  ],
  ([actorId, projectId]) => {
    const permissions = auth.project?.effectivePermissionCodes ?? [];
    if (!actorId || !projectId || !canReadSupportWorkspaceAccess(permissions)) {
      clearSupportWorkspaceShellAdmission();
      return;
    }
    void ensureSupportWorkspaceShellAdmission({
      actorId,
      projectId,
      effectivePermissionCodes: permissions,
    });
  },
  { immediate: true },
);

const navigationItems = computed(() => [
    {
      label: "CMS Users",
      icon: "pi pi-users",
      to: "/platform/cms-users",
      platformPermission: "platform.cms_users.read",
    },
    {
      label: "Доставка и восстановление",
      icon: "pi pi-heart-fill",
      to: "/platform/notification-operations",
      platformPermission: "platform.notifications.operations.read",
    },
    {
      label: "Тарифы AI",
      icon: "pi pi-dollar",
      to: "/platform/ai-pricing",
      platformPermission: "platform.ai_pricing.read",
    },
    { label: "Обзор", icon: "pi pi-sparkles", to: "/overview", project: true },
    {
      label: "Отчёты",
      icon: "pi pi-chart-line",
      to: "/reports",
      project: true,
      projectPermission: "project.analytics.read",
      reportingFeature: true,
    },
    {
      label: "Проект",
      icon: "pi pi-sliders-h",
      to: "/project",
      project: true,
      projectSectionRoot: true,
    },
    {
      label: "Интеграции",
      icon: "pi pi-link",
      to: "/settings/integrations",
      project: true,
      projectPermissionsAny: [
        "project.notifications.read",
        "project.integrations.read",
      ],
      nested: true,
    },
    {
      label: "Администраторы",
      icon: "pi pi-user-edit",
      to: "/project/memberships",
      nested: true,
      project: true,
      projectMemberships: true,
    },
    {
      label: "Роли",
      icon: "pi pi-shield",
      to: "/project/roles",
      nested: true,
      project: true,
      projectRoles: true,
    },
    {
      label: "Поля профиля",
      icon: "pi pi-id-card",
      to: "/profile-fields",
      project: true,
      projectPermission: "project.profile_contract.read",
    },
    {
      label: "База знаний",
      icon: "pi pi-book",
      to: "/knowledge",
      project: true,
      projectPermission: "project.knowledge.read",
    },
    {
      label: "Интерфейс",
      icon: "pi pi-th-large",
      to: "/interface",
      project: true,
      projectPermission: "project.ui_registry.read",
    },
    {
      label: "События",
      icon: "pi pi-bolt",
      to: "/events",
      project: true,
      projectPermission: "project.event_catalog.read",
    },
    {
      label: "Журнал проекта",
      icon: "pi pi-list",
      to: "/event-logs",
      project: true,
      projectPermissionsAny: [
        "project.event_logs.read",
        "project.integration_activity.read",
      ],
    },
    {
      label: "Действия",
      icon: "pi pi-directions-alt",
      to: "/actions",
      project: true,
      projectPermission: "project.actions.read",
    },
    {
      label: "Поддержка",
      icon: "pi pi-headphones",
      to: supportWorkspacePath.value,
      project: true,
      supportWorkspace: true,
      supportSectionRoot: true,
      supportSection: true,
    },
    {
      label: "Операционный обзор",
      icon: "pi pi-chart-line",
      to: "/support/control",
      project: true,
      supportLeadControl: true,
      nested: true,
      supportSection: true,
    },
    {
      label: "Настройки обращений",
      icon: "pi pi-sliders-h",
      to: "/cases/settings",
      project: true,
      projectPermission: "project.cases.settings.manage",
      nested: true,
      supportSection: true,
    },
    {
      label: "Календарь и SLA",
      icon: "pi pi-clock",
      to: "/support/settings/sla-calendars",
      project: true,
      projectPermissionsAny: [
        "project.support.sla.read",
        "project.support.sla.manage",
      ],
      nested: true,
      supportSection: true,
    },
    {
      label: "Шаблоны ответов",
      icon: "pi pi-file-edit",
      to: "/support/settings/macros",
      project: true,
      projectPermission: "project.support.macros.manage",
      nested: true,
      supportSection: true,
    },
    {
      label: "Уведомления",
      icon: "pi pi-bell",
      to: "/support/settings/notifications",
      project: true,
      supportNotificationSettings: true,
      nested: true,
      supportSection: true,
    },
    {
      label: "Внешние задачи",
      icon: "pi pi-directions",
      to: "/support/external-work",
      project: true,
      projectPermissionsAny: [
        "project.support.external_work.inbox_read",
        "project.support.external_work.read_linked",
      ],
      nested: true,
      supportSection: true,
    },
    {
      label: "Интеграции",
      icon: "pi pi-link",
      to: "/support/settings/integrations",
      project: true,
      projectPermission: "project.support.external_work.manage",
      nested: true,
      supportSection: true,
    },
    {
      label: "Запуск и возврат",
      icon: "pi pi-shield",
      to: "/support/settings/audit-rollout",
      project: true,
      projectPermission: "project.support.workspace.rollout.manage",
      nested: true,
      supportSection: true,
    },
    {
      label: "AI-анализы",
      icon: "pi pi-sparkles",
      to: "/ai-analyses",
      project: true,
      projectPermission: "project.ai_analyses.read",
    },
    {
      label: "Журнал AI",
      icon: "pi pi-history",
      to: "/ai-operations",
      project: true,
      projectPermission: "project.ai_operations.read",
    },
    {
      label: "Расходы AI",
      icon: "pi pi-chart-line",
      to: "/ai-costs",
      project: true,
      projectPermissionsAny: [
        "project.ai_costs.read",
        "project.ai_allowance.read",
        "project.ai_allowance.manage",
        "project.ai_allowance.grant",
        "project.ai_allowance.reconcile",
        "project.ai_allowance.accrual_rules.read",
        "project.ai_allowance.accrual_rules.manage",
        "project.ai_allowance.accrual_receipts.read",
      ],
    },
    {
      label: "Telegram-рассылки",
      icon: "pi pi-send",
      to: "/telegram/broadcasts",
      project: true,
      projectPermission: "project.telegram.broadcasts.read",
    },
    {
      label: "Сценарии",
      icon: "pi pi-sitemap",
      to: "/scenarios",
      project: true,
      projectPermission: "project.scenarios.read",
    },
    {
      label: "Сегменты",
      icon: "pi pi-filter-fill",
      to: "/segments",
      project: true,
      projectPermission: "project.segments.read",
    },
    {
      label: "Документация",
      icon: "pi pi-bookmark",
      to: "/docs",
      project: true,
    },
    {
      label: "Операции",
      icon: "pi pi-chart-bar",
      to: "/operations",
      project: true,
      projectPermissionsAny: [
        "project.event_logs.read",
        "project.scenario_runs.read",
        "project.audit.read",
        "project.integration_api_requests.read",
      ],
    },
    {
      label: "Пользователи",
      icon: "pi pi-users",
      to: "/users",
      project: true,
      projectPermission: "project.profiles.read",
    },
    {
      label: "Сейчас онлайн",
      icon: "pi pi-circle-fill",
      to: "/live",
      live: true,
      project: true,
      projectPermission: "project.end_users.read",
    },
  ]);

const navigation = computed(() => {
  const visibleItems = navigationItems.value.filter(
    (item) =>
      (!item.project || Boolean(auth.project)) &&
      (!item.reportingFeature || reportingMvpEnabled) &&
      (!item.projectSectionRoot ||
        canReadProjectSettings.value ||
        canReadMemberships.value ||
        canReadRoles.value ||
        canReadProjectIntegrations.value) &&
      (!item.platformPermission ||
        auth.user?.platformPermissionCodes?.includes(
          item.platformPermission,
        )) &&
      (!item.projectPermission ||
        hasProjectPermission(
          auth.project?.effectivePermissionCodes ?? [],
          item.projectPermission as Parameters<typeof hasProjectPermission>[1],
        )) &&
      (!Array.isArray(item.projectPermissionsAny) ||
        item.projectPermissionsAny.some((permission) =>
          hasProjectPermission(
            auth.project?.effectivePermissionCodes ?? [],
            permission as Parameters<typeof hasProjectPermission>[1],
          ),
        )) &&
      (!item.projectMemberships || canReadMemberships.value) &&
      (!item.projectRoles || canReadRoles.value) &&
      (!item.supportWorkspace ||
        item.supportSectionRoot ||
        canReadSupportWorkspace.value) &&
      (!item.supportLeadControl || canReadSupportControl.value) &&
      (!item.supportNotificationSettings ||
        canReadSupportNotificationSettings.value),
  );
  const hasVisibleSupportChild = visibleItems.some(
    (item) => item.supportSection && !item.supportSectionRoot,
  );
  return visibleItems.filter(
    (item) =>
      !item.supportSectionRoot ||
      canReadSupportWorkspace.value ||
      hasVisibleSupportChild,
  );
});

const navigationGroups = computed(() => {
  const groups: Array<{
    key: string;
    label?: string;
    items: typeof navigation.value;
  }> = [];
  for (const item of navigation.value) {
    if (item.supportSection) {
      const supportGroup = groups.find((group) => group.key === "support");
      if (supportGroup) supportGroup.items.push(item);
      else groups.push({ key: "support", label: "Поддержка", items: [item] });
      continue;
    }
    groups.push({ key: item.to, items: [item] });
  }
  return groups;
});

function navigationPath(to: string): string {
  return to.split("?", 1)[0] ?? to;
}

function isNavigationItemActive(to: string): boolean {
  const targetPath = navigationPath(to);
  const activePath = navigationIntentPath.value || route.path;
  return (
    activePath === targetPath ||
    (targetPath !== "/project" && activePath.startsWith(`${targetPath}/`))
  );
}

function handleNavigationIntent(event: MouseEvent, to: string): void {
  if (
    event.button !== 0 ||
    event.metaKey ||
    event.ctrlKey ||
    event.shiftKey ||
    event.altKey
  )
    return;
  navigationIntentPath.value = navigationPath(to);
  sidebarOpen.value = false;
}

const removeNavigationIntentAfterEach = router.afterEach(() => {
  navigationIntentPath.value = "";
});
const removeNavigationIntentOnError = router.onError(() => {
  navigationIntentPath.value = "";
});

const profileItems = computed(() => [
  { label: auth.user?.email, disabled: true },
  { separator: true },
  ...(auth.projects.length > 0
    ? [
        {
          label: "Переключить проект",
          icon: "pi pi-briefcase",
          items: auth.projects.map((project) => ({
            label: project.name,
            icon:
              auth.project?.id === project.id
                ? "pi pi-check"
                : "pi pi-briefcase",
            command: () => switchProject(project.id),
            openInNewTab: () => openProjectTab(project.id),
          })),
        },
        { separator: true },
      ]
    : []),
  {
    label: "Безопасность",
    icon: "pi pi-lock",
    command: () => router.push("/settings/security"),
  },
  { label: "Выйти", icon: "pi pi-sign-out", command: () => logout(false) },
  { label: "Выйти везде", icon: "pi pi-shield", command: () => logout(true) },
]);

async function switchProject(projectId: string) {
  if (auth.project?.id === projectId) return;
  projectActions.clear();
  auth.selectProject(projectId);
  await router.push("/overview");
}

function openProjectTab(projectId: string) {
  profileMenu.value?.hide?.();
  openProjectInNewTab(projectId);
}

async function logout(allDevices: boolean) {
  suspensions.deactivate();
  cmsRealtimeClient.deactivateProject();
  try {
    await auth.logout(allDevices);
  } finally {
    projectActions.clear();
    await router.push("/login");
  }
}

watch(
  () => ({
    projectId: auth.project?.id,
    permissions: auth.project?.effectivePermissionCodes?.join("\u0000") ?? "",
  }),
  ({ projectId }) => {
    if (projectId) {
      if (
        conversationAISuspensionEnabled &&
        ["project.conversations.read", "project.conversations.ai_suspend"].some(
          (permission) =>
            hasProjectPermission(
              auth.project?.effectivePermissionCodes ?? [],
              permission as Parameters<typeof hasProjectPermission>[1],
            ),
        )
      )
        void suspensions.activateProject(projectId);
      else suspensions.deactivate();
    } else {
      suspensions.deactivate();
      cmsRealtimeClient.deactivateProject();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  removeNavigationIntentAfterEach();
  removeNavigationIntentOnError();
  clearSupportWorkspaceShellAdmission();
  suspensions.deactivate();
  cmsRealtimeClient.deactivateProject();
});
</script>

<template>
  <div
    class="shell"
    :class="{ 'shell--sidebar-collapsed': sidebarCollapsed }"
  >
    <aside
      class="sidebar"
      :class="{ open: sidebarOpen }"
      aria-label="Основная навигация CMS"
    >
      <div class="sidebar-header">
        <div class="brand">
          <div class="brand-mark">
            <span>{{ productBrand.mark }}</span>
          </div>
          <div class="brand-copy">
            <strong>{{ productBrand.name }}</strong
            ><small>Центр управления</small>
          </div>
          <button
            type="button"
            class="sidebar-collapse-toggle"
            :aria-label="
              sidebarCollapsed
                ? 'Развернуть боковое меню'
                : 'Свернуть боковое меню'
            "
            :title="
              sidebarCollapsed
                ? 'Развернуть боковое меню'
                : 'Свернуть боковое меню'
            "
            @click="toggleSidebarCollapsed"
          >
            <i class="pi pi-angle-double-left" aria-hidden="true" />
          </button>
        </div>

        <div class="project-pill">
          <div class="project-avatar">
            {{
              auth.project ? auth.project.name.slice(0, 2).toUpperCase() : "CP"
            }}
          </div>
          <div class="project-copy">
            <strong>{{ auth.project?.name ?? "Управление платформой" }}</strong
            ><span>{{
              auth.project?.organization?.name ??
              (auth.project ? "Текущий проект" : "Управление платформой")
            }}</span>
          </div>
          <i class="pi pi-lock" />
        </div>
      </div>

      <div class="sidebar-scroll">
        <nav id="cms-primary-navigation">
          <div
            v-for="group in navigationGroups"
            :key="group.key"
            class="nav-group"
            :role="group.label ? 'group' : undefined"
            :aria-label="group.label"
          >
            <template v-for="item in group.items" :key="item.to">
            <div
              v-if="
                (item.projectSectionRoot && !canReadProjectSettings) ||
                (item.supportSectionRoot && !canReadSupportWorkspace)
              "
              class="nav-item nav-item--section"
              role="heading"
              aria-level="2"
              :aria-label="item.label"
              :title="sidebarCollapsed ? item.label : undefined"
            >
              <i :class="item.icon" />
              <span>{{ item.label }}</span>
            </div>
            <RouterLink
              v-else
              :to="item.to"
              class="nav-item"
              :title="sidebarCollapsed ? item.label : undefined"
              :aria-label="sidebarCollapsed ? item.label : undefined"
              :aria-current="
                isNavigationItemActive(item.to) ? 'page' : undefined
              "
              :class="{
                active: isNavigationItemActive(item.to),
                'nav-item--nested': item.nested,
              }"
              @click="handleNavigationIntent($event, item.to)"
            >
              <i
                :class="item.icon"
                aria-hidden="true"
                :style="
                  item.live
                    ? 'font-size:.55rem;color:var(--status-success)'
                    : ''
                "
              />
              <span>{{ item.label }}</span>
              <span v-if="item.live" class="live-pulse" />
            </RouterLink>
            </template>
          </div>
        </nav>
      </div>

      <div class="sidebar-footer">
        <ThemeSwitch />
        <div class="sidebar-note">
          <i class="pi pi-code" />
          <div>
            <strong>{{
              repository.mode === "mock"
                ? "Демонстрационный режим"
                : "Подключение к API"
            }}</strong
            ><span>{{
              repository.mode === "mock"
                ? "Изменения сохраняются локально"
                : `Данные с сервера ${productBrand.name}`
            }}</span>
          </div>
        </div>
        <button
          type="button"
          class="sidebar-profile"
          aria-label="Открыть меню профиля"
          @click="profileMenu?.toggle($event)"
        >
          <Avatar
            :label="auth.user?.name.slice(0, 1).toUpperCase()"
            shape="circle"
          />
          <div>
            <strong>{{ auth.user?.name }}</strong
            ><span>{{
              !auth.project && auth.user?.platformPermissionCodes?.length
                ? "Platform Operator"
                : auth.project?.roleKeys?.includes("PROJECT_OWNER")
                  ? "Владелец"
                  : "Администратор"
            }}</span>
          </div>
          <i class="pi pi-ellipsis-h" />
        </button>
      </div>
      <Menu ref="profileMenu" :model="profileItems" popup>
        <template #item="{ item, label, props }">
          <div v-if="item.openInNewTab" class="project-menu-item">
            <a v-bind="props.action" class="project-menu-item__switch">
              <span v-if="item.icon" v-bind="props.icon" />
              <span v-bind="props.label">{{ label }}</span>
            </a>
            <button
              type="button"
              class="project-menu-item__open"
              :aria-label="`Открыть проект ${label} в новой вкладке`"
              title="Открыть в новой вкладке"
              @click.stop="item.openInNewTab()"
            >
              <i class="pi pi-external-link" aria-hidden="true" />
            </button>
          </div>
          <a
            v-else
            v-bind="props.action"
            :href="item.url"
            :target="item.target"
          >
            <span v-if="item.icon" v-bind="props.icon" />
            <span v-bind="props.label">{{ label }}</span>
          </a>
        </template>
      </Menu>
    </aside>

    <main class="content">
      <header class="mobile-header">
        <Button
          icon="pi pi-bars"
          text
          rounded
          aria-label="Открыть меню"
          :aria-expanded="sidebarOpen"
          @click="sidebarOpen = !sidebarOpen"
        />
        <strong>{{ productBrand.cmsName }}</strong>
        <Tag
          :value="repository.mode === 'mock' ? 'ДЕМО' : 'API'"
          severity="secondary"
        />
      </header>
      <RouterView />
    </main>
    <div v-if="sidebarOpen" class="backdrop" @click="sidebarOpen = false" />
  </div>
</template>

<style scoped>
.shell {
  min-height: 100vh;
  display: grid;
  grid-template-columns: 250px minmax(0, 1fr);
  transition: grid-template-columns 220ms cubic-bezier(0.23, 1, 0.32, 1);
}
.shell--sidebar-collapsed {
  grid-template-columns: 64px minmax(0, 1fr);
}
.shell--sidebar-collapsed .sidebar {
  padding: 14px 8px 12px;
}
.shell--sidebar-collapsed .brand {
  flex-direction: column;
  justify-content: center;
  gap: 8px;
  padding: 0 0 14px;
}
.shell--sidebar-collapsed .brand-copy,
.shell--sidebar-collapsed .project-copy,
.shell--sidebar-collapsed .project-pill > i,
.shell--sidebar-collapsed .nav-item > span:not(.live-pulse),
.shell--sidebar-collapsed .live-pulse,
.shell--sidebar-collapsed .sidebar-profile > div,
.shell--sidebar-collapsed .sidebar-profile > i {
  max-width: 0;
  max-height: 0;
  opacity: 0;
  overflow: hidden;
  visibility: hidden;
  transform: translateX(-6px);
  transition:
    max-width 180ms cubic-bezier(0.23, 1, 0.32, 1),
    max-height 180ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 80ms linear,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
    visibility 0s linear 180ms;
}
.shell--sidebar-collapsed .sidebar-note {
  max-height: 0;
  padding-top: 0;
  padding-bottom: 0;
  opacity: 0;
  visibility: hidden;
  transform: translateX(-6px);
  transition:
    max-height 180ms cubic-bezier(0.23, 1, 0.32, 1),
    padding 180ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 80ms linear,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
    visibility 0s linear 180ms;
}
.shell--sidebar-collapsed .sidebar-collapse-toggle {
  margin-left: 0;
}
.shell--sidebar-collapsed .sidebar-collapse-toggle > i {
  transform: rotate(180deg);
}
.shell--sidebar-collapsed .project-pill {
  justify-content: center;
  padding: 7px;
  margin-bottom: 12px;
}
.shell--sidebar-collapsed .nav-item,
.shell--sidebar-collapsed .nav-item--nested {
  width: 100%;
  min-height: 40px;
  justify-content: center;
  margin-left: 0;
  padding: 10px;
}
.shell--sidebar-collapsed .nav-item--nested::after {
  display: none;
}
.shell--sidebar-collapsed .nav-item.active::before {
  left: -8px;
}
.shell--sidebar-collapsed .sidebar-profile {
  justify-content: center;
  padding: 4px 0;
}
.shell--sidebar-collapsed :deep(.theme-switch) {
  justify-content: center;
  padding: 10px;
}
.shell--sidebar-collapsed :deep(.theme-copy),
.shell--sidebar-collapsed :deep(.theme-track) {
  max-width: 0;
  opacity: 0;
  overflow: hidden;
  visibility: hidden;
  transform: translateX(-6px);
  transition:
    max-width 180ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 80ms linear,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1),
    visibility 0s linear 180ms;
}
.sidebar {
  position: sticky;
  top: 0;
  height: 100dvh;
  padding: 24px 16px 18px;
  overflow: hidden;
  background: var(--sidebar-background);
  color: var(--sidebar-text);
  display: flex;
  flex-direction: column;
  z-index: 20;
}
.sidebar-header,
.sidebar-footer {
  flex: 0 0 auto;
}
.brand {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 0 8px 24px;
}
.brand-copy {
  min-width: 0;
}
.brand-copy,
.project-copy,
.project-pill > i,
.nav-item > span:not(.live-pulse),
.live-pulse,
.sidebar-profile > div,
.sidebar-profile > i {
  max-width: 180px;
  max-height: 48px;
  opacity: 1;
  visibility: visible;
  transform: translateX(0);
  transition:
    max-width 220ms cubic-bezier(0.23, 1, 0.32, 1),
    max-height 180ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 120ms linear 80ms,
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1) 60ms,
    visibility 0s linear;
}
.sidebar-footer :deep(.theme-copy),
.sidebar-footer :deep(.theme-track) {
  max-width: 180px;
  opacity: 1;
  visibility: visible;
  transform: translateX(0);
  transition:
    max-width 220ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 120ms linear 80ms,
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1) 60ms,
    visibility 0s linear;
}
.sidebar-collapse-toggle {
  width: 40px;
  height: 40px;
  flex: 0 0 40px;
  display: grid;
  place-items: center;
  margin-left: auto;
  border: 1px solid var(--sidebar-border);
  border-radius: 11px;
  background: var(--sidebar-surface);
  color: var(--sidebar-text-muted);
  cursor: pointer;
  transition:
    background-color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    color 160ms cubic-bezier(0.23, 1, 0.32, 1),
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.sidebar-collapse-toggle:hover,
.sidebar-collapse-toggle:focus-visible {
  background: var(--sidebar-surface-hover);
  color: var(--sidebar-text);
}
.sidebar-collapse-toggle:focus-visible {
  outline: 2px solid var(--brand);
  outline-offset: 2px;
}
.sidebar-collapse-toggle:active {
  transform: scale(0.97);
}
.sidebar-collapse-toggle > i {
  font-size: 0.78rem;
  transition: transform 200ms cubic-bezier(0.23, 1, 0.32, 1);
}
.brand-mark {
  width: 39px;
  height: 39px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  background: var(--brand-primary);
  color: var(--on-action-primary);
  font-family: var(--font-display);
  font-weight: 700;
  transform: rotate(-3deg);
}
.brand strong {
  font: 700 1.15rem var(--font-display);
  display: block;
  letter-spacing: -0.04em;
}
.brand small {
  display: block;
  color: var(--sidebar-text-subtle);
  font-size: 0.68rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  margin-top: 2px;
}
.project-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 11px;
  border: 1px solid var(--sidebar-border);
  background: var(--sidebar-surface);
  border-radius: 14px;
  margin-bottom: 20px;
}
.project-avatar {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 10px;
  background: var(--sidebar-project-avatar-background);
  font-size: 0.72rem;
  font-weight: 700;
}
.project-copy {
  min-width: 0;
  flex: 1;
}
.project-copy strong,
.project-copy span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.project-copy strong {
  font-size: 0.82rem;
}
.project-copy span {
  font-size: 0.68rem;
  color: var(--sidebar-text-subtle);
  margin-top: 3px;
}
.project-pill > i {
  font-size: 0.7rem;
  color: var(--sidebar-text-subtle);
}
.sidebar-scroll {
  min-height: 0;
  flex: 1 1 auto;
  overflow-y: auto;
  overscroll-behavior: contain;
  scrollbar-gutter: stable;
}
.sidebar-scroll::-webkit-scrollbar {
  width: 5px;
}
.sidebar-scroll::-webkit-scrollbar-thumb {
  border-radius: 999px;
  background: var(--sidebar-border);
}
nav {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-group {
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.nav-item {
  position: relative;
  display: flex;
  align-items: center;
  gap: 12px;
  border-radius: 11px;
  padding: 10px 12px;
  color: var(--sidebar-text-muted);
  font-size: 0.88rem;
  font-weight: 500;
  transition:
    background-color 180ms cubic-bezier(0.23, 1, 0.32, 1),
    color 180ms cubic-bezier(0.23, 1, 0.32, 1);
}
.nav-item > i {
  width: 17px;
  text-align: center;
  font-size: 0.9rem;
}
.nav-item--nested {
  width: calc(100% - 22px);
  margin-left: 22px;
  padding: 8px 11px;
  font-size: 0.82rem;
}
.nav-item--nested::after {
  content: "";
  position: absolute;
  left: -10px;
  width: 7px;
  border-top: 1px solid var(--sidebar-border);
}
.nav-item--nested > i {
  font-size: 0.82rem;
}
.nav-item:hover {
  background: var(--sidebar-surface-hover);
  color: var(--sidebar-text);
}
.nav-item--section:hover {
  background: transparent;
  color: var(--sidebar-text-muted);
}
.nav-item.active {
  background: var(--sidebar-active-background);
  color: var(--sidebar-active-text);
}
.nav-item.active:before {
  content: "";
  position: absolute;
  left: -16px;
  width: 3px;
  height: 22px;
  background: var(--brand);
  border-radius: 0 3px 3px 0;
}
.nav-count {
  min-width: 20px;
  margin-left: auto;
  padding: 1px 6px;
  border-radius: 999px;
  background: var(--action-primary);
  color: var(--on-action-primary);
  font-size: 0.68rem;
  font-weight: 700;
  line-height: 18px;
  text-align: center;
}
.live-pulse {
  margin-left: auto;
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--status-success);
  box-shadow: 0 0 0 4px
    color-mix(in srgb, var(--status-success) 12%, transparent);
}
.sidebar-footer {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding-top: 10px;
}
.sidebar-note {
  display: flex;
  gap: 10px;
  max-height: 80px;
  padding: 12px;
  overflow: hidden;
  background: var(--sidebar-surface-hover);
  border-radius: 12px;
  color: var(--sidebar-text-muted);
  opacity: 1;
  visibility: visible;
  transform: translateX(0);
  transition:
    max-height 220ms cubic-bezier(0.23, 1, 0.32, 1),
    padding 220ms cubic-bezier(0.23, 1, 0.32, 1),
    opacity 120ms linear 80ms,
    transform 160ms cubic-bezier(0.23, 1, 0.32, 1) 60ms,
    visibility 0s linear;
}
.sidebar-note > i {
  color: var(--brand);
  font-size: 0.85rem;
  margin-top: 2px;
}
.sidebar-note strong,
.sidebar-note span {
  display: block;
}
.sidebar-note strong {
  font-size: 0.74rem;
  color: var(--sidebar-text);
}
.sidebar-note span {
  font-size: 0.66rem;
  margin-top: 3px;
  line-height: 1.35;
}
.sidebar-profile {
  width: 100%;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 6px 8px 2px;
  border: 0;
  background: transparent;
  color: inherit;
  text-align: left;
  cursor: pointer;
}
.sidebar-profile > div:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.sidebar-profile strong,
.sidebar-profile span {
  display: block;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.sidebar-profile strong {
  font-size: 0.78rem;
}
.sidebar-profile span {
  font-size: 0.65rem;
  color: var(--sidebar-text-subtle);
  text-transform: uppercase;
  margin-top: 3px;
}
.sidebar-profile > i {
  font-size: 0.8rem;
  color: var(--sidebar-text-subtle);
}
.project-menu-item {
  display: flex;
  align-items: center;
  width: 100%;
}
.project-menu-item__switch {
  flex: 1;
  min-width: 0;
}
.project-menu-item__open {
  flex: 0 0 auto;
  width: 2.25rem;
  height: 2.25rem;
  margin-right: 0.35rem;
  display: grid;
  place-items: center;
  border: 0;
  border-radius: 0.5rem;
  background: transparent;
  color: var(--text-secondary);
  cursor: pointer;
}
.project-menu-item__open:hover,
.project-menu-item__open:focus-visible {
  background: var(--surface-hover);
  color: var(--text-primary);
  outline: none;
}
.content {
  min-width: 0;
}
.mobile-header {
  display: none;
}
.backdrop {
  display: none;
}
@media (max-width: 900px) {
  .shell {
    display: block;
  }
  .sidebar {
    position: fixed;
    left: 0;
    transform: translateX(-105%);
    transition: 0.22s ease;
    width: 250px;
  }
  .sidebar.open {
    transform: none;
  }
  .mobile-header {
    height: 60px;
    padding: 0 14px;
    display: flex;
    align-items: center;
    justify-content: space-between;
    background: var(--surface-card);
    border-bottom: 1px solid var(--border-default);
    position: sticky;
    top: 0;
    z-index: 15;
  }
  .backdrop {
    display: block;
    position: fixed;
    inset: 0;
    background: var(--overlay-backdrop);
    z-index: 19;
  }
  .sidebar-collapse-toggle {
    display: none;
  }
  .shell--sidebar-collapsed .sidebar {
    padding: 24px 16px 18px;
  }
  .shell--sidebar-collapsed .brand {
    flex-direction: row;
    justify-content: flex-start;
    gap: 11px;
    padding: 0 8px 24px;
  }
  .shell--sidebar-collapsed .brand-copy,
  .shell--sidebar-collapsed .project-copy,
  .shell--sidebar-collapsed .project-pill > i,
  .shell--sidebar-collapsed .nav-item > span:not(.live-pulse),
  .shell--sidebar-collapsed .live-pulse,
  .shell--sidebar-collapsed .sidebar-profile > div,
  .shell--sidebar-collapsed .sidebar-profile > i {
    max-width: 180px;
    max-height: 48px;
    opacity: 1;
    visibility: visible;
    transform: translateX(0);
    transition: none;
    display: block;
  }
  .shell--sidebar-collapsed .project-pill > i,
  .shell--sidebar-collapsed .sidebar-profile > i {
    display: inline-block;
  }
  .shell--sidebar-collapsed .nav-item > span:not(.live-pulse) {
    display: inline;
  }
  .shell--sidebar-collapsed .live-pulse {
    display: block;
  }
  .shell--sidebar-collapsed .sidebar-note {
    max-height: 80px;
    padding: 12px;
    opacity: 1;
    visibility: visible;
    transform: translateX(0);
    transition: none;
    display: flex;
  }
  .shell--sidebar-collapsed .project-pill {
    justify-content: flex-start;
    padding: 11px;
    margin-bottom: 20px;
  }
  .shell--sidebar-collapsed .nav-item {
    width: 100%;
    justify-content: flex-start;
    padding: 10px 12px;
  }
  .shell--sidebar-collapsed .nav-item--nested {
    width: calc(100% - 22px);
    margin-left: 22px;
    padding: 8px 11px;
  }
  .shell--sidebar-collapsed .nav-item--nested::after {
    display: block;
  }
  .shell--sidebar-collapsed .nav-item.active::before {
    left: -16px;
  }
  .shell--sidebar-collapsed .sidebar-profile {
    justify-content: flex-start;
    padding: 6px 8px 2px;
  }
  .shell--sidebar-collapsed :deep(.theme-switch) {
    justify-content: flex-start;
    padding: 10px 11px;
  }
  .shell--sidebar-collapsed :deep(.theme-copy),
  .shell--sidebar-collapsed :deep(.theme-track) {
    max-width: 180px;
    opacity: 1;
    visibility: visible;
    transform: translateX(0);
    transition: none;
    display: flex;
  }
}

@media (prefers-reduced-motion: reduce) {
  .shell,
  .sidebar-collapse-toggle,
  .sidebar-collapse-toggle > i,
  .nav-item,
  .brand-copy,
  .project-copy,
  .project-pill > i,
  .nav-item > span,
  .sidebar-note,
  .sidebar-profile > div,
  .sidebar-profile > i,
  .sidebar-footer :deep(.theme-copy),
  .sidebar-footer :deep(.theme-track) {
    transition-duration: 0.01ms;
  }
}
</style>
