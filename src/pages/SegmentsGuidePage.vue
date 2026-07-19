<script setup lang="ts">
import guideSource from '../../docs/cms-segments-guide.ru.md?raw'
import { AdminGuidePage } from '@/features/documentation/ui'
</script>

<template>
  <AdminGuidePage
    :source="guideSource"
    title="Как создавать и использовать сегменты"
    description="Соберите понятное правило аудитории, проверьте его на пользователе, опубликуйте версию и безопасно подключите к сценарию."
    :meta="[
      { icon: 'pi pi-clock', label: '17 минут' },
      { icon: 'pi pi-sparkles', label: '5 примеров' },
      { icon: 'pi pi-history', label: 'Версии и свежесть' },
    ]"
    :visual-nodes="[
      { icon: 'pi pi-users' },
      { icon: 'pi pi-filter', tone: 'highlight' },
      { icon: 'pi pi-sitemap', tone: 'accent' },
    ]"
    visual-caption="Профиль → правило → сценарий"
    content-label="Руководство по сегментам"
    section-icon="pi pi-users"
    footer-title="Готовы собрать аудиторию?"
    footer-action="Открыть сегменты"
    footer-route-name="segments"
  />
</template>
