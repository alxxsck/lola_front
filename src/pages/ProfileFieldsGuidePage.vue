<script setup lang="ts">
import guideSource from '../../docs/cms-user-profile-fields-guide.ru.md?raw'
import { AdminGuidePage } from '@/features/documentation/ui'
</script>

<template>
  <AdminGuidePage
    :source="guideSource"
    title="Как настроить поля профиля пользователей"
    description="От первого поля и правил обязательности до версий, публикации, качества данных и безопасного вывода из использования."
    :meta="[
      { icon: 'pi pi-clock', label: '18 минут' },
      { icon: 'pi pi-list-check', label: 'Полный пример' },
      { icon: 'pi pi-shield', label: 'Проверочный список' },
    ]"
    :visual-nodes="[
      { icon: 'pi pi-id-card' },
      { icon: 'pi pi-sliders-h', tone: 'highlight' },
      { icon: 'pi pi-check-circle', tone: 'accent' },
    ]"
    visual-caption="Создать → настроить → опубликовать"
    content-label="Руководство по полям профиля пользователей"
    section-icon="pi pi-id-card"
    footer-title="Готовы настроить профиль?"
    footer-action="Открыть поля профиля"
    footer-route-name="project-user-attributes"
  />
</template>
