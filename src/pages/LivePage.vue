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
import UserWorkspaceDialog from '@/features/end-user-workspace/UserWorkspaceDialog.vue'
import { useAuthStore } from '@/features/auth/auth.store'

const auth = useAuthStore()
const sessions = ref<ActiveSession[]>([])
const selected = ref<ActiveSession | null>(null)
const actionVisible = ref(false)
const workspaceVisible = ref(false)
const loading = ref(true)
const error = ref('')
let timer: number | undefined
const online = computed(() =>
  sessions.value.filter((item) => item.status === 'ONLINE'),
)
const onlineUsers = computed(
  () => new Set(online.value.map((item) => item.userId)).size,
)
const connections = computed(() => {
  const byUser = new Map<string, number>()
  for (const session of sessions.value)
    byUser.set(session.userId, session.connectionCount ?? 1)
  return [...byUser.values()].reduce((total, count) => total + count, 0)
})

async function load(silent = false) {
  if (!silent) loading.value = true
  try {
    sessions.value =
      auth.project && repository.capabilities.presence
        ? await repository.getSessions(auth.project.id)
        : []
    error.value = ''
  } catch (cause) {
    error.value =
      cause instanceof Error
        ? cause.message
        : 'Не удалось получить активные сессии'
  } finally {
    loading.value = false
  }
}
function openWorkspace(session: ActiveSession) {
  selected.value = session
  workspaceVisible.value = true
}
function openActions(session: ActiveSession) {
  selected.value = session
  actionVisible.value = true
}
onMounted(() => {
  load()
  timer = window.setInterval(() => load(true), 15_000)
})
onUnmounted(() => window.clearInterval(timer))
</script>

<template>
  <section class="page live-page">
    <header class="page-header">
      <div>
        <div class="eyebrow live-label"><i /> Realtime</div>
        <h1>Сейчас онлайн</h1>
        <p class="subtitle">
          Наблюдайте за активными сессиями и помогайте пользователям в нужный
          момент.
        </p>
      </div>
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        @click="load()"
      />
    </header>
    <Message v-if="error" severity="error" class="mb">{{ error }}</Message>
    <div class="summary-grid">
      <article class="summary-card lime">
        <div class="summary-head">
          <span>Пользователи онлайн</span
          ><span class="live-pill"><i /> Live</span>
        </div>
        <div class="summary-main">
          <strong>{{ onlineUsers }}</strong>
          <div>
            <b>Сейчас в проекте</b
            ><small
              ><i class="pi pi-wifi" /> presence подтверждён backend</small
            >
          </div>
        </div>
      </article>
      <article class="summary-card connections-card">
        <div class="summary-head">
          <span>Подключения</span
          ><span class="summary-icon"><i class="pi pi-link" /></span>
        </div>
        <div class="summary-main">
          <strong>{{ connections }}</strong>
          <div><b>Realtime-каналы</b><small>вкладки и устройства</small></div>
        </div>
      </article>
    </div>
    <div class="section-title">
      <div>
        <h2>Активные сессии</h2>
        <p>
          {{ sessions.length }} подключений · автообновление каждые 15 секунд
        </p>
      </div>
      <span class="updated"><i class="pi pi-sync" /> Live</span>
    </div>
    <div v-if="loading" class="session-grid">
      <Skeleton v-for="i in 6" :key="i" height="210px" border-radius="18px" />
    </div>
    <div v-else-if="sessions.length" class="session-grid">
      <article
        v-for="session in sessions"
        :key="session.id"
        class="session-card card"
        :class="{ idle: session.status === 'STALE' }"
      >
        <button
          type="button"
          class="session-open-overlay"
          :aria-label="`Открыть диалог с ${session.userName}`"
          @click="openWorkspace(session)"
        />
        <div class="session-top">
          <div class="session-avatar">
            {{ session.userName.slice(0, 1).toUpperCase() }}<i />
          </div>
          <div>
            <strong>{{ session.userName }}</strong
            ><span class="mono">{{ session.externalId }}</span>
          </div>
          <Tag
            :value="session.status === 'ONLINE' ? 'Онлайн' : 'Stale'"
            :severity="session.status === 'ONLINE' ? 'success' : 'warn'"
          />
        </div>
        <div class="session-context">
          <div>
            <i class="pi pi-link" /><span>Interaction session</span
            ><strong class="mono">{{ session.id }}</strong>
          </div>
          <div>
            <i class="pi pi-desktop" /><span>Transport</span
            ><strong>{{ session.device }}</strong>
          </div>
        </div>
        <div class="session-footer">
          <small>Активность {{ relativeTime(session.lastSeenAt) }}</small>
          <div class="session-actions">
            <Button
              label="Действия"
              icon="pi pi-bolt"
              size="small"
              severity="secondary"
              text
              @click.stop="openActions(session)"
            /><Button
              label="Открыть диалог"
              icon="pi pi-comments"
              size="small"
              @click.stop="openWorkspace(session)"
            />
          </div>
        </div>
      </article>
    </div>
    <div v-else class="empty card">
      <i class="pi pi-wifi" />Сейчас нет активных сессий.
    </div>
  </section>
  <SendActionDialog
    v-model:visible="actionVisible"
    :project-id="auth.project?.id"
    :session="selected"
    :sessions="sessions.filter((item) => item.userId === selected?.userId)"
    @sent="load(true)"
  />
  <UserWorkspaceDialog
    v-if="auth.project"
    v-model:visible="workspaceVisible"
    :project-id="auth.project.id"
    :end-user-id="selected?.userId ?? null"
    :external-user-id="selected?.externalId"
    @changed="load(true)"
  />
</template>

<style scoped>
.mb {
  margin-bottom: 16px;
}
.live-label {
  color: var(--status-success-text);
}
.live-label i {
  display: inline-block;
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: var(--status-success-text);
  margin-right: 6px;
  box-shadow: 0 0 0 5px var(--status-success-soft);
}
.summary-grid {
  display: grid;
  grid-template-columns: minmax(0, 1.4fr) minmax(280px, 0.6fr);
  gap: 16px;
  margin-bottom: 34px;
}
.summary-card {
  position: relative;
  min-height: 174px;
  padding: 22px 24px;
  border: 1px solid var(--line);
  border-radius: 22px;
  background: var(--surface-card);
  display: flex;
  flex-direction: column;
  overflow: hidden;
}
.summary-card.lime {
  background: linear-gradient(135deg, var(--brand) 0%, var(--brand-hover) 100%);
  border-color: var(--brand-hover);
  color: var(--on-brand);
}
.summary-card.lime:after {
  content: '';
  position: absolute;
  right: -42px;
  bottom: -92px;
  width: 220px;
  height: 220px;
  border: 42px solid
    color-mix(in srgb, var(--text-on-emphasis) 28%, transparent);
  border-radius: 50%;
  pointer-events: none;
}
.connections-card {
  background: linear-gradient(
    145deg,
    var(--surface-card) 0%,
    var(--surface-subtle) 100%
  );
}
.connections-card:after {
  content: '';
  position: absolute;
  right: -38px;
  bottom: -50px;
  width: 132px;
  height: 132px;
  border-radius: 50%;
  background: radial-gradient(
    circle,
    color-mix(in srgb, var(--status-violet) 10%, transparent),
    transparent 70%
  );
  pointer-events: none;
}
.summary-head {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.summary-head > span:first-child {
  text-transform: uppercase;
  letter-spacing: 0.09em;
  font-size: 0.68rem;
  font-weight: 700;
  color: var(--text-small-muted);
}
.summary-card.lime .summary-head > span:first-child,
.summary-card.lime .summary-main small {
  color: color-mix(in srgb, var(--on-brand) 72%, transparent);
}
.live-pill {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 6px 9px;
  border: 1px solid color-mix(in srgb, var(--on-brand) 18%, transparent);
  border-radius: 999px;
  background: color-mix(in srgb, var(--surface-card) 22%, transparent);
  color: var(--on-brand);
  font-size: 0.6rem;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}
.live-pill i {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--on-brand);
  box-shadow: 0 0 0 4px color-mix(in srgb, var(--on-brand) 13%, transparent);
}
.summary-icon {
  display: grid;
  place-items: center;
  width: 34px;
  height: 34px;
  border-radius: 11px;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
}
.summary-icon i {
  font-size: 0.78rem;
}
.summary-main {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  gap: 22px;
  margin-top: auto;
}
.summary-main > strong {
  flex: 0 0 auto;
  font: 700 3.4rem/1 var(--font-display);
  letter-spacing: -0.07em;
}
.summary-main > div {
  min-width: 0;
  padding-bottom: 3px;
}
.summary-main b,
.summary-main small {
  display: block;
}
.summary-main b {
  margin-bottom: 5px;
  font-size: 0.82rem;
}
.summary-main small {
  color: var(--text-secondary);
  font-size: 0.7rem;
  line-height: 1.35;
}
.summary-main small i {
  margin-right: 5px;
}
.section-title {
  display: flex;
  justify-content: space-between;
  align-items: end;
  margin-bottom: 16px;
}
.section-title p {
  margin: 5px 0 0;
  color: var(--muted);
  font-size: 0.78rem;
}
.updated {
  font-size: 0.7rem;
  color: var(--status-success-text);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}
.updated i {
  font-size: 0.65rem;
  margin-right: 5px;
}
.session-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}
.session-card {
  position: relative;
  padding: 18px;
  transition: 0.18s ease;
}
.session-open-overlay {
  position: absolute;
  z-index: 1;
  inset: 0;
  border: 0;
  border-radius: inherit;
  background: transparent;
  cursor: pointer;
}
.session-open-overlay:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
.session-card > :not(.session-open-overlay) {
  position: relative;
  pointer-events: none;
}
.session-card .session-actions {
  z-index: 2;
  pointer-events: auto;
}
.session-card:hover {
  transform: translateY(-2px);
  box-shadow: var(--shadow);
}
.session-card.idle {
  opacity: 0.76;
}
.session-top {
  display: flex;
  align-items: center;
  gap: 10px;
}
.session-top > div:nth-child(2) {
  flex: 1;
  min-width: 0;
}
.session-top strong,
.session-top span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.session-top strong {
  font-size: 0.86rem;
}
.session-top span {
  font-size: 0.63rem;
  color: var(--muted);
  margin-top: 3px;
}
.session-avatar {
  position: relative;
  width: 40px;
  height: 40px;
  display: grid;
  place-items: center;
  background: var(--status-violet-soft);
  color: var(--status-violet-text);
  border-radius: 13px;
  font-weight: 700;
}
.session-avatar i {
  position: absolute;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  background: var(--status-success-text);
  border: 2px solid var(--surface-card);
  right: -2px;
  bottom: -1px;
}
.session-context {
  margin: 18px 0;
  display: grid;
  gap: 10px;
}
.session-context > div {
  display: grid;
  grid-template-columns: 16px 1fr;
  gap: 2px 8px;
}
.session-context i {
  grid-row: 1/3;
  color: var(--text-secondary);
  font-size: 0.73rem;
  margin-top: 2px;
}
.session-context span {
  font-size: 0.64rem;
  color: var(--muted);
  text-transform: uppercase;
  letter-spacing: 0.06em;
}
.session-context strong {
  font-size: 0.76rem;
  margin-top: 2px;
  overflow: hidden;
  text-overflow: ellipsis;
}
.session-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border-top: 1px solid var(--line);
  padding-top: 14px;
}
.session-footer small {
  font-size: 0.68rem;
  color: var(--muted);
}
@media (max-width: 1120px) {
  .session-grid {
    grid-template-columns: repeat(2, 1fr);
  }
}
@media (max-width: 760px) {
  .summary-grid,
  .session-grid {
    grid-template-columns: 1fr;
  }
  .summary-card {
    min-height: 146px;
  }
  .summary-main > strong {
    font-size: 2.8rem;
  }
  .section-title {
    align-items: flex-start;
    gap: 14px;
  }
}
@media (max-width: 420px) {
  .summary-card {
    padding: 19px;
  }
  .summary-main {
    gap: 16px;
  }
  .summary-main b {
    font-size: 0.76rem;
  }
  .summary-main small {
    font-size: 0.65rem;
  }
}
.session-actions {
  display: flex;
  align-items: center;
  gap: 4px;
}
.session-card:focus-visible {
  outline: 3px solid color-mix(in srgb, var(--brand) 42%, transparent);
  outline-offset: 2px;
}
@media (max-width: 520px) {
  .session-footer {
    align-items: flex-start;
    flex-direction: column;
    gap: 10px;
  }
  .session-actions {
    width: 100%;
    justify-content: flex-end;
  }
}
</style>
