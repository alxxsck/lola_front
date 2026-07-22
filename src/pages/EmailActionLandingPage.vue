<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import { useAuthStore } from '@/features/auth/auth.store'
import {
  hasEmailActionCapability,
  takeEmailActionCapability,
  type EmailIdentityActionKind,
} from '@/features/email-identity/email-action-capability'
import { emailIdentityApi } from '@/features/email-identity/email-identity.api'

const props = defineProps<{ action: EmailIdentityActionKind }>()
const router = useRouter()
const auth = useAuthStore()
const state = ref<'READY' | 'PENDING' | 'SUCCESS' | 'ERROR' | 'MISSING'>(
  hasEmailActionCapability(props.action) ? 'READY' : 'MISSING',
)

const copy = computed(() => ({
  'initial-access': {
    eyebrow: 'Приглашение в Lola CMS',
    title: 'Завершите создание аккаунта',
    description: 'Подтвердите переход, чтобы задать постоянный пароль.',
    button: 'Продолжить настройку',
  },
  verification: {
    eyebrow: 'Безопасность аккаунта',
    title: 'Подтвердите email',
    description: 'Адрес будет подтверждён только после вашего явного действия.',
    button: 'Подтвердить email',
  },
  'email-change': {
    eyebrow: 'Безопасность аккаунта',
    title: 'Подтвердите новый email',
    description: 'Текущий адрес сохранится до успешного подтверждения нового.',
    button: 'Изменить email',
  },
}[props.action]))

const successCopy = computed(() => props.action === 'verification' ? 'Email подтверждён' : 'Email изменён')

async function consume() {
  if (state.value !== 'READY') return
  const token = takeEmailActionCapability(props.action)
  if (!token) {
    state.value = 'MISSING'
    return
  }
  state.value = 'PENDING'
  try {
    const result = await emailIdentityApi.consume(props.action, token)
    if (props.action === 'initial-access') {
      if (!('kind' in result) || result.kind !== 'PASSWORD_SETUP_REQUIRED') throw new Error('Unexpected response')
      auth.beginEmailedPasswordSetup(result.setupToken)
      await router.replace('/password/setup')
      return
    }
    state.value = 'SUCCESS'
  } catch {
    state.value = 'ERROR'
  }
}
</script>

<template>
  <main class="email-action-page" :data-action="action">
    <section class="email-action-card" aria-live="polite">
      <div class="brand"><span>L</span><strong>Lola CMS</strong></div>

      <template v-if="state === 'SUCCESS'">
        <div class="state-icon success"><i class="pi pi-check" /></div>
        <h1>{{ successCopy }}</h1>
        <p>Действие выполнено. Секрет ссылки удалён из адресной строки и больше не используется.</p>
        <a class="safe-link" href="/settings/security">Вернуться к настройкам безопасности</a>
      </template>

      <template v-else>
        <span class="eyebrow">{{ copy.eyebrow }}</span>
        <h1>{{ copy.title }}</h1>
        <p>{{ copy.description }}</p>
        <Message v-if="state === 'ERROR'" severity="error" role="alert">
          Ссылка недействительна или уже использована. Запросите новое письмо.
        </Message>
        <Message v-else-if="state === 'MISSING'" severity="warn" role="alert">
          Ссылка недоступна. Откройте полную ссылку из последнего письма.
        </Message>
        <Button
          :label="copy.button"
          icon="pi pi-arrow-right"
          :loading="state === 'PENDING'"
          :disabled="state !== 'READY'"
          @click="consume"
        />
        <small>Открытие страницы само по себе ничего не изменяет.</small>
      </template>
    </section>
  </main>
</template>

<style scoped>
.email-action-page{display:grid;min-height:100dvh;place-items:center;padding:24px;background:var(--surface-canvas)}.email-action-card{display:flex;width:min(480px,100%);flex-direction:column;align-items:stretch;padding:34px;border:1px solid var(--border-default);border-radius:24px;background:var(--surface-card);box-shadow:var(--shadow-dialog);text-align:center}.brand{display:flex;align-items:center;justify-content:center;gap:10px;margin-bottom:32px}.brand span{display:grid;width:38px;height:38px;place-items:center;border-radius:12px;background:var(--brand);color:var(--on-brand);font-weight:800;transform:rotate(-3deg)}.brand strong{font-family:var(--font-display);font-size:1.05rem}.email-action-card h1{margin:8px 0 10px;font-size:clamp(1.7rem,5vw,2.25rem)}.email-action-card p{margin:0 0 22px;color:var(--muted)}.email-action-card small{margin-top:13px;color:var(--text-secondary)}.email-action-card :deep(.p-message){text-align:left}.email-action-card :deep(.p-button){justify-content:center;margin-top:4px}.state-icon{display:grid;width:58px;height:58px;place-items:center;margin:0 auto 12px;border-radius:18px;font-size:1.25rem}.state-icon.success{background:var(--status-success-soft);color:var(--status-success-text)}.safe-link{align-self:center;padding:10px 12px;color:var(--text-link);font-weight:700}
@media(max-width:520px){.email-action-page{padding:12px}.email-action-card{padding:28px 20px;border-radius:20px}}
</style>
