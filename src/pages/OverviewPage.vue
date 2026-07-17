<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Tag from 'primevue/tag'
import { useAuthStore } from '@/features/auth/auth.store'
import { repository } from '@/shared/api/repository'
import { relativeTime } from '@/shared/lib/format'
import type { DashboardStats, EventLog } from '@/shared/types/domain'

const auth = useAuthStore()
const loading = ref(true)
const error = ref('')
const stats = ref<DashboardStats | null>(null)
const activity = ref<EventLog[]>([])

const numberFormatter = new Intl.NumberFormat('ru-RU')

const statCards = computed(() => repository.mode === 'api' ? [
  { label: 'Пользователи', value: stats.value?.users ?? 0, icon: 'pi pi-users', tone: 'lime', hint: 'Всего в проекте' },
  { label: 'Обработано событий', value: stats.value?.events ?? 0, icon: 'pi pi-bolt', tone: 'coral', hint: 'За всё время' },
  { label: 'Активные сценарии', value: stats.value?.scenarios ?? 0, icon: 'pi pi-sitemap', tone: 'violet', hint: 'Запущены сейчас' },
  { label: 'Ошибки выполнения', value: stats.value?.integrationErrors ?? 0, icon: 'pi pi-exclamation-triangle', tone: 'green', hint: 'События и сценарии' },
] : [
  { label: 'Пользователи', value: stats.value?.users ?? 0, icon: 'pi pi-users', tone: 'lime', hint: 'Всего в проекте' },
  { label: 'Диалоги', value: stats.value?.conversations ?? 0, icon: 'pi pi-comments', tone: 'green', hint: 'История сохранена' },
  { label: 'Обработано событий', value: stats.value?.events ?? 0, icon: 'pi pi-bolt', tone: 'coral', hint: 'За всё время' },
  { label: 'Активные сценарии', value: stats.value?.scenarios ?? 0, icon: 'pi pi-sitemap', tone: 'violet', hint: 'Запущены сейчас' },
  { label: 'Конверсия CTA', value: stats.value?.ctaConversion ?? 0, suffix: '%', icon: 'pi pi-chart-line', tone: 'lime', hint: 'За 30 дней' },
  { label: 'Ошибки интеграции', value: stats.value?.integrationErrors ?? 0, icon: 'pi pi-shield', tone: 'green', hint: 'Контур стабилен' },
])

const quickLinks = [
  { title: 'Создать событие', description: 'Опишите сигнал от продукта и его поля', icon: 'pi pi-bolt', to: '/events', tone: 'coral' },
  { title: 'Собрать сценарий', description: 'Свяжите событие с действиями ассистента', icon: 'pi pi-sitemap', to: '/scenarios', tone: 'violet' },
  { title: 'Добавить элемент', description: 'Зарегистрируйте элемент, страницу или модалку', icon: 'pi pi-plus-circle', to: '/interface', tone: 'lime' },
  { title: 'Проверить операции', description: 'События, запуски сценариев и журнал аудита', icon: 'pi pi-chart-bar', to: '/operations', tone: 'green' },
]

const activitySeverity = (status: EventLog['status']): 'success' | 'warn' | 'danger' =>
  status === 'PROCESSED' ? 'success' : status === 'FAILED' ? 'danger' : 'warn'

const activityStatus = (status: EventLog['status']) => ({
  PROCESSED: 'Обработано',
  FAILED: 'Ошибка',
  RECEIVED: 'Получено',
})[status]

async function loadDashboard() {
  const projectId = auth.project?.id
  if (!projectId) {
    error.value = 'Текущий проект не найден. Войдите заново.'
    loading.value = false
    return
  }

  loading.value = true
  error.value = ''
  try {
    const [nextStats, nextActivity] = await Promise.all([
      repository.getStats(projectId),
      repository.getEventLogPage(projectId, { limit: 6 }),
    ])
    stats.value = nextStats
    activity.value = nextActivity.items
  } catch (cause) {
    error.value = cause instanceof Error ? cause.message : 'Не удалось загрузить обзор проекта'
  } finally {
    loading.value = false
  }
}

onMounted(loadDashboard)
</script>

<template>
  <div class="page overview-page">
    <header class="page-header overview-header">
      <div>
        <div class="eyebrow">Рабочее пространство</div>
        <h1>Добрый день, {{ auth.user?.name }}</h1>
        <p class="subtitle">Всё важное о проекте {{ auth.project?.name }} — в одном месте.</p>
      </div>
      <RouterLink v-if="repository.capabilities.presence" to="/live" class="live-link">
        <span class="live-indicator"><i /></span>
        <span><strong>{{ stats?.online ?? '—' }} онлайн</strong><small>Открыть live-центр</small></span>
        <i class="pi pi-arrow-up-right" />
      </RouterLink>
    </header>

    <Message v-if="error" severity="error" class="dashboard-error">
      <div class="error-row">
        <span>{{ error }}</span>
        <Button label="Повторить" icon="pi pi-refresh" size="small" text @click="loadDashboard" />
      </div>
    </Message>

    <section class="stats-grid" aria-label="Статистика проекта">
      <article v-for="item in statCards" :key="item.label" class="stat-card card" :class="`tone-${item.tone}`">
        <template v-if="loading">
          <Skeleton width="2.75rem" height="2.75rem" border-radius="12px" />
          <Skeleton width="45%" height="2rem" />
          <Skeleton width="70%" height="0.8rem" />
        </template>
        <template v-else>
          <div class="stat-top">
            <span class="stat-icon"><i :class="item.icon" /></span>
            <span v-if="item.label === 'Ошибки интеграции'" class="online-label"><i /> HEALTHY</span>
          </div>
          <strong class="stat-value">{{ numberFormatter.format(item.value) }}{{ item.suffix ?? '' }}</strong>
          <div class="stat-copy"><span>{{ item.label }}</span><small>{{ item.hint }}</small></div>
        </template>
      </article>
    </section>

    <section class="dashboard-grid">
      <div class="card activity-card">
        <div class="section-heading">
          <div><div class="eyebrow">Поток проекта</div><h2>Последняя активность</h2></div>
          <RouterLink to="/event-logs" class="section-link">Открыть журнал <i class="pi pi-arrow-right" /></RouterLink>
        </div>

        <div v-if="loading" class="activity-list">
          <div v-for="item in 4" :key="item" class="activity-skeleton"><Skeleton shape="circle" size="2.5rem" /><div><Skeleton width="11rem" /><Skeleton width="16rem" height="0.7rem" /></div></div>
        </div>
        <div v-else-if="activity.length" class="activity-list">
          <article v-for="item in activity" :key="item.id" class="activity-item">
            <span class="activity-icon" :class="item.status.toLowerCase()"><i :class="item.status === 'FAILED' ? 'pi pi-exclamation-triangle' : 'pi pi-bolt'" /></span>
            <div class="activity-copy">
              <div class="activity-title"><strong>{{ item.eventName }}</strong><Tag :value="activityStatus(item.status)" :severity="activitySeverity(item.status)" rounded /></div>
              <p>{{ item.userExternalId }} · {{ item.eventCode }} · {{ item.source.toLowerCase() }}</p>
            </div>
            <time :datetime="item.receivedAt">{{ relativeTime(item.receivedAt) }}</time>
          </article>
        </div>
        <div v-else class="empty"><i class="pi pi-inbox" />Активность появится после первых событий.</div>
      </div>

      <aside class="quick-panel">
        <div class="section-heading"><div><div class="eyebrow">Быстрый старт</div><h2>Что настроить</h2></div></div>
        <div class="quick-list">
          <RouterLink v-for="item in quickLinks" :key="item.to" :to="item.to" class="quick-card" :class="`tone-${item.tone}`">
            <span class="quick-icon"><i :class="item.icon" /></span>
            <span><strong>{{ item.title }}</strong><small>{{ item.description }}</small></span>
            <i class="pi pi-arrow-up-right" />
          </RouterLink>
        </div>
        <RouterLink to="/project" class="project-note">
          <span class="assistant-avatar">{{ auth.project?.assistantName.slice(0, 1).toUpperCase() || 'L' }}</span>
          <span><small>Ваш ассистент</small><strong>{{ auth.project?.assistantName || 'Lola' }}</strong></span>
          <span class="project-note-action">Настроить</span>
        </RouterLink>
      </aside>
    </section>
  </div>
</template>

<style scoped>
.overview-page{position:relative}.overview-page:before{content:'';position:absolute;top:0;right:5%;width:280px;height:180px;background:radial-gradient(circle,rgba(215,255,100,.22),transparent 70%);pointer-events:none}.overview-header{position:relative;align-items:center}.live-link{display:flex;align-items:center;gap:11px;min-width:220px;padding:12px 14px;background:#fff;border:1px solid var(--line);border-radius:15px;transition:.18s ease}.live-link:hover{transform:translateY(-2px);box-shadow:var(--shadow)}.live-link>span:nth-child(2){display:flex;flex-direction:column;flex:1}.live-link strong{font-size:.82rem}.live-link small{color:var(--muted);font-size:.7rem;margin-top:2px}.live-link>.pi{font-size:.75rem;color:#8b9086}.live-indicator{display:grid;place-items:center;width:34px;height:34px;border-radius:11px;background:#edf8ed}.live-indicator i,.online-label i{width:7px;height:7px;background:#61bc6c;border-radius:50%;box-shadow:0 0 0 4px rgba(97,188,108,.13)}.dashboard-error{margin-bottom:18px}.error-row{display:flex;align-items:center;justify-content:space-between;gap:16px;width:100%}.stats-grid{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:16px;margin-bottom:18px}.stat-card{min-height:184px;padding:20px;display:flex;flex-direction:column;gap:15px;overflow:hidden;position:relative}.stat-card:after{content:'';position:absolute;width:110px;height:110px;border-radius:50%;right:-45px;top:-42px;background:var(--card-color);opacity:.13}.stat-top{display:flex;align-items:center;justify-content:space-between}.stat-icon,.quick-icon{display:grid;place-items:center;width:42px;height:42px;border-radius:13px;background:var(--card-soft);color:var(--card-color)}.stat-icon i{font-size:.95rem}.stat-value{font:700 2rem Manrope;letter-spacing:-.05em;line-height:1}.stat-copy{display:flex;align-items:flex-end;justify-content:space-between;gap:8px}.stat-copy span{font-weight:600;font-size:.86rem}.stat-copy small{color:var(--muted);font-size:.67rem;text-align:right}.tone-lime{--card-color:#759d00;--card-soft:#f0facf}.tone-green{--card-color:#399049;--card-soft:#eaf7eb}.tone-coral{--card-color:#d86443;--card-soft:#fff0eb}.tone-violet{--card-color:#765ce5;--card-soft:#f0edff}.online-label{display:flex;align-items:center;gap:7px;color:#56a960;font-size:.6rem;font-weight:700;letter-spacing:.1em}.online-label i{display:inline-block;width:5px;height:5px}.dashboard-grid{display:grid;grid-template-columns:minmax(0,1.6fr) minmax(300px,.8fr);gap:18px}.activity-card{padding:24px;min-width:0}.section-heading{display:flex;align-items:center;justify-content:space-between;gap:16px;margin-bottom:18px}.section-heading .eyebrow{margin-bottom:5px}.section-link{font-size:.76rem;font-weight:600;color:#555a51}.section-link i{font-size:.65rem;margin-left:5px}.activity-list{display:flex;flex-direction:column}.activity-item{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:13px;padding:14px 0;border-top:1px solid #eeeeea}.activity-item:first-child{border-top:0}.activity-icon{display:grid;place-items:center;width:39px;height:39px;border-radius:12px;background:#f4f5f0;color:#6c7167}.activity-icon.failed{background:#fff0eb;color:#c7543a}.activity-copy{min-width:0}.activity-title{display:flex;align-items:center;gap:8px;min-width:0}.activity-title strong{font-size:.83rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.activity-title :deep(.p-tag){font-size:.58rem;padding:.18rem .4rem;flex:0 0 auto}.activity-copy p{margin:4px 0 0;color:var(--muted);font-size:.74rem;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.activity-item time{font-size:.67rem;color:#989c93;white-space:nowrap}.activity-skeleton{display:flex;align-items:center;gap:13px;padding:14px 0}.activity-skeleton>div{display:flex;flex-direction:column;gap:8px}.quick-panel{padding:24px;background:#24271f;color:white;border-radius:20px;min-width:0}.quick-panel .eyebrow{color:#a6aa9f}.quick-list{display:flex;flex-direction:column;gap:10px}.quick-card{display:grid;grid-template-columns:auto minmax(0,1fr) auto;align-items:center;gap:12px;padding:13px;background:#2d3129;border:1px solid #3a3e35;border-radius:15px;transition:.18s ease}.quick-card:hover{background:#33372f;transform:translateX(2px)}.quick-icon{width:38px;height:38px}.quick-card>span:nth-child(2){min-width:0}.quick-card strong,.quick-card small{display:block}.quick-card strong{font-size:.79rem}.quick-card small{margin-top:3px;color:#9da297;font-size:.66rem;line-height:1.3}.quick-card>.pi{font-size:.68rem;color:#747a6e}.project-note{display:flex;align-items:center;gap:11px;padding:17px 2px 0;margin-top:18px;border-top:1px solid #3b3f36}.assistant-avatar{display:grid;place-items:center;width:37px;height:37px;border-radius:50%;background:var(--violet);font:700 .9rem Manrope}.project-note>span:nth-child(2){display:flex;flex-direction:column;flex:1}.project-note small{font-size:.63rem;color:#8f9488}.project-note strong{font-size:.79rem;margin-top:2px}.project-note-action{font-size:.68rem;color:var(--accent)}
@media(max-width:1180px){.stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}.dashboard-grid{grid-template-columns:1fr}.quick-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr))}.quick-card{grid-template-columns:auto minmax(0,1fr)}.quick-card>.pi{display:none}}
@media(max-width:700px){.overview-header{align-items:flex-start}.live-link{width:100%}.stats-grid{grid-template-columns:1fr 1fr}.stat-card{min-height:160px;padding:16px}.stat-value{font-size:1.65rem}.stat-copy{display:block}.stat-copy small{display:block;text-align:left;margin-top:3px}.activity-card,.quick-panel{padding:18px}.quick-list{grid-template-columns:1fr}.activity-item{grid-template-columns:auto minmax(0,1fr)}.activity-item time{grid-column:2}.section-link{display:none}}
@media(max-width:430px){.stats-grid{grid-template-columns:1fr}.stat-card{min-height:150px}.activity-title{align-items:flex-start;flex-direction:column;gap:4px}}
.stats-grid{grid-template-columns:repeat(3,minmax(0,1fr))}.stat-card{min-height:164px}@media(max-width:1180px){.stats-grid{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:700px){.stats-grid{grid-template-columns:1fr 1fr}}@media(max-width:430px){.stats-grid{grid-template-columns:1fr}}
</style>
