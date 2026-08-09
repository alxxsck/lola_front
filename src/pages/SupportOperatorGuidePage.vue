<script setup lang="ts">
import operatorGuideSource from '../../docs/cms-support-operator-guide.ru.md?raw'
import operatorScreen from '../../docs/evidence/support-guides/operator-workspace.png?url'
import { AdminGuidePage } from '@/features/documentation/ui'

const screen = {
  src: operatorScreen,
  alt: 'Рабочее место оператора: очередь, переписка и контекст обращения',
  title: 'Рабочее место оператора',
  caption: 'Три области отвечают на три вопроса: что взять, что происходит и что делать дальше.',
  markers: [
    { x: 11, y: 36, label: 'Очередь, представления, поиск и обращения' },
    { x: 49, y: 42, label: 'Переписка и поле ответа' },
    { x: 84, y: 43, label: 'Контекст обращения, SLA и назначение' },
  ],
}
</script>

<template>
  <AdminGuidePage
    :source="operatorGuideSource"
    title="Работа оператора поддержки"
    description="Короткое руководство для первой смены: как выбрать обращение, разобраться в контексте, ответить и передать работу без потери данных."
    audience-label="Руководство для оператора"
    :meta="[
      { icon: 'pi pi-clock', label: '12 минут' },
      { icon: 'pi pi-compass', label: 'Маршрут первой смены' },
      { icon: 'pi pi-book', label: 'Все термины объяснены' },
    ]"
    :visual-nodes="[
      { icon: 'pi pi-inbox' },
      { icon: 'pi pi-comments', tone: 'highlight' },
      { icon: 'pi pi-send', tone: 'accent' },
    ]"
    visual-caption="Очередь → контекст → ответ"
    content-label="Руководство для оператора поддержки"
    section-icon="pi pi-headphones"
    footer-title="Можно начинать смену"
    footer-action="Открыть поддержку"
    footer-route-name="support-inbox"
    :screen="screen"
  />
</template>
