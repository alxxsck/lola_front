<script setup lang="ts">
import { computed, ref, watch } from "vue";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import type { ResolveSupportExternalWorkCommandDto } from "@/shared/api/generated/models";
import { relativeTime } from "@/shared/lib/format";
import type {
  createSupportCaseExternalWorkController,
  SupportCaseExternalWorkPermissions,
} from "../model/use-support-case-external-work";

const props = defineProps<{
  controller: ReturnType<typeof createSupportCaseExternalWorkController>;
  permissions: SupportCaseExternalWorkPermissions;
}>();
const createDraft = props.controller.createDraft;
const commentDraft = props.controller.commentDraft;

const createVisible = ref(false);
const linkVisible = ref(false);
const unknownVisible = ref(false);
const unknownMode = ref<"RESOLVE" | "EVIDENCE">("RESOLVE");
const unlinkVisible = ref(false);
const activeUnlinkId = ref("");
const activeUnknownCommandId = ref("");
const unknownDecision =
  ref<ResolveSupportExternalWorkCommandDto["decision"]>("CANCEL");
const unknownRemoteItemId = ref("");
const unknownProviderCorrelation = ref("");
const unknownEvidenceNote = ref("");
const evidenceRemoteItemId = ref("");
const selectedInboxItemId = ref("");
const selectedMappingOptionId = ref("");

const activeLink = computed(
  () =>
    props.controller.links.value.find(
      (item) => item.linkId === props.controller.selectedLinkId.value,
    ) ?? null,
);
const activeUnknownCommand = computed(() =>
  props.controller.commands.value.find(
    (command) => command.commandId === activeUnknownCommandId.value,
  ),
);
const unknownDecisionChoices = computed(() => {
  const common = [
    {
      label: "Подтвердить отсутствие доставки",
      value: "CONFIRM_NOT_DELIVERED",
    },
    { label: "Отменить", value: "CANCEL" },
  ];
  if (activeUnknownCommand.value?.intent === "CREATE")
    return [
      { label: "Связать найденный объект", value: "LINK_EXISTING" },
      ...common,
    ];
  if (activeUnknownCommand.value?.intent === "COMMENT")
    return [
      { label: "Подтвердить доставку", value: "CONFIRM_DELIVERED" },
      ...common,
    ];
  if (activeUnknownCommand.value?.intent === "REFRESH")
    return [
      { label: "Безопасный повтор", value: "RETRY_SAFE" },
      { label: "Отменить", value: "CANCEL" },
    ];
  return [];
});
const selectedCreateOption = computed(() =>
  props.controller.createOptions.value.find(
    (item) => item.optionId === createDraft.value.optionId,
  ),
);
const safePreview = computed(() =>
  [
    createDraft.value.includeCaseTitle ? "Тема обращения" : "",
    createDraft.value.includeCaseSummary ? "Краткий контекст обращения" : "",
    createDraft.value.body.trim() ? "Редактируемое описание" : "",
  ].filter(Boolean),
);
const canCommentActiveLink = computed(() => {
  const actions = activeLink.value?.item.allowedActions ?? [];
  return (
    (props.permissions.commentInternal &&
      actions.includes("COMMENT_INTERNAL")) ||
    (props.permissions.commentPublic && actions.includes("COMMENT_PUBLIC"))
  );
});

const createOptionChoices = computed(() =>
  props.controller.createOptions.value
    .filter((item) => item.allowedActions.includes("CREATE"))
    .map((item) => ({
      value: item.optionId,
      label: `${item.destinationLabel}${item.formLabel ? ` · ${item.formLabel}` : ""}`,
    })),
);
const linkItemChoices = computed(() =>
  props.controller.inboxItems.value.map((item) => ({
    value: item.itemId,
    label: `${providerLabel(item.provider)} · ${item.remoteKey ?? item.remoteItemId}`,
  })),
);

function providerLabel(provider: string): string {
  return provider === "JSM" ? "JSM" : "HelpDesk";
}

function commandStatusLabel(status: string): string {
  return (
    {
      QUEUED: "В очереди",
      CLAIMED: "Отправляется",
      RETRYING: "Повтор",
      SUCCEEDED: "Создано",
      FAILED: "Требует внимания",
      UNKNOWN: "Результат неизвестен",
      CANCELLED: "Отменено",
    }[status] ?? status
  );
}

function commandIntentLabel(intent: string): string {
  return (
    {
      CREATE: "Создание внешней заявки",
      COMMENT: "Внешний комментарий",
      REFRESH: "Обновление данных",
      UNLINK: "Отвязка от обращения",
    }[intent] ?? intent
  );
}

function freshnessLabel(value: string): string {
  return (
    {
      FRESH: "Актуально",
      STALE: "Требует обновления",
      TOMBSTONED: "Удалено во внешней системе",
    }[value] ?? value
  );
}

function openCreate(): void {
  if (!createDraft.value.optionId)
    createDraft.value.optionId =
      props.controller.createOptions.value.find((item) =>
        item.allowedActions.includes("CREATE"),
      )?.optionId ?? "";
  createVisible.value = true;
}

function selectLink(linkId: string): void {
  void props.controller.selectLink(linkId);
}

function chooseAudience(audience: "INTERNAL" | "PUBLIC"): void {
  commentDraft.value.audience = audience;
  if (audience === "INTERNAL") commentDraft.value.publicConfirmed = false;
}

function openUnknown(commandId: string): void {
  unknownMode.value = "RESOLVE";
  activeUnknownCommandId.value = commandId;
  const command = props.controller.commands.value.find(
    (candidate) => candidate.commandId === commandId,
  );
  unknownDecision.value =
    command?.intent === "CREATE"
      ? "LINK_EXISTING"
      : command?.intent === "COMMENT"
        ? "CONFIRM_DELIVERED"
        : command?.intent === "REFRESH"
          ? "RETRY_SAFE"
          : "CANCEL";
  unknownRemoteItemId.value = "";
  unknownProviderCorrelation.value = "";
  unknownEvidenceNote.value = "";
  evidenceRemoteItemId.value = "";
  unknownVisible.value = true;
}

function openEvidence(commandId: string): void {
  unknownMode.value = "EVIDENCE";
  activeUnknownCommandId.value = commandId;
  evidenceRemoteItemId.value = "";
  unknownVisible.value = true;
}

async function refreshEvidence(): Promise<void> {
  await props.controller.refreshEvidence(
    activeUnknownCommandId.value,
    evidenceRemoteItemId.value,
  );
  if (!props.controller.error.value) unknownVisible.value = false;
}

function openUnlink(linkId: string): void {
  activeUnlinkId.value = linkId;
  unlinkVisible.value = true;
}

async function confirmUnlink(): Promise<void> {
  await props.controller.unlink(activeUnlinkId.value);
  if (!props.controller.error.value) unlinkVisible.value = false;
}

async function submitCreate(): Promise<void> {
  await props.controller.create();
  if (!props.controller.validationError.value && !props.controller.error.value)
    createVisible.value = false;
}

async function resolveUnknown(): Promise<void> {
  const body: ResolveSupportExternalWorkCommandDto = {
    decision: unknownDecision.value,
    ...(unknownDecision.value === "LINK_EXISTING" &&
    unknownRemoteItemId.value.trim()
      ? { remoteItemId: unknownRemoteItemId.value.trim() }
      : {}),
    ...(unknownDecision.value === "CONFIRM_DELIVERED" &&
    unknownProviderCorrelation.value.trim()
      ? { providerCorrelation: unknownProviderCorrelation.value.trim() }
      : {}),
    ...(unknownEvidenceNote.value.trim()
      ? { evidenceNote: unknownEvidenceNote.value.trim() }
      : {}),
  };
  await props.controller.resolveCommand(activeUnknownCommandId.value, body);
  if (!props.controller.error.value) unknownVisible.value = false;
}

async function linkExisting(): Promise<void> {
  if (!selectedInboxItemId.value || !selectedMappingOptionId.value) return;
  await props.controller.linkExisting(
    selectedInboxItemId.value,
    selectedMappingOptionId.value,
  );
  if (!props.controller.error.value) linkVisible.value = false;
}

function fieldValue(fieldId: string): unknown {
  return createDraft.value.fieldValues[fieldId]?.value;
}

function updateField(fieldId: string, type: string, value: unknown): void {
  createDraft.value.fieldValues[fieldId] = { type, value };
}

function resetLocalDialogs(): void {
  createVisible.value = false;
  linkVisible.value = false;
  unknownVisible.value = false;
  unlinkVisible.value = false;
  activeUnknownCommandId.value = "";
  activeUnlinkId.value = "";
  unknownRemoteItemId.value = "";
  unknownProviderCorrelation.value = "";
  unknownEvidenceNote.value = "";
  evidenceRemoteItemId.value = "";
  selectedInboxItemId.value = "";
  selectedMappingOptionId.value = "";
}

watch(selectedCreateOption, (option) => {
  if (!option) return;
  const next: Record<string, { type: string; value: unknown }> = {};
  for (const field of option.fields) {
    if (field.defaultValue !== undefined)
      next[field.id] = { type: field.valueType, value: field.defaultValue };
  }
  createDraft.value.fieldValues = next;
});
watch(props.controller.scopeRevision, resetLocalDialogs);
</script>

<template>
  <section class="external-case-pane" aria-label="Интеграции обращения">
    <header class="external-case-pane__header">
      <div>
        <span class="external-case-pane__kicker">External Work</span>
        <h3>Передача работы во внешнюю систему</h3>
        <p>Только выбранный контекст и подтверждённые сервером действия.</p>
      </div>
      <Button
        label="Обновить"
        icon="pi pi-refresh"
        severity="secondary"
        text
        :loading="controller.loading.value"
        :disabled="controller.mutating.value"
        @click="controller.load"
      />
    </header>

    <div
      v-if="controller.loading.value && !controller.links.value.length"
      class="external-skeleton"
      aria-busy="true"
    >
      <Skeleton width="54%" height="18px" />
      <Skeleton width="100%" height="72px" />
      <Skeleton width="100%" height="72px" />
      <Skeleton width="72%" height="42px" />
    </div>

    <template v-else>
      <Message v-if="controller.error.value" severity="error" :closable="false">
        {{ controller.error.value }}
      </Message>
      <Message
        v-if="controller.validationError.value"
        severity="warn"
        :closable="false"
      >
        {{ controller.validationError.value }}
      </Message>
      <div class="external-case-pane__actions">
        <Button
          v-if="permissions.create && createOptionChoices.length"
          data-testid="external-create-open"
          label="Создать внешнюю заявку"
          icon="pi pi-plus"
          :disabled="
            controller.mutating.value || controller.newIntentBlocked.value
          "
          @click="openCreate"
        />
        <Button
          v-if="permissions.inboxRead && controller.inboxItems.value.length"
          label="Связать существующую"
          icon="pi pi-link"
          severity="secondary"
          outlined
          :disabled="
            controller.mutating.value || controller.newIntentBlocked.value
          "
          @click="linkVisible = true"
        />
      </div>

      <Message
        v-if="controller.unknownAttempt.value"
        severity="warn"
        :closable="false"
        class="unknown-attempt"
      >
        <strong>Результат запроса неизвестен.</strong>
        Новый intent заблокирован. Можно повторить только тот же payload с тем
        же ключом.
        <Button
          label="Повторить тот же запрос"
          severity="secondary"
          outlined
          :loading="controller.mutating.value"
          @click="controller.replayUnknownAttempt"
        />
      </Message>

      <div class="command-live" aria-live="polite" aria-atomic="true">
        <template v-if="controller.feedback.value">
          {{ commandStatusLabel(controller.feedback.value.status) }}.
          <span v-if="!controller.feedback.value.terminal"
            >Ждём подтверждения внешней системы.</span
          >
        </template>
      </div>

      <div
        v-if="controller.links.value.length"
        class="external-links"
        aria-label="Связанные внешние заявки"
      >
        <button
          v-for="link in controller.links.value"
          :key="link.linkId"
          type="button"
          class="external-link-card"
          :class="{
            'external-link-card--active':
              controller.selectedLinkId.value === link.linkId,
          }"
          :data-testid="`external-link-${link.linkId}`"
          @click="selectLink(link.linkId)"
        >
          <span class="external-link-card__provider"
            >В {{ providerLabel(link.item.provider) }}</span
          >
          <strong>{{ link.item.remoteKey ?? link.item.remoteItemId }}</strong>
          <span class="external-link-card__summary">{{
            link.item.summary ?? "Без темы"
          }}</span>
          <span class="external-link-card__freshness">{{
            freshnessLabel(link.item.freshness)
          }}</span>
          <dl>
            <div>
              <dt>Статус во внешней системе</dt>
              <dd>{{ link.item.status ?? "Не передан" }}</dd>
            </div>
            <div>
              <dt>Исполнитель во внешней системе</dt>
              <dd>{{ link.item.assignee?.label ?? "Не назначен" }}</dd>
            </div>
          </dl>
        </button>
      </div>

      <div v-else class="external-empty">
        <span class="external-empty__mark" aria-hidden="true"
          ><i class="pi pi-link"
        /></span>
        <h4>Внешних заявок нет</h4>
        <p>Создайте новую заявку или свяжите доступный HelpDesk ticket.</p>
      </div>

      <section
        v-if="controller.commands.value.length"
        class="external-command-ledger"
        aria-label="История внешних команд"
      >
        <header>
          <span>Команды</span
          ><small>HTTP 202 остаётся pending до подтверждения</small>
        </header>
        <ol>
          <li
            v-for="command in controller.commands.value"
            :key="command.commandId"
          >
            <span
              class="command-dot"
              :class="`command-dot--${command.status.toLowerCase()}`"
              aria-hidden="true"
            />
            <div>
              <strong>{{ commandIntentLabel(command.intent) }}</strong>
              <span
                >{{ commandStatusLabel(command.status) }} ·
                {{ relativeTime(command.createdAt) }}</span
              >
            </div>
            <div class="command-actions">
              <Button
                v-if="
                  permissions.resolveUnknown &&
                  command.allowedActions.includes('REFRESH_EVIDENCE')
                "
                label="Обновить evidence"
                severity="secondary"
                outlined
                @click="openEvidence(command.commandId)"
              />
              <Button
                label="Проверить"
                severity="secondary"
                text
                :disabled="controller.mutating.value"
                @click="controller.reconcileCommand(command.commandId)"
              />
              <Button
                v-if="
                  permissions.retry && command.allowedActions.includes('RETRY')
                "
                label="Безопасный повтор"
                severity="secondary"
                outlined
                @click="controller.retryCommand(command.commandId)"
              />
              <Button
                v-if="
                  permissions.resolveUnknown &&
                  command.allowedActions.includes('RESOLVE_UNKNOWN') &&
                  command.intent !== 'UNLINK'
                "
                label="Разобрать UNKNOWN"
                severity="warn"
                outlined
                @click="openUnknown(command.commandId)"
              />
            </div>
          </li>
        </ol>
      </section>

      <section
        v-if="activeLink"
        class="external-detail"
        aria-label="Внешняя переписка"
      >
        <header class="external-detail__header">
          <div>
            <span class="external-case-pane__kicker"
              >В {{ providerLabel(activeLink.item.provider) }}</span
            >
            <h4>
              {{ activeLink.item.remoteKey ?? activeLink.item.remoteItemId }}
            </h4>
          </div>
          <div class="external-detail__actions">
            <a
              v-if="
                activeLink.item.remoteUrl &&
                activeLink.item.allowedActions.includes('OPEN_REMOTE')
              "
              class="external-open-link"
              :href="activeLink.item.remoteUrl"
              target="_blank"
              rel="noopener noreferrer"
              >Открыть во внешней системе</a
            >
            <Button
              v-if="activeLink.item.allowedActions.includes('REFRESH')"
              label="Обновить"
              severity="secondary"
              outlined
              :disabled="controller.newIntentBlocked.value"
              @click="controller.refresh(activeLink.linkId)"
            />
            <Button
              v-if="activeLink.item.allowedActions.includes('UNLINK')"
              label="Отвязать"
              severity="danger"
              outlined
              :disabled="controller.newIntentBlocked.value"
              @click="openUnlink(activeLink.linkId)"
            />
          </div>
        </header>

        <div
          v-if="controller.loadingTimeline.value"
          class="timeline-skeleton"
          aria-busy="true"
        >
          <Skeleton width="100%" height="54px" />
          <Skeleton width="84%" height="54px" />
        </div>
        <ol v-else class="external-timeline">
          <li
            v-for="message in controller.timeline.value"
            :key="message.messageId"
          >
            <header>
              <Tag
                :value="
                  message.audience === 'INTERNAL' ? 'Внутренний' : 'Публичный'
                "
              />
              <time :datetime="message.remoteCreatedAt">{{
                relativeTime(message.remoteCreatedAt)
              }}</time>
            </header>
            <p v-if="message.tombstonedAt">
              Сообщение удалено во внешней системе.
            </p>
            <p v-else-if="message.bodyUnavailable">
              Текст недоступен для текущих прав.
            </p>
            <p v-else>{{ message.body }}</p>
            <Button
              v-if="message.body"
              label="Копировать в черновик ответа"
              severity="secondary"
              text
              @click="controller.copyTimelineMessage(message.messageId)"
            />
          </li>
        </ol>

        <div v-if="canCommentActiveLink" class="external-comment-composer">
          <div
            class="audience-switch"
            role="group"
            aria-label="Аудитория внешнего комментария"
          >
            <button
              v-if="
                permissions.commentInternal &&
                activeLink.item.allowedActions.includes('COMMENT_INTERNAL')
              "
              type="button"
              :aria-pressed="
                controller.commentDraft.value.audience === 'INTERNAL'
              "
              @click="chooseAudience('INTERNAL')"
            >
              <i class="pi pi-lock" aria-hidden="true" /> Внутренний
            </button>
            <button
              v-if="
                permissions.commentPublic &&
                activeLink.item.allowedActions.includes('COMMENT_PUBLIC')
              "
              type="button"
              :aria-pressed="
                controller.commentDraft.value.audience === 'PUBLIC'
              "
              @click="chooseAudience('PUBLIC')"
            >
              <i class="pi pi-send" aria-hidden="true" /> Публичный
            </button>
          </div>
          <p class="audience-copy">
            Внутренний — безопасный режим по умолчанию. Публичный комментарий
            нужно явно подтвердить.
          </p>
          <Textarea
            v-model="commentDraft.body"
            rows="4"
            maxlength="32000"
            placeholder="Комментарий во внешнюю систему"
            aria-label="Текст внешнего комментария"
          />
          <label
            v-if="controller.commentDraft.value.audience === 'PUBLIC'"
            class="public-confirmation"
          >
            <Checkbox v-model="commentDraft.publicConfirmed" binary />
            <span>Подтверждаю, что текст будет виден внешнему получателю</span>
          </label>
          <Button
            :label="
              controller.commentDraft.value.audience === 'PUBLIC'
                ? 'Отправить публичный комментарий'
                : 'Добавить внутренний комментарий'
            "
            :loading="controller.mutating.value"
            :disabled="controller.newIntentBlocked.value"
            @click="controller.comment(activeLink.linkId)"
          />
        </div>
      </section>
    </template>

    <Dialog
      v-model:visible="createVisible"
      modal
      header="Создать внешнюю заявку"
      :style="{ width: 'min(620px, calc(100vw - 24px))' }"
    >
      <div class="external-form">
        <Message severity="info" :closable="false">
          История чата не копируется автоматически. Проверьте каждый фрагмент
          safe context ниже.
        </Message>
        <label>
          <span>Назначение</span>
          <Select
            v-model="createDraft.optionId"
            :options="createOptionChoices"
            option-label="label"
            option-value="value"
            placeholder="Выберите назначение"
          />
        </label>
        <label v-if="selectedCreateOption?.requester?.emailRequired">
          <span>Email requester *</span>
          <InputText
            v-model="createDraft.requesterEmail"
            type="email"
            maxlength="320"
            autocomplete="off"
          />
        </label>
        <label v-if="selectedCreateOption?.requester?.nameRequired">
          <span>Имя requester *</span>
          <InputText
            v-model="createDraft.requesterName"
            maxlength="255"
            autocomplete="off"
          />
        </label>
        <label>
          <span>Заголовок во внешней системе</span>
          <InputText v-model="createDraft.title" maxlength="500" />
        </label>
        <fieldset class="safe-context">
          <legend>Safe context</legend>
          <label
            ><Checkbox v-model="createDraft.includeCaseTitle" binary /><span
              >Тема обращения</span
            ></label
          >
          <label
            ><Checkbox v-model="createDraft.includeCaseSummary" binary /><span
              >Краткий контекст обращения</span
            ></label
          >
        </fieldset>
        <label>
          <span>Редактируемое описание</span>
          <Textarea v-model="createDraft.body" rows="6" maxlength="32000" />
        </label>
        <div class="safe-preview" aria-live="polite">
          <strong>Будет отправлено</strong>
          <span v-if="safePreview.length">{{ safePreview.join(" · ") }}</span>
          <span v-else>Контекст ещё не выбран</span>
        </div>
        <template
          v-for="field in selectedCreateOption?.fields ?? []"
          :key="field.id"
        >
          <label
            v-if="
              field.valueType === 'CHOICE' || field.valueType === 'MULTI_CHOICE'
            "
          >
            <span>{{ field.id }}<b v-if="field.required"> *</b></span>
            <Select
              :model-value="String(fieldValue(field.id) ?? '')"
              :options="field.options"
              option-label="label"
              option-value="value"
              :multiple="field.valueType === 'MULTI_CHOICE'"
              :disabled="!field.editable"
              @update:model-value="
                updateField(field.id, field.valueType, $event)
              "
            />
          </label>
          <label
            v-else-if="field.valueType === 'BOOLEAN'"
            class="boolean-field"
          >
            <Checkbox
              :model-value="Boolean(fieldValue(field.id))"
              binary
              :disabled="!field.editable"
              @update:model-value="
                updateField(field.id, field.valueType, $event)
              "
            />
            <span>{{ field.id }}<b v-if="field.required"> *</b></span>
          </label>
          <label v-else>
            <span>{{ field.id }}<b v-if="field.required"> *</b></span>
            <InputText
              :model-value="String(fieldValue(field.id) ?? '')"
              :type="
                field.valueType === 'NUMBER'
                  ? 'number'
                  : field.valueType === 'DATE'
                    ? 'date'
                    : 'text'
              "
              :disabled="!field.editable"
              @update:model-value="
                updateField(
                  field.id,
                  field.valueType,
                  field.valueType === 'NUMBER' ? Number($event) : $event,
                )
              "
            />
          </label>
        </template>
        <div class="dialog-actions">
          <Button
            label="Отмена"
            severity="secondary"
            text
            @click="createVisible = false"
          />
          <Button
            label="Принять в очередь"
            :loading="controller.mutating.value"
            :disabled="controller.newIntentBlocked.value"
            @click="submitCreate"
          />
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="linkVisible"
      modal
      header="Связать существующий HelpDesk ticket"
      :style="{ width: 'min(520px, calc(100vw - 24px))' }"
    >
      <div class="external-form">
        <label
          ><span>Внешняя заявка</span
          ><Select
            v-model="selectedInboxItemId"
            :options="linkItemChoices"
            option-label="label"
            option-value="value"
        /></label>
        <label
          ><span>Mapping</span
          ><Select
            v-model="selectedMappingOptionId"
            :options="createOptionChoices"
            option-label="label"
            option-value="value"
        /></label>
        <div class="dialog-actions">
          <Button
            label="Отмена"
            severity="secondary"
            text
            @click="linkVisible = false"
          />
          <Button
            label="Связать"
            :loading="controller.mutating.value"
            @click="linkExisting"
          />
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="unknownVisible"
      modal
      :header="
        unknownMode === 'EVIDENCE'
          ? 'Обновить evidence'
          : 'Разобрать неизвестный результат'
      "
      :style="{ width: 'min(560px, calc(100vw - 24px))' }"
    >
      <div class="external-form">
        <Message severity="warn" :closable="false"
          >Решение проверяется по текущей revision и попадёт в audit. Новый
          blind retry не выполняется.</Message
        >
        <template v-if="unknownMode === 'EVIDENCE'">
          <Message severity="info" :closable="false">
            Remote item ID проверяется сервером. Команда не считается успешной
            до нового authoritative evidence.
          </Message>
          <label>
            <span>Remote item ID</span>
            <InputText v-model="evidenceRemoteItemId" maxlength="255" />
          </label>
        </template>
        <template v-else>
          <label
            ><span>Решение</span
            ><Select
              v-model="unknownDecision"
              :options="unknownDecisionChoices"
              option-label="label"
              option-value="value"
          /></label>
          <label v-if="unknownDecision === 'LINK_EXISTING'"
            ><span>Remote item ID</span
            ><InputText v-model="unknownRemoteItemId" maxlength="255"
          /></label>
          <label v-if="unknownDecision === 'CONFIRM_DELIVERED'"
            ><span>Provider correlation</span
            ><InputText v-model="unknownProviderCorrelation" maxlength="255"
          /></label>
          <label
            ><span>Audit note</span
            ><Textarea v-model="unknownEvidenceNote" rows="4" maxlength="2000"
          /></label>
        </template>
        <div class="dialog-actions">
          <Button
            label="Отмена"
            severity="secondary"
            text
            @click="unknownVisible = false"
          />
          <Button
            :label="
              unknownMode === 'EVIDENCE'
                ? 'Проверить evidence'
                : 'Подтвердить решение'
            "
            :loading="controller.mutating.value"
            @click="
              unknownMode === 'EVIDENCE' ? refreshEvidence() : resolveUnknown()
            "
          />
        </div>
      </div>
    </Dialog>

    <Dialog
      v-model:visible="unlinkVisible"
      modal
      header="Отвязать внешнюю заявку?"
      :style="{ width: 'min(460px, calc(100vw - 24px))' }"
    >
      <div class="external-form">
        <Message severity="warn" :closable="false">
          Связь исчезнет из обращения. Внешний объект и его история не
          удаляются.
        </Message>
        <div class="dialog-actions">
          <Button
            label="Отмена"
            severity="secondary"
            text
            @click="unlinkVisible = false"
          />
          <Button
            label="Отвязать"
            severity="danger"
            :loading="controller.mutating.value"
            @click="confirmUnlink"
          />
        </div>
      </div>
    </Dialog>
  </section>
</template>

<style scoped>
.external-case-pane {
  display: grid;
  gap: 16px;
  min-width: 0;
}
.external-case-pane__header {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.external-case-pane__header h3 {
  margin: 3px 0 0;
  color: var(--text-primary);
  font-size: 0.94rem;
  font-weight: 750;
  letter-spacing: -0.01em;
  text-wrap: balance;
}
.external-case-pane__header p {
  margin: 5px 0 0;
  color: var(--text-muted);
  font-size: 0.72rem;
  line-height: 1.45;
  text-wrap: pretty;
}
.external-case-pane__kicker {
  color: var(--text-muted);
  font-size: 0.66rem;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
}
.external-skeleton,
.timeline-skeleton {
  display: grid;
  gap: 10px;
}
.external-case-pane__actions,
.external-detail__actions,
.command-actions,
.dialog-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}
.external-case-pane__actions :deep(.p-button),
.external-detail__actions :deep(.p-button) {
  min-height: 44px;
}
.unknown-attempt :deep(.p-message-content) {
  display: grid;
  gap: 8px;
}
.command-live {
  min-height: 18px;
  color: var(--text-muted);
  font-size: 0.72rem;
}
.external-links {
  display: grid;
  gap: 8px;
}
.external-link-card {
  width: 100%;
  min-width: 0;
  padding: 12px;
  display: grid;
  grid-template-columns: auto minmax(0, 1fr) auto;
  gap: 5px 10px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface);
  color: var(--text-primary);
  font: inherit;
  text-align: left;
  cursor: pointer;
  transition:
    border-color 140ms ease-out,
    background-color 140ms ease-out,
    transform 120ms cubic-bezier(0.23, 1, 0.32, 1);
}
.external-link-card:hover,
.external-link-card--active {
  border-color: var(--brand);
  background: var(--brand-soft);
}
.external-link-card:active {
  transform: scale(0.985);
}
.external-link-card:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
.external-link-card__provider,
.external-link-card__freshness {
  align-self: center;
  color: var(--text-brand);
  font-size: 0.68rem;
  font-weight: 800;
}
.external-link-card__freshness {
  color: var(--text-muted);
  text-align: right;
}
.external-link-card strong {
  min-width: 0;
  overflow-wrap: anywhere;
  font-size: 0.8rem;
}
.external-link-card__summary {
  grid-column: 2 / -1;
  color: var(--text-muted);
  font-size: 0.72rem;
  overflow-wrap: anywhere;
}
.external-link-card dl {
  grid-column: 1 / -1;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 6px 0 0;
  padding-top: 8px;
  border-top: 1px solid color-mix(in srgb, var(--line) 72%, transparent);
}
.external-link-card dt {
  color: var(--text-muted);
  font-size: 0.64rem;
}
.external-link-card dd {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  font-size: 0.72rem;
  font-weight: 700;
}
.external-empty {
  padding: 24px 16px;
  display: grid;
  justify-items: center;
  gap: 7px;
  border: 1px dashed var(--line);
  border-radius: 14px;
  text-align: center;
}
.external-empty__mark {
  width: 34px;
  height: 34px;
  display: grid;
  place-items: center;
  border-radius: 11px;
  background: var(--brand-soft);
  color: var(--brand);
}
.external-empty h4,
.external-empty p {
  margin: 0;
}
.external-empty h4 {
  font-size: 0.84rem;
}
.external-empty p {
  color: var(--text-muted);
  font-size: 0.72rem;
  line-height: 1.45;
}
.external-command-ledger {
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 14px;
}
.external-command-ledger > header {
  padding: 9px 11px;
  display: flex;
  justify-content: space-between;
  gap: 8px;
  background: var(--surface-muted);
}
.external-command-ledger > header span {
  font-size: 0.72rem;
  font-weight: 800;
}
.external-command-ledger > header small {
  color: var(--text-muted);
  font-size: 0.62rem;
}
.external-command-ledger ol {
  margin: 0;
  padding: 0;
  list-style: none;
}
.external-command-ledger li {
  min-width: 0;
  padding: 10px 11px;
  display: grid;
  grid-template-columns: 10px minmax(0, 1fr);
  gap: 8px;
  border-top: 1px solid var(--line);
}
.external-command-ledger li > div:nth-child(2) {
  display: grid;
  gap: 3px;
}
.external-command-ledger strong {
  font-size: 0.72rem;
}
.external-command-ledger span {
  color: var(--text-muted);
  font-size: 0.66rem;
}
.command-dot {
  width: 8px;
  height: 8px;
  margin-top: 4px;
  border-radius: 50%;
  background: var(--brand);
  box-shadow: 0 0 0 4px var(--brand-soft);
}
.command-dot--failed,
.command-dot--unknown {
  background: var(--status-warning-text);
  box-shadow: 0 0 0 4px var(--status-warning-soft);
}
.command-actions {
  grid-column: 2;
}
.external-detail {
  padding-top: 16px;
  border-top: 1px solid var(--line);
  display: grid;
  gap: 14px;
}
.external-detail__header {
  display: flex;
  justify-content: space-between;
  gap: 12px;
}
.external-detail__header h4 {
  margin: 3px 0 0;
  overflow-wrap: anywhere;
  font-size: 0.86rem;
}
.external-open-link {
  min-height: 44px;
  padding: 0 10px;
  display: inline-flex;
  align-items: center;
  border-radius: 9px;
  color: var(--text-brand);
  font-size: 0.72rem;
  font-weight: 700;
  text-decoration: none;
}
.external-open-link:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 2px;
}
.external-timeline {
  display: grid;
  gap: 8px;
  margin: 0;
  padding: 0;
  list-style: none;
}
.external-timeline li {
  padding: 10px 11px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-muted);
}
.external-timeline header {
  display: flex;
  justify-content: space-between;
  gap: 8px;
}
.external-timeline time {
  color: var(--text-muted);
  font-size: 0.64rem;
  font-variant-numeric: tabular-nums;
}
.external-timeline p {
  margin: 8px 0 0;
  overflow-wrap: anywhere;
  color: var(--text-secondary);
  font-size: 0.72rem;
  line-height: 1.45;
  white-space: pre-wrap;
}
.external-comment-composer {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-muted);
}
.audience-switch {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 4px;
  padding: 4px;
  border-radius: 10px;
  background: var(--surface);
}
.audience-switch button {
  min-height: 40px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--text-muted);
  font: inherit;
  font-size: 0.72rem;
  font-weight: 750;
  cursor: pointer;
}
.audience-switch button[aria-pressed="true"] {
  background: var(--brand-soft);
  color: var(--text-brand);
}
.audience-switch button:focus-visible {
  outline: 3px solid var(--focus-ring);
  outline-offset: 1px;
}
.audience-copy {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.68rem;
  line-height: 1.45;
}
.public-confirmation,
.safe-context label,
.boolean-field {
  min-height: 44px;
  display: flex !important;
  align-items: center;
  gap: 9px;
}
.external-form {
  display: grid;
  gap: 14px;
}
.external-form > label {
  display: grid;
  gap: 7px;
  color: var(--text-primary);
  font-size: 0.78rem;
  font-weight: 700;
}
.external-form :deep(.p-inputtext),
.external-form :deep(.p-select),
.external-form :deep(.p-textarea) {
  width: 100%;
}
.safe-context {
  margin: 0;
  padding: 10px 12px;
  display: grid;
  gap: 4px;
  border: 1px solid var(--line);
  border-radius: 12px;
}
.safe-context legend {
  padding: 0 4px;
  color: var(--text-muted);
  font-size: 0.72rem;
  font-weight: 800;
}
.safe-preview {
  padding: 10px 11px;
  display: grid;
  gap: 4px;
  border-radius: 10px;
  background: var(--brand-soft);
  color: var(--text-brand);
  font-size: 0.72rem;
}
.dialog-actions {
  justify-content: flex-end;
  padding-top: 4px;
}
@media (max-width: 560px) {
  .external-case-pane__header,
  .external-detail__header {
    display: grid;
  }
  .external-case-pane__actions,
  .external-detail__actions {
    display: grid;
    grid-template-columns: 1fr;
  }
  .external-case-pane__actions :deep(.p-button),
  .external-detail__actions :deep(.p-button),
  .external-open-link {
    width: 100%;
    justify-content: center;
  }
  .external-link-card {
    grid-template-columns: auto minmax(0, 1fr);
  }
  .external-link-card__freshness {
    grid-column: 1 / -1;
    text-align: left;
  }
  .external-link-card__summary {
    grid-column: 1 / -1;
  }
  .external-link-card dl {
    grid-template-columns: 1fr;
  }
  .external-command-ledger > header {
    display: grid;
  }
  .command-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
  .command-actions :deep(.p-button),
  .dialog-actions :deep(.p-button) {
    width: 100%;
    min-height: 44px;
  }
  .dialog-actions {
    position: sticky;
    bottom: -1px;
    z-index: 1;
    display: grid;
    grid-template-columns: 1fr;
    padding: 10px 0 2px;
    background: var(--surface-card);
  }
}
@media (prefers-reduced-motion: reduce) {
  .external-link-card {
    transition-duration: 1ms;
  }
}
</style>
