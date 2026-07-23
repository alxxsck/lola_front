<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Avatar from "primevue/avatar";
import Menu from "primevue/menu";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import { useActionDefinitionsStore } from "@/features/actions/action-definitions.store";
import { useAIProposalsStore } from "@/features/ai-proposals/model/ai-proposals.store";
import { useConversationAISuspensionStore } from "@/features/conversation-ai-suspension/model/conversation-ai-suspension.store";
import {
  hasProjectPermission,
  PROJECT_SETTINGS_SURFACE_READ_PERMISSIONS,
} from "@/features/auth/permission-access";
import { canReadProjectMemberships } from "@/features/project-memberships/model/project-membership-permissions";
import { canReadProjectRoles } from "@/features/project-roles/model/project-role-permissions";
import AIProposalBadge from "@/features/ai-proposals/ui/AIProposalBadge.vue";
import { repository } from "@/shared/api/repository";
import { cmsRealtimeClient } from "@/shared/realtime/cms-realtime-client";
import { conversationAISuspensionEnabled } from "@/shared/config/features";
import ThemeSwitch from "./ThemeSwitch.vue";

const route = useRoute();
const router = useRouter();
const auth = useAuthStore();
const actionDefinitions = useActionDefinitionsStore();
const proposals = useAIProposalsStore();
const suspensions = useConversationAISuspensionStore();
const profileMenu = ref<InstanceType<typeof Menu> | null>(null);
const sidebarOpen = ref(false);

const navigation = computed(() =>
  [
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
    { label: "Обзор", icon: "pi pi-sparkles", to: "/overview", project: true },
    {
      label: "Проект",
      icon: "pi pi-sliders-h",
      to: "/project",
      project: true,
      projectPermissionsAny: [...PROJECT_SETTINGS_SURFACE_READ_PERMISSIONS],
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
    },
    {
      label: "Администраторы",
      icon: "pi pi-user-edit",
      to: "/project/memberships",
      project: true,
      projectMemberships: true,
    },
    {
      label: "Роли",
      icon: "pi pi-shield",
      to: "/project/roles",
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
      label: "Журнал событий",
      icon: "pi pi-list",
      to: "/event-logs",
      project: true,
      projectPermission: "project.event_logs.read",
    },
    {
      label: "Действия",
      icon: "pi pi-directions-alt",
      to: "/actions",
      project: true,
      projectPermission: "project.actions.read",
    },
    {
      label: "Предложения Lola",
      icon: "pi pi-inbox",
      to: "/ai-proposals",
      proposals: true,
      project: true,
      projectPermission: "project.ai_proposals.read",
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
  ].filter(
    (item) =>
      (!item.project || Boolean(auth.project)) &&
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
      (!item.projectMemberships ||
        canReadProjectMemberships(
          auth.user?.platformPermissionCodes ?? [],
          auth.project?.effectivePermissionCodes ?? [],
        )) &&
      (!item.projectRoles ||
        canReadProjectRoles(
          auth.user?.platformPermissionCodes ?? [],
          auth.project?.effectivePermissionCodes ?? [],
        )),
  ),
);

const profileItems = [
  { label: auth.user?.email, disabled: true },
  { separator: true },
  {
    label: "Безопасность",
    icon: "pi pi-lock",
    command: () => router.push("/settings/security"),
  },
  { label: "Выйти", icon: "pi pi-sign-out", command: () => logout(false) },
  { label: "Выйти везде", icon: "pi pi-shield", command: () => logout(true) },
];

async function logout(allDevices: boolean) {
  proposals.deactivate();
  suspensions.deactivate();
  cmsRealtimeClient.deactivateProject();
  try {
    await auth.logout(allDevices);
  } finally {
    actionDefinitions.clear();
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
        hasProjectPermission(
          auth.project?.effectivePermissionCodes ?? [],
          "project.conversations.ai_suspend",
        )
      )
        void suspensions.activateProject(projectId);
      else suspensions.deactivate();
      if (
        hasProjectPermission(
          auth.project?.effectivePermissionCodes ?? [],
          "project.ai_proposals.read",
        )
      )
        void proposals.activateProject(projectId);
      else proposals.deactivate();
    } else {
      proposals.deactivate();
      suspensions.deactivate();
      cmsRealtimeClient.deactivateProject();
    }
  },
  { immediate: true },
);

onBeforeUnmount(() => {
  proposals.deactivate();
  suspensions.deactivate();
  cmsRealtimeClient.deactivateProject();
});
</script>

<template>
  <div class="shell">
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="sidebar-header">
        <div class="brand">
          <div class="brand-mark"><span>Lo</span></div>
          <div><strong>Lola</strong><small>Центр управления</small></div>
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
              (auth.project ? "Текущий Project" : "Control plane")
            }}</span>
          </div>
          <i class="pi pi-lock" />
        </div>
      </div>

      <div class="sidebar-scroll">
        <nav>
          <RouterLink
            v-for="item in navigation"
            :key="item.to"
            :to="item.to"
            class="nav-item"
            :class="{ active: route.path.startsWith(item.to) }"
            @click="sidebarOpen = false"
          >
            <i
              :class="item.icon"
              :style="
                item.live ? 'font-size:.55rem;color:var(--status-success)' : ''
              "
            />
            <span>{{ item.label }}</span>
            <AIProposalBadge
              v-if="item.proposals"
              :count="proposals.unreadCount"
            />
            <span v-if="item.live" class="live-pulse" />
          </RouterLink>
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
                : "Данные с сервера Lola"
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
      <Menu ref="profileMenu" :model="profileItems" popup />
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
        <strong>Lola CMS</strong>
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
.brand-mark {
  width: 39px;
  height: 39px;
  border-radius: 13px;
  display: grid;
  place-items: center;
  background: var(--brand);
  color: var(--on-brand);
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
  transition: 0.18s ease;
}
.nav-item > i {
  width: 17px;
  text-align: center;
  font-size: 0.9rem;
}
.nav-item:hover {
  background: var(--sidebar-surface-hover);
  color: var(--sidebar-text);
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
  padding: 12px;
  background: var(--sidebar-surface-hover);
  border-radius: 12px;
  color: var(--sidebar-text-muted);
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
}
</style>
