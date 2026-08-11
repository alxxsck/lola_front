<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import { useRoute, useRouter } from "vue-router";
import Button from "primevue/button";
import Checkbox from "primevue/checkbox";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import Message from "primevue/message";
import MultiSelect from "primevue/multiselect";
import RadioButton from "primevue/radiobutton";
import Select from "primevue/select";
import Skeleton from "primevue/skeleton";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import { useAuthStore } from "@/features/auth/auth.store";
import { hasProjectPermission } from "@/features/auth/permission-access";
import { supportCaseNotificationPolicySource } from "@/features/support-case-notifications/api/support-case-notification-policy-source";
import {
  policyModeLabel,
  policyStatusLabel,
} from "@/features/support-case-notifications/model/support-case-notification-policy";
import { createSupportCaseNotificationPolicyController } from "@/features/support-case-notifications/model/use-support-case-notification-policy";

const auth = useAuthStore();
const route = useRoute();
const router = useRouter();
const accessDenied = ref(false);
const confirmation = ref<"PUBLISH" | "DISABLE" | "RESTORE" | null>(null);
const restorationRevisionId = ref<string | null>(null);
const permissionSignature = computed(() =>
  [...(auth.project?.effectivePermissionCodes ?? [])].sort().join("\u0000"),
);
const canManage = computed(
  () =>
    !accessDenied.value &&
    hasProjectPermission(
      auth.project?.effectivePermissionCodes ?? [],
      "project.support.notification_policy.manage",
    ),
);

const controller = createSupportCaseNotificationPolicyController(
  {
    actorId: () => auth.user?.id,
    projectId: () => auth.project?.id,
    canManage: () => canManage.value,
    async onForbidden() {
      accessDenied.value = true;
      try {
        await auth.refreshContext();
      } catch {
        /* Protected state is already purged. */
      }
    },
    async onAuthenticationRequired() {
      try {
        await auth.logout();
      } catch {
        /* Local authority is cleared before the request. */
      } finally {
        await router.replace({
          path: "/login",
          query: { redirect: route.fullPath },
        });
      }
    },
  },
  supportCaseNotificationPolicySource,
);

const modeOptions = [
  {
    value: "IMMEDIATE" as const,
    title: "Сразу",
    description: "Отдельное уведомление после каждого подходящего события.",
    icon: "pi pi-bolt",
  },
  {
    value: "DIGEST" as const,
    title: "Сводкой",
    description: "Несколько событий объединяются и приходят по расписанию.",
    icon: "pi pi-list-check",
  },
  {
    value: "OFF" as const,
    title: "Не отправлять",
    description: "Новая версия сохранит политику выключенной.",
    icon: "pi pi-bell-slash",
  },
];
const priorityOptions = [
  { label: "Низкий и выше", value: "LOW" },
  { label: "Обычный и выше", value: "NORMAL" },
  { label: "Высокий и выше", value: "HIGH" },
  { label: "Срочный и выше", value: "URGENT" },
  { label: "Критический", value: "CRITICAL" },
];
const topicOptions = computed(() =>
  (controller.current.value?.allowedTopicCodes ?? []).map((value) => ({
    value,
    label: topicLabel(value),
  })),
);
const teamOptions = computed(() =>
  controller.teams.value.map((team) => ({
    value: team.id,
    label: team.name,
    code: team.code,
  })),
);
const activePolicy = computed(() => controller.current.value?.current ?? null);
const publishDisabledReason = computed(() => {
  if (controller.pending.value)
    return "Сначала проверьте результат предыдущей команды.";
  if (!controller.current.value?.draft) return "Сначала сохраните черновик.";
  if (!controller.draftMatchesForm.value)
    return "После изменений снова сохраните черновик.";
  if (!controller.preview.value)
    return "Сначала выполните предварительную проверку.";
  if (controller.previewStale.value)
    return "После изменений выполните проверку ещё раз.";
  if (!controller.preview.value.publishable)
    return "Исправьте ошибки предварительной проверки.";
  if (!controller.previewMatchesDraft.value)
    return "Проверка должна относиться к сохранённому черновику.";
  return null;
});
const publicationWindowCopy = computed(() => {
  const from = controller.form.value.effectiveFrom
    ? "с " + formatDate(controller.form.value.effectiveFrom)
    : "сразу";
  const until = controller.form.value.effectiveUntil
    ? "до " + formatDate(controller.form.value.effectiveUntil)
    : "без ограничения срока";
  return from + ", " + until;
});
const confirmationTitle = computed(() =>
  confirmation.value === "PUBLISH"
    ? "Опубликовать политику?"
    : confirmation.value === "RESTORE"
      ? "Восстановить эту версию?"
      : "Выключить политику?",
);
const confirmationCopy = computed(() => {
  if (confirmation.value === "PUBLISH")
    return `Период действия: ${publicationWindowCopy.value}. Уведомления получат только сотрудники с личной подпиской и подключённым браузером.`;
  if (confirmation.value === "RESTORE")
    return `Сервер создаст новую версию на основе выбранной. Причина: ${controller.form.value.reason.trim()}.`;
  return "Новые уведомления перестанут создаваться. Уже отправленные уведомления останутся в браузерах сотрудников.";
});

function topicLabel(value: string): string {
  return (
    (
      {
        PAYMENTS: "Платежи",
        ACCOUNT_ACCESS: "Доступ к аккаунту",
        PRODUCT_USAGE: "Использование продукта",
      } as Record<string, string>
    )[value] ?? value.replaceAll("_", " ").toLocaleLowerCase("ru-RU")
  );
}
function priorityLabel(value: string): string {
  return (
    (
      {
        LOW: "Низкий",
        NORMAL: "Обычный",
        HIGH: "Высокий",
        URGENT: "Срочный",
        CRITICAL: "Критический",
      } as Record<string, string>
    )[value] ?? "Неизвестный"
  );
}
function occurrenceLabel(value: string): string {
  return value === "CREATED"
    ? "Создание"
    : value === "REOPENED"
      ? "Повторное открытие"
      : "Неизвестное событие";
}
function classLabel(value: string): string {
  return value === "PRODUCT_PROBLEM"
    ? "Проблема с продуктом"
    : value === "PRODUCT_INQUIRY"
      ? "Вопрос о продукте"
      : "Неизвестный тип";
}
function issueMessage(code: string): string {
  return (
    (
      {
        INVALID_WINDOW: "Проверьте начало и окончание периода.",
        TEAM_REQUIRED: "Выберите хотя бы одну команду.",
        TEAM_NOT_ALLOWED: "Одна из команд больше недоступна.",
        TEAM_NOT_FOUND: "Одна из команд не найдена.",
        TOPIC_NOT_ALLOWED: "Одна из тем больше недоступна.",
        DIGEST_CONFIG_INVALID: "Проверьте интервал и размер сводки.",
        CHANNEL_UNAVAILABLE: "Доставка через браузер сейчас недоступна.",
        OFF_POLICY_HAS_SCOPE:
          "У выключенной политики не должно быть дополнительных условий.",
      } as Record<string, string>
    )[code] ?? "Сервер не может применить одно из условий."
  );
}
function formatNumber(value: number): string {
  return new Intl.NumberFormat("ru-RU").format(value);
}
function formatDate(value: string | null | undefined): string {
  if (!value) return "Без ограничения";
  return new Intl.DateTimeFormat("ru-RU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}
function localDate(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}
function setDate(
  field: "effectiveFrom" | "effectiveUntil",
  value: string,
): void {
  controller.form.value[field] = value ? new Date(value).toISOString() : null;
}
function chooseMode(value: "OFF" | "IMMEDIATE" | "DIGEST"): void {
  controller.form.value.mode = value;
  if (value === "OFF") {
    Object.assign(controller.form.value, {
      topicCodes: [],
      teamIds: [],
      effectiveFrom: null,
      effectiveUntil: null,
      digestWindowMinutes: null,
      digestMaxItems: null,
    });
  } else if (value === "DIGEST") {
    controller.form.value.digestWindowMinutes ??= 60;
    controller.form.value.digestMaxItems ??= 25;
  } else {
    controller.form.value.digestWindowMinutes = null;
    controller.form.value.digestMaxItems = null;
  }
}
async function confirmCommand(): Promise<void> {
  const value = confirmation.value;
  confirmation.value = null;
  if (value === "PUBLISH") await controller.publish();
  if (value === "DISABLE") await controller.disable();
  if (value === "RESTORE" && restorationRevisionId.value)
    await controller.restore(restorationRevisionId.value);
  restorationRevisionId.value = null;
}
function focusIssue(path: string): void {
  document
    .querySelector<HTMLElement>(
      `[data-field="${CSS.escape(path)}"] input, [data-field="${CSS.escape(path)}"] textarea, [data-field="${CSS.escape(path)}"] button`,
    )
    ?.focus();
}

watch(
  () => [auth.user?.id, auth.project?.id, permissionSignature.value] as const,
  () => {
    accessDenied.value = false;
    if (canManage.value) void controller.load();
    else controller.reset({ forgetPending: true });
  },
  { immediate: true, flush: "sync" },
);
watch(controller.form, controller.markPreviewStale, { deep: true });
onBeforeUnmount(() => controller.reset());
</script>

<template>
  <section class="page notification-policy-page">
    <header class="policy-header">
      <div>
        <a href="/support/settings/notifications" class="back-link"
          ><i class="pi pi-arrow-left" /> Уведомления поддержки</a
        >
        <div class="eyebrow">
          <i class="pi pi-megaphone" /> Настройки проекта
        </div>
        <h1>Уведомления о новых обращениях</h1>
        <p>
          Определите, о каких новых и повторно открытых обращениях сообщать
          сотрудникам поддержки.
        </p>
      </div>
      <Button
        label="Перечитать"
        icon="pi pi-refresh"
        severity="secondary"
        outlined
        :loading="controller.loading.value"
        :disabled="controller.mutating.value"
        @click="controller.load"
      />
    </header>

    <Message v-if="!canManage" severity="warn" :closable="false"
      >У вас нет права на изменение политики уведомлений этого проекта.</Message
    >
    <Message v-if="controller.error.value" severity="error" :closable="false">{{
      controller.error.value
    }}</Message>
    <Message
      v-if="controller.success.value"
      severity="success"
      :closable="false"
      >{{ controller.success.value }}</Message
    >
    <Message v-if="controller.pending.value" severity="warn" :closable="false">
      <div class="pending-message">
        <span
          >Результат предыдущей команды пока неизвестен. Не создавайте новую
          команду.</span
        >
        <div class="pending-actions">
          <Button
            label="Проверить результат"
            icon="pi pi-search"
            size="small"
            outlined
            :disabled="controller.mutating.value"
            @click="controller.retryReconciliation"
          />
          <Button
            label="Повторить ту же команду"
            icon="pi pi-replay"
            size="small"
            :disabled="controller.mutating.value"
            @click="controller.replayPendingCommand"
          />
        </div>
      </div>
    </Message>

    <template v-if="controller.loading.value && !controller.current.value">
      <div class="policy-skeleton">
        <Skeleton height="128px" border-radius="18px" /><Skeleton
          height="540px"
          border-radius="18px"
        /><Skeleton height="540px" border-radius="18px" />
      </div>
    </template>

    <template v-else-if="controller.current.value">
      <section class="status-strip" aria-label="Текущее состояние политики">
        <div class="status-primary">
          <span
            :class="[
              'status-dot',
              controller.current.value.effectiveStatus.toLowerCase(),
            ]"
          />
          <div>
            <small>Сейчас</small
            ><strong>{{
              policyStatusLabel(controller.current.value.effectiveStatus)
            }}</strong>
          </div>
        </div>
        <div>
          <small>Способ доставки</small
          ><strong>{{
            activePolicy ? policyModeLabel(activePolicy.mode) : "Не настроен"
          }}</strong>
        </div>
        <div>
          <small>Срок</small
          ><strong>{{
            activePolicy?.effectiveUntil
              ? `до ${formatDate(activePolicy.effectiveUntil)}`
              : "Постоянно"
          }}</strong>
        </div>
        <div>
          <small>Личная доставка</small
          ><strong>Зависит от подписки и браузера</strong>
        </div>
      </section>

      <div class="editor-layout">
        <main class="policy-form" aria-label="Редактор политики">
          <section class="form-section" data-field="mode">
            <div class="section-heading">
              <div>
                <span>1</span>
                <div>
                  <h2>Как отправлять</h2>
                  <p>
                    Выберите скорость доставки. Это не включает личные подписки
                    сотрудников.
                  </p>
                </div>
              </div>
            </div>
            <div class="mode-grid">
              <label
                v-for="option in modeOptions"
                :key="option.value"
                :class="[
                  'mode-card',
                  { selected: controller.form.value.mode === option.value },
                ]"
              >
                <RadioButton
                  :model-value="controller.form.value.mode"
                  :value="option.value"
                  name="notification-mode"
                  @update:model-value="chooseMode(option.value)"
                />
                <i :class="option.icon" /><span
                  ><strong>{{ option.title }}</strong
                  ><small>{{ option.description }}</small></span
                >
              </label>
            </div>
          </section>

          <template v-if="controller.form.value.mode !== 'OFF'">
            <section class="form-section">
              <div class="section-heading">
                <div>
                  <span>2</span>
                  <div>
                    <h2>Какие обращения учитывать</h2>
                    <p>
                      Обычное сообщение внутри обращения не создаёт повторное
                      уведомление.
                    </p>
                  </div>
                </div>
              </div>
              <div class="field-grid">
                <fieldset data-field="occurrences">
                  <legend>Событие</legend>
                  <label class="check-row"
                    ><Checkbox
                      v-model="controller.form.value.occurrences"
                      value="CREATED"
                    /><span
                      ><strong>Создано обращение</strong
                      ><small
                        >Первое появление принятого обращения.</small
                      ></span
                    ></label
                  ><label class="check-row"
                    ><Checkbox
                      v-model="controller.form.value.occurrences"
                      value="REOPENED"
                    /><span
                      ><strong>Обращение открыто повторно</strong
                      ><small
                        >Закрытое обращение снова требует работы.</small
                      ></span
                    ></label
                  >
                </fieldset>
                <fieldset data-field="conversationClasses">
                  <legend>Тип обращения</legend>
                  <label class="check-row"
                    ><Checkbox
                      v-model="controller.form.value.conversationClasses"
                      value="PRODUCT_PROBLEM"
                    /><span
                      ><strong>Проблема с продуктом</strong
                      ><small
                        >Ошибка, сбой или невозможность выполнить
                        действие.</small
                      ></span
                    ></label
                  ><label class="check-row"
                    ><Checkbox
                      v-model="controller.form.value.conversationClasses"
                      value="PRODUCT_INQUIRY"
                    /><span
                      ><strong>Вопрос о продукте</strong
                      ><small
                        >Запрос информации или помощи в использовании.</small
                      ></span
                    ></label
                  >
                </fieldset>
              </div>
              <div class="control-grid">
                <label data-field="topicCodes"
                  ><span>Темы обращения</span
                  ><MultiSelect
                    v-model="controller.form.value.topicCodes"
                    :options="topicOptions"
                    option-label="label"
                    option-value="value"
                    placeholder="Все темы"
                    display="chip"
                    :max-selected-labels="3"
                  /><small
                    >Оставьте пустым, чтобы учитывать все разрешённые
                    темы.</small
                  ></label
                >
                <label data-field="minimumPriority"
                  ><span>Минимальный приоритет</span
                  ><Select
                    v-model="controller.form.value.minimumPriority"
                    :options="priorityOptions"
                    option-label="label"
                    option-value="value"
                  /><small
                    >Обращения с более высоким приоритетом тоже попадут в
                    выборку.</small
                  ></label
                >
              </div>
            </section>

            <section class="form-section">
              <div class="section-heading">
                <div>
                  <span>3</span>
                  <div>
                    <h2>Кому отправлять</h2>
                    <p>
                      Уведомление получат только сотрудники с личной подпиской и
                      подключённым браузером.
                    </p>
                  </div>
                </div>
              </div>
              <div class="recipient-grid" data-field="recipientRule">
                <label
                  :class="[
                    'recipient-card',
                    {
                      selected:
                        controller.form.value.recipientRule ===
                        'ALL_ELIGIBLE_SUBSCRIBERS',
                    },
                  ]"
                  ><RadioButton
                    v-model="controller.form.value.recipientRule"
                    value="ALL_ELIGIBLE_SUBSCRIBERS"
                    name="recipient-rule"
                  /><span
                    ><strong>Всем подходящим подписчикам</strong
                    ><small
                      >В проекте, у кого есть доступ к обращению.</small
                    ></span
                  ></label
                >
                <label
                  :class="[
                    'recipient-card',
                    {
                      selected:
                        controller.form.value.recipientRule ===
                        'TEAM_SUBSCRIBERS',
                    },
                  ]"
                  ><RadioButton
                    v-model="controller.form.value.recipientRule"
                    value="TEAM_SUBSCRIBERS"
                    name="recipient-rule"
                  /><span
                    ><strong>Только выбранным командам</strong
                    ><small
                      >Личные подписки остаются обязательными.</small
                    ></span
                  ></label
                >
              </div>
              <label
                v-if="
                  controller.form.value.recipientRule === 'TEAM_SUBSCRIBERS'
                "
                class="full-control"
                data-field="teamIds"
                ><span>Команды</span
                ><MultiSelect
                  v-model="controller.form.value.teamIds"
                  :options="teamOptions"
                  option-label="label"
                  option-value="value"
                  placeholder="Выберите команды"
                  display="chip"
                /><small
                  >Список ограничен командами, доступными для этой политики.
                  Дополнительного права на управление командами не
                  требуется.</small
                ></label
              >
            </section>

            <section class="form-section">
              <div class="section-heading">
                <div>
                  <span>4</span>
                  <div>
                    <h2>Когда политика действует</h2>
                    <p>
                      Можно включить её постоянно, запланировать начало или
                      заранее задать окончание.
                    </p>
                  </div>
                </div>
              </div>
              <div class="control-grid time-grid">
                <label data-field="effectiveFrom"
                  ><span>Начало</span
                  ><input
                    type="datetime-local"
                    :value="localDate(controller.form.value.effectiveFrom)"
                    @input="
                      setDate(
                        'effectiveFrom',
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  /><small>Пусто — сразу после публикации.</small></label
                >
                <label data-field="effectiveUntil"
                  ><span>Окончание</span
                  ><input
                    type="datetime-local"
                    :value="localDate(controller.form.value.effectiveUntil)"
                    @input="
                      setDate(
                        'effectiveUntil',
                        ($event.target as HTMLInputElement).value,
                      )
                    "
                  /><small>Пусто — без ограничения срока.</small></label
                >
              </div>
              <div
                v-if="controller.form.value.mode === 'DIGEST'"
                class="control-grid digest-grid"
              >
                <label data-field="digestWindowMinutes"
                  ><span>Интервал сводки, минут</span
                  ><InputNumber
                    v-model="controller.form.value.digestWindowMinutes"
                    :min="5"
                    :max="1440"
                    :use-grouping="false"
                  /><small>От 5 минут до 24 часов.</small></label
                >
                <label data-field="digestMaxItems"
                  ><span>Обращений в одной сводке</span
                  ><InputNumber
                    v-model="controller.form.value.digestMaxItems"
                    :min="1"
                    :max="100"
                    :use-grouping="false"
                  /><small
                    >Лишние обращения попадут в следующую сводку.</small
                  ></label
                >
              </div>
            </section>
          </template>

          <section class="form-section reason-section" data-field="reason">
            <div class="section-heading">
              <div>
                <span>5</span>
                <div>
                  <h2>Почему меняется политика</h2>
                  <p>
                    Причина попадёт в журнал решений и поможет восстановить
                    контекст.
                  </p>
                </div>
              </div>
            </div>
            <Textarea
              v-model="controller.form.value.reason"
              rows="3"
              maxlength="500"
              auto-resize
              aria-label="Причина изменения"
            />
            <small class="character-count"
              >{{ controller.form.value.reason.length }}/500</small
            >
          </section>

          <section
            v-if="controller.formIssues.value.length"
            class="issue-summary"
            aria-labelledby="issue-title"
            role="alert"
          >
            <div>
              <i class="pi pi-exclamation-triangle" />
              <div>
                <strong id="issue-title"
                  >Нужно исправить:
                  {{ controller.formIssues.value.length }}</strong
                ><span>Перейдите к полю и проверьте значение.</span>
              </div>
            </div>
            <button
              v-for="issue in controller.formIssues.value"
              :key="`${issue.path}:${issue.message}`"
              type="button"
              @click="focusIssue(issue.path)"
            >
              {{ issue.message }} <i class="pi pi-arrow-up-right" />
            </button>
          </section>

          <footer class="form-actions">
            <div>
              <Button
                label="Сохранить черновик"
                icon="pi pi-save"
                severity="secondary"
                outlined
                :loading="controller.mutating.value"
                :disabled="!controller.canSubmit.value"
                @click="controller.saveDraft"
              /><small>Сохранение не включает доставку.</small>
            </div>
            <div class="primary-actions">
              <Button
                label="Проверить влияние"
                icon="pi pi-chart-bar"
                outlined
                :loading="controller.previewing.value"
                :disabled="
                  controller.formIssues.value.length > 0 ||
                  controller.mutating.value ||
                  Boolean(controller.pending.value)
                "
                @click="controller.runPreview"
              /><Button
                label="Опубликовать"
                icon="pi pi-check"
                :disabled="
                  Boolean(publishDisabledReason) || controller.mutating.value
                "
                @click="confirmation = 'PUBLISH'"
              />
            </div>
          </footer>
          <p v-if="publishDisabledReason" class="publish-hint">
            {{ publishDisabledReason }}
          </p>
        </main>

        <aside class="preview-panel" aria-labelledby="preview-title">
          <div class="preview-heading">
            <div>
              <span class="section-kicker">Предварительная проверка</span>
              <h2 id="preview-title">Что изменится</h2>
            </div>
            <Tag
              v-if="controller.previewStale.value"
              value="Нужно обновить"
              severity="warn"
            />
          </div>
          <div v-if="controller.previewing.value" class="preview-loading">
            <Skeleton height="72px" /><Skeleton height="150px" /><Skeleton
              height="210px"
            />
          </div>
          <div v-else-if="!controller.preview.value" class="preview-empty">
            <span class="preview-icon"><i class="pi pi-chart-line" /></span
            ><strong>Проверьте влияние до публикации</strong>
            <p>
              Сервер рассчитает объём за последние 7 дней и покажет до пяти
              обезличенных примеров.
            </p>
            <Button
              label="Проверить влияние"
              icon="pi pi-play"
              :disabled="controller.formIssues.value.length > 0"
              @click="controller.runPreview"
            />
          </div>
          <div
            v-else
            :class="[
              'preview-content',
              { stale: controller.previewStale.value },
            ]"
          >
            <Message
              v-if="controller.previewStale.value"
              severity="warn"
              :closable="false"
              >Форма изменилась. Эти числа больше не относятся к текущим
              условиям.</Message
            >
            <div class="impact-metrics">
              <div>
                <strong>{{
                  formatNumber(
                    controller.preview.value.matchingOccurrencesLast7Days,
                  )
                }}</strong
                ><span>событий</span>
              </div>
              <div>
                <strong>{{
                  formatNumber(
                    controller.preview.value.estimatedEligibleRecipients,
                  )
                }}</strong
                ><span>получателей</span>
              </div>
              <div class="impact-result">
                <strong>{{
                  formatNumber(
                    controller.form.value.mode === "DIGEST"
                      ? controller.preview.value.estimatedDigestWindowsLast7Days
                      : controller.preview.value
                          .estimatedImmediateDeliveriesLast7Days,
                  )
                }}</strong
                ><span>{{
                  controller.form.value.mode === "DIGEST"
                    ? "сводок"
                    : "доставок"
                }}</span>
              </div>
            </div>
            <p class="estimate-note">
              Оценка по данным проекта за последние 7 дней. Фактическая доставка
              зависит от личной подписки, доступа и подключённого браузера.
            </p>
            <div class="effective-window" role="note">
              <i class="pi pi-calendar" />
              <span>
                <strong>Период действия</strong>
                {{ publicationWindowCopy }}
              </span>
            </div>
            <div
              v-if="controller.preview.value.issues.length"
              class="server-issues"
            >
              <strong>Сервер нашёл ограничения</strong
              ><button
                v-for="issue in controller.preview.value.issues"
                :key="`${issue.code}:${issue.path}`"
                type="button"
                @click="focusIssue(issue.path)"
              >
                {{ issueMessage(issue.code) }}
              </button>
            </div>
            <section class="example-section">
              <div>
                <h3>Безопасные примеры</h3>
                <span>{{ controller.preview.value.examples.length }} из 5</span>
              </div>
              <ul v-if="controller.preview.value.examples.length">
                <li
                  v-for="(example, index) in controller.preview.value.examples"
                  :key="`${example.occurredAt}:${index}`"
                >
                  <span class="example-number">{{ index + 1 }}</span>
                  <div>
                    <strong>{{ topicLabel(example.topicCode) }}</strong
                    ><small
                      >{{ occurrenceLabel(example.occurrence) }} ·
                      {{ classLabel(example.conversationClass) }} ·
                      {{ priorityLabel(example.priority) }}</small
                    >
                  </div>
                  <time>{{ formatDate(example.occurredAt) }}</time>
                </li>
              </ul>
              <p v-else>За выбранный период подходящих примеров нет.</p>
              <small class="privacy-note"
                ><i class="pi pi-shield" /> Здесь нет номера обращения,
                заголовка, текста сообщения или личных данных.</small
              >
            </section>
          </div>

          <section v-if="controller.metrics.value" class="metrics-section">
            <h3>Фактическая доставка за период</h3>
            <small class="metrics-window">
              {{ formatDate(controller.metrics.value.from) }} —
              {{ formatDate(controller.metrics.value.to) }}
            </small>
            <dl>
              <div>
                <dt>Принято событий</dt>
                <dd>
                  {{
                    formatNumber(controller.metrics.value.admittedOccurrences)
                  }}
                </dd>
              </div>
              <div>
                <dt>Доставлено</dt>
                <dd>{{ formatNumber(controller.metrics.value.deliveries) }}</dd>
              </div>
              <div>
                <dt>Подписаны</dt>
                <dd>
                  {{
                    formatNumber(controller.metrics.value.subscribedRecipients)
                  }}
                  из
                  {{
                    formatNumber(controller.metrics.value.eligibleRecipients)
                  }}
                </dd>
              </div>
              <div>
                <dt>Ошибок доставки</dt>
                <dd>{{ formatNumber(controller.metrics.value.failures) }}</dd>
              </div>
            </dl>
          </section>

          <section
            v-if="
              controller.current.value.current &&
              ['ACTIVE', 'SCHEDULED'].includes(
                controller.current.value.effectiveStatus,
              )
            "
            class="danger-zone"
          >
            <div>
              <strong>Выключить действующую политику</strong>
              <p>
                Новые уведомления перестанут создаваться. Личные подписки и
                браузеры сотрудников не изменятся.
              </p>
            </div>
            <Button
              label="Выключить"
              icon="pi pi-pause"
              severity="danger"
              outlined
              :disabled="
                controller.mutating.value || Boolean(controller.pending.value)
              "
              @click="confirmation = 'DISABLE'"
            />
          </section>

          <section
            v-if="controller.current.value.restorableRevisions.length"
            class="history-section"
          >
            <h3>Предыдущие версии</h3>
            <div
              v-for="revision in controller.current.value.restorableRevisions"
              :key="revision.id"
            >
              <span
                ><strong>Версия {{ revision.revisionNumber }}</strong
                ><small
                  >{{ policyModeLabel(revision.mode) }} ·
                  {{ formatDate(revision.publishedAt) }}</small
                ></span
              ><Button
                label="Восстановить"
                text
                size="small"
                :disabled="
                  controller.mutating.value || Boolean(controller.pending.value)
                "
                @click="
                  restorationRevisionId = revision.id;
                  confirmation = 'RESTORE';
                "
              />
            </div>
          </section>
        </aside>
      </div>
    </template>

    <Dialog
      :visible="Boolean(confirmation)"
      modal
      :header="confirmationTitle"
      :style="{ width: 'min(520px,calc(100vw - 28px))' }"
      @update:visible="
        (value) => {
          if (!value) {
            confirmation = null;
            restorationRevisionId = null;
          }
        }
      "
    >
      <p>{{ confirmationCopy }}</p>
      <template #footer
        ><Button
          label="Отмена"
          severity="secondary"
          text
          @click="confirmation = null" /><Button
          :label="
            confirmation === 'PUBLISH'
              ? 'Опубликовать'
              : confirmation === 'RESTORE'
                ? 'Восстановить'
                : 'Выключить'
          "
          :severity="confirmation === 'DISABLE' ? 'danger' : undefined"
          @click="confirmCommand"
      /></template>
    </Dialog>
  </section>
</template>

<style scoped>
.notification-policy-page {
  --policy-accent: var(--brand);
  width: min(1460px, calc(100% - 48px));
  margin: 0 auto;
  padding-bottom: 72px;
}
.policy-header {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 24px;
  padding: 26px 0 20px;
}
.policy-header > div {
  min-width: 0;
}
.back-link {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  margin-bottom: 18px;
  color: var(--text-secondary);
  font-size: 0.7rem;
  font-weight: 700;
  text-decoration: none;
}
.policy-header h1 {
  margin: 5px 0 7px;
  font-size: clamp(1.8rem, 3vw, 2.65rem);
  letter-spacing: -0.04em;
}
.policy-header p {
  max-width: 760px;
  margin: 0;
  color: var(--text-secondary);
  font-size: 0.78rem;
  line-height: 1.55;
}
.pending-message {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
}
.pending-actions {
  display: flex;
  flex: 0 0 auto;
  gap: 8px;
}
.policy-skeleton {
  display: grid;
  gap: 16px;
}
.status-strip {
  display: grid;
  grid-template-columns: 1.15fr repeat(3, 1fr);
  margin-bottom: 16px;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: var(--surface-card);
  box-shadow: var(--shadow-sm);
}
.status-strip > div {
  display: grid;
  align-content: center;
  gap: 4px;
  min-height: 76px;
  padding: 14px 18px;
  border-left: 1px solid var(--line);
}
.status-strip > div:first-child {
  border-left: 0;
}
.status-strip small {
  color: var(--text-muted);
  font-size: 0.61rem;
}
.status-strip strong {
  font-size: 0.75rem;
}
.status-primary {
  grid-template-columns: auto 1fr;
  align-items: center !important;
}
.status-primary > div {
  display: grid;
  gap: 4px;
}
.status-dot {
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--text-muted);
  box-shadow: 0 0 0 5px color-mix(in srgb, var(--text-muted) 12%, transparent);
}
.status-dot.active {
  background: var(--status-success);
  box-shadow: 0 0 0 5px
    color-mix(in srgb, var(--status-success) 14%, transparent);
}
.status-dot.scheduled {
  background: var(--status-info);
}
.status-dot.expired {
  background: var(--status-warning);
}
.editor-layout {
  display: grid;
  grid-template-columns: minmax(0, 7fr) minmax(360px, 5fr);
  align-items: start;
  gap: 16px;
}
.policy-form {
  display: grid;
  gap: 14px;
}
.form-section,
.preview-panel {
  border: 1px solid var(--line);
  border-radius: 18px;
  background: var(--surface-card);
  box-shadow: var(--shadow-sm);
}
.form-section {
  padding: 21px;
}
.section-heading {
  margin-bottom: 17px;
}
.section-heading > div {
  display: flex;
  align-items: flex-start;
  gap: 12px;
}
.section-heading > div > span {
  display: grid;
  flex: 0 0 30px;
  height: 30px;
  place-items: center;
  border-radius: 10px;
  background: var(--brand-soft);
  color: var(--text-brand);
  font-size: 0.68rem;
  font-weight: 900;
}
.section-heading h2,
.preview-heading h2 {
  margin: 1px 0 4px;
  font-size: 1rem;
}
.section-heading p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.69rem;
  line-height: 1.45;
}
.mode-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}
.mode-card,
.recipient-card {
  display: grid;
  grid-template-columns: auto auto 1fr;
  align-items: start;
  gap: 10px;
  min-height: 112px;
  padding: 15px;
  border: 1px solid var(--line);
  border-radius: 14px;
  cursor: pointer;
  transition:
    border-color 0.18s ease,
    background 0.18s ease,
    transform 0.18s ease;
}
.mode-card:hover,
.recipient-card:hover {
  transform: translateY(-1px);
  border-color: var(--line-strong);
}
.mode-card.selected,
.recipient-card.selected {
  border-color: color-mix(in srgb, var(--brand) 55%, var(--line));
  background: color-mix(in srgb, var(--brand-soft) 38%, var(--surface-card));
}
.mode-card > i {
  display: grid;
  width: 30px;
  height: 30px;
  place-items: center;
  border-radius: 10px;
  background: var(--surface-subtle);
  color: var(--text-brand);
}
.mode-card span,
.recipient-card span,
.check-row span {
  display: grid;
  gap: 5px;
}
.mode-card strong,
.recipient-card strong,
.check-row strong {
  font-size: 0.73rem;
}
.mode-card small,
.recipient-card small,
.check-row small {
  color: var(--text-muted);
  font-size: 0.63rem;
  line-height: 1.45;
}
.field-grid,
.control-grid,
.recipient-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}
.field-grid fieldset {
  display: grid;
  align-content: start;
  gap: 8px;
  margin: 0;
  padding: 13px;
  border: 1px solid var(--line);
  border-radius: 14px;
}
.field-grid legend {
  padding: 0 6px;
  font-size: 0.68rem;
  font-weight: 800;
}
.check-row {
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: start;
  gap: 9px;
  padding: 8px;
  border-radius: 10px;
  cursor: pointer;
}
.check-row:hover {
  background: var(--surface-subtle);
}
.control-grid,
.recipient-grid,
.full-control {
  margin-top: 13px;
}
.control-grid label,
.full-control {
  display: grid;
  align-content: start;
  gap: 7px;
}
.control-grid label > span,
.full-control > span {
  font-size: 0.68rem;
  font-weight: 800;
}
.control-grid label > small,
.full-control > small {
  min-height: 32px;
  color: var(--text-muted);
  font-size: 0.62rem;
  line-height: 1.4;
}
.control-grid :deep(.p-select),
.control-grid :deep(.p-multiselect),
.control-grid :deep(.p-inputnumber),
.full-control :deep(.p-multiselect) {
  width: 100%;
  min-height: 44px;
}
.recipient-card {
  grid-template-columns: auto 1fr;
  min-height: 90px;
}
.time-grid input {
  width: 100%;
  min-height: 44px;
  padding: 0 12px;
  border: 1px solid var(--line-strong);
  border-radius: 10px;
  background: var(--surface-card);
  color: var(--text-primary);
  font: inherit;
}
.reason-section :deep(textarea) {
  width: 100%;
  resize: vertical;
}
.character-count {
  display: block;
  margin-top: 5px;
  color: var(--text-muted);
  font-size: 0.6rem;
  text-align: right;
}
.issue-summary {
  display: grid;
  gap: 8px;
  padding: 14px;
  border: 1px solid color-mix(in srgb, var(--status-danger) 30%, var(--line));
  border-radius: 14px;
  background: var(--status-danger-soft);
}
.issue-summary > div {
  display: flex;
  gap: 9px;
}
.issue-summary > div > div {
  display: grid;
  gap: 3px;
}
.issue-summary strong {
  font-size: 0.72rem;
}
.issue-summary span {
  font-size: 0.62rem;
}
.issue-summary button,
.server-issues button {
  display: flex;
  justify-content: space-between;
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: 8px;
  background: transparent;
  color: var(--status-danger-text);
  font: 600 0.65rem/1.4 inherit;
  text-align: left;
  cursor: pointer;
}
.issue-summary button:hover,
.server-issues button:hover {
  background: color-mix(in srgb, var(--status-danger) 10%, transparent);
}
.form-actions {
  position: sticky;
  bottom: 10px;
  z-index: 3;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 16px;
  background: color-mix(in srgb, var(--surface-card) 92%, transparent);
  box-shadow: var(--shadow-md);
  backdrop-filter: blur(16px);
}
.form-actions > div:first-child {
  display: grid;
  gap: 3px;
}
.form-actions small,
.publish-hint {
  color: var(--text-muted);
  font-size: 0.6rem;
}
.primary-actions {
  display: flex;
  gap: 9px;
}
.publish-hint {
  margin: -6px 4px 0;
  text-align: right;
}
.preview-panel {
  position: sticky;
  top: 14px;
  display: grid;
  gap: 15px;
  padding: 20px;
  max-height: calc(100vh - 28px);
  overflow: auto;
}
.preview-heading {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}
.section-kicker {
  color: var(--text-muted);
  font-size: 0.59rem;
  font-weight: 900;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}
.preview-loading {
  display: grid;
  gap: 10px;
}
.preview-empty {
  display: grid;
  justify-items: center;
  gap: 9px;
  padding: 32px 20px;
  border: 1px dashed var(--line-strong);
  border-radius: 15px;
  text-align: center;
}
.preview-icon {
  display: grid;
  width: 48px;
  height: 48px;
  place-items: center;
  border-radius: 15px;
  background: var(--brand-soft);
  color: var(--text-brand);
  font-size: 1rem;
}
.preview-empty strong {
  font-size: 0.78rem;
}
.preview-empty p {
  max-width: 340px;
  margin: 0 0 6px;
  color: var(--text-muted);
  font-size: 0.68rem;
  line-height: 1.5;
}
.preview-content {
  display: grid;
  gap: 13px;
  transition: opacity 0.18s ease;
}
.preview-content.stale {
  opacity: 0.66;
}
.impact-metrics {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  align-items: center;
  gap: 7px;
}
.impact-metrics > div {
  display: grid;
  justify-items: center;
  gap: 3px;
  padding: 12px 7px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface-subtle);
}
.impact-metrics strong {
  font-size: 1rem;
}
.impact-metrics span {
  color: var(--text-muted);
  font-size: 0.58rem;
}
.impact-result {
  border-color: color-mix(in srgb, var(--brand) 35%, var(--line)) !important;
  background: color-mix(
    in srgb,
    var(--brand-soft) 35%,
    var(--surface-card)
  ) !important;
}
.estimate-note,
.example-section > p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.62rem;
  line-height: 1.5;
}
.effective-window {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 11px;
  background: var(--surface-subtle);
  color: var(--text-secondary);
  font-size: 0.61rem;
  line-height: 1.45;
}
.effective-window strong {
  display: block;
  color: var(--text-primary);
}
.server-issues {
  padding: 12px;
  border-radius: 12px;
  background: var(--status-danger-soft);
}
.server-issues > strong {
  font-size: 0.68rem;
}
.example-section,
.metrics-section,
.danger-zone,
.history-section {
  padding-top: 14px;
  border-top: 1px solid var(--line);
}
.example-section > div,
.history-section > div,
.danger-zone {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}
.example-section h3,
.metrics-section h3,
.history-section h3 {
  margin: 0;
  font-size: 0.76rem;
}
.metrics-window {
  display: block;
  margin-top: 3px;
  color: var(--text-muted);
  font-size: 0.58rem;
}
.example-section > div > span {
  color: var(--text-muted);
  font-size: 0.6rem;
}
.example-section ul {
  display: grid;
  gap: 6px;
  margin: 10px 0;
  padding: 0;
  list-style: none;
}
.example-section li {
  display: grid;
  grid-template-columns: auto 1fr auto;
  align-items: center;
  gap: 9px;
  padding: 9px;
  border-radius: 11px;
  background: var(--surface-subtle);
}
.example-number {
  display: grid;
  width: 25px;
  height: 25px;
  place-items: center;
  border-radius: 8px;
  background: var(--surface-card);
  font-size: 0.6rem;
  font-weight: 800;
}
.example-section li > div {
  display: grid;
  gap: 3px;
}
.example-section li strong {
  font-size: 0.65rem;
}
.example-section li small,
.example-section time {
  color: var(--text-muted);
  font-size: 0.56rem;
}
.privacy-note {
  display: flex;
  align-items: flex-start;
  gap: 6px;
  color: var(--status-info-text);
  font-size: 0.59rem;
  line-height: 1.4;
}
.metrics-section dl {
  display: grid;
  grid-template-columns: repeat(2, 1fr);
  gap: 1px;
  margin: 10px 0 0;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--line);
}
.metrics-section dl > div {
  display: grid;
  gap: 3px;
  padding: 10px;
  background: var(--surface-card);
}
.metrics-section dt {
  color: var(--text-muted);
  font-size: 0.57rem;
}
.metrics-section dd {
  margin: 0;
  font-size: 0.72rem;
  font-weight: 800;
}
.danger-zone > div {
  display: grid;
  gap: 3px;
}
.danger-zone strong {
  font-size: 0.7rem;
}
.danger-zone p {
  margin: 0;
  color: var(--text-muted);
  font-size: 0.6rem;
  line-height: 1.4;
}
.history-section {
  display: grid;
  gap: 9px;
}
.history-section > div {
  padding: 8px;
  border-radius: 10px;
  background: var(--surface-subtle);
}
.history-section > div > span {
  display: grid;
  gap: 2px;
}
.history-section strong {
  font-size: 0.64rem;
}
.history-section small {
  color: var(--text-muted);
  font-size: 0.56rem;
}
@media (max-width: 1100px) {
  .editor-layout {
    grid-template-columns: 1fr;
  }
  .preview-panel {
    position: static;
    max-height: none;
  }
  .form-actions {
    position: static;
  }
  .status-strip {
    grid-template-columns: repeat(2, 1fr);
  }
  .status-strip > div:nth-child(3) {
    border-left: 0;
    border-top: 1px solid var(--line);
  }
  .status-strip > div:nth-child(4) {
    border-top: 1px solid var(--line);
  }
}
@media (max-width: 720px) {
  .notification-policy-page {
    width: auto;
    padding-inline: 14px;
  }
  .policy-header {
    align-items: flex-start;
    flex-direction: column;
  }
  .policy-header :deep(.p-button) {
    width: 100%;
    justify-content: center;
  }
  .status-strip,
  .mode-grid,
  .field-grid,
  .control-grid,
  .recipient-grid {
    grid-template-columns: 1fr;
  }
  .status-strip > div {
    border-top: 1px solid var(--line);
    border-left: 0;
  }
  .status-strip > div:first-child {
    border-top: 0;
  }
  .form-section,
  .preview-panel {
    padding: 16px;
    border-radius: 16px;
  }
  .mode-card {
    min-height: 88px;
  }
  .form-actions {
    position: static;
    align-items: stretch;
    flex-direction: column;
  }
  .primary-actions {
    display: grid;
    grid-template-columns: 1fr 1fr;
  }
  .form-actions :deep(.p-button) {
    width: 100%;
    justify-content: center;
  }
  .publish-hint {
    text-align: left;
  }
  .pending-message {
    align-items: stretch;
    flex-direction: column;
  }
  .pending-actions {
    display: grid;
    grid-template-columns: 1fr;
  }
  .impact-metrics {
    grid-template-columns: 1fr;
  }
  .example-section li {
    grid-template-columns: auto 1fr;
  }
  .example-section time {
    grid-column: 2;
  }
}
@media (max-width: 390px) {
  .primary-actions {
    grid-template-columns: 1fr;
  }
  .policy-header h1 {
    font-size: 1.7rem;
  }
  .metrics-section dl {
    grid-template-columns: 1fr;
  }
}
@media (prefers-reduced-motion: reduce) {
  .mode-card,
  .recipient-card,
  .preview-content {
    transition: none;
  }
  .mode-card:hover,
  .recipient-card:hover {
    transform: none;
  }
}
</style>
