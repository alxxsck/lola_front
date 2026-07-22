<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import Button from 'primevue/button'
import Message from 'primevue/message'
import Skeleton from 'primevue/skeleton'
import Textarea from 'primevue/textarea'
import { useAuthStore } from '@/features/auth/auth.store'
import type { ProjectMfaPolicyResponseDto } from '@/shared/api/generated/models'
import { normalizeApiError } from '@/shared/api/http/api-error'
import { projectMfaPolicyApi } from '../api/project-mfa-policy.api'

const props = defineProps<{
  projectId: string
  editable: boolean
}>()

const auth = useAuthStore()
const router = useRouter()
const policy = ref<ProjectMfaPolicyResponseDto | null>(null)
const loading = ref(true)
const saving = ref(false)
const editing = ref(false)
const selectedMode = ref<'OPTIONAL' | 'REQUIRED'>('OPTIONAL')
const reason = ref('')
const error = ref('')
const success = ref('')
const stepUpRequired = ref(false)

const reasonLength = computed(() => [...reason.value.trim().normalize('NFC')].length)
const reasonValid = computed(() => reasonLength.value >= 10 && reasonLength.value <= 500)
const policyLabel = computed(() => policy.value?.mode === 'REQUIRED'
  ? 'Обязательная MFA'
  : 'Необязательная MFA')

function applyPolicy(next: ProjectMfaPolicyResponseDto) {
  policy.value = next
  selectedMode.value = next.mode
}

async function loadPolicy() {
  loading.value = true
  error.value = ''
  try {
    applyPolicy(await projectMfaPolicyApi.get(props.projectId))
  } catch (cause) {
    error.value = normalizeApiError(cause).message || 'Не удалось загрузить политику MFA.'
  } finally {
    loading.value = false
  }
}

function beginEdit() {
  if (!props.editable || !policy.value) return
  selectedMode.value = policy.value.mode
  reason.value = ''
  success.value = ''
  error.value = ''
  stepUpRequired.value = false
  editing.value = true
}

function cancelEdit() {
  editing.value = false
  reason.value = ''
  error.value = ''
  stepUpRequired.value = false
}

async function savePolicy() {
  if (!policy.value || !props.editable || !reasonValid.value) return
  saving.value = true
  error.value = ''
  success.value = ''
  stepUpRequired.value = false
  try {
    applyPolicy(await projectMfaPolicyApi.update(props.projectId, {
      mode: selectedMode.value,
      expectedVersion: policy.value.version,
      reason: reason.value.trim().normalize('NFC'),
    }))
    editing.value = false
    reason.value = ''
    success.value = 'Политика MFA обновлена.'
  } catch (cause) {
    const normalized = normalizeApiError(cause)
    if (normalized.status === 409 || normalized.code === 'PROJECT_MFA_POLICY_VERSION_CONFLICT') {
      await loadPolicy()
      editing.value = false
      error.value = 'Политика уже изменилась. Актуальные данные загружены; проверьте их перед новой попыткой.'
    } else if (
      normalized.status === 428
      || normalized.code === 'REAUTHENTICATION_REQUIRED'
      || normalized.code === 'MFA_REQUIRED'
    ) {
      stepUpRequired.value = true
      error.value = 'Для изменения политики нужен свежий вход с passkey. Изменение не было повторено.'
    } else {
      error.value = normalized.message || 'Не удалось обновить политику MFA.'
    }
  } finally {
    saving.value = false
  }
}

async function reauthenticate() {
  await auth.logout()
  await router.replace('/login')
}

onMounted(() => void loadPolicy())
</script>

<template>
  <section class="card card-pad project-mfa-policy">
    <div class="policy-heading">
      <div>
        <div class="eyebrow">Безопасность проекта</div>
        <h2>Многофакторная аутентификация</h2>
        <p>Определяет, обязаны ли участники проекта использовать passkey при входе.</p>
      </div>
      <Button
        v-if="editable && policy && !editing"
        data-testid="mfa-policy-edit"
        label="Изменить"
        icon="pi pi-pencil"
        severity="secondary"
        outlined
        @click="beginEdit"
      />
    </div>

    <Skeleton v-if="loading" height="5rem" />
    <template v-else>
      <Message v-if="error" severity="error" role="alert" :closable="false">
        {{ error }}
      </Message>
      <Message v-if="success" severity="success" :closable="false">{{ success }}</Message>

      <div v-if="policy && !editing" class="policy-summary">
        <span :class="['policy-badge', policy.mode.toLowerCase()]">{{ policyLabel }}</span>
        <p>
          {{ policy.mode === 'REQUIRED'
            ? 'Каждый CMS User с доступом к проекту завершает вход с passkey.'
            : 'MFA обязательна для Platform Operators; участники проекта могут подключить passkey добровольно.' }}
        </p>
      </div>

      <form v-if="policy && editing" data-testid="mfa-policy-form" class="policy-form" @submit.prevent="savePolicy">
        <label for="project-mfa-mode">Режим</label>
        <select id="project-mfa-mode" v-model="selectedMode" :disabled="saving">
          <option value="OPTIONAL">Необязательная MFA</option>
          <option value="REQUIRED">Обязательная MFA</option>
        </select>

        <label for="project-mfa-reason">Причина изменения</label>
        <Textarea
          id="project-mfa-reason"
          v-model="reason"
          rows="3"
          maxlength="500"
          :disabled="saving"
          placeholder="Например: требование политики безопасности поддержки"
        />
        <small :class="{ invalid: reason.length > 0 && !reasonValid }">
          {{ reasonLength }}/500, минимум 10 символов. Причина попадёт в аудит.
        </small>

        <div class="policy-actions">
          <Button type="button" label="Отмена" severity="secondary" text :disabled="saving" @click="cancelEdit" />
          <Button type="submit" label="Сохранить политику" :loading="saving" :disabled="!reasonValid" />
        </div>
      </form>

      <Button
        v-if="stepUpRequired"
        data-testid="mfa-policy-reauthenticate"
        label="Войти заново"
        icon="pi pi-sign-in"
        severity="secondary"
        outlined
        @click="reauthenticate"
      />

      <Button
        v-if="!policy && !loading"
        label="Повторить"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        @click="loadPolicy"
      />
    </template>
  </section>
</template>

<style scoped>
.project-mfa-policy{display:flex;flex-direction:column;gap:16px}.policy-heading{display:flex;align-items:flex-start;justify-content:space-between;gap:16px}.policy-heading h2{margin:4px 0 6px}.policy-heading p,.policy-summary p{margin:0;color:var(--muted);line-height:1.5}.policy-summary{display:flex;align-items:flex-start;gap:12px;padding:14px;border:1px solid var(--border-subtle);border-radius:14px;background:var(--surface-subtle)}.policy-badge{flex:0 0 auto;padding:5px 9px;border-radius:999px;font-size:.75rem;font-weight:700}.policy-badge.required{background:var(--status-warning-soft);color:var(--status-warning-text)}.policy-badge.optional{background:var(--status-success-soft);color:var(--status-success-text)}.policy-form{display:flex;flex-direction:column;gap:9px}.policy-form label{font-size:.78rem;font-weight:700}.policy-form select{min-height:42px;padding:0 12px;border:1px solid var(--border-default);border-radius:10px;background:var(--surface-card);color:inherit}.policy-form small{color:var(--muted)}.policy-form small.invalid{color:var(--status-danger-text)}.policy-actions{display:flex;justify-content:flex-end;gap:8px;margin-top:4px}@media(max-width:640px){.policy-heading,.policy-summary{flex-direction:column}.policy-actions{flex-direction:column-reverse}.policy-actions :deep(.p-button){width:100%}}
</style>
