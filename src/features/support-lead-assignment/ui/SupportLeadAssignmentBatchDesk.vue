<script setup lang="ts">
import { ref, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import Message from "primevue/message";
import Select from "primevue/select";
import Tag from "primevue/tag";
import Textarea from "primevue/textarea";
import type {
  SupportLeadAssignmentBatchRow,
  createSupportLeadAssignmentBatchController,
} from "@/features/support-lead-assignment/model/use-support-lead-assignment-batch";

const props = withDefaults(
  defineProps<{
    controller: ReturnType<typeof createSupportLeadAssignmentBatchController>;
    caseIds: string[];
    caseLabels?: Record<string, string>;
  }>(),
  { caseLabels: () => ({}) },
);

const visible = ref(false);

function teams(row: SupportLeadAssignmentBatchRow) {
  return (
    row.snapshot?.teams.filter((team) =>
      team.operators.some(
        (operator) =>
          operator.actions.assign ||
          (props.controller.hasForceAuthority.value &&
            operator.actions.assignWithOverride),
      ),
    ) ?? []
  );
}

function operators(row: SupportLeadAssignmentBatchRow) {
  return (
    teams(row)
      .find((team) => team.id === row.teamId)
      ?.operators.filter(
        (operator) =>
          operator.actions.assign ||
          (props.controller.hasForceAuthority.value &&
            operator.actions.assignWithOverride),
      )
      .map((operator) => ({
        ...operator,
        optionLabel: `${operator.displayName} · ${operator.availableCapacityUnits} ед.`,
      })) ?? []
  );
}

function requiredOverrides(row: SupportLeadAssignmentBatchRow): string[] {
  return (
    operators(row).find((operator) => operator.id === row.operatorId)
      ?.requiredOverrides ?? []
  );
}

function caseLabel(value: string): string {
  return props.caseLabels[value] ?? "Выбранное обращение";
}

function rowRequiresForce(row: SupportLeadAssignmentBatchRow): boolean {
  const operator = row.snapshot?.teams
    .find((team) => team.id === row.teamId)
    ?.operators.find((candidate) => candidate.id === row.operatorId);
  return Boolean(
    operator && !operator.actions.assign && operator.actions.assignWithOverride,
  );
}

function caseCountLabel(value: number): string {
  return `${value} ${value === 1 ? "обращение" : "обращений"} в пакете`;
}

function errorLabel(code?: string): string {
  return (
    {
      OPERATOR_CAPACITY_EXCEEDED: "Недостаточно свободной нагрузки",
      OPERATOR_NOT_AVAILABLE: "Оператор недоступен",
      CASE_VERSION_CONFLICT: "Обращение уже изменилось",
      CASE_NOT_ACTIONABLE: "Обращение больше нельзя назначить",
      IDEMPOTENCY_KEY_REUSED: "Ключ команды уже использован с другим пакетом",
    }[code ?? ""] ??
    "Ошибка не распознана. Обновите данные; если она повторится, передайте идентификатор обращения администратору."
  );
}

async function openDesk(): Promise<void> {
  visible.value = true;
  await props.controller.prepare(props.caseIds);
}

function closeDesk(): void {
  if (props.controller.unknownOutcome.value) return;
  visible.value = false;
  props.controller.reset();
}

watch(
  () => props.controller.hasAuthority.value,
  (allowed) => {
    if (allowed || !visible.value) return;
    visible.value = false;
    props.controller.reset();
  },
);

watch(
  () => props.controller.hasForceAuthority.value,
  (allowed) => {
    if (
      allowed ||
      !visible.value ||
      !props.controller.rows.value.some(rowRequiresForce)
    )
      return;
    visible.value = false;
    props.controller.reset();
  },
  { flush: "sync" },
);

watch(
  () => props.caseIds.join("\u001f"),
  (signature, previous) => {
    if (!visible.value || signature === previous) return;
    visible.value = false;
    props.controller.reset();
  },
);
</script>

<template>
  <Button
    v-if="controller.hasAuthority.value"
    label="Назначить выбранные"
    icon="pi pi-users"
    :badge="String(caseIds.length)"
    :disabled="caseIds.length === 0"
    aria-label="Пакетное назначение выбранных обращений"
    @click="openDesk"
  />

  <Dialog
    :visible="visible"
    modal
    header="Пакетное назначение"
    :closable="!controller.unknownOutcome.value"
    :dismissable-mask="!controller.unknownOutcome.value"
    :style="{ width: 'min(860px, calc(100vw - 24px))' }"
    class="lead-batch-dialog"
    @update:visible="(value) => !value && closeDesk()"
  >
    <div class="batch-intro">
      <div>
        <span class="section-kicker">Панель руководителя</span>
        <strong>{{ caseCountLabel(caseIds.length) }}</strong>
      </div>
      <Tag
        v-if="controller.rows.value.length"
        :value="`${controller.readyCount.value} готовы`"
        :severity="
          controller.readyCount.value === controller.rows.value.length
            ? 'success'
            : 'warn'
        "
      />
    </div>

    <Message severity="info" :closable="false">
      Каждое обращение проверяется отдельно. Частичный результат останется
      видимым по строкам.
    </Message>
    <Message v-if="controller.error.value" severity="error" :closable="false">
      {{ controller.error.value }}
    </Message>

    <div v-if="controller.preparing.value" class="batch-loading">
      <i class="pi pi-spin pi-spinner" aria-hidden="true" />
      Проверяем доступные команды и операторов…
    </div>

    <div v-else-if="!controller.result.value" class="batch-rows">
      <article
        v-for="row in controller.rows.value"
        :key="row.caseId"
        class="batch-row"
      >
        <header>
          <div>
            <span class="section-kicker">Обращение</span>
            <strong>{{ caseLabel(row.caseId) }}</strong>
          </div>
          <Tag
            v-if="requiredOverrides(row).length"
            value="Нужно исключение"
            severity="warn"
          />
        </header>
        <Message v-if="row.error" severity="error" :closable="false">
          {{ row.error }}
        </Message>
        <div v-else class="batch-row__target">
          <label>
            <span>Команда</span>
            <Select
              :model-value="row.teamId"
              :options="teams(row)"
              option-label="name"
              option-value="id"
              :aria-label="`Команда для ${caseLabel(row.caseId)}`"
              fluid
              @update:model-value="controller.setTarget(row.caseId, $event)"
            />
          </label>
          <label>
            <span>Оператор</span>
            <Select
              :model-value="row.operatorId"
              :options="operators(row)"
              option-label="optionLabel"
              option-value="id"
              :aria-label="`Оператор для ${caseLabel(row.caseId)}`"
              fluid
              @update:model-value="
                controller.setTarget(row.caseId, row.teamId, $event)
              "
            />
          </label>
        </div>
      </article>

      <label class="batch-reason">
        <span>Общее обоснование · попадёт в журнал по каждому обращению</span>
        <Textarea
          :model-value="controller.reasonNote.value"
          rows="3"
          maxlength="500"
          auto-resize
          fluid
          aria-label="Обоснование пакетного назначения"
          @update:model-value="controller.setReasonNote($event)"
        />
      </label>
    </div>

    <section v-else class="batch-result" aria-live="polite">
      <header>
        <div>
          <span class="section-kicker">Результат</span>
          <h3>
            {{
              controller.result.value.outcome === "PENDING"
                ? "Пакет обрабатывается"
                : controller.result.value.outcome === "SUCCEEDED"
                  ? "Пакет выполнен"
                  : controller.result.value.outcome === "PARTIAL"
                    ? "Пакет выполнен частично"
                    : "Пакет не выполнен"
            }}
          </h3>
        </div>
        <Tag
          :value="`${controller.result.value.succeededCount} успешно · ${controller.result.value.failedCount} ошибок`"
          :severity="
            controller.result.value.outcome === 'PENDING'
              ? 'info'
              : controller.result.value.outcome === 'SUCCEEDED'
                ? 'success'
                : controller.result.value.outcome === 'PARTIAL'
                  ? 'warn'
                  : 'danger'
          "
        />
      </header>
      <ol>
        <li
          v-for="item in controller.result.value.items"
          :key="item.clientItemId"
        >
          <div>
            <strong>{{ caseLabel(item.caseId) }}</strong>
          </div>
          <Tag
            :value="
              item.status === 'SUCCEEDED'
                ? 'Назначен'
                : item.status === 'FAILED'
                  ? errorLabel(item.error?.code)
                  : 'В обработке'
            "
            :severity="
              item.status === 'SUCCEEDED'
                ? 'success'
                : item.status === 'FAILED'
                  ? 'danger'
                  : 'info'
            "
          />
        </li>
      </ol>
    </section>

    <template #footer>
      <div class="batch-footer">
        <Button
          label="Закрыть"
          severity="secondary"
          text
          :disabled="controller.unknownOutcome.value"
          @click="closeDesk"
        />
        <Button
          v-if="controller.unknownOutcome.value"
          label="Проверить результат"
          icon="pi pi-refresh"
          :loading="controller.reconciling.value"
          @click="controller.reconcileUnknownOutcome()"
        />
        <Button
          v-else-if="!controller.result.value"
          label="Назначить пакет"
          icon="pi pi-check"
          :loading="controller.mutating.value"
          :disabled="
            controller.preparing.value ||
            controller.readyCount.value !== controller.rows.value.length ||
            !controller.reasonNote.value.trim()
          "
          @click="controller.submit"
        />
      </div>
    </template>
  </Dialog>
</template>

<style scoped>
.batch-intro,
.batch-intro > div,
.batch-row header,
.batch-result > header,
.batch-result li,
.batch-footer {
  display: flex;
  align-items: center;
}

.batch-intro,
.batch-row header,
.batch-result > header,
.batch-result li,
.batch-footer {
  justify-content: space-between;
  gap: 12px;
}

.batch-intro {
  margin: -4px 0 14px;
  padding: 12px 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-soft);
}

.batch-intro > div {
  align-items: flex-start;
  flex-direction: column;
  gap: 4px;
}

.section-kicker {
  color: var(--text-muted);
  font-size: 0.68rem;
  font-weight: 800;
  letter-spacing: 0.12em;
  text-transform: uppercase;
}

.batch-loading {
  display: flex;
  min-height: 180px;
  align-items: center;
  justify-content: center;
  gap: 10px;
  color: var(--text-muted);
}

.batch-rows {
  display: grid;
  max-height: min(54vh, 560px);
  gap: 10px;
  padding-right: 4px;
  overflow-y: auto;
}

.batch-row {
  display: grid;
  gap: 12px;
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-card);
}

.batch-row header > div {
  display: grid;
  gap: 4px;
}

.batch-row__target {
  display: grid;
  grid-template-columns: minmax(160px, 0.8fr) minmax(220px, 1.2fr);
  gap: 10px;
}

.batch-row__target label,
.batch-reason {
  display: grid;
  gap: 6px;
  color: var(--text-strong);
  font-size: 0.76rem;
  font-weight: 700;
}

.batch-reason {
  padding: 14px;
  border: 1px solid var(--line);
  border-radius: 14px;
  background: var(--surface-soft);
}

.batch-result h3 {
  margin: 4px 0 0;
  font-size: 1rem;
}

.batch-result ol {
  display: grid;
  gap: 8px;
  margin: 14px 0 0;
  padding: 0;
  list-style: none;
}

.batch-result li {
  min-height: 54px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
}

.batch-result li > div {
  display: grid;
  gap: 3px;
}

.batch-result small {
  color: var(--text-muted);
}

.batch-footer {
  width: 100%;
  padding-top: 4px;
  border-top: 1px solid var(--line);
}

@media (max-width: 640px) {
  .batch-row__target {
    grid-template-columns: 1fr;
  }

  .batch-intro,
  .batch-result > header,
  .batch-result li,
  .batch-footer {
    align-items: stretch;
    flex-direction: column;
  }

  .batch-footer :deep(.p-button) {
    width: 100%;
  }
}
</style>
