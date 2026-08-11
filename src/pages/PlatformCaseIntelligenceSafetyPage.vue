<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRouter } from "vue-router";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Tag from "primevue/tag";
import { useAuthStore } from "@/features/auth/auth.store";
import {
  lookupPlatformCaseIntelligenceSafetyCommand,
  publishPlatformCaseIntelligenceSafety,
  readPlatformCaseIntelligenceSafety,
} from "@/features/platform-case-intelligence-safety/api/platform-case-intelligence-safety";
import {
  buildPlatformSafetyPolicy,
  createPlatformSafetyDraft,
  hasUniformPlatformSafetyGates,
  parsePlatformSafetyLocales,
  platformSafetyClassLabels,
  platformSafetyClasses,
  validatePlatformSafetyDraft,
  type PlatformSafetyDraftIssue,
} from "@/features/platform-case-intelligence-safety/model/platform-case-intelligence-safety";
import type {
  PlatformCaseIntelligenceSafetyStateResponseDto,
  PlatformCaseIntelligenceSafetyPolicyDtoChannelsItem,
  PublishPlatformCaseIntelligenceSafetyDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";

const auth = useAuthStore();
const router = useRouter();
const state = ref<PlatformCaseIntelligenceSafetyStateResponseDto | null>(null);
const draft = ref(createPlatformSafetyDraft());
const loading = ref(false);
const publishing = ref(false);
const reconciling = ref(false);
const error = ref("");
const notice = ref("");
const freshAuthRequired = ref(false);
const confirmationOpen = ref(false);
const pendingPublication = ref<PublishPlatformCaseIntelligenceSafetyDto | null>(
  null,
);
const pendingCommandKey = ref("");
const publicationOutcomeUnknown = ref(false);
let requestGeneration = 0;
let activeRequest: AbortController | undefined;

const canManage = computed(() =>
  (auth.user?.platformPermissionCodes ?? []).includes(
    "platform.case_intelligence.safety.manage",
  ),
);
const issues = computed(() => validatePlatformSafetyDraft(draft.value));
const issueMap = computed(() =>
  issues.value.reduce<Record<string, string>>((result, issue) => {
    result[issue.path] ??= issue.message;
    return result;
  }, {}),
);
const gateCount = computed(
  () =>
    parsePlatformSafetyLocales(draft.value.localesText).length *
    draft.value.channels.length *
    4,
);
const activePolicy = computed(() => state.value?.revision.definition ?? null);
const existingGatesAreUniform = computed(() =>
  hasUniformPlatformSafetyGates(activePolicy.value ?? undefined),
);

const channelOptions: Array<{
  value: PlatformCaseIntelligenceSafetyPolicyDtoChannelsItem;
  label: string;
}> = [
  { value: "TEXT", label: "Текст" },
  { value: "VOICE", label: "Голос" },
  { value: "TELEGRAM", label: "Telegram" },
];

function formatDate(value: string): string {
  return new Intl.DateTimeFormat("ru-RU", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(value));
}

function resetDraftFromState(): void {
  draft.value = createPlatformSafetyDraft(state.value?.revision.definition);
}

function clearAuthorityState(): void {
  activeRequest?.abort();
  activeRequest = undefined;
  requestGeneration += 1;
  state.value = null;
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
  if (!canManage.value)
    await router.replace(auth.authenticatedLandingPath);
}

async function load(preserveDraft = false): Promise<void> {
  activeRequest?.abort();
  const controller = new AbortController();
  activeRequest = controller;
  const generation = ++requestGeneration;
  loading.value = true;
  error.value = "";
  try {
    const next = await readPlatformCaseIntelligenceSafety(controller.signal);
    if (generation !== requestGeneration) return;
    state.value = next;
    if (!preserveDraft) resetDraftFromState();
  } catch (cause) {
    if (controller.signal.aborted || generation !== requestGeneration) return;
    const normalized = normalizeApiError(cause);
    if (normalized.status === 403) {
      error.value = "Платформенное право управления защитой отозвано.";
      await refreshAuthorityAfterForbidden();
    } else {
      error.value = "Не удалось загрузить состояние обязательной защиты.";
    }
  } finally {
    if (generation === requestGeneration) loading.value = false;
  }
}

function preparePublication(): void {
  error.value = "";
  notice.value = "";
  freshAuthRequired.value = false;
  if (issues.value.length || !existingGatesAreUniform.value) return;
  const idempotencyKey = crypto.randomUUID();
  pendingPublication.value = {
    expectedVersion: state.value?.version ?? 0,
    idempotencyKey,
    reason: draft.value.reason.trim(),
    definition: buildPlatformSafetyPolicy(draft.value, crypto.randomUUID()),
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
    draft.value = createPlatformSafetyDraft(next.revision.definition);
    notice.value = `Глобальная защита опубликована как версия ${next.version}.`;
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
        "Состояние защиты изменилось. Загружена актуальная версия; введённые значения сохранены.";
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
        "Результат публикации неизвестен. Проверьте ту же команду перед новой попыткой.";
    } else
      error.value =
        "Сервер отклонил публикацию. Проверьте идентификаторы артефактов и пороги допуска.";
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
    draft.value = createPlatformSafetyDraft(next.revision.definition);
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

function fieldIssue(path: PlatformSafetyDraftIssue["path"]): string {
  return issueMap.value[path] ?? "";
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
        <div class="eyebrow">Control plane · Platform scope</div>
        <h1>Обязательная защита Case Intelligence</h1>
        <p class="subtitle">
          Одна неизменяемая политика для всех проектов. Проектные владельцы не
          могут её отключить или ослабить.
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
      </div>
    </Message>

    <div v-if="loading && !state" class="loading-card card" role="status">
      <i class="pi pi-spin pi-spinner" />
      Загружаем глобальную safety-политику…
    </div>

    <section v-else class="safety-workbench">
      <article class="safety-status card" aria-labelledby="safety-status-title">
        <div class="safety-status__mark">
          <i :class="state ? 'pi pi-shield' : 'pi pi-exclamation-triangle'" />
        </div>
        <div>
          <span class="eyebrow">Глобальное состояние</span>
          <h2 id="safety-status-title">
            {{ state ? `Защита активна · версия ${state.version}` : "Защита ещё не настроена" }}
          </h2>
          <p v-if="state">
            Ревизия {{ state.revision.version }} опубликована
            {{ formatDate(state.revision.publishedAt) }} и автоматически
            применяется ко всем проектам.
          </p>
          <p v-else>
            Case Intelligence работает fail-closed: проверка и публикация
            проектных конфигураций заблокированы до первой глобальной ревизии.
          </p>
        </div>
        <Tag
          :value="state?.reconciliationState ?? 'NOT_CONFIGURED'"
          :severity="state ? 'success' : 'warn'"
        />
      </article>

      <Message
        v-if="!existingGatesAreUniform"
        severity="warn"
        :closable="false"
      >
        В активной ревизии пороги различаются между отдельными рисками, языками
        или каналами. Минимальная форма их не перезаписывает: публикация здесь
        заблокирована, пока серверная конфигурация не будет приведена к единым
        порогам.
      </Message>

      <form
        class="safety-form card"
        aria-labelledby="safety-form-title"
        @submit.prevent="preparePublication"
      >
        <header class="section-heading">
          <div>
            <span class="eyebrow">Новая неизменяемая ревизия</span>
            <h2 id="safety-form-title">
              {{ state ? "Опубликовать следующую версию" : "Активировать защиту" }}
            </h2>
            <p>
              Сервер проверит совместимость всех артефактов. Публикация не
              повторяется автоматически при неизвестном результате.
            </p>
          </div>
          <span class="gate-count">{{ gateCount }} admission gates</span>
        </header>

        <section class="form-section" aria-labelledby="artifacts-title">
          <div class="form-section__intro">
            <span>01</span>
            <div>
              <h3 id="artifacts-title">Проверенные артефакты</h3>
              <p>Ревизии должны уже существовать и быть допущены сервером.</p>
            </div>
          </div>
          <div class="field-grid">
            <label>
              <span>Ревизия классификатора</span>
              <input
                v-model="draft.classifierRevisionId"
                data-testid="safety-classifier"
                type="text"
                maxlength="128"
                :aria-invalid="Boolean(fieldIssue('classifierRevisionId'))"
              />
              <small v-if="fieldIssue('classifierRevisionId')" class="field-error">{{ fieldIssue("classifierRevisionId") }}</small>
            </label>
            <label>
              <span>Ревизия калибратора</span>
              <input
                v-model="draft.calibratorRevisionId"
                data-testid="safety-calibrator"
                type="text"
                maxlength="128"
                :aria-invalid="Boolean(fieldIssue('calibratorRevisionId'))"
              />
              <small v-if="fieldIssue('calibratorRevisionId')" class="field-error">{{ fieldIssue("calibratorRevisionId") }}</small>
            </label>
            <label>
              <span>Размеченный dataset</span>
              <input
                v-model="draft.labelledDatasetRevisionId"
                data-testid="safety-labelled-dataset"
                type="text"
                maxlength="128"
                :aria-invalid="Boolean(fieldIssue('labelledDatasetRevisionId'))"
              />
              <small v-if="fieldIssue('labelledDatasetRevisionId')" class="field-error">{{ fieldIssue("labelledDatasetRevisionId") }}</small>
            </label>
            <label>
              <span>Sentinel dataset</span>
              <input
                v-model="draft.sentinelDatasetRevisionId"
                data-testid="safety-sentinel-dataset"
                type="text"
                maxlength="128"
                :aria-invalid="Boolean(fieldIssue('sentinelDatasetRevisionId'))"
              />
              <small v-if="fieldIssue('sentinelDatasetRevisionId')" class="field-error">{{ fieldIssue("sentinelDatasetRevisionId") }}</small>
            </label>
          </div>
        </section>

        <section class="form-section" aria-labelledby="coverage-title">
          <div class="form-section__intro">
            <span>02</span>
            <div>
              <h3 id="coverage-title">Обязательный охват</h3>
              <p>Для каждой комбинации язык × канал × риск создаётся gate.</p>
            </div>
          </div>
          <div class="coverage-grid">
            <label>
              <span>Языки</span>
              <textarea
                v-model="draft.localesText"
                data-testid="safety-locales"
                rows="4"
                placeholder="ru&#10;en"
                :aria-invalid="Boolean(fieldIssue('localesText'))"
              />
              <small>Один код в строке или через запятую.</small>
              <small v-if="fieldIssue('localesText')" class="field-error">{{ fieldIssue("localesText") }}</small>
            </label>
            <fieldset>
              <legend>Каналы</legend>
              <label
                v-for="channel in channelOptions"
                :key="channel.value"
                class="check-option"
              >
                <Checkbox
                  v-model="draft.channels"
                  :input-id="`safety-channel-${channel.value}`"
                  :value="channel.value"
                />
                <span>{{ channel.label }}</span>
              </label>
              <small v-if="fieldIssue('channels')" class="field-error">{{ fieldIssue("channels") }}</small>
            </fieldset>
          </div>
        </section>

        <section class="form-section" aria-labelledby="quality-title">
          <div class="form-section__intro">
            <span>03</span>
            <div>
              <h3 id="quality-title">Минимальная линия допуска</h3>
              <p>Единые безопасные пороги для всех созданных gates.</p>
            </div>
          </div>
          <div class="threshold-grid">
            <label>
              <span>Critical recall</span>
              <input v-model="draft.minimumCriticalRecall" data-testid="safety-recall" type="number" min="0.9" max="1" step="0.01" />
              <small v-if="fieldIssue('minimumCriticalRecall')" class="field-error">{{ fieldIssue("minimumCriticalRecall") }}</small>
            </label>
            <label>
              <span>Максимальный false-negative rate</span>
              <input v-model="draft.maximumFalseNegativeRate" data-testid="safety-fnr" type="number" min="0" max="0.1" step="0.01" />
              <small v-if="fieldIssue('maximumFalseNegativeRate')" class="field-error">{{ fieldIssue("maximumFalseNegativeRate") }}</small>
            </label>
            <label>
              <span>Минимум примеров</span>
              <input v-model="draft.minimumSamples" data-testid="safety-samples" type="number" min="1" max="1000000" step="1" />
              <small v-if="fieldIssue('minimumSamples')" class="field-error">{{ fieldIssue("minimumSamples") }}</small>
            </label>
          </div>
          <small v-if="fieldIssue('gates')" class="field-error">{{ fieldIssue("gates") }}</small>
        </section>

        <section class="risk-ledger" aria-labelledby="risk-title">
          <header>
            <div>
              <span class="eyebrow">Неизменяемое ядро</span>
              <h3 id="risk-title">Четыре обязательных риска</h3>
            </div>
            <span>Проектное переопределение запрещено</span>
          </header>
          <div class="risk-list">
            <article v-for="risk in platformSafetyClasses" :key="risk.code">
              <div>
                <strong>{{ platformSafetyClassLabels[risk.code] }}</strong>
                <small>{{ risk.code }}</small>
              </div>
              <Tag :value="risk.severity" :severity="risk.severity === 'URGENT' ? 'danger' : 'warn'" />
              <span>{{ risk.consequences.length }} обязательных действия</span>
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
            :aria-invalid="Boolean(fieldIssue('reason'))"
          />
          <small v-if="fieldIssue('reason')" class="field-error">{{ fieldIssue("reason") }}</small>
        </label>

        <footer class="form-footer">
          <div>
            <strong>{{ issues.length ? `${issues.length} ошибок` : "Форма готова" }}</strong>
            <span>Публикация потребует свежего входа с MFA.</span>
          </div>
          <Button
            data-testid="prepare-safety-publication"
            type="submit"
            :label="state ? 'Проверить новую версию' : 'Проверить и активировать'"
            icon="pi pi-shield"
            :disabled="publicationOutcomeUnknown || !existingGatesAreUniform"
          />
        </footer>
      </form>
    </section>

    <Dialog
      v-model:visible="confirmationOpen"
      modal
      header="Опубликовать глобальную защиту?"
      :closable="!publishing"
      :dismissable-mask="false"
      class="safety-confirmation"
    >
      <div v-if="pendingPublication" class="confirmation-copy">
        <i class="pi pi-shield" />
        <p>
          Новая ревизия станет минимальной обязательной политикой для всех
          проектов. Отключить её на уровне проекта будет нельзя.
        </p>
        <dl>
          <div><dt>Языки</dt><dd>{{ pendingPublication.definition.locales.length }}</dd></div>
          <div><dt>Каналы</dt><dd>{{ pendingPublication.definition.channels.length }}</dd></div>
          <div><dt>Admission gates</dt><dd>{{ pendingPublication.definition.gates.length }}</dd></div>
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
.safety-status__mark { width: 48px; height: 48px; display: grid; place-items: center; border-radius: 14px; color: var(--brand); background: var(--brand-soft); font-size: 1.2rem; }
.safety-status h2, .section-heading h2, .form-section h3, .risk-ledger h3 { margin: 3px 0 0; letter-spacing: -.02em; }
.safety-status p, .section-heading p, .form-section__intro p { margin: 5px 0 0; color: var(--muted); line-height: 1.45; }
.safety-form { display: grid; gap: 0; overflow: hidden; padding: 0; }
.section-heading { display: flex; justify-content: space-between; align-items: flex-start; gap: 16px; padding: 20px; border-bottom: 1px solid var(--line); }
.gate-count { padding: 6px 9px; border-radius: 999px; background: var(--surface-soft); color: var(--muted); font-size: .72rem; font-weight: 750; font-variant-numeric: tabular-nums; }
.form-section { display: grid; grid-template-columns: minmax(190px, .65fr) minmax(0, 1.35fr); gap: 24px; padding: 20px; border-bottom: 1px solid var(--line); }
.form-section__intro { display: grid; grid-template-columns: 28px minmax(0, 1fr); gap: 10px; align-content: start; }
.form-section__intro > span { width: 28px; height: 28px; display: grid; place-items: center; border-radius: 8px; background: var(--surface-soft); color: var(--muted); font-size: .68rem; font-weight: 800; }
.field-grid, .threshold-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 14px; }
.threshold-grid { grid-template-columns: repeat(3, minmax(0, 1fr)); }
.coverage-grid { display: grid; grid-template-columns: minmax(0, 1fr) minmax(180px, .7fr); gap: 16px; }
label, fieldset { display: grid; align-content: start; gap: 6px; min-width: 0; }
label > span, legend { color: var(--text); font-size: .8rem; font-weight: 750; }
input, textarea { width: 100%; min-height: 44px; box-sizing: border-box; border: 1px solid var(--line); border-radius: 9px; background: var(--surface-soft); color: var(--text); padding: 10px 12px; font: inherit; }
textarea { resize: vertical; }
input:focus, textarea:focus { outline: 2px solid color-mix(in srgb, var(--brand) 28%, transparent); border-color: var(--brand); }
input[aria-invalid="true"], textarea[aria-invalid="true"] { border-color: var(--danger-color); }
small { color: var(--muted); line-height: 1.35; }
.field-error { color: var(--danger-color); font-weight: 650; }
fieldset { margin: 0; padding: 12px; border: 1px solid var(--line); border-radius: 10px; }
legend { padding: 0 4px; }
.check-option { grid-template-columns: auto 1fr; align-items: center; min-height: 40px; }
.risk-ledger { padding: 20px; border-bottom: 1px solid var(--line); }
.risk-ledger > header { display: flex; justify-content: space-between; align-items: end; gap: 16px; margin-bottom: 12px; }
.risk-ledger > header > span { color: var(--muted); font-size: .72rem; font-weight: 700; }
.risk-list { border: 1px solid var(--line); border-radius: 12px; overflow: hidden; }
.risk-list article { min-height: 52px; display: grid; grid-template-columns: minmax(0, 1fr) auto minmax(150px, auto); align-items: center; gap: 12px; padding: 10px 12px; border-bottom: 1px solid var(--line); }
.risk-list article:last-child { border-bottom: 0; }
.risk-list article > div { display: grid; gap: 2px; }
.risk-list article > span { color: var(--muted); font-size: .76rem; text-align: right; }
.reason-field { padding: 20px; border-bottom: 1px solid var(--line); }
.form-footer { display: flex; justify-content: space-between; align-items: center; gap: 16px; padding: 16px 20px; background: var(--surface-soft); }
.form-footer > div { display: grid; gap: 2px; }
.form-footer span { color: var(--muted); font-size: .74rem; }
.confirmation-copy { display: grid; justify-items: center; gap: 14px; max-width: 520px; text-align: center; }
.confirmation-copy > i { width: 52px; height: 52px; display: grid; place-items: center; border-radius: 16px; background: var(--brand-soft); color: var(--brand); font-size: 1.3rem; }
.confirmation-copy p { margin: 0; color: var(--muted); line-height: 1.5; }
.confirmation-copy dl { width: 100%; display: grid; grid-template-columns: repeat(3, 1fr); margin: 0; border: 1px solid var(--line); border-radius: 10px; overflow: hidden; }
.confirmation-copy dl > div { display: grid; gap: 3px; padding: 10px; border-right: 1px solid var(--line); }
.confirmation-copy dl > div:last-child { border-right: 0; }
.confirmation-copy dt { color: var(--muted); font-size: .7rem; }
.confirmation-copy dd { margin: 0; font-weight: 800; font-variant-numeric: tabular-nums; }
@media (max-width: 820px) {
  .form-section { grid-template-columns: 1fr; gap: 16px; }
  .threshold-grid { grid-template-columns: 1fr; }
}
@media (max-width: 620px) {
  .safety-status { grid-template-columns: auto 1fr; }
  .safety-status > :last-child { grid-column: 1 / -1; justify-self: start; }
  .section-heading, .form-footer, .risk-ledger > header { align-items: stretch; flex-direction: column; }
  .field-grid, .coverage-grid { grid-template-columns: 1fr; }
  .risk-list article { grid-template-columns: minmax(0, 1fr) auto; }
  .risk-list article > span { grid-column: 1 / -1; text-align: left; }
  .form-footer :deep(.p-button) { width: 100%; min-height: 44px; }
  .message-action { align-items: stretch; flex-direction: column; }
}
</style>
