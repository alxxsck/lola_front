export type EventQueryRange =
  'POLICY_MAX' | 'CURRENT_CASE_WINDOW' | 'LAST_24_HOURS' | 'LAST_7_DAYS' | 'LAST_30_DAYS';

export interface EventQueryPeriodOption {
  value: EventQueryRange;
  label: string;
  hours: number;
}

export function eventQueryPeriodOptions(input: {
  maxHours: number;
  now?: Date;
  caseCreatedAt?: string;
}): EventQueryPeriodOption[] {
  const now = input.now ?? new Date();
  const options: EventQueryPeriodOption[] = [];
  const createdAt = input.caseCreatedAt ? new Date(input.caseCreatedAt).getTime() : Number.NaN;
  const caseHours = Math.max(0, (now.getTime() - createdAt) / 3_600_000);
  if (Number.isFinite(caseHours) && caseHours <= input.maxHours) {
    options.push({
      value: 'CURRENT_CASE_WINDOW',
      label: 'С открытия обращения',
      hours: caseHours,
    });
  }
  const presets = (
    [
      { value: 'LAST_24_HOURS', label: '24 часа', hours: 24 },
      { value: 'LAST_7_DAYS', label: '7 дней', hours: 168 },
      { value: 'LAST_30_DAYS', label: '30 дней', hours: 720 },
    ] satisfies EventQueryPeriodOption[]
  ).filter((option) => option.hours <= input.maxHours);
  options.push(...presets);
  if (!presets.some((option) => option.hours === input.maxHours)) {
    options.push({
      value: 'POLICY_MAX',
      label: `${input.maxHours} ч. (лимит политики)`,
      hours: input.maxHours,
    });
  }
  return options;
}

export function eventQueryTimeRange(value: EventQueryRange, maxHours: number, now = new Date()) {
  if (value !== 'POLICY_MAX') return { kind: value };
  return {
    kind: 'EXPLICIT' as const,
    from: new Date(now.getTime() - maxHours * 3_600_000).toISOString(),
    to: now.toISOString(),
  };
}
