<script setup lang="ts">
import { computed, ref } from "vue";
import Button from "primevue/button";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Select from "primevue/select";
import ActionConfigFields from "@/features/actions/ActionConfigFields.vue";
import {
  ScenarioGoalEditor,
  ScenarioGoalPreview,
} from "@/features/scenario-goals/ui";
import type { ScenarioAuthoringContract } from "@/shared/api/repository/scenario-authoring";
import type { ScenarioLocalizationPolicyDto } from "@/shared/api/generated/models";
import type { TranslationUiState } from "@/features/scenario-localization/ui";
import { LocalizedField } from "@/features/scenario-localization/ui";
import { localizedValue } from "@/features/scenario-localization/model";
import ScenarioConditionRows from "./ScenarioConditionRows.vue";
import type {
  EventDefinition,
  ScenarioAction,
  ScenarioActionCatalogItem,
  UiElement,
} from "@/shared/types/domain";
import {
  availableTargets,
  choiceOptions,
  choiceReminders,
  conditionBranches,
} from "./model/scenario-graph";
import type { ChoiceOption } from "./model/scenario-graph";
import {
  createActionConfig,
  findScenarioActionCatalogItem,
} from "@/shared/lib/scenario-action-catalog";
import { slugify } from "@/shared/lib/format";

const props = defineProps<{
  projectId: string;
  action: ScenarioAction;
  actions: ScenarioAction[];
  actionCatalog: ScenarioActionCatalogItem[];
  events: EventDefinition[];
  elements: UiElement[];
  templateVariables: Array<
    string | { value: string; label: string; meta?: string; disabled?: boolean }
  >;
  conditionPaths: string[];
  issues: string[];
  authoringContract: ScenarioAuthoringContract | null;
  localizationPolicy: ScenarioLocalizationPolicyDto;
  scenarioId: string;
  actionPath: string;
  translationStates: Record<string, Record<string, TranslationUiState>>;
  focusFieldPath?: string;
  focusLocale?: string;
}>();
const emit = defineEmits<{
  changeType: [type: string];
  createTarget: [
    type: string,
    kind:
      | "next"
      | "choice"
      | "timeout"
      | "condition"
      | "fallback"
      | "goal",
    index?: number,
  ];
  remove: [];
  validity: [valid: boolean];
  update: [action: ScenarioAction];
  rename: [oldKey: string, newKey: string];
  close: [];
  "translation-request": [payload: { fieldPath: string; targets: string[] }];
  "translation-retry": [payload: { fieldPath: string; locale: string }];
  "translation-cancel": [fieldPath: string];
  "translation-manual-edit": [payload: { fieldPath: string; locale: string }];
}>();

const inspectorElement = ref<HTMLElement | null>(null);

defineExpose({
  focus: () => inspectorElement.value?.focus(),
});

const createTargetPrefix = "__create__:";
const definition = computed(() =>
  findScenarioActionCatalogItem(props.actionCatalog, props.action.type),
);
const targets = computed(() =>
  availableTargets(props.actions, props.action).map((target) => {
    const action = props.actions.find((item) => item.nodeKey === target.value);
    const targetDefinition = action
      ? findScenarioActionCatalogItem(props.actionCatalog, action.type)
      : undefined;
    return {
      ...target,
      label: `${targetDefinition?.name ?? action?.type ?? target.label} · ${target.value}`,
    };
  }),
);
const actionOptions = computed(() =>
  props.actionCatalog
    .filter((item) => item.enabled)
    .map((item) => ({ label: item.name, value: item.type })),
);
const targetOptions = computed(() => [
  ...targets.value,
  ...actionOptions.value.map((option) => ({
    label: `＋ Создать: ${option.label}`,
    value: `${createTargetPrefix}${option.value}`,
  })),
]);
const reminderActionOptions = computed(() =>
  props.actionCatalog
    .filter(
      (item) =>
        item.enabled && (item.type === "SAY" || item.executor === "FRONTEND"),
    )
    .map((item) => ({ label: item.name, value: item.type })),
);
const genericDefinition = computed(() => {
  if (props.action.type === "WAIT_FOR_GOAL") return undefined;
  if (
    !definition.value ||
    !["ASK_CHOICE", "CONDITION"].includes(props.action.type)
  )
    return definition.value;
  const hidden =
    props.action.type === "ASK_CHOICE"
      ? new Set(["options", "onTimeout", "reminders"])
      : new Set(["branches", "fallbackNodeKey"]);
  return {
    ...definition.value,
    uiSchema: {
      ...definition.value.uiSchema,
      fields: definition.value.uiSchema.fields.filter(
        (field) => !hidden.has(field.key),
      ),
    },
  };
});
const choiceLabelDescriptor = computed(() =>
  props.authoringContract?.localization?.paths.find(
    (descriptor) =>
      descriptor.actionType === "ASK_CHOICE" &&
      descriptor.path === "config.options[].label",
  ),
);

function updateAction(patch: Partial<ScenarioAction>) {
  emit("update", { ...props.action, ...patch });
}
function setConfig(key: string, value: unknown) {
  updateAction({ config: { ...props.action.config, [key]: value } });
}
function setOptions(value: ReturnType<typeof choiceOptions>) {
  setConfig("options", value);
}
function setReminders(value: ReturnType<typeof choiceReminders>) {
  setConfig("reminders", value);
}
function setBranches(value: ReturnType<typeof conditionBranches>) {
  setConfig("branches", value);
}
function nextOptionId() {
  const used = new Set(choiceOptions(props.action).map((item) => item.id));
  let index = used.size + 1;
  while (used.has(`option_${index}`)) index += 1;
  return `option_${index}`;
}
function addChoice() {
  setOptions([
    ...choiceOptions(props.action),
    { id: nextOptionId(), label: "", nextNodeKey: "" },
  ]);
}
function updateChoice(index: number, patch: Partial<ChoiceOption>) {
  setOptions(
    choiceOptions(props.action).map((item, itemIndex) =>
      itemIndex === index ? { ...item, ...patch } : item,
    ),
  );
}
function choiceLabelText(option: ChoiceOption) {
  return typeof option.label === "string" ? option.label : "";
}
function addBranch() {
  setBranches([
    ...conditionBranches(props.action),
    {
      conditions: [
        {
          path: props.conditionPaths[0] ?? "user.segment",
          operator: "eq",
          value: "",
        },
      ],
      nextNodeKey: "",
    },
  ]);
}
function selectTarget(
  value: unknown,
  kind: "next" | "choice" | "timeout" | "condition" | "fallback",
  index?: number,
) {
  const target = String(value ?? "");
  if (target.startsWith(createTargetPrefix)) {
    emit("createTarget", target.slice(createTargetPrefix.length), kind, index);
    return;
  }
  if (kind === "next") updateAction({ nextNodeKey: target || null });
  else if (kind === "choice" && index !== undefined)
    updateChoice(index, { nextNodeKey: target });
  else if (kind === "timeout") setConfig("onTimeout", target);
  else if (kind === "condition" && index !== undefined)
    setBranches(
      conditionBranches(props.action).map((item, itemIndex) =>
        itemIndex === index ? { ...item, nextNodeKey: target } : item,
      ),
    );
  else if (kind === "fallback") setConfig("fallbackNodeKey", target);
}
function createGoalTarget(
  type: string,
  branch: "goal" | "timeout",
) {
  emit("createTarget", type, branch);
}
function addReminder() {
  const type = reminderActionOptions.value[0]?.value ?? "SAY";
  const actionDefinition = findScenarioActionCatalogItem(props.actionCatalog, type);
  setReminders([
    ...choiceReminders(props.action),
    {
      afterMs: 10_000,
      actions: [
        {
          type,
          config: actionDefinition ? createActionConfig(actionDefinition) : {},
        },
      ],
    },
  ]);
}
function addReminderAction(reminderIndex: number) {
  const reminders = choiceReminders(props.action);
  const type = reminderActionOptions.value[0]?.value ?? "SAY";
  const actionDefinition = findScenarioActionCatalogItem(props.actionCatalog, type);
  reminders[reminderIndex].actions.push({
    type,
    config: actionDefinition ? createActionConfig(actionDefinition) : {},
  });
  setReminders(reminders);
}
function changeReminderType(
  reminderIndex: number,
  actionIndex: number,
  type: string,
) {
  const reminders = choiceReminders(props.action);
  const actionDefinition = findScenarioActionCatalogItem(props.actionCatalog, type);
  reminders[reminderIndex].actions[actionIndex] = {
    type,
    config: actionDefinition ? createActionConfig(actionDefinition) : {},
  };
  setReminders(reminders);
}
function updateNodeKey(value: string | undefined) {
  const oldKey = props.action.nodeKey;
  const newKey = slugify(value ?? "").replace(/\./g, "_");
  emit("rename", oldKey ?? "", newKey);
}
</script>

<template>
  <aside
    ref="inspectorElement"
    class="inspector"
    tabindex="-1"
    aria-label="Настройка действия"
    @keydown.esc="emit('close')"
  >
    <div class="inspector-head">
      <div>
        <small>Узел {{ action.position + 1 }}</small>
        <h2>{{ definition?.name ?? action.type }}</h2>
      </div>
      <div class="inspector-actions">
        <Button
          icon="pi pi-times"
          text
          rounded
          aria-label="Закрыть инспектор узла"
          @click="emit('close')"
        /><Button
          icon="pi pi-trash"
          text
          rounded
          severity="danger"
          aria-label="Удалить узел"
          @click="emit('remove')"
        />
      </div>
    </div>
    <div v-if="issues.length" class="issue-box">
      <i class="pi pi-exclamation-circle" />
      <div>
        <strong>Нужно исправить</strong
        ><span v-for="issue in issues" :key="issue">{{ issue }}</span>
      </div>
    </div>
    <section>
      <h3>Основное</h3>
      <div class="field">
        <label :for="`${scenarioId}-${action.nodeKey}-type`">Тип действия</label
        ><Select
          :input-id="`${scenarioId}-${action.nodeKey}-type`"
          :model-value="action.type"
          :options="actionOptions"
          option-label="label"
          option-value="value"
          @update:model-value="emit('changeType', $event)"
        />
      </div>
      <div class="field">
        <label :for="`${scenarioId}-${action.nodeKey}-node-key`">Ключ узла</label
        ><InputText
          :id="`${scenarioId}-${action.nodeKey}-node-key`"
          :model-value="action.nodeKey"
          class="mono"
          @update:model-value="updateNodeKey"
        /><small>Неизменяемый код шага. По нему сценарий связывает переходы, ответы и результаты.</small>
      </div>
      <div
        v-if="
          !['ASK_CHOICE', 'CONDITION', 'WAIT_FOR_GOAL'].includes(action.type)
        "
        class="field"
      >
        <label :for="`${scenarioId}-${action.nodeKey}-next-action`">Следующее действие</label
        ><Select
          :input-id="`${scenarioId}-${action.nodeKey}-next-action`"
          :model-value="action.nextNodeKey"
          :options="targetOptions"
          option-label="label"
          option-value="value"
          show-clear
          placeholder="Завершить или выбрать действие"
          @update:model-value="selectTarget($event, 'next')"
        />
      </div>
    </section>
    <section>
      <h3>Параметры</h3>
      <ActionConfigFields
        v-if="genericDefinition"
        :model-value="action.config"
        :definition="genericDefinition"
        :elements="elements"
        :events="events"
        :template-variables="templateVariables"
        :project-id="projectId"
        :scenario-id="scenarioId"
        :field-path-prefix="`${actionPath}.config`"
        :localization-catalog="authoringContract?.localization"
        :translation-catalog="authoringContract?.translation"
        :localization-policy="localizationPolicy"
        :translation-states="translationStates"
        :focus-field-path="focusFieldPath"
        :focus-locale="focusLocale"
        @update:model-value="updateAction({ config: $event })"
        @validity-change="emit('validity', $event)"
        @translation-request="emit('translation-request', $event)"
        @translation-retry="emit('translation-retry', $event)"
        @translation-cancel="emit('translation-cancel', $event)"
        @translation-manual-edit="emit('translation-manual-edit', $event)"
      />
      <ScenarioGoalEditor
        v-else-if="action.type === 'WAIT_FOR_GOAL' && authoringContract"
        :model-value="action.config"
        :contract="authoringContract"
        :targets="targetOptions"
        @update:model-value="updateAction({ config: $event })"
        @validity-change="emit('validity', $event)"
        @create-target="createGoalTarget"
      />
      <ScenarioGoalPreview
        v-if="action.type === 'WAIT_FOR_GOAL' && authoringContract"
        :project-id="projectId"
        :config="action.config"
        :contract="authoringContract"
      />
      <div v-else-if="action.type === 'WAIT_FOR_GOAL'" class="issue-box">
        <i class="pi pi-exclamation-circle" />
        <div>
          <strong>Каталог недоступен</strong
          ><span>Цель нельзя настроить без каталога сценариев.</span>
        </div>
      </div>
    </section>

    <section v-if="action.type === 'ASK_CHOICE'">
      <div class="section-title">
        <div>
          <h3>Варианты ответа</h3>
          <p>Выберите существующее следующее действие или создайте новое.</p>
        </div>
        <Button
          icon="pi pi-plus"
          text
          rounded
          aria-label="Добавить вариант"
          @click="addChoice"
        />
      </div>
      <div
        class="choice-card"
        v-for="(option, index) in choiceOptions(action)"
        :key="index"
      >
        <div class="choice-grid">
          <LocalizedField
            v-if="choiceLabelDescriptor && authoringContract?.localization && authoringContract.translation"
            :model-value="localizedValue(option.label, authoringContract.localization.defaultLocale)"
            :catalog="authoringContract.localization"
            :translation="authoringContract.translation"
            :policy="localizationPolicy"
            :source-locale="authoringContract.localization.defaultLocale"
            :field-path="`${actionPath}.config.options.${option.id}.label`"
            :scenario-id="scenarioId"
            :project-id="projectId"
            label="Текст кнопки"
            :max-length="choiceLabelDescriptor.maxLength"
            :translation-states="translationStates[`${actionPath}.config.options.${option.id}.label`]"
            :focus-locale="focusFieldPath === `${actionPath}.config.options.${option.id}.label` ? focusLocale : ''"
            @update:model-value="updateChoice(index, { label: $event })"
            @translation-request="emit('translation-request', { fieldPath: `${actionPath}.config.options.${option.id}.label`, targets: $event })"
            @retry="emit('translation-retry', { fieldPath: `${actionPath}.config.options.${option.id}.label`, locale: $event })"
            @cancel="emit('translation-cancel', `${actionPath}.config.options.${option.id}.label`)"
            @manual-edit="emit('translation-manual-edit', { fieldPath: `${actionPath}.config.options.${option.id}.label`, locale: $event })"
          />
          <InputText
            v-else
            :id="`${scenarioId}-${action.nodeKey}-choice-${index}-label`"
            :aria-label="`Текст кнопки варианта ${index + 1}`"
            :model-value="choiceLabelText(option)"
            placeholder="Текст кнопки"
            @update:model-value="
              updateChoice(index, {
                label: String($event ?? ''),
                id:
                  option.id === `option_${index + 1}`
                    ? slugify(String($event ?? '')) || option.id
                    : option.id,
              })
            "
          /><InputText
            :id="`${scenarioId}-${action.nodeKey}-choice-${index}-id`"
            :aria-label="`Ключ варианта ${index + 1}`"
            :model-value="option.id"
            class="mono"
            placeholder="option_id"
            @update:model-value="
              updateChoice(index, { id: String($event ?? '') })
            "
          />
        </div>
        <div class="choice-target">
          <i class="pi pi-arrow-right" />
          <label class="sr-only" :for="`${scenarioId}-${action.nodeKey}-choice-${index}-target`">Следующее действие для варианта {{ index + 1 }}</label>
          <Select
            :input-id="`${scenarioId}-${action.nodeKey}-choice-${index}-target`"
            :model-value="option.nextNodeKey"
            :options="targetOptions"
            option-label="label"
            option-value="value"
            placeholder="Следующее действие"
            @update:model-value="selectTarget($event, 'choice', index)"
          /><Button
            icon="pi pi-trash"
            text
            rounded
            severity="danger"
            :aria-label="`Удалить вариант ${index + 1}`"
            @click="
              setOptions(
                choiceOptions(action).filter(
                  (_, itemIndex) => itemIndex !== index,
                ),
              )
            "
          />
        </div>
      </div>
      <div class="field timeout-field">
        <label :for="`${scenarioId}-${action.nodeKey}-timeout-target`">Действие по тайм-ауту</label
        ><Select
          :input-id="`${scenarioId}-${action.nodeKey}-timeout-target`"
          :model-value="action.config.onTimeout"
          :options="targetOptions"
          option-label="label"
          option-value="value"
          placeholder="Что выполнить без ответа"
          @update:model-value="selectTarget($event, 'timeout')"
        />
      </div>
    </section>

    <section v-if="action.type === 'CONDITION'">
      <div class="section-title">
        <div>
          <h3>Ветки выполнения</h3>
          <p>Проверяются сверху вниз; сработает первая.</p>
        </div>
        <Button
          icon="pi pi-plus"
          text
          rounded
          aria-label="Добавить ветку"
          @click="addBranch"
        />
      </div>
      <div
        class="branch-card"
        v-for="(branch, index) in conditionBranches(action)"
        :key="index"
      >
        <div class="branch-head">
          <strong>Ветка {{ index + 1 }}</strong
          ><Button
            icon="pi pi-trash"
            text
            rounded
            severity="danger"
            :aria-label="`Удалить ветку ${index + 1}`"
            @click="
              setBranches(
                conditionBranches(action).filter(
                  (_, itemIndex) => itemIndex !== index,
                ),
              )
            "
          />
        </div>
        <ScenarioConditionRows
          :model-value="branch.conditions"
          :paths="conditionPaths"
          @update:model-value="
            setBranches(
              conditionBranches(action).map((item, itemIndex) =>
                itemIndex === index ? { ...item, conditions: $event } : item,
              ),
            )
          "
        />
        <div class="branch-target">
          <label :for="`${scenarioId}-${action.nodeKey}-branch-${index}-target`">Тогда</label
          ><Select
            :input-id="`${scenarioId}-${action.nodeKey}-branch-${index}-target`"
            :model-value="branch.nextNodeKey"
            :options="targetOptions"
            option-label="label"
            option-value="value"
            placeholder="Следующее действие"
            @update:model-value="selectTarget($event, 'condition', index)"
          />
        </div>
      </div>
      <div class="field">
        <label :for="`${scenarioId}-${action.nodeKey}-fallback-target`">Иначе</label
        ><Select
          :input-id="`${scenarioId}-${action.nodeKey}-fallback-target`"
          :model-value="action.config.fallbackNodeKey"
          :options="targetOptions"
          option-label="label"
          option-value="value"
          placeholder="Следующее действие"
          @update:model-value="selectTarget($event, 'fallback')"
        />
      </div>
    </section>

    <section v-if="action.type === 'ASK_CHOICE'">
      <div class="section-title">
        <div>
          <h3>Напоминания</h3>
          <p>Выполняются, пока вопрос ждёт ответа.</p>
        </div>
        <Button
          icon="pi pi-plus"
          text
          rounded
          aria-label="Добавить напоминание"
          @click="addReminder"
        />
      </div>
      <div
        class="reminder-card"
        v-for="(reminder, reminderIndex) in choiceReminders(action)"
        :key="reminderIndex"
      >
        <div class="reminder-head">
          <div class="field">
            <label :for="`${scenarioId}-${action.nodeKey}-reminder-${reminderIndex}-delay`">Через, мс</label
            ><InputNumber
              :input-id="`${scenarioId}-${action.nodeKey}-reminder-${reminderIndex}-delay`"
              :model-value="reminder.afterMs"
              :min="1000"
              :max="86400000"
              :use-grouping="false"
              @update:model-value="
                setReminders(
                  choiceReminders(action).map((item, index) =>
                    index === reminderIndex
                      ? { ...item, afterMs: $event ?? 1000 }
                      : item,
                  ),
                )
              "
            />
          </div>
          <Button
            icon="pi pi-trash"
            text
            rounded
            severity="danger"
            :aria-label="`Удалить напоминание ${reminderIndex + 1}`"
            @click="
              setReminders(
                choiceReminders(action).filter(
                  (_, index) => index !== reminderIndex,
                ),
              )
            "
          />
        </div>
        <div
          class="reminder-action"
          v-for="(reminderAction, actionIndex) in reminder.actions"
          :key="actionIndex"
        >
          <label class="sr-only" :for="`${scenarioId}-${action.nodeKey}-reminder-${reminderIndex}-action-${actionIndex}-type`">Тип действия в напоминании {{ reminderIndex + 1 }}</label>
          <Select
            :input-id="`${scenarioId}-${action.nodeKey}-reminder-${reminderIndex}-action-${actionIndex}-type`"
            :model-value="reminderAction.type"
            :options="reminderActionOptions"
            option-label="label"
            option-value="value"
            @update:model-value="
              changeReminderType(reminderIndex, actionIndex, $event)
            "
          />
          <ActionConfigFields
            v-if="findScenarioActionCatalogItem(actionCatalog, reminderAction.type)"
            :model-value="reminderAction.config"
            :definition="
              findScenarioActionCatalogItem(actionCatalog, reminderAction.type)!
            "
            :elements="elements"
            :events="events"
            :template-variables="templateVariables"
            :project-id="projectId"
            :scenario-id="scenarioId"
            :field-path-prefix="`${actionPath}.config.reminders.${reminderIndex}.actions.${actionIndex}.config`"
            :localization-catalog="authoringContract?.localization"
            :translation-catalog="authoringContract?.translation"
            :localization-policy="localizationPolicy"
            :translation-states="translationStates"
            :focus-field-path="focusFieldPath"
            :focus-locale="focusLocale"
            @update:model-value="
              setReminders(
                choiceReminders(action).map((item, index) =>
                  index === reminderIndex
                    ? {
                        ...item,
                        actions: item.actions.map((nested, nestedIndex) =>
                          nestedIndex === actionIndex
                            ? { ...nested, config: $event }
                            : nested,
                        ),
                      }
                    : item,
                ),
              )
            "
            @translation-request="emit('translation-request', $event)"
            @translation-retry="emit('translation-retry', $event)"
            @translation-cancel="emit('translation-cancel', $event)"
            @translation-manual-edit="emit('translation-manual-edit', $event)"
          />
          <Button
            icon="pi pi-times"
            text
            rounded
            severity="danger"
            :aria-label="`Удалить действие ${actionIndex + 1} из напоминания ${reminderIndex + 1}`"
            @click="
              setReminders(
                choiceReminders(action).map((item, index) =>
                  index === reminderIndex
                    ? {
                        ...item,
                        actions: item.actions.filter(
                          (_, nestedIndex) => nestedIndex !== actionIndex,
                        ),
                      }
                    : item,
                ),
              )
            "
          />
        </div>
        <Button
          label="Добавить действие"
          icon="pi pi-plus"
          text
          size="small"
          @click="addReminderAction(reminderIndex)"
        />
      </div>
    </section>
  </aside>
</template>

<style scoped>
.inspector {
  height: 100%;
  overflow: auto;
  background: var(--surface-card);
  container: action-inspector / inline-size;
}
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
.inspector-head {
  position: sticky;
  top: 0;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 20px 20px 16px;
  border-bottom: 1px solid var(--line);
  background: var(--surface-card);
}
.inspector-head small {
  color: var(--text-small-muted);
  font-size: 0.67rem;
  text-transform: uppercase;
  letter-spacing: 0.1em;
}
.inspector-head h2 {
  margin-top: 4px;
  font-size: 1.05rem;
}
.inspector section {
  width: min(960px, 100%);
  margin-inline: auto;
  padding: 22px clamp(20px, 4vw, 52px);
  box-sizing: border-box;
  border-bottom: 1px solid var(--line);
}
h3 {
  margin: 0 0 13px;
  font-size: 0.78rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-secondary);
}
.field {
  margin-top: 12px;
}
.field:first-of-type {
  margin-top: 0;
}
.field > small {
  color: var(--text-small-muted);
  font-size: 0.67rem;
}
.issue-box {
  display: flex;
  gap: 10px;
  margin: 14px;
  padding: 12px;
  border: 1px solid var(--status-danger);
  border-radius: 12px;
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.inspector > .issue-box {
  width: min(860px, calc(100% - 40px));
  margin-inline: auto;
  box-sizing: border-box;
}
.issue-box strong,
.issue-box span {
  display: block;
}
.issue-box strong {
  font-size: 0.76rem;
}
.issue-box span {
  margin-top: 4px;
  font-size: 0.68rem;
}
.section-title {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 8px;
}
.section-title h3 {
  margin-bottom: 2px;
}
.section-title p {
  margin: 0;
  color: var(--text-small-muted);
  font-size: 0.68rem;
}
.choice-card,
.branch-card,
.reminder-card {
  margin-top: 10px;
  padding: 11px;
  border: 1px solid var(--border-default);
  border-radius: 12px;
  background: var(--surface-subtle);
}
.choice-grid {
  display: grid;
  grid-template-columns: 1.25fr 0.75fr;
  gap: 7px;
}
.choice-target,
.branch-target {
  display: flex;
  align-items: center;
  gap: 7px;
  margin-top: 7px;
}
.choice-target > i {
  color: var(--status-violet-text);
  font-size: 0.72rem;
}
.choice-target .p-select,
.branch-target .p-select {
  flex: 1;
}
.branch-head,
.reminder-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.branch-head strong {
  font-size: 0.75rem;
}
.branch-target span {
  color: var(--text-small-muted);
  font-size: 0.7rem;
}
.timeout-field {
  margin-top: 14px;
}
.reminder-head .field {
  flex: 1;
  margin: 0;
}
.reminder-action {
  display: grid;
  grid-template-columns: 1fr;
  gap: 8px;
  margin: 10px 0;
  padding: 10px;
  background: var(--surface-card);
  border-radius: 10px;
}
.reminder-action > .p-button {
  justify-self: end;
}
.inspector :deep(.schema-fields) {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}
.inspector :deep(.field-wide) {
  grid-column: 1 / -1;
}
.inspector-actions {
  display: flex;
  gap: 4px;
}
@container action-inspector (max-width: 680px) {
  .inspector :deep(.schema-fields) {
    grid-template-columns: 1fr;
  }
  .inspector :deep(.field-wide) {
    grid-column: auto;
  }
  .choice-grid {
    grid-template-columns: 1fr;
  }
}
</style>
