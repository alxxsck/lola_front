import type {
  AIProposalPriority,
  AIProposalSourceType,
  AIProposalWorkflowStatus,
} from "./ai-proposal";

export function proposalSourcePresentation(sourceType: AIProposalSourceType) {
  return {
    TEXT_CHAT: { label: "Чат", detailLabel: "Чат", icon: "pi pi-comments" },
    VOICE: {
      label: "Голос",
      detailLabel: "Голосовой диалог",
      icon: "pi pi-microphone",
    },
    BACKGROUND_AI: {
      label: "Фоновый аудит",
      detailLabel: "Фоновый аудит",
      icon: "pi pi-sparkles",
    },
  }[sourceType];
}

export function proposalPriorityLabel(priority: AIProposalPriority): string {
  return {
    LOW: "Низкий приоритет",
    NORMAL: "Обычный приоритет",
    HIGH: "Высокий приоритет",
    URGENT: "Срочный приоритет",
  }[priority];
}

export function proposalWorkflowLabel(
  status: AIProposalWorkflowStatus,
): string {
  return {
    OPEN: "Требует решения",
    ACCEPTED: "Принято к выполнению",
    REJECTED: "Отклонено",
    RESOLVED: "Обработано",
    EXPIRED: "Истекло",
    CANCELLED: "Отменено",
  }[status];
}
