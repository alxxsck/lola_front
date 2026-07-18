<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import DataTable from 'primevue/datatable'
import Column from 'primevue/column'
import InputText from 'primevue/inputtext'
import Select from 'primevue/select'
import Tag from 'primevue/tag'
import Drawer from 'primevue/drawer'
import Button from 'primevue/button'
import Skeleton from 'primevue/skeleton'
import Message from 'primevue/message'
import { useAuthStore } from '@/features/auth/auth.store'
import { repository } from '@/shared/api/repository'
import { formatDate, relativeTime } from '@/shared/lib/format'
import type { ActiveSession, Conversation, ConversationMessage, EndUser, EventLog } from '@/shared/types/domain'
import SendActionDialog from '@/features/live/SendActionDialog.vue'

const auth = useAuthStore()
const users = ref<EndUser[]>([])
const usersNextCursor = ref<string | null>(null)
const loadingMoreUsers = ref(false)
const sessions = ref<ActiveSession[]>([])
const activity = ref<EventLog[]>([])
const activityLoading = ref(false)
const activityError = ref('')
const loading = ref(true)
const error = ref('')
const search = ref('')
const segment = ref('ALL')
const presence = ref('ALL')
const selected = ref<EndUser | null>(null)
const drawerVisible = ref(false)
const actionVisible = ref(false)
const profileTab = ref<'activity' | 'messages'>('activity')
const conversations = ref<Conversation[]>([])
const messages = ref<ConversationMessage[]>([])
const activeConversationId = ref('')
const conversationNextCursor = ref<string | null>(null)
const messageNextCursor = ref<string | null>(null)
const conversationsLoading = ref(false)
const messagesLoading = ref(false)
const loadingMoreConversations = ref(false)
const loadingMoreMessages = ref(false)
const conversationError = ref('')
const messageError = ref('')
let conversationRequestId = 0
let messageRequestId = 0
let activityRequestId = 0

const segments = computed(() => [{ label: 'Все сегменты', value: 'ALL' }, ...Array.from(new Set(users.value.map((item) => item.segment).filter(Boolean))).map((value) => ({ label: value!, value: value! }))])
const presenceOptions = computed(() => repository.capabilities.presence
  ? [{ label: 'Любая активность', value: 'ALL' }, { label: 'Сейчас онлайн', value: 'ONLINE' }, { label: 'Stale', value: 'STALE' }, { label: 'Офлайн', value: 'OFFLINE' }]
  : [{ label: 'Presence недоступен', value: 'ALL' }])
const onlineIds = computed(() => new Set(sessions.value.filter((item) => item.status === 'ONLINE').map((item) => item.userId)))
const presenceMap = computed(() => new Map(sessions.value.map((item) => [item.userId, item.status])))
const selectedSession = computed(() => sessions.value.find((item) => item.userId === selected.value?.id && item.status === 'ONLINE') ?? null)
const filteredUsers = computed(() => users.value.filter((user) => {
  const query = search.value.toLowerCase()
  const matchesQuery = !query || [user.externalId, user.profile.name, user.profile.email].some((value) => String(value ?? '').toLowerCase().includes(query))
  const matchesSegment = segment.value === 'ALL' || user.segment === segment.value
  const userPresence = presenceMap.value.get(user.id) ?? 'OFFLINE'
  return matchesQuery && matchesSegment && (presence.value === 'ALL' || presence.value === userPresence)
}))
const conversationOptions = computed(() => conversations.value.map((item) => ({ label: `${item.title} · ${item.messageCount}`, value: item.id })))
const activeConversation = computed(() => conversations.value.find((item) => item.id === activeConversationId.value))
const conversationCountLabel = computed(() => `${conversations.value.length}${conversationNextCursor.value ? '+' : ''}`)
const messageCountLabel = computed(() => activeConversation.value
  ? `${messages.value.length} из ${activeConversation.value.messageCount}`
  : '0 сообщений')

async function load() {
  if (!auth.project) return
  loading.value = true; error.value = ''
  try {
    const [usersPage, nextSessions] = await Promise.all([
      repository.getUsersPage(auth.project.id, { limit: 50 }),
      repository.capabilities.presence ? repository.getSessions(auth.project.id) : Promise.resolve([]),
    ])
    users.value = usersPage.items
    usersNextCursor.value = usersPage.nextCursor
    sessions.value = nextSessions
  }
  catch (cause) { error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить пользователей' }
  finally { loading.value = false }
}

async function loadMoreUsers() {
  if (!auth.project || !usersNextCursor.value) return
  loadingMoreUsers.value = true
  error.value = ''
  try {
    const page = await repository.getUsersPage(auth.project.id, { limit: 50, cursor: usersNextCursor.value })
    users.value.push(...page.items)
    usersNextCursor.value = page.nextCursor
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить следующую страницу пользователей'
  } finally {
    loadingMoreUsers.value = false
  }
}
function openUser(user: EndUser) {
  selected.value = user
  profileTab.value = 'activity'
  drawerVisible.value = true
  activity.value = []
  activityError.value = ''
  conversations.value = []
  messages.value = []
  activeConversationId.value = ''
  conversationNextCursor.value = null
  messageNextCursor.value = null
  conversationError.value = ''
  messageError.value = ''
  conversationsLoading.value = false
  messagesLoading.value = false
  loadingMoreConversations.value = false
  loadingMoreMessages.value = false
  conversationRequestId += 1
  messageRequestId += 1
  void loadUserActivity()
  if (repository.capabilities.conversations) void loadConversations()
}

async function loadUserActivity() {
  if (!auth.project || !selected.value) return
  const userId = selected.value.id
  const externalUserId = selected.value.externalId
  const requestId = ++activityRequestId
  activityLoading.value = true
  activityError.value = ''
  try {
    const page = await repository.getEventLogPage(auth.project.id, { externalUserId, limit: 25 })
    if (requestId !== activityRequestId || selected.value?.id !== userId) return
    activity.value = page.items
  } catch (cause) {
    if (requestId === activityRequestId) activityError.value = cause instanceof Error ? cause.message : 'Не удалось загрузить активность'
  } finally {
    if (requestId === activityRequestId) activityLoading.value = false
  }
}

async function selectConversation(id: string) {
  if (!auth.project || !selected.value) return
  activeConversationId.value = id
  messages.value = []
  messageNextCursor.value = null
  messageError.value = ''
  loadingMoreMessages.value = false
  const requestId = ++messageRequestId
  messagesLoading.value = true
  try {
    const page = await repository.getMessages(auth.project.id, selected.value.id, id, { limit: 50 })
    if (requestId !== messageRequestId || activeConversationId.value !== id) return
    messages.value = [...page.items].reverse()
    messageNextCursor.value = page.nextCursor
  } catch (cause) {
    if (requestId === messageRequestId) messageError.value = cause instanceof Error ? cause.message : 'Не удалось загрузить сообщения'
  } finally {
    if (requestId === messageRequestId) messagesLoading.value = false
  }
}

async function loadConversations(append = false) {
  if (!auth.project || !selected.value || (append && !conversationNextCursor.value)) return
  const userId = selected.value.id
  const requestId = ++conversationRequestId
  conversationError.value = ''
  if (append) loadingMoreConversations.value = true
  else conversationsLoading.value = true
  try {
    const page = await repository.getConversations(auth.project.id, userId, {
      limit: 30,
      ...(append && conversationNextCursor.value ? { cursor: conversationNextCursor.value } : {}),
    })
    if (requestId !== conversationRequestId || selected.value?.id !== userId) return
    conversations.value = append ? [...conversations.value, ...page.items] : page.items
    conversationNextCursor.value = page.nextCursor
    if (!append) {
      conversationsLoading.value = false
      const firstConversationId = page.items[0]?.id ?? ''
      activeConversationId.value = firstConversationId
      if (firstConversationId) await selectConversation(firstConversationId)
    }
  } catch (cause) {
    if (requestId === conversationRequestId) conversationError.value = cause instanceof Error ? cause.message : 'Не удалось загрузить диалоги'
  } finally {
    if (requestId === conversationRequestId) {
      conversationsLoading.value = false
      loadingMoreConversations.value = false
    }
  }
}

async function loadMoreMessages() {
  if (!auth.project || !selected.value || !activeConversationId.value || !messageNextCursor.value) return
  const conversationId = activeConversationId.value
  const requestId = ++messageRequestId
  messageError.value = ''
  loadingMoreMessages.value = true
  try {
    const page = await repository.getMessages(auth.project.id, selected.value.id, conversationId, {
      cursor: messageNextCursor.value,
      limit: 50,
    })
    if (requestId !== messageRequestId || activeConversationId.value !== conversationId) return
    messages.value = [...page.items].reverse().concat(messages.value)
    messageNextCursor.value = page.nextCursor
  } catch (cause) {
    if (requestId === messageRequestId) messageError.value = cause instanceof Error ? cause.message : 'Не удалось загрузить сообщения'
  } finally {
    if (requestId === messageRequestId) loadingMoreMessages.value = false
  }
}

function presenceLabel(userId: string) {
  return presenceMap.value.get(userId) ?? 'OFFLINE'
}
onMounted(load)
</script>

<template>
  <section class="page">
    <header class="page-header"><div><div class="eyebrow">Аудитория</div><h1>Пользователи</h1><p class="subtitle">Профили, последние действия и история взаимодействий с Lola.</p></div><Button label="Экспорт CSV" icon="pi pi-download" severity="secondary" outlined disabled /></header>
    <Message v-if="error" severity="error" class="mb">{{ error }}</Message>
    <div class="filters card">
      <span class="search"><i class="pi pi-search" /><InputText v-model="search" placeholder="Имя, email или external ID" /></span>
      <Select v-model="segment" :options="segments" option-label="label" option-value="value" />
      <Select v-model="presence" :options="presenceOptions" option-label="label" option-value="value" :disabled="!repository.capabilities.presence" />
      <span class="count">{{ filteredUsers.length }}{{ usersNextCursor ? '+' : '' }} пользователей</span>
    </div>
    <div class="card table-card">
      <div v-if="loading" class="loading-list"><Skeleton v-for="i in 6" :key="i" height="58px" /></div>
      <DataTable v-else :value="filteredUsers" paginator :rows="10" row-hover data-key="id" @row-click="openUser($event.data)">
        <template #empty><div class="empty"><i class="pi pi-users" />По выбранным фильтрам никого нет.</div></template>
        <Column header="Пользователь">
          <template #body="{ data }"><div class="user-cell"><div class="avatar">{{ String(data.profile.name ?? data.externalId).slice(0, 1).toUpperCase() }}<span v-if="onlineIds.has(data.id)" /></div><div><strong>{{ data.profile.name ?? data.externalId }}</strong><small>{{ data.profile.email ?? data.externalId }}</small></div></div></template>
        </Column>
        <Column field="segment" header="Сегмент" class="mobile-hide"><template #body="{ data }"><Tag :value="data.segment ?? '—'" severity="secondary" /></template></Column>
        <Column field="locale" header="Язык" class="mobile-hide"><template #body="{ data }">{{ (data.locale ?? '—').toUpperCase() }}</template></Column>
        <Column header="Статус"><template #body="{ data }"><span v-if="!repository.capabilities.presence" class="muted">Не опубликован</span><span v-else-if="presenceLabel(data.id) === 'ONLINE'" class="online"><i /> Онлайн</span><span v-else-if="presenceLabel(data.id) === 'STALE'" class="stale"><i /> Stale</span><span v-else class="muted">Офлайн</span></template></Column>
        <Column header="Последняя активность" class="mobile-hide"><template #body="{ data }"><span :title="formatDate(data.lastSeenAt)">{{ relativeTime(data.lastSeenAt) }}</span></template></Column>
        <Column><template #body><i class="pi pi-chevron-right muted" /></template></Column>
      </DataTable>
      <div v-if="!loading && usersNextCursor" class="load-more"><Button label="Загрузить ещё пользователей" icon="pi pi-chevron-down" severity="secondary" outlined :loading="loadingMoreUsers" @click="loadMoreUsers" /></div>
    </div>
  </section>

  <Drawer v-model:visible="drawerVisible" position="right" :style="{ width: 'min(560px, 100vw)' }">
    <template #header><div><div class="eyebrow">Карточка пользователя</div><h2>{{ selected?.profile.name ?? selected?.externalId }}</h2></div></template>
    <div v-if="selected" class="stack profile">
      <div class="profile-head surface-soft"><div class="avatar big">{{ String(selected.profile.name ?? selected.externalId).slice(0, 1).toUpperCase() }}<span v-if="selectedSession" /></div><div><strong>{{ selected.profile.email ?? selected.externalId }}</strong><small class="mono">{{ selected.externalId }}</small></div><Tag :value="selected.segment ?? 'без сегмента'" severity="secondary" /></div>
      <Button v-if="repository.capabilities.adminMessaging" label="Написать от имени Lola" icon="pi pi-send" fluid @click="actionVisible = true" />
      <Message v-if="selectedSession" severity="success" size="small">Пользователь онлайн · {{ sessions.filter((item) => item.userId === selected?.id).length }} активных сессий</Message>
      <Message v-else severity="secondary" size="small">Пользователь offline. Backend повторно проверит presence при отправке текста.</Message>
      <div class="grid grid-2 facts"><div><span>Язык</span><strong>{{ selected.locale?.toUpperCase() ?? '—' }}</strong></div><div><span>Страна</span><strong>{{ selected.profile.country ?? '—' }}</strong></div><div><span>Первый визит</span><strong>{{ formatDate(selected.createdAt) }}</strong></div><div><span>Последняя активность</span><strong>{{ relativeTime(selected.lastSeenAt) }}</strong></div></div>
      <div class="profile-tabs surface-soft" role="tablist" aria-label="Данные пользователя"><button type="button" role="tab" :aria-selected="profileTab === 'activity'" :class="{ active: profileTab === 'activity' }" @click="profileTab = 'activity'"><i class="pi pi-history" /> Активность</button><button type="button" role="tab" :aria-selected="profileTab === 'messages'" :class="{ active: profileTab === 'messages' }" @click="profileTab = 'messages'"><i class="pi pi-comments" /> Диалоги <span>{{ conversationsLoading ? '…' : conversationCountLabel }}</span></button></div>
      <div v-if="profileTab === 'activity'"><div class="row-between timeline-title"><h3>История</h3><RouterLink :to="{ name: 'event-logs', query: { user: selected.externalId } }">Открыть журнал</RouterLink><span>{{ activityLoading ? '…' : `${activity.length} записей` }}</span></div><div v-if="activityLoading" class="timeline-loading"><Skeleton v-for="item in 3" :key="item" height="62px" /></div><div v-else-if="activityError" class="history-error"><Message severity="error" size="small" :closable="false">{{ activityError }}</Message><Button label="Повторить" severity="secondary" size="small" @click="loadUserActivity" /></div><div v-else-if="!activity.length" class="empty surface-soft">История пока пуста</div><div v-else class="timeline"><div v-for="item in activity" :key="item.id" class="timeline-item"><div class="timeline-icon" :class="item.status.toLowerCase()"><i :class="item.status === 'FAILED' ? 'pi pi-exclamation-triangle' : 'pi pi-bolt'" /></div><div><div class="row-between"><strong>{{ item.eventName }}</strong><small>{{ relativeTime(item.receivedAt) }}</small></div><p>{{ item.message || item.eventCode }}</p><Tag :value="item.status" :severity="item.status === 'FAILED' ? 'danger' : item.status === 'PROCESSED' ? 'success' : 'warn'" /></div></div></div></div>
      <div v-else class="conversation-panel">
        <div class="row-between timeline-title"><h3>История сообщений</h3><span>{{ messageCountLabel }}</span></div>
        <div v-if="conversationsLoading" class="empty surface-soft">Загружаем диалоги…</div>
        <template v-else-if="conversations.length">
          <Select :model-value="activeConversationId" :options="conversationOptions" option-label="label" option-value="value" fluid @update:model-value="selectConversation" />
          <Button v-if="conversationNextCursor" label="Загрузить ещё диалоги" icon="pi pi-chevron-down" severity="secondary" text :loading="loadingMoreConversations" @click="loadConversations(true)" />
          <Message v-if="conversationError" severity="error" size="small" :closable="false">{{ conversationError }}</Message>
          <Message v-if="messageError" severity="error" size="small" :closable="false">{{ messageError }}</Message>
          <div v-if="messagesLoading" class="empty surface-soft">Загружаем сообщения…</div>
          <div v-else-if="messages.length || messageNextCursor" class="messages">
            <Button v-if="messageNextCursor" label="Загрузить предыдущие сообщения" icon="pi pi-history" severity="secondary" text size="small" :loading="loadingMoreMessages" @click="loadMoreMessages" />
            <article v-for="message in messages" :key="message.id" class="message" :class="message.author.toLowerCase()"><div class="message-meta"><strong>{{ { USER: 'Пользователь', ASSISTANT: 'Lola', ADMIN: 'Администратор', SCENARIO: 'Сценарий', SYSTEM: 'Система' }[message.author] }}</strong><time>{{ relativeTime(message.createdAt) }}</time></div><p>{{ message.text }}</p><small>{{ message.status.toLowerCase() }}</small></article>
          </div>
          <div v-else-if="messageError" class="history-error"><Button label="Повторить" severity="secondary" size="small" @click="selectConversation(activeConversationId)" /></div>
          <div v-else class="empty surface-soft"><i class="pi pi-comments" />В диалоге пока нет сообщений.</div>
        </template>
        <div v-else-if="conversationError" class="history-error"><Message severity="error" size="small" :closable="false">{{ conversationError }}</Message><Button label="Повторить" severity="secondary" size="small" @click="loadConversations()" /></div>
        <div v-else class="empty surface-soft"><i class="pi pi-comments" />Диалогов пока нет.</div>
      </div>
    </div>
  </Drawer>
  <SendActionDialog v-model:visible="actionVisible" :project-id="auth.project?.id" :user-id="selected?.id" :recipient-name="String(selected?.profile.name ?? selected?.externalId ?? '')" :session="selectedSession" :sessions="sessions.filter((item) => item.userId === selected?.id)" @sent="load" />
</template>

<style scoped>
.mb{margin-bottom:16px}.filters{display:grid;grid-template-columns:minmax(260px,1fr) 190px 190px auto;gap:12px;padding:14px;margin-bottom:18px;align-items:center}.search{position:relative}.search>i{position:absolute;left:14px;top:50%;transform:translateY(-50%);z-index:2;color:var(--text-secondary)}.search :deep(input){padding-left:40px}.count{font-size:.78rem;color:var(--muted);white-space:nowrap}.table-card{overflow:hidden}.loading-list{display:grid;gap:10px;padding:18px}.user-cell,.profile-head{display:flex;align-items:center;gap:11px}.avatar{width:38px;height:38px;display:grid;place-items:center;position:relative;border-radius:13px;background:var(--status-violet-soft);color:var(--status-violet-text);font-weight:700}.avatar span{position:absolute;right:-2px;bottom:-1px;width:10px;height:10px;border-radius:50%;background:var(--status-success-text);border:2px solid var(--surface-card)}.avatar.big{width:54px;height:54px;font-size:1.15rem}.user-cell strong,.user-cell small,.profile-head strong,.profile-head small{display:block}.user-cell small,.profile-head small{font-size:.72rem;color:var(--muted);margin-top:3px}.online{color:var(--status-success-text);font-weight:600;font-size:.8rem}.online i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--status-success-text);margin-right:6px}.table-card :deep(tbody tr){cursor:pointer}.profile-head{padding:15px}.profile-head>div:nth-child(2){flex:1}.facts>div{padding:15px;background:var(--surface-subtle);border-radius:13px}.facts span,.facts strong{display:block}.facts span{font-size:.68rem;text-transform:uppercase;letter-spacing:.08em;color:var(--muted)}.facts strong{font-size:.82rem;margin-top:5px}.timeline-title{margin:8px 0 14px;gap:12px}.timeline-title a{margin-left:auto;color:var(--status-violet-text);font-size:.72rem;font-weight:700}.timeline-title span{color:var(--muted);font-size:.75rem}.timeline-loading{display:grid;gap:10px}.timeline{position:relative;display:flex;flex-direction:column;gap:18px}.timeline:before{content:'';position:absolute;left:17px;top:20px;bottom:20px;width:1px;background:var(--line)}.timeline-item{position:relative;display:grid;grid-template-columns:36px minmax(0,1fr);gap:12px}.timeline-icon{width:34px;height:34px;display:grid;place-items:center;border-radius:11px;background:var(--status-warning-soft);color:var(--status-warning-text);z-index:1}.timeline-icon.failed{background:var(--status-danger-soft);color:var(--status-danger-text)}.timeline-item>div:last-child{min-width:0}.timeline-item strong{overflow:hidden;font-size:.82rem;text-overflow:ellipsis;white-space:nowrap}.timeline-item small{color:var(--muted);font-size:.68rem;white-space:nowrap}.timeline-item p{overflow-wrap:anywhere;color:var(--muted);font-size:.77rem;margin:4px 0 6px}.profile h3{font-size:1rem;margin:0}
@media(max-width:900px){.filters{grid-template-columns:1fr 1fr}.search{grid-column:1/-1}.count{text-align:right}}@media(max-width:540px){.filters{grid-template-columns:1fr}.search{grid-column:auto}.count{text-align:left}.table-card{overflow:auto}.facts{grid-template-columns:1fr 1fr!important}:deep(.mobile-hide){display:none}}
.stale{color:var(--status-warning-text);font-weight:600;font-size:.8rem}.stale i{display:inline-block;width:7px;height:7px;border-radius:50%;background:var(--status-warning-text);margin-right:6px}.profile-tabs{display:grid;grid-template-columns:1fr 1fr;padding:4px;gap:4px}.profile-tabs button{border:0;background:transparent;border-radius:10px;padding:9px;color:var(--muted);font-weight:600;cursor:pointer}.profile-tabs button.active{background:var(--surface-card);color:var(--ink);box-shadow:var(--shadow-raised)}.profile-tabs span{margin-left:4px;padding:1px 6px;border-radius:10px;background:var(--surface-subtle);font-size:.65rem}.conversation-panel{display:flex;flex-direction:column;gap:13px}.messages{display:flex;flex-direction:column;gap:9px;max-height:430px;overflow:auto;padding:3px}.history-error{display:grid;gap:9px}.message{max-width:88%;padding:11px 13px;border-radius:14px;background:var(--surface-subtle);border:1px solid var(--surface-subtle)}.message.user{align-self:flex-end;background:var(--surface-emphasis-raised);color:var(--text-on-emphasis);border-color:var(--surface-emphasis-raised)}.message.admin{background:var(--status-violet-soft);border-color:var(--status-violet-soft)}.message.scenario{background:var(--status-success-soft);border-color:var(--status-success)}.message-meta{display:flex;align-items:center;justify-content:space-between;gap:16px}.message-meta strong{font-size:.67rem;text-transform:uppercase;letter-spacing:.06em}.message-meta time{font-size:.62rem;opacity:.62}.message p{font-size:.78rem;margin:6px 0;line-height:1.45}.message>small{font-size:.6rem;opacity:.58;text-transform:uppercase}
</style>
