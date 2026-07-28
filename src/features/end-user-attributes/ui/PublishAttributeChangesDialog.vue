<script setup lang="ts">
import { computed, reactive, watch } from "vue";
import Button from "primevue/button";
import Dialog from "primevue/dialog";
import InputNumber from "primevue/inputnumber";
import InputText from "primevue/inputtext";
import Message from "primevue/message";
import Textarea from "primevue/textarea";
import ToggleSwitch from "primevue/toggleswitch";
import type {
  AttributeContractIssueResponseDto,
  AttributePublicationChangesResponseDto,
} from "@/shared/api/generated/models";
import type { AttributePublicationFormCommand } from "../model/publication-domain";
import PublicationImpactSummary from "./PublicationImpactSummary.vue";

const props = defineProps<{
  canConfirmSecurity: boolean;
  changes: AttributePublicationChangesResponseDto;
  issues: AttributeContractIssueResponseDto[];
  publishing: boolean;
  visible: boolean;
}>();

const emit = defineEmits<{
  publish: [command: AttributePublicationFormCommand];
  "update:visible": [visible: boolean];
}>();

const form = reactive({
  reason: "",
  graceDays: 7,
  breakingChangePlan: "",
  readinessEvidenceId: "",
  confirmSecurity: false,
});

const securityDefinitionIds = computed(() => [
  ...new Set(
    props.issues
      .filter(
        (issue) =>
          issue.compatibility === "SECURITY" && Boolean(issue.definitionId),
      )
      .map((issue) => issue.definitionId as string),
  ),
]);
const requiresSecurityConfirmation = computed(
  () => securityDefinitionIds.value.length > 0,
);
const requiresReadinessEvidence = computed(() =>
  props.issues.some(
    (issue) =>
      issue.code === "ATTRIBUTE_REQUIREMENT_CHANGED" ||
      issue.code === "ATTRIBUTE_REQUIRED_ENFORCED_ADDED",
  ),
);
const requiresBreakingPlan = computed(
  () =>
    props.changes.contractChanged &&
    props.changes.contractCompatibility === "BREAKING",
);
const profileResyncRequired = computed(() =>
  props.issues.some((issue) => issue.compatibility === "BREAKING"),
);
const canSubmit = computed(
  () =>
    form.reason.trim().length > 0 &&
    (!requiresBreakingPlan.value ||
      form.breakingChangePlan.trim().length > 0) &&
    (!requiresReadinessEvidence.value ||
      form.readinessEvidenceId.trim().length > 0) &&
    (!requiresSecurityConfirmation.value ||
      (props.canConfirmSecurity && form.confirmSecurity)),
);

watch(
  () => props.visible,
  (visible) => {
    if (!visible) return;
    form.reason = "";
    form.graceDays = 7;
    form.breakingChangePlan = "";
    form.readinessEvidenceId = "";
    form.confirmSecurity = false;
  },
);

function close() {
  emit("update:visible", false);
}

function submit() {
  if (!canSubmit.value || props.publishing) return;
  emit("publish", {
    breakingChangePlan: requiresBreakingPlan.value
      ? form.breakingChangePlan.trim()
      : null,
    compatibilityGraceDays: props.changes.contractChanged
      ? form.graceDays
      : undefined,
    readinessEvidenceId: requiresReadinessEvidence.value
      ? form.readinessEvidenceId.trim()
      : null,
    reason: form.reason.trim(),
    securityConfirmations: form.confirmSecurity
      ? securityDefinitionIds.value
      : [],
  });
}
</script>

<template>
  <Dialog
    :visible="visible"
    modal
    header="Опубликовать изменения"
    :style="{ width: 'min(680px, calc(100vw - 24px))' }"
    @update:visible="emit('update:visible', $event)"
  >
    <div class="publish-form">
      <PublicationImpactSummary
        :changes="changes"
        :profile-resync-required="profileResyncRequired"
      />

      <Message
        v-if="changes.policyChanged"
        severity="info"
        :closable="false"
      >
        Разрешение ИИ начнёт действовать сразу после публикации. Уже сохранённые
        значения перечитывать или отправлять заново не нужно.
      </Message>

      <label>
        <span>Причина изменения *</span>
        <Textarea v-model="form.reason" rows="3" maxlength="1000" />
        <small>Причина сохранится в неизменяемой истории публикаций.</small>
      </label>

      <template v-if="changes.contractChanged">
        <label data-testid="compatibility-grace">
          <span>Переходный период, дней</span>
          <InputNumber
            v-model="form.graceDays"
            :min="0"
            :max="30"
            :use-grouping="false"
          />
          <small>
            Сколько дней backend продукта может отправлять предыдущую версию
            контракта.
          </small>
        </label>

        <label v-if="requiresBreakingPlan" data-testid="breaking-plan">
          <span>План перехода *</span>
          <Textarea
            v-model="form.breakingChangePlan"
            rows="3"
            maxlength="2000"
          />
          <small>
            Опишите обновление producer-интеграции и затронутых профилей.
          </small>
        </label>

        <label v-if="requiresReadinessEvidence">
          <span>Подтверждение готовности интеграции *</span>
          <InputText
            v-model="form.readinessEvidenceId"
            class="mono"
            placeholder="UUID проверки готовности"
          />
        </label>
      </template>

      <label
        v-if="requiresSecurityConfirmation"
        class="security-confirmation"
      >
        <ToggleSwitch v-model="form.confirmSecurity" />
        <span>
          Я проверил назначение и новые способы использования персональных
          данных.
        </span>
      </label>

      <Message
        v-if="requiresSecurityConfirmation && !canConfirmSecurity"
        severity="error"
        :closable="false"
      >
        Это расширение доступа должен подтвердить владелец Project.
      </Message>
    </div>

    <template #footer>
      <Button label="Отмена" severity="secondary" text @click="close" />
      <Button
        label="Опубликовать изменения"
        icon="pi pi-send"
        :loading="publishing"
        :disabled="!canSubmit"
        @click="submit"
      />
    </template>
  </Dialog>
</template>

<style scoped>
.publish-form {
  display: grid;
  gap: 1rem;
}

.publish-form label {
  display: grid;
  gap: 0.45rem;
}

.publish-form small {
  color: var(--p-text-muted-color);
}

.security-confirmation {
  grid-template-columns: auto 1fr;
  align-items: start;
}
</style>
