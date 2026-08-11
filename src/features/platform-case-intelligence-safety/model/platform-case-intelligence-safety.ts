import type {
  PlatformSafetyModelCatalogItem,
  PlatformSafetyReasoningEffort,
  PlatformSafetyState,
} from "@/features/platform-case-intelligence-safety/api/platform-case-intelligence-safety";

export type PlatformSafetyDraft = {
  modelId: string;
  reasoningEffort: PlatformSafetyReasoningEffort;
  reason: string;
};

export type PlatformSafetyDraftIssue = {
  path: keyof PlatformSafetyDraft;
  message: string;
};

export const platformSafetyClassLabels = {
  SELF_HARM_OR_SUICIDE: "Самоповреждение или суицид",
  CREDIBLE_THREAT_OR_VIOLENCE: "Достоверная угроза или насилие",
  HARM_INVOLVING_MINORS: "Риск для несовершеннолетних",
  RESPONSIBLE_GAMING_CRISIS: "Кризис ответственной игры",
} as const;

export const platformSafetyClassActions = {
  SELF_HARM_OR_SUICIDE: "Безопасный ответ, обращение, эскалация и тревога",
  CREDIBLE_THREAT_OR_VIOLENCE:
    "Безопасный ответ, обращение, эскалация и тревога",
  HARM_INVOLVING_MINORS: "Безопасный ответ, обращение, эскалация и тревога",
  RESPONSIBLE_GAMING_CRISIS:
    "Безопасный ответ, обращение и эскалация",
} as const;

export function createPlatformSafetyDraft(
  state: PlatformSafetyState | null,
  models: PlatformSafetyModelCatalogItem[],
): PlatformSafetyDraft {
  const selected =
    models.find((item) => item.id === state?.profile.modelId) ??
    models.find(
      (item) =>
        item.id === "grok-4.5" &&
        item.selectable &&
        item.providerAvailable !== false,
    ) ??
    models.find(
      (item) => item.selectable && item.providerAvailable !== false,
    );
  const activeEffort = state?.profile.reasoningEffort;
  const requestedEffort: PlatformSafetyReasoningEffort =
    activeEffort === "medium" || activeEffort === "high"
      ? activeEffort
      : "medium";
  const reasoningEffort = selected?.reasoningEfforts.includes(requestedEffort)
    ? requestedEffort
    : selected?.reasoningEfforts.includes("medium")
      ? "medium"
      : (selected?.reasoningEfforts[0] ?? "medium");
  return { modelId: selected?.id ?? "", reasoningEffort, reason: "" };
}

export function normalizePlatformSafetyReasoning(
  draft: PlatformSafetyDraft,
  model?: PlatformSafetyModelCatalogItem,
): void {
  if (!model || model.reasoningEfforts.includes(draft.reasoningEffort)) return;
  draft.reasoningEffort = model.reasoningEfforts.includes("medium")
    ? "medium"
    : (model.reasoningEfforts[0] ?? "medium");
}

export function validatePlatformSafetyDraft(
  draft: PlatformSafetyDraft,
  models: PlatformSafetyModelCatalogItem[],
  catalogStale: boolean,
): PlatformSafetyDraftIssue[] {
  const issues: PlatformSafetyDraftIssue[] = [];
  const model = models.find((item) => item.id === draft.modelId);
  if (!model)
    issues.push({ path: "modelId", message: "Выберите модель безопасности." });
  else if (!model.selectable || model.providerAvailable === false)
    issues.push({
      path: "modelId",
      message: "Эта модель недоступна для текущего ключа xAI.",
    });
  else if (!model.reasoningEfforts.includes(draft.reasoningEffort))
    issues.push({
      path: "reasoningEffort",
      message: "Выбранная глубина не поддерживается моделью.",
    });
  if (catalogStale)
    issues.push({
      path: "modelId",
      message: "Дождитесь свежей проверки доступности моделей xAI.",
    });
  const reason = draft.reason.trim();
  if (!reason)
    issues.push({ path: "reason", message: "Укажите причину публикации." });
  else if (reason.length > 2000)
    issues.push({
      path: "reason",
      message: "Причина должна быть короче 2001 символа.",
    });
  return issues;
}
