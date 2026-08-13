<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import Button from 'primevue/button';
import Dialog from 'primevue/dialog';
import Message from 'primevue/message';
import { useAuthStore } from '@/features/auth/auth.store';
import {
  formatExactCurrencyRate as formatMoney,
  isValidTextToSpeechRate,
} from '@/features/ai-pricing/ai-pricing.model';
import {
  fetchTextToSpeechPricing,
  publishTextToSpeechPricing,
  type TextToSpeechPricingRevision,
  type TextToSpeechPricingState,
} from '@/features/ai-pricing/ai-pricing.api';
import { normalizeApiError } from '@/shared/api/http/api-error';

const auth = useAuthStore();
const router = useRouter();
const state = ref<TextToSpeechPricingState | null>(null);
const loading = ref(false);
const loadingMore = ref(false);
const publishing = ref(false);
const error = ref('');
const freshAuthRequired = ref(false);
const publicationOutcomeUnknown = ref(false);
const notice = ref('');
const rate = ref('');
const reason = ref('');
const validationError = ref('');
const confirmationOpen = ref(false);
const pendingPublication = ref<{
  ratePerMillionCharacters: string;
  changeReason: string;
} | null>(null);
let loadGeneration = 0;
let latestSuccessfulLoadGeneration = 0;
let mutationGeneration = 0;
let activeRequest: AbortController | undefined;

const permissions = computed(() => auth.user?.platformPermissionCodes ?? []);
const canRead = computed(() => permissions.value.includes('platform.ai_pricing.read'));
const canWrite = computed(() => permissions.value.includes('platform.ai_pricing.write'));

function formatDate(value: string): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date(value));
}

function actorLabel(revision: TextToSpeechPricingRevision): string {
  const type = {
    CMS_USER: 'CMS User',
    BREAK_GLASS: 'Break-glass',
    SYSTEM: 'System',
  }[revision.createdBy.type];
  return `${type} · ${revision.createdBy.id}`;
}

function clearSensitiveState(): void {
  activeRequest?.abort();
  activeRequest = undefined;
  loadGeneration += 1;
  mutationGeneration += 1;
  publishing.value = false;
  state.value = null;
  rate.value = '';
  reason.value = '';
  validationError.value = '';
  confirmationOpen.value = false;
  pendingPublication.value = null;
  notice.value = '';
  error.value = '';
  freshAuthRequired.value = false;
  publicationOutcomeUnknown.value = false;
}

async function refreshAuthorityAfterForbidden(): Promise<void> {
  state.value = null;
  confirmationOpen.value = false;
  pendingPublication.value = null;
  try {
    await auth.refreshContext();
  } catch {
    await router.replace({ name: 'login' });
    return;
  }
  if (auth.isAuthenticated && !canRead.value) {
    await router.replace(auth.authenticatedLandingPath);
  }
}

async function load(): Promise<boolean> {
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const generation = ++loadGeneration;
  loading.value = true;
  error.value = '';
  freshAuthRequired.value = false;
  try {
    const next = await fetchTextToSpeechPricing({ limit: 50 }, controller.signal);
    if (generation !== loadGeneration) return false;
    state.value = next;
    latestSuccessfulLoadGeneration = generation;
    error.value = '';
    publicationOutcomeUnknown.value = false;
    return true;
  } catch (cause) {
    if (controller.signal.aborted || generation !== loadGeneration) return false;
    const normalized = normalizeApiError(cause);
    if (normalized.status === 403) {
      error.value = 'Недостаточно прав для просмотра тарифов AI.';
      await refreshAuthorityAfterForbidden();
    } else {
      error.value = 'Не удалось загрузить тарифы AI.';
    }
    return false;
  } finally {
    if (generation === loadGeneration) loading.value = false;
  }
}

async function loadMore(): Promise<void> {
  const current = state.value;
  if (!current?.hasMore || !current.nextCursor || loadingMore.value) return;
  loadingMore.value = true;
  error.value = '';
  try {
    const next = await fetchTextToSpeechPricing({
      cursor: current.nextCursor,
      limit: 50,
    });
    if (state.value !== current) return;
    const ids = new Set(current.history.map(({ id }) => id));
    state.value = {
      ...current,
      history: [...current.history, ...next.history.filter(({ id }) => !ids.has(id))],
      hasMore: next.hasMore,
      nextCursor: next.nextCursor,
    };
  } catch (cause) {
    const normalized = normalizeApiError(cause);
    if (normalized.status === 403) {
      error.value = 'Недостаточно прав для просмотра тарифов AI.';
      await refreshAuthorityAfterForbidden();
    } else {
      error.value = 'Не удалось загрузить продолжение истории тарифов.';
    }
  } finally {
    loadingMore.value = false;
  }
}

function preparePublication(): void {
  if (publicationOutcomeUnknown.value) return;
  const normalizedRate = rate.value.trim();
  const normalizedReason = reason.value.trim().normalize('NFC');
  if (!isValidTextToSpeechRate(normalizedRate)) {
    validationError.value =
      'Укажите положительную ставку не более 1 000 000, до 12 знаков после запятой.';
    return;
  }
  if (normalizedReason.length < 3 || normalizedReason.length > 500) {
    validationError.value = 'Укажите причину изменения от 3 до 500 символов.';
    return;
  }
  validationError.value = '';
  pendingPublication.value = {
    ratePerMillionCharacters: normalizedRate,
    changeReason: normalizedReason,
  };
  confirmationOpen.value = true;
}

function cancelConfirmation(): void {
  if (publishing.value) return;
  confirmationOpen.value = false;
  pendingPublication.value = null;
}

async function confirmPublication(): Promise<void> {
  const input = pendingPublication.value;
  if (!input || publishing.value) return;
  confirmationOpen.value = false;
  pendingPublication.value = null;
  const authorityKey = currentAuthorityKey();
  const generation = ++mutationGeneration;
  publishing.value = true;
  error.value = '';
  freshAuthRequired.value = false;
  notice.value = '';
  try {
    await publishTextToSpeechPricing(input);
    if (generation !== mutationGeneration || authorityKey !== currentAuthorityKey()) return;
    rate.value = '';
    reason.value = '';
    const rereadGeneration = loadGeneration + 1;
    const refreshed = await load();
    if (generation !== mutationGeneration || authorityKey !== currentAuthorityKey()) return;
    if (refreshed || latestSuccessfulLoadGeneration > rereadGeneration) {
      notice.value = 'Новая ставка опубликована. Исторические операции не пересчитаны.';
    } else {
      publicationOutcomeUnknown.value = true;
      error.value =
        'Ставка опубликована, но состояние не удалось перечитать. Обновите историю перед новой публикацией.';
    }
  } catch (cause) {
    if (generation !== mutationGeneration || authorityKey !== currentAuthorityKey()) return;
    const normalized = normalizeApiError(cause);
    if (
      normalized.status === 428 ||
      ['MFA_REQUIRED', 'MFA_ENROLLMENT_REQUIRED', 'REAUTHENTICATION_REQUIRED'].includes(
        normalized.code ?? '',
      )
    ) {
      freshAuthRequired.value = true;
      error.value = 'Требуется свежий вход с MFA. Публикация не повторялась автоматически.';
    } else if (normalized.status === 403) {
      error.value = 'Недостаточно прав для публикации ставки. Действие не повторялось.';
      await refreshAuthorityAfterForbidden();
    } else if (normalized.status === 0 || normalized.status >= 500) {
      publicationOutcomeUnknown.value = true;
      error.value = 'Результат публикации неизвестен. Обновите историю перед новой попыткой.';
    } else {
      error.value = 'Не удалось опубликовать ставку. Действие не повторялось.';
    }
  } finally {
    if (generation === mutationGeneration) publishing.value = false;
  }
}

function currentAuthorityKey(): string {
  return [auth.isAuthenticated, auth.user?.id ?? '', canRead.value, canWrite.value].join(':');
}

async function requireFreshLogin(): Promise<void> {
  try {
    await auth.logout();
  } catch {
    // Local authority is cleared by logout even when the network is unavailable.
  }
  clearSensitiveState();
  await router.replace({
    name: 'login',
    query: { redirect: '/platform/ai-pricing' },
  });
}

watch(
  () => ({
    authenticated: auth.isAuthenticated,
    userId: auth.user?.id ?? '',
    read: canRead.value,
  }),
  async ({ authenticated, read }) => {
    clearSensitiveState();
    if (!authenticated) return;
    if (!read) {
      await router.replace(auth.authenticatedLandingPath);
      return;
    }
    await load();
  },
  { immediate: true },
);

watch(canWrite, (allowed) => {
  if (allowed) return;
  rate.value = '';
  reason.value = '';
  validationError.value = '';
  confirmationOpen.value = false;
  pendingPublication.value = null;
});

onBeforeUnmount(() => {
  activeRequest?.abort();
  loadGeneration += 1;
  mutationGeneration += 1;
});
</script>

<template>
  <section class="page pricing-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Control plane · Platform scope</div>
        <h1>Тарифы AI</h1>
        <p class="subtitle">
          Ручная публикация проверенных тарифов, которые применяются только к новым операциям.
        </p>
      </div>
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :loading="loading"
        @click="load"
      />
    </header>

    <Message v-if="notice" severity="success" closable @close="notice = ''">
      {{ notice }}
    </Message>
    <Message v-if="error" severity="error" :closable="false">
      <div class="message-action">
        <span>{{ error }}</span>
        <Button
          v-if="freshAuthRequired"
          data-testid="pricing-fresh-login"
          label="Войти заново"
          size="small"
          @click="requireFreshLogin"
        />
      </div>
    </Message>

    <div v-if="loading && !state" class="loading-card card" role="status">
      <i class="pi pi-spin pi-spinner" />
      Загружаем тарифы AI…
    </div>

    <section v-if="state" class="pricing-card card">
      <header class="pricing-header">
        <span class="pricing-mark"><i class="pi pi-volume-up" /></span>
        <div>
          <span class="eyebrow">Text to Speech</span>
          <h2>xAI — озвучивание текста</h2>
          <p>Ставка за входные символы, зафиксированная в backend ledger.</p>
        </div>
      </header>

      <Message v-if="!state.current" severity="warn" :closable="false" class="empty-warning">
        Озвучивание текста заблокировано до первичной настройки ставки.
      </Message>

      <div v-else class="current-rate" aria-label="Текущая ставка">
        <div>
          <span>Текущая ставка</span>
          <strong>{{ formatMoney(state.current.rate, state.current.currency) }}</strong>
          <small>за 1 000 000 входных символов</small>
        </div>
        <dl>
          <div>
            <dt>Валюта</dt>
            <dd>{{ state.current.currency.toUpperCase() }}</dd>
          </div>
          <div>
            <dt>Единица</dt>
            <dd>1 000 000 входных символов</dd>
          </div>
          <div>
            <dt>Действует с</dt>
            <dd>{{ formatDate(state.current.effectiveFrom) }}</dd>
          </div>
        </dl>
      </div>

      <a class="source-link" :href="state.sourceUrl" target="_blank" rel="noopener noreferrer">
        <i class="pi pi-external-link" />
        Проверить официальный тариф xAI
      </a>

      <form
        v-if="canWrite"
        class="publish-form"
        aria-labelledby="publish-rate-title"
        @submit.prevent="preparePublication"
      >
        <div>
          <span class="eyebrow">Новая revision</span>
          <h3 id="publish-rate-title">Опубликовать новую ставку</h3>
          <p>
            Дату начала действия назначает сервер. Изменить, удалить или задним числом применить
            revision нельзя.
          </p>
        </div>
        <label>
          <span>USD за 1 000 000 входных символов</span>
          <input
            v-model="rate"
            data-testid="pricing-rate"
            type="text"
            inputmode="decimal"
            autocomplete="off"
            placeholder="Введите ставку"
            :disabled="publishing"
          />
        </label>
        <label>
          <span>Причина изменения</span>
          <textarea
            v-model="reason"
            data-testid="pricing-reason"
            rows="3"
            maxlength="500"
            :disabled="publishing"
          />
        </label>
        <Message v-if="validationError" severity="error" :closable="false">
          {{ validationError }}
        </Message>
        <Button
          data-testid="prepare-pricing"
          type="submit"
          label="Проверить и продолжить"
          :loading="publishing"
          :disabled="publicationOutcomeUnknown"
        />
      </form>

      <section class="history" aria-labelledby="pricing-history-title">
        <header>
          <div>
            <span class="eyebrow">Append-only ledger</span>
            <h3 id="pricing-history-title">История ставок</h3>
          </div>
          <span>{{ state.history.length }} записей загружено</span>
        </header>
        <div v-if="state.history.length" class="history-list">
          <article v-for="revision in state.history" :key="revision.id">
            <div class="history-rate">
              <strong>{{ formatMoney(revision.rate, revision.currency) }}</strong>
              <small>за 1 000 000 символов</small>
            </div>
            <div>
              <strong>{{ revision.changeReason }}</strong>
              <span>{{ actorLabel(revision) }}</span>
            </div>
            <time :datetime="revision.effectiveFrom">
              {{ formatDate(revision.effectiveFrom) }}
            </time>
          </article>
        </div>
        <p v-else class="history-empty">История ставок пока пуста.</p>
        <Button
          v-if="state.hasMore"
          label="Загрузить ещё"
          severity="secondary"
          text
          :loading="loadingMore"
          @click="loadMore"
        />
      </section>
    </section>

    <Dialog
      v-model:visible="confirmationOpen"
      modal
      header="Подтвердите новую ставку"
      :closable="!publishing"
      :dismissable-mask="false"
      class="pricing-confirmation"
      @hide="cancelConfirmation"
    >
      <section v-if="pendingPublication" class="confirmation">
        <span class="confirmation-icon"><i class="pi pi-shield" /></span>
        <p>Новая ставка применяется только к следующим операциям. История не пересчитывается.</p>
        <strong>{{ formatMoney(pendingPublication.ratePerMillionCharacters, 'usd') }}</strong>
        <div class="confirmation-actions">
          <Button
            label="Отмена"
            severity="secondary"
            text
            :disabled="publishing"
            @click="cancelConfirmation"
          />
          <Button
            data-testid="confirm-pricing"
            label="Опубликовать"
            :loading="publishing"
            @click="confirmPublication"
          />
        </div>
      </section>
    </Dialog>
  </section>
</template>

<style scoped>
.pricing-page {
  display: grid;
  gap: 20px;
}

.message-action,
.pricing-header,
.history > header,
.confirmation-actions {
  display: flex;
  align-items: center;
}

.message-action,
.history > header {
  justify-content: space-between;
  gap: 16px;
}

.pricing-card {
  padding: 24px;
}

.loading-card {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 9px;
  min-height: 160px;
  color: var(--text-small-muted);
}

.pricing-header {
  gap: 14px;
  padding-bottom: 18px;
  border-bottom: 1px solid var(--border-subtle);
}

.pricing-header h2,
.publish-form h3,
.history h3 {
  margin: 0;
}

.pricing-header p,
.publish-form p {
  margin: 4px 0 0;
  color: var(--text-small-muted);
  font-size: 0.72rem;
}

.pricing-mark,
.confirmation-icon {
  display: grid;
  place-items: center;
  flex: 0 0 auto;
  background: var(--status-accent-soft);
  color: var(--status-accent);
}

.pricing-mark {
  width: 46px;
  height: 46px;
  border-radius: 14px;
}

.empty-warning {
  margin-top: 18px;
}

.current-rate {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(0, 1.2fr);
  gap: 18px;
  padding: 20px;
  margin-top: 18px;
  border-radius: 17px;
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
}

.current-rate > div > span,
.current-rate > div > small {
  display: block;
  color: var(--text-on-emphasis-muted);
  font-size: 0.67rem;
}

.current-rate > div > strong {
  display: block;
  margin: 8px 0 4px;
  font: 700 clamp(1.5rem, 3vw, 2rem) var(--font-display);
}

.current-rate dl {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
  margin: 0;
}

.current-rate dl div {
  padding: 12px;
  border: 1px solid color-mix(in srgb, currentColor 18%, transparent);
  border-radius: 12px;
}

.current-rate dt {
  color: var(--text-on-emphasis-muted);
  font-size: 0.62rem;
}

.current-rate dd {
  margin: 5px 0 0;
  font-size: 0.75rem;
  font-weight: 700;
  overflow-wrap: anywhere;
}

.source-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-top: 13px;
  color: var(--text-link);
  font-size: 0.7rem;
  font-weight: 700;
  text-decoration: none;
}

.source-link:hover {
  text-decoration: underline;
}

.publish-form {
  display: grid;
  grid-template-columns: minmax(220px, 0.8fr) minmax(240px, 1fr);
  gap: 14px;
  padding: 20px;
  margin-top: 24px;
  border: 1px solid var(--border-default);
  border-radius: 17px;
  background: var(--surface-subtle);
}

.publish-form > div:first-child {
  grid-row: span 2;
}

.publish-form label {
  display: grid;
  gap: 6px;
}

.publish-form label span {
  color: var(--text-small-muted);
  font-size: 0.68rem;
  font-weight: 700;
}

.publish-form input,
.publish-form textarea {
  width: 100%;
  padding: 10px 12px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
}

.publish-form textarea {
  resize: vertical;
}

.publish-form > button {
  justify-self: end;
}

.history {
  margin-top: 26px;
}

.history > header > span {
  color: var(--text-small-muted);
  font-size: 0.66rem;
}

.history-list {
  display: grid;
  gap: 9px;
  margin-top: 12px;
}

.history-list article {
  display: grid;
  grid-template-columns: minmax(130px, 0.4fr) minmax(220px, 1fr) auto;
  align-items: center;
  gap: 16px;
  padding: 14px;
  border: 1px solid var(--border-default);
  border-radius: 13px;
  background: var(--surface-subtle);
}

.history-list strong,
.history-list span,
.history-list small {
  display: block;
}

.history-list span,
.history-list small,
.history-list time,
.history-empty {
  color: var(--text-small-muted);
  font-size: 0.65rem;
}

.history-list time {
  white-space: nowrap;
}

.history-empty {
  padding: 22px;
  border: 1px dashed var(--border-default);
  border-radius: 13px;
  text-align: center;
}

.confirmation {
  max-width: 460px;
}

.confirmation-icon {
  width: 42px;
  height: 42px;
  margin-bottom: 14px;
  border-radius: 13px;
}

.confirmation p {
  color: var(--text-small-muted);
  line-height: 1.55;
}

.confirmation > strong {
  display: block;
  margin: 18px 0;
  font: 700 1.4rem var(--font-display);
}

.confirmation-actions {
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 760px) {
  .current-rate,
  .publish-form {
    grid-template-columns: 1fr;
  }

  .current-rate dl {
    grid-template-columns: 1fr;
  }

  .publish-form > div:first-child {
    grid-row: auto;
  }

  .history-list article {
    grid-template-columns: 1fr;
  }

  .history-list time {
    white-space: normal;
  }
}
</style>
