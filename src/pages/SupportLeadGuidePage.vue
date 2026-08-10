<script setup lang="ts">
import leadGuideSource from '../../docs/cms-support-lead-guide.ru.md?raw'
import leadScreen from '../../docs/evidence/support-guides/lead-control.png?url'
import { AdminGuidePage } from '@/features/documentation/ui'

const screen = {
  src: leadScreen,
  alt: 'Панель лида с показателями очереди, рисками и пакетным назначением',
  title: 'Панель лида',
  caption: 'Сначала оцените очередь и SLA. Затем откройте причину риска и только после этого меняйте назначение.',
  markers: [
    { x: 50, y: 39, label: 'Сводка по очереди, SLA, нагрузке и доставке' },
    { x: 43, y: 72, label: 'Доступность команды и дефицит ёмкости' },
    { x: 54, y: 95, label: 'Активные сигналы; ниже находится очередь рисков' },
  ],
}
</script>

<template>
  <AdminGuidePage
    :source="leadGuideSource"
    title="Работа лида поддержки"
    description="Справочник по ежедневному контролю: очередь, нагрузка, риски SLA, назначения, материалы и интеграции."
    audience-label="Руководство для лида"
    :meta="[
      { icon: 'pi pi-clock', label: '15 минут' },
      { icon: 'pi pi-shield', label: 'Границы прав' },
      { icon: 'pi pi-history', label: 'Безопасные изменения' },
    ]"
    :visual-nodes="[
      { icon: 'pi pi-chart-line' },
      { icon: 'pi pi-users', tone: 'highlight' },
      { icon: 'pi pi-shield', tone: 'accent' },
    ]"
    visual-caption="Сигнал → причина → действие"
    content-label="Руководство для лида поддержки"
    section-icon="pi pi-chart-line"
    footer-title="Готовы проверить смену?"
    footer-action="Открыть операционный обзор"
    footer-route-name="support-control"
    :screen="screen"
  />
</template>
