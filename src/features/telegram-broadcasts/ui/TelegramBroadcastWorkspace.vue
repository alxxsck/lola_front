<script setup lang="ts">
import { computed, ref } from "vue";
import {
  TELEGRAM_BROADCAST_AUDIENCE_CAP,
  type TelegramBroadcast,
  type TelegramBroadcastActionAvailability,
  type TelegramBroadcastLifecycle,
  type TelegramBroadcastPreview,
  type TelegramBroadcastSafeError,
} from "@/features/telegram-broadcasts/model/telegram-broadcast";
import type {
  TelegramBroadcastDelivery,
  TelegramBroadcastTestSend,
} from "@/features/telegram-broadcasts/model/use-telegram-broadcasts";
import TelegramBroadcastActionDialog from "@/features/telegram-broadcasts/ui/TelegramBroadcastActionDialog.vue";
import TelegramBroadcastDraftForm from "@/features/telegram-broadcasts/ui/TelegramBroadcastDraftForm.vue";
import TelegramBroadcastPreviewPanel from "@/features/telegram-broadcasts/ui/TelegramBroadcastPreview.vue";
import TelegramBroadcastProgressPanel from "@/features/telegram-broadcasts/ui/TelegramBroadcastProgress.vue";

defineOptions({ name: "TelegramBroadcastWorkspace" });

const props = defineProps<{
  broadcast: TelegramBroadcast;
  preview: TelegramBroadcastPreview | null;
  latestTestSend: TelegramBroadcastTestSend | null;
  deliveries: TelegramBroadcastDelivery[];
  deliveryTotal: number;
  nextDeliveryCursor: string | null;
  availability: TelegramBroadcastActionAvailability;
  loading: boolean;
  mutating: boolean;
  error: TelegramBroadcastSafeError | null;
  retryAvailable: boolean;
}>();

const emit = defineEmits<{
  back: [];
  saveDraft: [
    draft: {
      title: string;
      content: { text: string };
      audience: { kind: "ALL_EXPLICITLY_OPTED_IN" };
    },
  ];
  generatePreview: [];
  testSend: [endUserExternalId: string, label: string];
  approve: [];
  start: [];
  schedule: [scheduledFor: string];
  pause: [];
  resume: [];
  cancel: [];
  refresh: [];
  loadMoreDeliveries: [];
  retry: [];
  freshLogin: [];
  dirtyChange: [dirty: boolean];
}>();

type Confirmation = "APPROVE" | "CANCEL" | null;

const confirmation = ref<Confirmation>(null);
const scheduledFor = ref("");
const busy = computed(() => props.loading || props.mutating);
const approvalTestEvidence = computed(() => {
  const test = props.latestTestSend;
  return test?.status === "SENT" &&
    test.currentRevision &&
    test.revisionId === props.broadcast.revision.id
    ? test
    : null;
});
const audienceWithinCap = computed(
  () =>
    !props.preview ||
    props.preview.eligibleRecipientCount <= TELEGRAM_BROADCAST_AUDIENCE_CAP,
);
const approvalReady = computed(
  () =>
    props.availability.approve &&
    Boolean(approvalTestEvidence.value) &&
    audienceWithinCap.value,
);
const approvedTestEvidence = computed(() => {
  const approval = props.broadcast.approval;
  const test = props.broadcast.latestTest ?? props.latestTestSend;
  return approval &&
    test?.id === approval.successfulTestId &&
    test.status === "SENT" &&
    test.currentRevision &&
    test.revisionId === approval.revisionId
    ? test
    : null;
});
const draft = computed(() => ({
  title: props.broadcast.title,
  content: props.broadcast.content,
  audience: props.broadcast.audience,
}));
const lifecycleLabels: Record<TelegramBroadcastLifecycle, string> = {
  DRAFT: "Черновик",
  APPROVED: "Одобрена",
  SCHEDULED: "Запланирована",
  RUNNING: "Отправляется",
  PAUSED: "Приостановлена",
  COMPLETED: "Завершена",
  COMPLETED_WITH_FAILURES: "Завершена с ошибками",
  CANCELLED: "Отменена",
};

const confirmationTitle = computed(() =>
  confirmation.value === "APPROVE"
    ? `Подтвердить рассылку «${props.broadcast.title}»`
    : `Отменить рассылку «${props.broadcast.title}»`,
);
const confirmationDescription = computed(() =>
  confirmation.value === "APPROVE"
    ? `Будет зафиксирован снимок из ${props.preview?.eligibleRecipientCount ?? 0} получателей с явным согласием. После подтверждения черновик нельзя изменить.`
    : "Уже отправленные сообщения нельзя отозвать. Необработанные доставки будут отменены, а аудит сохранится.",
);

function confirmAction(): void {
  if (confirmation.value === "APPROVE" && approvalReady.value) emit("approve");
  if (confirmation.value === "CANCEL") emit("cancel");
  confirmation.value = null;
}

function emitSchedule(): void {
  if (!scheduledFor.value) return;
  const date = new Date(scheduledFor.value);
  if (Number.isNaN(date.valueOf())) return;
  emit("schedule", date.toISOString());
}

function forwardTestSend(endUserExternalId: string, label: string): void {
  emit("testSend", endUserExternalId, label);
}
</script>

<template>
  <section class="page broadcast-detail-page" :aria-busy="busy">
    <button type="button" class="back-button" @click="emit('back')">
      <i class="pi pi-arrow-left" aria-hidden="true" />
      К рассылкам
    </button>

    <header class="detail-header">
      <div>
        <div class="eyebrow">Telegram-рассылка</div>
        <h1>{{ broadcast.title }}</h1>
        <p>
          Версия {{ broadcast.version }} · ревизия
          {{ broadcast.revision.revisionNumber }}
        </p>
      </div>
      <div class="header-actions">
        <span class="lifecycle" role="status" aria-live="polite">
          <i class="pi pi-circle-fill" aria-hidden="true" />
          {{ lifecycleLabels[broadcast.status] }}
        </span>
        <button
          type="button"
          class="secondary-button"
          :disabled="busy"
          @click="emit('refresh')"
        >
          Обновить
        </button>
      </div>
    </header>

    <p v-if="error" class="error-banner" role="alert">
      {{ error.message }}
      <button
        v-if="retryAvailable"
        type="button"
        class="link-button"
        @click="emit('retry')"
      >
        Повторить
      </button>
      <button
        v-if="error.kind === 'FRESH_AUTH'"
        type="button"
        class="link-button"
        data-action="broadcast-fresh-login"
        @click="emit('freshLogin')"
      >
        Войти заново
      </button>
    </p>

    <section v-if="broadcast.status === 'DRAFT'" class="workspace-card">
      <div class="section-heading">
        <span>Шаг 1</span>
        <h2>Содержание и аудитория</h2>
      </div>
      <TelegramBroadcastDraftForm
        :draft="draft"
        :disabled="busy || !availability.edit"
        @save="emit('saveDraft', $event)"
        @dirty-change="emit('dirtyChange', $event)"
      />
      <button
        v-if="availability.preview"
        type="button"
        class="secondary-button preview-button"
        :disabled="busy"
        @click="emit('generatePreview')"
      >
        Сформировать предпросмотр
      </button>
    </section>

    <section v-if="preview" class="workspace-card">
      <TelegramBroadcastPreviewPanel
        :preview="preview"
        :latest-test-send="latestTestSend"
        :can-test="availability.testSend"
        :disabled="busy"
        @test-send="forwardTestSend"
      />
    </section>

    <section
      v-if="preview && availability.approve"
      class="workspace-card review-card"
      aria-labelledby="broadcast-review-title"
    >
      <div class="section-heading">
        <span>Шаг 3</span>
        <h2 id="broadcast-review-title">Проверка и подтверждение</h2>
      </div>
      <p>
        Проверьте точный текст, ревизию предпросмотра и количество получателей.
        Подтверждение создаст неизменяемый снимок аудитории.
      </p>
      <dl class="approval-evidence">
        <div>
          <dt>Ревизия предпросмотра</dt>
          <dd>{{ preview.revisionId }}</dd>
        </div>
        <div>
          <dt>Ожидаемых получателей</dt>
          <dd>{{ preview.eligibleRecipientCount }}</dd>
        </div>
        <div>
          <dt>Хеш содержания</dt>
          <dd><code>{{ preview.contentHash }}</code></dd>
        </div>
        <div>
          <dt>Последний успешный тест</dt>
          <dd v-if="approvalTestEvidence">
            {{ approvalTestEvidence.label }} · SENT · текущая ревизия
          </dd>
          <dd v-else>Нет успешного SENT-теста текущей ревизии</dd>
        </div>
      </dl>
      <p
        v-if="!audienceWithinCap"
        class="approval-warning"
        role="alert"
      >
        Получателей больше {{ TELEGRAM_BROADCAST_AUDIENCE_CAP }}. Уменьшите
        аудиторию до лимита перед подтверждением.
      </p>
      <button
        type="button"
        class="primary-button"
        data-action="ask-approve"
        :disabled="busy || !approvalReady"
        @click="approvalReady && (confirmation = 'APPROVE')"
      >
        Подтвердить рассылку
      </button>
    </section>

    <section
      v-if="broadcast.approval"
      class="workspace-card"
      aria-labelledby="broadcast-approved-evidence-title"
    >
      <div class="section-heading">
        <span>Зафиксировано</span>
        <h2 id="broadcast-approved-evidence-title">
          Доказательства подтверждения
        </h2>
      </div>
      <dl class="approval-evidence">
        <div>
          <dt>Получателей</dt>
          <dd>{{ broadcast.approval.recipientCount }}</dd>
        </div>
        <div>
          <dt>Хеш содержания</dt>
          <dd><code>{{ broadcast.approval.contentHash }}</code></dd>
        </div>
        <div>
          <dt>Успешный тест</dt>
          <dd v-if="approvedTestEvidence">
            {{ approvedTestEvidence.label }} · SENT · текущая ревизия
          </dd>
          <dd v-else>Тестовое доказательство недоступно</dd>
        </div>
      </dl>
    </section>

    <section
      v-if="broadcast.status !== 'DRAFT'"
      class="workspace-card controls-card"
      aria-labelledby="broadcast-controls-title"
    >
      <div class="section-heading">
        <span>Управление</span>
        <h2 id="broadcast-controls-title">Запуск и состояние</h2>
      </div>
      <div class="control-actions">
        <button
          v-if="availability.start"
          type="button"
          class="primary-button"
          data-action="start"
          :disabled="busy"
          @click="emit('start')"
        >
          Запустить сейчас
        </button>
        <template v-if="availability.schedule">
          <label for="broadcast-scheduled-for">Дата и время запуска</label>
          <input
            id="broadcast-scheduled-for"
            v-model="scheduledFor"
            type="datetime-local"
            :disabled="busy"
          />
          <button
            type="button"
            class="secondary-button"
            data-action="schedule"
            :disabled="busy || !scheduledFor"
            @click="emitSchedule"
          >
            Запланировать
          </button>
        </template>
        <button
          v-if="availability.pause"
          type="button"
          class="secondary-button"
          data-action="pause"
          :disabled="busy"
          @click="emit('pause')"
        >
          Приостановить
        </button>
        <button
          v-if="availability.resume"
          type="button"
          class="primary-button"
          data-action="resume"
          :disabled="busy"
          @click="emit('resume')"
        >
          Продолжить
        </button>
      </div>
      <p v-if="broadcast.scheduledAt">
        Запуск:
        <time :datetime="broadcast.scheduledAt">
          {{ new Date(broadcast.scheduledAt).toLocaleString("ru-RU") }}
        </time>
      </p>
    </section>

    <section v-if="broadcast.progress" class="workspace-card">
      <TelegramBroadcastProgressPanel
        :progress="broadcast.progress"
        :deliveries="deliveries"
        :delivery-total="deliveryTotal"
        :next-delivery-cursor="nextDeliveryCursor"
        :loading="loading"
        @load-more="emit('loadMoreDeliveries')"
      />
    </section>

    <section v-if="availability.cancel" class="danger-zone">
      <div>
        <strong>Отмена рассылки</strong>
        <p>Отмена не удаляет снимок аудитории и журнал доставки.</p>
      </div>
      <button
        type="button"
        class="danger-button"
        data-action="ask-cancel"
        :disabled="busy"
        @click="confirmation = 'CANCEL'"
      >
        Отменить рассылку
      </button>
    </section>

    <TelegramBroadcastActionDialog
      :open="Boolean(confirmation)"
      :title="confirmationTitle"
      :description="confirmationDescription"
      :confirm-label="
        confirmation === 'APPROVE'
          ? 'Подтвердить и зафиксировать'
          : 'Отменить рассылку'
      "
      :destructive="confirmation === 'CANCEL'"
      @confirm="confirmAction"
      @cancel="confirmation = null"
    >
      <dl v-if="confirmation === 'APPROVE' && preview" class="dialog-evidence">
        <div>
          <dt>Ревизия</dt>
          <dd>{{ preview.revisionId }}</dd>
        </div>
        <div>
          <dt>Получателей</dt>
          <dd>{{ preview.eligibleRecipientCount }}</dd>
        </div>
        <div>
          <dt>Хеш содержания</dt>
          <dd><code>{{ preview.contentHash }}</code></dd>
        </div>
        <div v-if="approvalTestEvidence">
          <dt>Успешный тест</dt>
          <dd>
            {{ approvalTestEvidence.label }} · SENT · текущая ревизия
          </dd>
        </div>
      </dl>
    </TelegramBroadcastActionDialog>
  </section>
</template>

<style scoped>
.broadcast-detail-page {
  display: grid;
  gap: 18px;
}
.back-button,
.secondary-button,
.primary-button,
.danger-button,
.link-button {
  font: inherit;
  font-weight: 700;
  cursor: pointer;
}
.back-button,
.link-button {
  justify-self: start;
  padding: 0;
  border: 0;
  background: transparent;
  color: var(--text-link);
}
.detail-header,
.header-actions,
.control-actions,
.danger-zone {
  display: flex;
  align-items: center;
}
.detail-header,
.danger-zone {
  justify-content: space-between;
  gap: 20px;
}
.detail-header h1 {
  margin: 4px 0;
}
.detail-header p {
  margin: 0;
  color: var(--text-small-muted);
}
.header-actions,
.control-actions {
  flex-wrap: wrap;
  gap: 8px;
}
.lifecycle {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 8px 11px;
  border-radius: 999px;
  background: var(--surface-subtle);
  font-weight: 700;
}
.lifecycle i {
  font-size: 0.55rem;
}
.workspace-card,
.danger-zone,
.error-banner {
  padding: 20px;
  border: 1px solid var(--border-default);
  border-radius: 16px;
  background: var(--surface-card);
}
.approval-warning {
  color: var(--status-danger-text);
}
.section-heading span {
  color: var(--text-small-muted);
  font-size: 0.75rem;
  font-weight: 700;
}
.section-heading h2 {
  margin: 4px 0 16px;
}
.preview-button {
  margin-top: 14px;
}
.primary-button,
.secondary-button,
.danger-button {
  min-height: 40px;
  padding: 0 14px;
  border-radius: 10px;
}
.primary-button {
  border: 1px solid var(--surface-emphasis);
  background: var(--surface-emphasis);
  color: var(--text-on-emphasis);
}
.secondary-button {
  border: 1px solid var(--border-default);
  background: var(--surface-card);
  color: var(--text-primary);
}
.danger-button {
  border: 1px solid var(--status-danger);
  background: transparent;
  color: var(--status-danger);
}
.error-banner {
  border-color: var(--status-danger);
}
.approval-evidence,
.dialog-evidence {
  display: grid;
  gap: 8px;
}
.approval-evidence > div,
.dialog-evidence > div {
  display: grid;
  grid-template-columns: minmax(160px, 1fr) 2fr;
  gap: 12px;
}
dt {
  color: var(--text-small-muted);
}
dd {
  min-width: 0;
  margin: 0;
  overflow-wrap: anywhere;
}
.control-actions label {
  width: 100%;
  font-weight: 700;
}
.control-actions input {
  min-height: 40px;
  padding: 0 10px;
  border: 1px solid var(--border-default);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
}
.danger-zone p {
  margin: 4px 0 0;
  color: var(--text-small-muted);
}
button:disabled,
input:disabled {
  cursor: not-allowed;
  opacity: 0.55;
}
@media (max-width: 720px) {
  .detail-header,
  .danger-zone {
    align-items: stretch;
    flex-direction: column;
  }
  .header-actions,
  .control-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
}
</style>
