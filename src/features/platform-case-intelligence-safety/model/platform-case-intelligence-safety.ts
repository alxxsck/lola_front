import type {
  PlatformCaseIntelligenceSafetyClassDto,
  PlatformCaseIntelligenceSafetyPolicyDto,
  PlatformCaseIntelligenceSafetyPolicyDtoChannelsItem,
} from "@/shared/api/generated/models";

export type PlatformSafetyDraft = {
  classifierRevisionId: string;
  calibratorRevisionId: string;
  labelledDatasetRevisionId: string;
  sentinelDatasetRevisionId: string;
  localesText: string;
  channels: PlatformCaseIntelligenceSafetyPolicyDtoChannelsItem[];
  minimumCriticalRecall: string;
  maximumFalseNegativeRate: string;
  minimumSamples: string;
  reason: string;
};

export type PlatformSafetyDraftIssue = {
  path: keyof PlatformSafetyDraft | "gates";
  message: string;
};

export const platformSafetyClasses: PlatformCaseIntelligenceSafetyClassDto[] = [
  {
    code: "SELF_HARM_OR_SUICIDE",
    severity: "URGENT",
    consequences: [
      "SAFE_RESPONSE",
      "SAFETY_OCCURRENCE",
      "CASE_ESCALATION",
      "OPERATIONAL_ALERT",
    ],
  },
  {
    code: "CREDIBLE_THREAT_OR_VIOLENCE",
    severity: "URGENT",
    consequences: [
      "SAFE_RESPONSE",
      "SAFETY_OCCURRENCE",
      "CASE_ESCALATION",
      "OPERATIONAL_ALERT",
    ],
  },
  {
    code: "HARM_INVOLVING_MINORS",
    severity: "URGENT",
    consequences: [
      "SAFE_RESPONSE",
      "SAFETY_OCCURRENCE",
      "CASE_ESCALATION",
      "OPERATIONAL_ALERT",
    ],
  },
  {
    code: "RESPONSIBLE_GAMING_CRISIS",
    severity: "HIGH",
    consequences: [
      "SAFE_RESPONSE",
      "SAFETY_OCCURRENCE",
      "CASE_ESCALATION",
    ],
  },
];

export const platformSafetyClassLabels = {
  SELF_HARM_OR_SUICIDE: "Самоповреждение или суицид",
  CREDIBLE_THREAT_OR_VIOLENCE: "Достоверная угроза или насилие",
  HARM_INVOLVING_MINORS: "Риск для несовершеннолетних",
  RESPONSIBLE_GAMING_CRISIS: "Кризис ответственной игры",
} as const;

export function hasUniformPlatformSafetyGates(
  policy?: PlatformCaseIntelligenceSafetyPolicyDto,
): boolean {
  if (!policy?.gates.length) return true;
  const [first, ...rest] = policy.gates;
  return rest.every(
    (gate) =>
      gate.minimumCriticalRecall === first.minimumCriticalRecall &&
      gate.maximumFalseNegativeRate === first.maximumFalseNegativeRate &&
      gate.minimumSamples === first.minimumSamples,
  );
}

export function createPlatformSafetyDraft(
  policy?: PlatformCaseIntelligenceSafetyPolicyDto,
): PlatformSafetyDraft {
  const firstGate = policy?.gates[0];
  return {
    classifierRevisionId: policy?.classifierRevisionId ?? "",
    calibratorRevisionId: policy?.calibratorRevisionId ?? "",
    labelledDatasetRevisionId: policy?.labelledDatasetRevisionId ?? "",
    sentinelDatasetRevisionId: policy?.sentinelDatasetRevisionId ?? "",
    localesText: policy?.locales.join("\n") ?? "ru\nen",
    channels: policy?.channels.length ? [...policy.channels] : ["TEXT"],
    minimumCriticalRecall: String(firstGate?.minimumCriticalRecall ?? 0.95),
    maximumFalseNegativeRate: String(
      firstGate?.maximumFalseNegativeRate ?? 0.05,
    ),
    minimumSamples: String(firstGate?.minimumSamples ?? 100),
    reason: "",
  };
}

export function parsePlatformSafetyLocales(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\n,]/u)
        .map((locale) => locale.trim())
        .filter(Boolean),
    ),
  ];
}

export function validatePlatformSafetyDraft(
  draft: PlatformSafetyDraft,
): PlatformSafetyDraftIssue[] {
  const issues: PlatformSafetyDraftIssue[] = [];
  const requiredRevisionFields = [
    ["classifierRevisionId", "Укажите ревизию классификатора."],
    ["calibratorRevisionId", "Укажите ревизию калибратора."],
    ["labelledDatasetRevisionId", "Укажите размеченный набор данных."],
    ["sentinelDatasetRevisionId", "Укажите контрольный набор данных."],
  ] as const;
  requiredRevisionFields.forEach(([path, message]) => {
    const value = draft[path].trim();
    if (!value) issues.push({ path, message });
    else if (value.length > 128)
      issues.push({ path, message: "Значение должно быть короче 129 символов." });
  });

  const locales = parsePlatformSafetyLocales(draft.localesText);
  if (!locales.length)
    issues.push({ path: "localesText", message: "Добавьте хотя бы один язык." });
  else if (locales.length > 50)
    issues.push({ path: "localesText", message: "Можно указать не больше 50 языков." });
  else if (locales.some((locale) => locale.length > 35))
    issues.push({ path: "localesText", message: "Код языка должен быть короче 36 символов." });

  if (!draft.channels.length)
    issues.push({ path: "channels", message: "Выберите хотя бы один канал." });

  const recall = Number(draft.minimumCriticalRecall);
  if (!Number.isFinite(recall) || recall < 0.9 || recall > 1)
    issues.push({
      path: "minimumCriticalRecall",
      message: "Critical recall должен быть от 0,9 до 1.",
    });
  const falseNegativeRate = Number(draft.maximumFalseNegativeRate);
  if (
    !Number.isFinite(falseNegativeRate) ||
    falseNegativeRate < 0 ||
    falseNegativeRate > 0.1
  )
    issues.push({
      path: "maximumFalseNegativeRate",
      message: "False-negative rate должен быть от 0 до 0,1.",
    });
  const samples = Number(draft.minimumSamples);
  if (!Number.isInteger(samples) || samples < 1 || samples > 1_000_000)
    issues.push({
      path: "minimumSamples",
      message: "Минимум примеров — целое число от 1 до 1 000 000.",
    });
  if (
    locales.length * draft.channels.length * platformSafetyClasses.length >
    500
  )
    issues.push({
      path: "gates",
      message: "Комбинация языков, каналов и классов создаёт больше 500 проверок.",
    });
  const reason = draft.reason.trim();
  if (!reason)
    issues.push({ path: "reason", message: "Укажите причину публикации." });
  else if (reason.length > 2000)
    issues.push({ path: "reason", message: "Причина должна быть короче 2001 символа." });
  return issues;
}

export function buildPlatformSafetyPolicy(
  draft: PlatformSafetyDraft,
  revisionId: string,
): PlatformCaseIntelligenceSafetyPolicyDto {
  const locales = parsePlatformSafetyLocales(draft.localesText);
  const minimumCriticalRecall = Number(draft.minimumCriticalRecall);
  const maximumFalseNegativeRate = Number(draft.maximumFalseNegativeRate);
  const minimumSamples = Number(draft.minimumSamples);
  return {
    revisionId,
    classifierRevisionId: draft.classifierRevisionId.trim(),
    calibratorRevisionId: draft.calibratorRevisionId.trim(),
    labelledDatasetRevisionId: draft.labelledDatasetRevisionId.trim(),
    sentinelDatasetRevisionId: draft.sentinelDatasetRevisionId.trim(),
    locales,
    channels: [...draft.channels],
    classes: platformSafetyClasses.map((item) => ({
      ...item,
      consequences: [...item.consequences],
    })),
    gates: locales.flatMap((locale) =>
      draft.channels.flatMap((channel) =>
        platformSafetyClasses.map((riskClass) => ({
          locale,
          channel,
          riskClass: riskClass.code,
          minimumCriticalRecall,
          maximumFalseNegativeRate,
          minimumSamples,
        })),
      ),
    ),
  };
}
