<script setup lang="ts">
import guideSource from '../../docs/cms-scenario-engine-guide.ru.md?raw'
import { AdminGuidePage } from '@/features/documentation/ui'
</script>

<template>
  <AdminGuidePage
    :source="guideSource"
    title="Как работают сценарии Lola"
    description="От события и аудитории до публикации, ожиданий и безопасного отката — без устройства API и базы данных."
    :meta="[
      { icon: 'pi pi-clock', label: '20 минут' },
      { icon: 'pi pi-list-check', label: 'Практические примеры' },
      { icon: 'pi pi-shield', label: 'Без технических деталей' },
    ]"
    :visual-nodes="[
      { icon: 'pi pi-bolt' },
      { icon: 'pi pi-filter', tone: 'highlight' },
      { icon: 'pi pi-send', tone: 'accent' },
    ]"
    visual-caption="Событие → проверка → действие"
    content-label="Руководство по сценариям"
    section-icon="pi pi-bookmark"
    footer-title="Готовы собрать сценарий?"
    footer-action="Создать сценарий"
    footer-route-name="scenario-create"
  />
</template>
