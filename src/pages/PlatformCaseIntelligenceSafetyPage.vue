<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import {
  lookupPlatformCaseIntelligenceSafetyCommand,
  publishPlatformCaseIntelligenceSafety,
  readPlatformCaseIntelligenceSafety,
  readPlatformSafetyModelCatalog,
  type PlatformSafetyModelCatalog,
  type PlatformSafetyState,
  type PublishPlatformSafety,
} from "@/features/platform-case-intelligence-safety/api/platform-case-intelligence-safety";
import {
  createPlatformSafetyDraft,
  normalizePlatformSafetyReasoning,
  platformSafetyClassActions,
  platformSafetyClassLabels,
  validatePlatformSafetyDraft,
} from "@/features/platform-case-intelligence-safety/model/platform-case-intelligence-safety";
import { normalizeApiError } from "@/shared/api/http/api-error";

const auth = useAuthStore();
const router = useRouter();
const state = ref<PlatformSafetyState | null>(null);
const catalog = ref<PlatformSafetyModelCatalog | null>(null);
const draft = ref(createPlatformSafetyDraft(null, []));
const loading = ref(false);
const publishing = ref(false);
const reconciling = ref(false);
const error = ref("");
const notice = ref("");
const freshAuthRequired = ref(false);
const validationVisible = ref(false);
const confirmationOpen = ref(false);
const pendingPublication = ref<PublishPlatformSafety | null>(null);
const pendingCommandKey = ref("");
const publicationOutcomeUnknown = ref(false);
let requestGeneration = 0;
let activeRequest: AbortController | undefined;

const canManage = computed(() =>
  (auth.user?.platformPermissionCodes ?? []).includes(
    "platform.case_intelligence.safety.manage",
  ),
);
const models = computed(() => catalog.value?.items ?? []);
const selectedModel = computed(() =>
  models.value.find((item) => item.id === draft.value.modelId),
);
const issues = computed(() =>
  validatePlatformSafetyDraft(
    draft.value,
    models.value,
    catalog.value?.stale ?? false,
  ),
);
const issueMap = computed(() =>
  issues.value.reduce<Record<string, string>>((result, issue) => {
    result[issue.path] ??= issue.message;
    return result;
  }, {}),
);
const publicationBlocked = computed(
  () =>
    publicationOutcomeUnknown.value ||
    issues.value.some((issue) => issue.path !== "reason"),
);
const formStatus = computed(() => {
  if (validationVisible.value && issues.value.length)
    return `${issues.value.length} ошибок`;
  return draft.value.reason.trim()
    ? "Готово к публикации"
    : "Добавьте причину публикации";
});
const modelOptions = computed(() =>
  models.value.map((model) => ({
    label: `${model.displayName}${model.reteniveTested ? " · рекомендуемая" : ""}`,
    value: model.id,
    disabled: !model.selectable || model.providerAvailable === false,
  })),
);
const reasoningOptions = computed(() =>
  (selectedModel.value?.reasoningEfforts ?? []).map((value) => ({
    value,
    label: value === "medium" ? "Стандартная" : "Максимальная",
    description:
      value === "medium"
        ? "Баланс качества, задержки и стоимости"
        : "Больше рассуждений для самых сложных сообщений",
  })),
);

const riskRows = Object.entries(platformSafetyClassLabels).map(
  ([code, label]) => ({
    code: code as keyof typeof platformSafetyClassLabels,
    label,
    action: platformSafetyClassActions[
      code as keyof typeof platformSafetyClassActions
    ],
  }),
);

function formatDate(value: string): string {
  if (!value) return "дата не указана";
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function reasoningLabel(value: PlatformSafetyState["profile"]["reasoningEffort"]): string {
  if (value === "high") return "максимальная";
  if (value === "medium") return "стандартная";
  if (value === "low") return "низкая (legacy)";
  return "без reasoning (legacy)";
}

function resetDraft(): void {
  draft.value = createPlatformSafetyDraft(state.value, models.value);
  validationVisible.value = false;
}

function clearAuthorityState(): void {
  activeRequest?.abort();
  activeRequest = undefined;
  requestGeneration += 1;
  state.value = null;
  catalog.value = null;
  confirmationOpen.value = false;
  pendingPublication.value = null;
  pendingCommandKey.value = "";
  publicationOutcomeUnknown.value = false;
  freshAuthRequired.value = false;
  error.value = "";
  notice.value = "";
  loading.value = false;
  publishing.value = false;
  reconciling.value = false;
}

async function refreshAuthorityAfterForbidden(): Promise<void> {
  try {
    await auth.refreshContext();
  } catch {
    await router.replace({ name: "login" });
    return;
  }
  if (!canManage.value) await router.replace(auth.authenticatedLandingPath);
}

async function load(preserveDraft = false): Promise<void> {
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const generation = ++requestGeneration;
  loading.value = true;
  error.value = "";
  try {
    const [nextState, nextCatalog] = await Promise.all([
      readPlatformCaseIntelligenceSafety(controller.signal),
      readPlatformSafetyModelCatalog(controller.signal),
    ]);
    if (generation !== requestGeneration) return;
    state.value = nextState;
    catalog.value = nextCatalog;
    if (!preserveDraft) resetDraft();
  } catch (cause) {
    if (controller.signal.aborted || generation !== requestGeneration) return;
    const normalized = normalizeApiError(cause);
    if (normalized.status === 403) {
      error.value = "Платформенное право управления защитой отозвано.";
      await refreshAuthorityAfterForbidden();
    } else if (normalized.status === 404) {
      error.value =
        "Сервер ещё не предоставляет каталог моделей безопасности. Нужен backend-контракт Global Safety v2.";
    } else {
      error.value = "Не удалось загрузить обязательную защиту и каталог xAI.";
    }
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}

function onModelChange(): void {
  normalizePlatformSafetyReasoning(draft.value, selectedModel.value);
}

function preparePublication(): void {
  error.value = "";
  notice.value = "";
  freshAuthRequired.value = false;
  validationVisible.value = true;
  if (issues.value.length) return;
  pendingPublication.value = {
    expectedVersion: state.value?.version ?? 0,
    idempotencyKey: crypto.randomUUID(),
    modelId: draft.value.modelId,
    reasoningEffort: draft.value.reasoningEffort,
    reason: draft.value.reason.trim(),
  };
  confirmationOpen.value = true;
}

async function publish(): Promise<void> {
  const payload = pendingPublication.value;
  if (!payload || publishing.value) return;
  publishing.value = true;
  error.value = "";
  notice.value = "";
  try {
    const next = await publishPlatformCaseIntelligenceSafety(payload);
    state.value = next;
    confirmationOpen.value = false;
    pendingPublication.value = null;
    pendingCommandKey.value = "";
    publicationOutcomeUnknown.value = false;
    resetDraft();
    notice.value = `Обязательная защита опубликована как версия ${next.version}.`;
  } catch (cause) {
    const normalized = normalizeApiError(cause);
    if (
      normalized.status === 428 ||
      [
        "MFA_REQUIRED",
        "MFA_ENROLLMENT_REQUIRED",
        "REAUTHENTICATION_REQUIRED",
      ].includes(normalized.code ?? "")
    ) {
      freshAuthRequired.value = true;
      error.value =
        "Требуется свежий вход с MFA. Публикация не повторялась автоматически.";
    } else if (normalized.status === 409) {
      error.value =
        "Состояние защиты изменилось. Загружена актуальная версия; выбранные значения сохранены.";
      confirmationOpen.value = false;
      pendingPublication.value = null;
      await load(true);
    } else if (normalized.status === 403) {
      error.value = "Платформенное право управления защитой отозвано.";
      confirmationOpen.value = false;
      pendingPublication.value = null;
      await refreshAuthorityAfterForbidden();
    } else if (normalized.status === 0 || normalized.status >= 500) {
      pendingCommandKey.value = payload.idempotencyKey;
      publicationOutcomeUnknown.value = true;
      confirmationOpen.value = false;
      error.value =
        "Результат публикации неизвестен. Проверьте эту же команду перед новой попыткой.";
    } else if (normalized.code === "AI_MODEL_CATALOG_STALE") {
      error.value =
        "Доступность моделей xAI сейчас нельзя подтвердить. Обновите каталог и повторите.";
    } else if (normalized.code === "AI_MODEL_UNAVAILABLE") {
      error.value = "Выбранная модель недоступна для текущего ключа xAI.";
    } else {
      error.value = "Сервер отклонил публикацию обязательной защиты.";
    }
  } finally {
    publishing.value = false;
  }
}

async function reconcileUnknownPublication(): Promise<void> {
  if (!pendingCommandKey.value || reconciling.value) return;
  reconciling.value = true;
  error.value = "";
  try {
    const next = await lookupPlatformCaseIntelligenceSafetyCommand(
      pendingCommandKey.value,
    );
    state.value = next;
    pendingCommandKey.value = "";
    pendingPublication.value = null;
    publicationOutcomeUnknown.value = false;
    resetDraft();
    notice.value = `Команда завершена. Активна версия ${next.version}.`;
  } catch (cause) {
    const normalized = normalizeApiError(cause);
    error.value =
      normalized.status === 404
        ? "Сервер ещё не зафиксировал результат команды. Повторите проверку позже."
        : "Не удалось проверить результат команды.";
  } finally {
    reconciling.value = false;
  }
}

async function requireFreshLogin(): Promise<void> {
  try {
    await auth.logout();
  } catch {
    // Local authority is cleared by logout even when the network is unavailable.
  }
  clearAuthorityState();
  await router.replace({
    name: "login",
    query: { redirect: "/platform/case-intelligence/safety" },
  });
}

watch(
  () => ({
    authenticated: auth.isAuthenticated,
    userId: auth.user?.id ?? "",
    allowed: canManage.value,
  }),
  async ({ authenticated, allowed }) => {
    clearAuthorityState();
    if (!authenticated) return;
    if (!allowed) {
      await router.replace(auth.authenticatedLandingPath);
      return;
    }
    await load();
  },
  { immediate: true },
);

onBeforeUnmount(clearAuthorityState);
</script>

<template>
  <section class="page platform-safety-page">
    <header class="page-header">
      <div>
        <div class="eyebrow">Платформа · Обязательная защита</div>
        <h1>Безопасность сообщений</h1>
        <p class="subtitle">
          Одна проверка для всех проектов. Проекты настраивают реакцию на риск,
          но не могут отключить саму защиту.
        </p>
      </div>
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :loading="loading"
        @click="load(false)"
      />
    </header>

    <Message v-if="notice" severity="success" closable @close="notice = ''">
      {{ notice }}
    </Message>
    <Message v-if="error" severity="error" :closable="false">
      <div class="message-action">
        <span>{{ error }}</span>
        <Button
          v-if="publicationOutcomeUnknown"
          label="Проверить результат"
          size="small"
          :loading="reconciling"
          @click="reconcileUnknownPublication"
        />
        <Button
          v-else-if="freshAuthRequired"
          label="Войти заново"
          size="small"
          @click="requireFreshLogin"
        />
        <Button
          v-else
          label="Повторить"
          size="small"
          severity="secondary"
          @click="load(false)"
        />
      </div>
    </Message>

    <section v-if="loading && !catalog" class="loading-card card">
      <i class="pi pi-spin pi-spinner" />
      Загружаем защиту и доступные модели xAI…
    </section>

    <section v-else class="safety-workbench">
      <article class="safety-status card" :data-active="Boolean(state)">
        <span class="safety-status__mark"><i class="pi pi-shield" /></span>
        <div>
          <span class="eyebrow">Текущее состояние</span>
          <h2>
            {{ state ? `Защита активна · версия ${state.version}` : "Нужна первичная активация" }}
          </h2>
          <p v-if="state">
            {{ state.profile.displayName }} ·
            {{ reasoningLabel(state.profile.reasoningEffort) }}
            глубина · опубликовано {{ formatDate(state.publishedAt) }}
          </p>
          <p v-else>
            До активации Case Intelligence работает fail-closed: публикация проектных
            конфигураций заблокирована.
          </p>
        </div>
        <Tag
          :value="state ? (state.reconciliationState === 'IDLE' ? 'Работает' : 'Применяется') : 'Не настроена'"
          :severity="state ? (state.reconciliationState === 'IDLE' ? 'success' : 'warn') : 'danger'"
        />
      </article>

      <article class="coverage-rail card" aria-labelledby="coverage-title">
        <header>
          <div>
            <span class="eyebrow">Автоматический охват</span>
            <h2 id="coverage-title">Ничего добавлять вручную не нужно</h2>
          </div>
          <span class="coverage-rail__lock"><i class="pi pi-lock" /> Обязательно</span>
        </header>
        <div class="coverage-rail__flow">
          <div><i class="pi pi-building" /><span>Все проекты</span><small>текущие и новые</small></div>
          <i class="pi pi-arrow-right" />
          <div><i class="pi pi-language" /><span>Любой язык</span><small>включая неизвестный</small></div>
          <i class="pi pi-arrow-right" />
          <div><i class="pi pi-comments" /><span>Все каналы</span><small>текст, голос, Telegram</small></div>
          <i class="pi pi-arrow-right" />
          <div><i class="pi pi-shield" /><span>4 критических риска</span><small>единое ядро</small></div>
        </div>
      </article>

      <form v-if="catalog" class="safety-form card" @submit.prevent="preparePublication">
        <header class="section-heading">
          <div>
            <span class="eyebrow">Новая неизменяемая версия</span>
            <h2>{{ state ? "Изменить модель проверки" : "Активировать защиту" }}</h2>
            <p>Сервер сам закрепит версию, правила, лимиты и формат результата.</p>
          </div>
          <Tag value="Без внутренних ID" severity="secondary" />
        </header>

        <Message v-if="catalog.stale" severity="warn" :closable="false" class="catalog-warning">
          Каталог xAI устарел. Новую версию нельзя публиковать, пока сервер не подтвердит
          доступность моделей.
        </Message>

        <section class="configuration-grid">
          <div class="configuration-copy">
            <span class="step-number">01</span>
            <div>
              <h3>Модель безопасности</h3>
              <p>
                Выберите модель из каталога, который доступен текущему ключу xAI.
                Grok 4.5 — рекомендуемый вариант.
              </p>
            </div>
          </div>
          <div class="field-stack">
            <label>
              <span>Модель</span>
              <Select
                v-model="draft.modelId"
                data-testid="safety-model"
                :options="modelOptions"
                option-label="label"
                option-value="value"
                option-disabled="disabled"
                placeholder="Выберите модель"
                fluid
                @change="onModelChange"
              />
              <small v-if="validationVisible && issueMap.modelId" class="field-error">{{ issueMap.modelId }}</small>
              <small v-else-if="selectedModel">
                Вход ${{ selectedModel.inputPricePerMillion }} · выход ${{ selectedModel.outputPricePerMillion }} за 1 млн токенов
              </small>
            </label>
            <label>
              <span>Глубина проверки</span>
              <Select
                v-model="draft.reasoningEffort"
                data-testid="safety-reasoning"
                :options="reasoningOptions"
                option-label="label"
                option-value="value"
                placeholder="Выберите глубину"
                fluid
              />
              <small v-if="validationVisible && issueMap.reasoningEffort" class="field-error">{{ issueMap.reasoningEffort }}</small>
              <small v-else>
                {{ reasoningOptions.find((item) => item.value === draft.reasoningEffort)?.description }}
              </small>
            </label>
          </div>
        </section>

        <section class="risk-ledger" aria-labelledby="risk-title">
          <header>
            <div>
              <span class="eyebrow">Неизменяемое ядро</span>
              <h3 id="risk-title">Что проверяет платформа</h3>
            </div>
            <span>Проектное переопределение запрещено</span>
          </header>
          <div class="risk-list">
            <article v-for="risk in riskRows" :key="risk.code">
              <span class="risk-icon"><i class="pi pi-shield" /></span>
              <div><strong>{{ risk.label }}</strong><small>{{ risk.action }}</small></div>
              <Tag :value="risk.code === 'RESPONSIBLE_GAMING_CRISIS' ? 'Высокий' : 'Срочный'" :severity="risk.code === 'RESPONSIBLE_GAMING_CRISIS' ? 'warn' : 'danger'" />
            </article>
          </div>
        </section>

        <label class="reason-field">
          <span>Причина публикации</span>
          <textarea
            v-model="draft.reason"
            data-testid="safety-reason"
            rows="3"
            maxlength="2000"
            placeholder="Например: первичная активация обязательной защиты"
            :aria-invalid="validationVisible && Boolean(issueMap.reason)"
          />
          <small>Причина попадёт в аудит и не будет показана пользователям.</small>
          <small v-if="validationVisible && issueMap.reason" class="field-error">{{ issueMap.reason }}</small>
        </label>

        <footer class="form-footer">
          <div>
            <strong>{{ formStatus }}</strong>
            <span>Потребуется свежий вход с MFA.</span>
          </div>
          <Button
            data-testid="prepare-safety-publication"
            type="submit"
            :label="state ? 'Проверить изменение' : 'Проверить и активировать'"
            icon="pi pi-shield"
            :disabled="publicationBlocked"
          />
        </footer>
      </form>
    </section>

    <Dialog
      v-model:visible="confirmationOpen"
      modal
      header="Опубликовать обязательную защиту?"
      :closable="!publishing"
      :dismissable-mask="false"
      class="safety-confirmation"
    >
      <div v-if="pendingPublication" class="confirmation-copy">
        <i class="pi pi-shield" />
        <div>
          <h3>{{ selectedModel?.displayName }}</h3>
          <p>
            {{ pendingPublication.reasoningEffort === "high" ? "Максимальная" : "Стандартная" }}
            глубина проверки станет обязательной для всех проектов, языков и каналов.
          </p>
        </div>
        <dl>
          <div><dt>Проекты</dt><dd>Все</dd></div>
          <div><dt>Языки</dt><dd>Все</dd></div>
          <div><dt>Каналы</dt><dd>Все</dd></div>
        </dl>
      </div>
      <template #footer>
        <Button label="Отмена" severity="secondary" text :disabled="publishing" @click="confirmationOpen = false" />
        <Button data-testid="publish-safety" label="Опубликовать для всех проектов" icon="pi pi-shield" :loading="publishing" @click="publish" />
      </template>
    </Dialog>
  </section>
</template>

<style scoped>
.platform-safety-page { display: grid; gap: 16px; }
.subtitle { max-width: 760px; }
.message-action { display: flex; align-items: center; justify-content: space-between; gap: 12px; }
.loading-card { min-height: 160px; display: grid; place-content: center; gap: 10px; color: var(--muted); }
.safety-workbench { display: grid; gap: 16px; }
.safety-status { display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 16px; padding: 18px; }
.safety-status__mark { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 14px; color: var(--danger-color); background: color-mix(in srgb, var(--danger-color) 10%, var(--surface)); font-size: 1.2rem; }
.safety-status[data-active="true"] .safety-status__mark { color: var(--status-success-text); background: var(--status-success-soft); }
.safety-status h2, .coverage-rail h2, .section-heading h2, .configuration-copy h3, .risk-ledger h3 { margin: 3px 0 0; letter-spacing: -.02em; }
.safety-status p, .section-heading p, .configuration-copy p { margin: 5px 0 0; color: var(--muted); line-height: 1.45; }
.coverage-rail { overflow: hidden; padding: 0; }
.coverage-rail > header { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; padding: 18px 20px; border-bottom: 1px solid var(--line); }
.coverage-rail__lock { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: .76rem; font-weight: 750; }
.coverage-rail__flow { display: grid; grid-template-columns: 1fr auto 1fr auto 1fr auto 1fr; align-items: center; gap: 12px; padding: 16px 20px; background: var(--surface-soft); }
.coverage-rail__flow > div { display: grid; grid-template-columns: auto 1fr; gap: 2px 9px; align-items: center; min-width: 0; }
.coverage-rail__flow > div i { grid-row: 1 / 3; width: 34px; height: 34px; display: grid; place-items: center; border: 1px solid var(--line); border-radius: 10px; color: var(--brand); background: var(--surface); }
.coverage-rail__flow span { font-size: .82rem; font-weight: 780; }
.coverage-rail__flow small { color: var(--muted); }
.coverage-rail__flow > i { color: var(--muted); font-size: .75rem; }
.safety-form { display: grid; gap: 0; overflow: hidden; padding: 0; }
.section-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 20px; border-bottom: 1px solid var(--line); }
.catalog-warning { margin: 16px 20px 0; }
.configuration-grid { display: grid; grid-template-columns: minmax(220px, .7fr) minmax(0, 1.3fr); gap: 28px; padding: 20px; border-bottom: 1px solid var(--line); }
.configuration-copy { display: grid; grid-template-columns: 30px 1fr; gap: 10px; align-content: start; }
.step-number { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; background: var(--brand-soft); color: var(--brand); font-size: .7rem; font-weight: 800; }
.field-stack { display: grid; gap: 16px; }
label { display: grid; gap: 6px; min-width: 0; }
label > span { color: var(--text); font-size: .8rem; font-weight: 750; }
textarea { width: 100%; min-height: 44px; box-sizing: border-box; resize: vertical; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-soft); color: var(--text); padding: 10px 12px; font: inherit; }
textarea:focus { outline: 2px solid color-mix(in srgb, var(--brand) 28%, transparent); border-color: var(--brand); }
textarea[aria-invalid="true"] { border-color: var(--danger-color); }
small { color: var(--muted); line-height: 1.35; }
.field-error { color: var(--danger-color); font-weight: 650; }
.risk-ledger { padding: 20px; border-bottom: 1px solid var(--line); }
.risk-ledger > header { display: flex; justify-content: space-between; align-items: end; gap: 16px; margin-bottom: 12px; }
.risk-ledger > header > span { color: var(--muted); font-size: .72rem; font-weight: 700; }
.risk-list { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.risk-list article { min-height: 54px; display: grid; grid-template-columns: auto minmax(0, 1fr) auto; align-items: center; gap: 11px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.risk-list article:last-child { border-bottom: 0; }
.risk-icon { width: 30px; height: 30px; display: grid; place-items: center; border-radius: 9px; background: var(--surface-soft); color: var(--muted); }
.risk-list article > div { display: grid; gap: 2px; }
.reason-field { padding: 20px; border-bottom: 1px solid var(--line); }
.form-footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 20px; background: var(--surface-soft); }
.form-footer > div { display: grid; gap: 2px; }
.form-footer span { color: var(--muted); font-size: .74rem; }
.confirmation-copy { display: grid; justify-items: center; gap: 14px; max-width: 520px; text-align: center; }
.confirmation-copy > i { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 16px; background: var(--brand-soft); color: var(--brand); font-size: 1.3rem; }
.confirmation-copy h3, .confirmation-copy p { margin: 0; }
.confirmation-copy p { margin-top: 5px; color: var(--muted); line-height: 1.5; }
.confirmation-copy dl { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); margin: 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.confirmation-copy dl > div { display: grid; gap: 3px; padding: 10px; border-right: 1px solid var(--line); }
.confirmation-copy dl > div:last-child { border-right: 0; }
.confirmation-copy dt { color: var(--muted); font-size: .7rem; }
.confirmation-copy dd { margin: 0; font-weight: 800; }
@media (max-width: 900px) {
  .coverage-rail__flow { grid-template-columns: 1fr 1fr; }
  .coverage-rail__flow > i { display: none; }
}
@media (max-width: 720px) {
  .configuration-grid { grid-template-columns: 1fr; gap: 16px; }
  .safety-status { grid-template-columns: auto 1fr; }
  .safety-status > :last-child { grid-column: 1 / -1; justify-self: start; }
}
@media (max-width: 560px) {
  .coverage-rail > header, .section-heading, .form-footer, .risk-ledger > header { align-items: stretch; flex-direction: column; }
  .coverage-rail__flow { grid-template-columns: 1fr; }
  .form-footer :deep(.p-button) { width: 100%; min-height: 44px; }
  .message-action { align-items: stretch; flex-direction: column; }
}
</style>
