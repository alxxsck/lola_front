<script setup lang="ts">
import { computed } from "vue";
import Button from "primevue/button";
import type { AIProposalDetail } from "../model/ai-proposal";

const props = defineProps<{ proposal: AIProposalDetail; deciding: boolean }>();
defineEmits<{ resolve: [] }>();

const terminalPresentation = computed(() => {
  const presentations = {
    ACCEPTED: {
      icon: "pi pi-clock",
      title: "Принято администратором",
      description: "Исполнение отслеживается отдельно.",
      tone: "accepted",
    },
    REJECTED: {
      icon: "pi pi-times-circle",
      title: "Предложение отклонено",
      description: "Действие по предложению не выполнялось.",
      tone: "rejected",
    },
    RESOLVED: {
      icon: "pi pi-check-circle",
      title: "Запрос обработан",
      description: "Работа с этим запросом завершена.",
      tone: "resolved",
    },
    EXPIRED: {
      icon: "pi pi-history",
      title: "Срок предложения истёк",
      description: "Предложение закрыто без исполнения.",
      tone: "neutral",
    },
    CANCELLED: {
      icon: "pi pi-ban",
      title: "Предложение отменено",
      description: "Предложение больше не требует решения.",
      tone: "neutral",
    },
  } as const;
  return presentations[
    props.proposal.workflowStatus as keyof typeof presentations
  ];
});
</script>

<template>
  <div v-if="proposal.workflowStatus === 'OPEN'" class="decision-bar">
    <div>
      <strong>Запрос требует внимания</strong>
      <span>Прочтение не закрывает предложение.</span>
    </div>
    <Button
      v-if="proposal.decisionMode === 'ACKNOWLEDGE'"
      label="Обработано"
      icon="pi pi-check"
      :loading="deciding"
      @click="$emit('resolve')"
    />
    <span v-else class="future-decision">
      Этот тип запроса пока можно только просмотреть. Выполните нужное действие
      вручную и оставьте запрос открытым.
    </span>
  </div>
  <div
    v-else-if="terminalPresentation"
    class="decision-complete"
    :class="`decision-${terminalPresentation.tone}`"
  >
    <i :class="terminalPresentation.icon" />
    <div>
      <strong>{{ terminalPresentation.title }}</strong>
      <span>{{ terminalPresentation.description }}</span>
    </div>
  </div>
</template>

<style scoped>
.decision-bar,
.decision-complete {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 16px;
  border-radius: 16px;
}
.decision-bar {
  border: 1px solid
    color-mix(in srgb, var(--status-violet) 22%, var(--border-default));
  background: var(--status-violet-soft);
}
.decision-complete {
  justify-content: flex-start;
  background: var(--surface-subtle);
  color: var(--text-secondary);
}
.decision-resolved {
  background: var(--status-success-soft);
  color: var(--status-success-text);
}
.decision-rejected {
  background: var(--status-danger-soft);
  color: var(--status-danger-text);
}
.decision-accepted {
  background: var(--status-info-soft, var(--surface-subtle));
  color: var(--status-info-text, var(--text-primary));
}
.decision-complete > i {
  font-size: 1.3rem;
}
.decision-bar strong,
.decision-bar span,
.decision-complete strong,
.decision-complete span {
  display: block;
}
.decision-bar strong,
.decision-complete strong {
  font-size: 0.8rem;
}
.decision-bar span,
.decision-complete span {
  margin-top: 3px;
  font-size: 0.7rem;
}
.future-decision {
  color: var(--text-secondary);
}
@media (max-width: 520px) {
  .decision-bar {
    align-items: stretch;
    flex-direction: column;
  }
}
</style>
