<script setup lang="ts">
import { computed, onMounted, onUnmounted, ref } from 'vue'
import Button from 'primevue/button'
import Tag from 'primevue/tag'
import Skeleton from 'primevue/skeleton'
import Message from 'primevue/message'
import { repository } from '@/shared/api/repository'
import { relativeTime } from '@/shared/lib/format'
import type { ActiveSession } from '@/shared/types/domain'
import SendActionDialog from '@/features/live/SendActionDialog.vue'
import { useAuthStore } from '@/features/auth/auth.store'

const auth = useAuthStore()
const sessions = ref<ActiveSession[]>([])
const selected = ref<ActiveSession | null>(null)
const actionVisible = ref(false)
const loading = ref(true)
const error = ref('')
let timer: number | undefined
const online = computed(() => sessions.value.filter((item) => item.status === 'ONLINE'))
const stale = computed(() => sessions.value.filter((item) => item.status === 'STALE'))
const onlineUsers = computed(() => new Set(online.value.map((item) => item.userId)).size)
const connections = computed(() => {
  const byUser = new Map<string, number>()
  for (const session of sessions.value) byUser.set(session.userId, session.connectionCount ?? 1)
  return [...byUser.values()].reduce((total, count) => total + count, 0)
})

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    sessions.value = auth.project && repository.capabilities.presence ? await repository.getSessions(auth.project.id) : []
    error.value = ''
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Не удалось получить активные сессии' }
  finally { loading.value = false }
}
function send(session: ActiveSession) { selected.value = session; actionVisible.value = true }
onMounted(() => { load(); timer = window.setInterval(() => load(true), 15_000) })
onUnmounted(() => window.clearInterval(timer))
</script>

<template>
  <section class="page live-page">
    <header class="page-header"><div><div class="eyebrow live-label"><i /> Realtime</div><h1>Сейчас онлайн</h1><p class="subtitle">Наблюдайте за активными сессиями и помогайте пользователям в нужный момент.</p></div><Button label="Обновить" icon="pi pi-refresh" severity="secondary" outlined @click="load()" /></header>
    <Message v-if="error" severity="error" class="mb">{{ error }}</Message>
    <div class="summary-grid">
      <div class="summary-card lime"><span>Пользователи онлайн</span><strong>{{ onlineUsers }}</strong><small><i class="pi pi-wifi" /> presence подтверждён backend</small></div>
      <div class="summary-card"><span>Активные сессии</span><strong>{{ online.length }}</strong><small>{{ stale.length ? `${stale.length} stale в demo` : 'валидный heartbeat' }}</small></div>
      <div class="summary-card"><span>Подключения</span><strong>{{ connections }}</strong><small>вкладки и устройства</small></div>
    </div>
    <div class="section-title"><div><h2>Активные сессии</h2><p>{{ sessions.length }} подключений · автообновление каждые 15 секунд</p></div><span class="updated"><i class="pi pi-sync" /> Live</span></div>
    <div v-if="loading" class="session-grid"><Skeleton v-for="i in 6" :key="i" height="210px" border-radius="18px" /></div>
    <div v-else-if="sessions.length" class="session-grid">
      <article v-for="session in sessions" :key="session.id" class="session-card card" :class="{ idle: session.status === 'STALE' }">
        <div class="session-top"><div class="session-avatar">{{ session.userName.slice(0, 1).toUpperCase() }}<i /></div><div><strong>{{ session.userName }}</strong><span class="mono">{{ session.externalId }}</span></div><Tag :value="session.status === 'ONLINE' ? 'Онлайн' : 'Stale'" :severity="session.status === 'ONLINE' ? 'success' : 'warn'" /></div>
        <div class="session-context"><div><i class="pi pi-link" /><span>Interaction session</span><strong class="mono">{{ session.id }}</strong></div><div><i class="pi pi-desktop" /><span>Transport</span><strong>{{ session.device }}</strong></div></div>
        <div class="session-footer"><small>Активность {{ relativeTime(session.lastSeenAt) }}</small><Button label="Написать" icon="pi pi-send" size="small" :disabled="session.status !== 'ONLINE'" @click="send(session)" /></div>
      </article>
    </div>
    <div v-else class="empty card"><i class="pi pi-wifi" />Сейчас нет активных сессий.</div>
  </section>
  <SendActionDialog v-model:visible="actionVisible" :project-id="auth.project?.id" :session="selected" :sessions="sessions.filter((item) => item.userId === selected?.userId)" @sent="load(true)" />
</template>

<style scoped>
.mb{margin-bottom:16px}.live-label{color:#4d9a55}.live-label i{display:inline-block;width:7px;height:7px;border-radius:50%;background:#69c573;margin-right:6px;box-shadow:0 0 0 5px #e5f5e7}.summary-grid{display:grid;grid-template-columns:1.15fr 1fr 1fr;gap:16px;margin-bottom:34px}.summary-card{min-height:156px;padding:22px 24px;border-radius:20px;background:white;border:1px solid var(--line);display:flex;flex-direction:column}.summary-card.lime{background:var(--accent);border-color:#c9ec58}.summary-card>span{text-transform:uppercase;letter-spacing:.09em;font-size:.68rem;font-weight:700;color:#6d7268}.summary-card strong{font:700 3.2rem/1 Manrope;margin:14px 0 auto;letter-spacing:-.06em}.summary-card small{color:#73776e;font-size:.72rem}.summary-card small i{margin-right:5px}.section-title{display:flex;justify-content:space-between;align-items:end;margin-bottom:16px}.section-title p{margin:5px 0 0;color:var(--muted);font-size:.78rem}.updated{font-size:.7rem;color:#4d9a55;text-transform:uppercase;letter-spacing:.08em;font-weight:700}.updated i{font-size:.65rem;margin-right:5px}.session-grid{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:16px}.session-card{padding:18px;transition:.18s ease}.session-card:hover{transform:translateY(-2px);box-shadow:var(--shadow)}.session-card.idle{opacity:.76}.session-top{display:flex;align-items:center;gap:10px}.session-top>div:nth-child(2){flex:1;min-width:0}.session-top strong,.session-top span{display:block;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}.session-top strong{font-size:.86rem}.session-top span{font-size:.63rem;color:var(--muted);margin-top:3px}.session-avatar{position:relative;width:40px;height:40px;display:grid;place-items:center;background:#eeeafb;color:#6e58d1;border-radius:13px;font-weight:700}.session-avatar i{position:absolute;width:9px;height:9px;border-radius:50%;background:#6ac674;border:2px solid white;right:-2px;bottom:-1px}.session-context{margin:18px 0;display:grid;gap:10px}.session-context>div{display:grid;grid-template-columns:16px 1fr;gap:2px 8px}.session-context i{grid-row:1/3;color:#a3a79e;font-size:.73rem;margin-top:2px}.session-context span{font-size:.64rem;color:var(--muted);text-transform:uppercase;letter-spacing:.06em}.session-context strong{font-size:.76rem;margin-top:2px;overflow:hidden;text-overflow:ellipsis}.session-footer{display:flex;align-items:center;justify-content:space-between;border-top:1px solid var(--line);padding-top:14px}.session-footer small{font-size:.68rem;color:var(--muted)}
@media(max-width:1120px){.session-grid{grid-template-columns:repeat(2,1fr)}}@media(max-width:760px){.summary-grid,.session-grid{grid-template-columns:1fr}.summary-card{min-height:130px}.summary-card strong{font-size:2.5rem}.section-title{align-items:flex-start;gap:14px}}
</style>
