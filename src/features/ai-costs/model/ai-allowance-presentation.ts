import type { AiAllowanceCategory } from "./ai-allowance";

export type AiAllowanceCostQuality =
  | "EXACT_PROVIDER_COST"
  | "EXACT_PROVIDER_UNITS"
  | "MEASURED_ESTIMATE"
  | "RESERVED_ESTIMATE"
  | "UNKNOWN";

const COST_QUALITY_LABELS: Record<AiAllowanceCostQuality, string> = {
  EXACT_PROVIDER_COST: "точная стоимость провайдера",
  EXACT_PROVIDER_UNITS: "расчёт по единицам провайдера",
  MEASURED_ESTIMATE: "расчётная стоимость",
  RESERVED_ESTIMATE: "предварительная оценка",
  UNKNOWN: "стоимость уточняется",
};

const CATEGORY_LABELS: Record<AiAllowanceCategory, string> = {
  CHAT: "Чат с Lola",
  VOICE: "Голосовой чат",
  SPEECH: "Озвучивание текста",
  MEMORY: "Память Lola",
  AI_REVIEW: "Проверка сообщений",
  AI_ANALYSIS: "AI-анализ",
  CMS_AGENT: "AI-помощник сотрудников",
  CASE_INTELLIGENCE: "Анализ обращений",
  PROJECT_OVERHEAD: "Системные AI-операции",
};

export function allowanceCostQualityLabel(
  quality: AiAllowanceCostQuality | null,
): string {
  return quality ? COST_QUALITY_LABELS[quality] : "стоимость не указана";
}

export function allowanceCategoryLabel(category: AiAllowanceCategory): string {
  return CATEGORY_LABELS[category];
}
