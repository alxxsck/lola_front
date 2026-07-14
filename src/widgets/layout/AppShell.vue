<script setup lang="ts">
import { ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Button from 'primevue/button'
import Avatar from 'primevue/avatar'
import Menu from 'primevue/menu'
import Tag from 'primevue/tag'
import { useAuthStore } from '@/features/auth/auth.store'
import { useActionDefinitionsStore } from '@/features/actions/action-definitions.store'
import { repository } from '@/shared/api/repository'

const route = useRoute()
const router = useRouter()
const auth = useAuthStore()
const actionDefinitions = useActionDefinitionsStore()
const profileMenu = ref<InstanceType<typeof Menu> | null>(null)
const sidebarOpen = ref(false)

const navigation = [
  { label: 'Обзор', icon: 'pi pi-sparkles', to: '/overview' },
  { label: 'Проект', icon: 'pi pi-sliders-h', to: '/project' },
  { label: 'База знаний', icon: 'pi pi-book', to: '/knowledge' },
  { label: 'Интерфейс', icon: 'pi pi-th-large', to: '/interface' },
  { label: 'События', icon: 'pi pi-bolt', to: '/events' },
  { label: 'Действия', icon: 'pi pi-directions-alt', to: '/actions' },
  { label: 'Сценарии', icon: 'pi pi-sitemap', to: '/scenarios' },
  { label: 'Операции', icon: 'pi pi-chart-bar', to: '/operations' },
  { label: 'Пользователи', icon: 'pi pi-users', to: '/users' },
  { label: 'Сейчас онлайн', icon: 'pi pi-circle-fill', to: '/live', live: true },
]

const profileItems = [
  { label: auth.user?.email, disabled: true },
  { separator: true },
  { label: 'Выйти', icon: 'pi pi-sign-out', command: () => logout(false) },
  { label: 'Выйти везде', icon: 'pi pi-shield', command: () => logout(true) },
]

async function logout(allDevices: boolean) {
  try {
    await auth.logout(allDevices)
  } finally {
    actionDefinitions.clear()
    await router.push('/login')
  }
}
</script>

<template>
  <div class="shell">
    <aside class="sidebar" :class="{ open: sidebarOpen }">
      <div class="brand">
        <div class="brand-mark"><span>Lo</span></div>
        <div><strong>Lola</strong><small>Control room</small></div>
      </div>

      <div class="project-pill">
        <div class="project-avatar">{{ auth.project?.name.slice(0, 2).toUpperCase() }}</div>
        <div class="project-copy"><strong>{{ auth.project?.name }}</strong><span>{{ auth.project?.organization?.name ?? 'Текущий проект' }}</span></div>
        <i class="pi pi-lock" />
      </div>

      <nav>
        <RouterLink v-for="item in navigation" :key="item.to" :to="item.to" class="nav-item" :class="{ active: route.path.startsWith(item.to) }" @click="sidebarOpen = false">
          <i :class="item.icon" :style="item.live ? 'font-size:.55rem;color:#70c777' : ''" />
          <span>{{ item.label }}</span>
          <span v-if="item.live" class="live-pulse" />
        </RouterLink>
      </nav>

      <div class="sidebar-note">
        <i class="pi pi-code" />
        <div><strong>{{ repository.mode === 'mock' ? 'Demo mode' : 'API connected' }}</strong><span>{{ repository.mode === 'mock' ? 'Изменения сохраняются локально' : 'Данные Lola Backend' }}</span></div>
      </div>
      <button type="button" class="sidebar-profile" aria-label="Открыть меню профиля" @click="profileMenu?.toggle($event)">
        <Avatar :label="auth.user?.name.slice(0, 1).toUpperCase()" shape="circle" />
        <div><strong>{{ auth.user?.name }}</strong><span>{{ auth.user?.role === 'OWNER' ? 'Владелец' : 'Администратор' }}</span></div>
        <i class="pi pi-ellipsis-h" />
      </button>
      <Menu ref="profileMenu" :model="profileItems" popup />
    </aside>

    <main class="content">
      <header class="mobile-header">
        <Button icon="pi pi-bars" text rounded aria-label="Открыть меню" :aria-expanded="sidebarOpen" @click="sidebarOpen = !sidebarOpen" />
        <strong>Lola CMS</strong>
        <Tag :value="repository.mode === 'mock' ? 'DEMO' : 'API'" severity="secondary" />
      </header>
      <RouterView />
    </main>
    <div v-if="sidebarOpen" class="backdrop" @click="sidebarOpen = false" />
  </div>
</template>

<style scoped>
.shell { min-height: 100vh; display: grid; grid-template-columns: 250px minmax(0, 1fr); }
.sidebar { position: sticky; top: 0; height: 100vh; padding: 24px 16px 18px; background: #22251f; color: #f3f4ee; display: flex; flex-direction: column; z-index: 20; }
.brand { display: flex; align-items: center; gap: 11px; padding: 0 8px 24px; }
.brand-mark { width: 39px; height: 39px; border-radius: 13px; display: grid; place-items: center; background: var(--accent); color: #24271f; font-family: Manrope; font-weight: 700; transform: rotate(-3deg); }
.brand strong { font: 700 1.15rem Manrope; display: block; letter-spacing: -.04em; }.brand small { display:block;color:#9da195;font-size:.68rem;text-transform:uppercase;letter-spacing:.1em;margin-top:2px }
.project-pill { display: flex; align-items: center; gap: 10px; padding: 11px; border: 1px solid #3c4037; background: #2b2f28; border-radius: 14px; margin-bottom: 20px; }
.project-avatar { width: 34px; height: 34px; display:grid;place-items:center;border-radius:10px;background:#8e77f5;font-size:.72rem;font-weight:700 }.project-copy{min-width:0;flex:1}.project-copy strong,.project-copy span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.project-copy strong{font-size:.82rem}.project-copy span{font-size:.68rem;color:#9da195;margin-top:3px}.project-pill>i{font-size:.7rem;color:#777c70}
nav { display: flex; flex-direction: column; gap: 4px; }
.nav-item { position:relative; display: flex; align-items: center; gap: 12px; border-radius: 11px; padding: 10px 12px; color: #aeb2a7; font-size: .88rem; font-weight: 500; transition: .18s ease; }.nav-item>i{width:17px;text-align:center;font-size:.9rem}.nav-item:hover{background:#2c3029;color:#fff}.nav-item.active{background:#f4f5ef;color:#22251f}.nav-item.active:before{content:'';position:absolute;left:-16px;width:3px;height:22px;background:var(--accent);border-radius:0 3px 3px 0}.live-pulse{margin-left:auto;width:6px;height:6px;border-radius:50%;background:#70c777;box-shadow:0 0 0 4px rgba(112,199,119,.12)}
.sidebar-note { margin-top:auto; display:flex; gap:10px; padding:12px; background:#2c3029; border-radius:12px; color:#afb3a8 }.sidebar-note>i{color:var(--accent);font-size:.85rem;margin-top:2px}.sidebar-note strong,.sidebar-note span{display:block}.sidebar-note strong{font-size:.74rem;color:#e6e8e1}.sidebar-note span{font-size:.66rem;margin-top:3px;line-height:1.35}
.sidebar-profile { width:100%;display:flex;align-items:center;gap:10px;padding:14px 8px 2px;border:0;background:transparent;color:inherit;text-align:left;cursor:pointer }.sidebar-profile>div:nth-child(2){flex:1;min-width:0}.sidebar-profile strong,.sidebar-profile span{display:block;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.sidebar-profile strong{font-size:.78rem}.sidebar-profile span{font-size:.65rem;color:#90958a;text-transform:uppercase;margin-top:3px}.sidebar-profile>i{font-size:.8rem;color:#777c70}
.content { min-width: 0; }.mobile-header{display:none}.backdrop{display:none}
@media(max-width:900px){.shell{display:block}.sidebar{position:fixed;left:0;transform:translateX(-105%);transition:.22s ease;width:250px}.sidebar.open{transform:none}.mobile-header{height:60px;padding:0 14px;display:flex;align-items:center;justify-content:space-between;background:white;border-bottom:1px solid var(--line);position:sticky;top:0;z-index:15}.backdrop{display:block;position:fixed;inset:0;background:rgba(20,22,18,.35);z-index:19}}
</style>
