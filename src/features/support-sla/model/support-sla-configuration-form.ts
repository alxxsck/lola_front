import type {
  ReplaceSupportSlaConfigurationDraftDto,
  SupportSlaPauseDtoFirstHumanResponseStatusesItem,
  SupportSlaRuleWhenDtoCaseTypesItem,
  SupportSlaRuleWhenDtoPrioritiesItem,
} from '@/shared/api/generated/models';

export interface SupportSlaTimeIntervalForm {
  id: string;
  start: string;
  end: string;
}

export interface SupportSlaWeekdayForm {
  isoWeekday: number;
  intervals: SupportSlaTimeIntervalForm[];
}

export interface SupportSlaExceptionForm {
  id: string;
  localDate: string;
  intervals: SupportSlaTimeIntervalForm[];
}

export interface SupportSlaTargetsMinutesForm {
  firstHumanResponse: number | null;
  nextHumanResponse: number | null;
  resolution: number | null;
}

export interface SupportSlaRuleForm {
  id: string;
  code: string;
  priorities: SupportSlaRuleWhenDtoPrioritiesItem[];
  caseTypes: SupportSlaRuleWhenDtoCaseTypesItem[];
  groupCodesText: string;
  targetsMinutes: SupportSlaTargetsMinutesForm;
  atRiskRemainingPercent: number | null;
  firstHumanResponsePause: SupportSlaPauseDtoFirstHumanResponseStatusesItem[];
  nextHumanResponsePause: SupportSlaPauseDtoFirstHumanResponseStatusesItem[];
  resolutionPause: SupportSlaPauseDtoFirstHumanResponseStatusesItem[];
}

export interface SupportSlaConfigurationForm {
  timeZone: string;
  weekly: SupportSlaWeekdayForm[];
  exceptions: SupportSlaExceptionForm[];
  rules: SupportSlaRuleForm[];
}

export type SupportSlaFormIssueCode =
  | 'TIME_ZONE_REQUIRED'
  | 'TIME_ZONE_INVALID'
  | 'CALENDAR_COVERAGE_REQUIRED'
  | 'INTERVAL_INVALID'
  | 'INTERVAL_OVERLAP'
  | 'INTERVAL_LIMIT'
  | 'EXCEPTION_DATE_INVALID'
  | 'EXCEPTION_DATE_DUPLICATE'
  | 'EXCEPTION_LIMIT'
  | 'RULE_REQUIRED'
  | 'RULE_CODE_INVALID'
  | 'RULE_CODE_DUPLICATE'
  | 'RULE_TARGET_INVALID'
  | 'AT_RISK_INVALID'
  | 'GROUP_CODE_INVALID'
  | 'FALLBACK_CONDITIONED';

export interface SupportSlaFormIssue {
  code: SupportSlaFormIssueCode;
  path: string;
  message: string;
}

export interface SupportSlaSerializationResult {
  configuration: ReplaceSupportSlaConfigurationDraftDto | null;
  issues: SupportSlaFormIssue[];
}

let localIdSequence = 0;

export function createSupportSlaLocalId(prefix: string): string {
  localIdSequence += 1;
  return `${prefix}-${localIdSequence}`;
}

export function createEmptySupportSlaRule(isFallback = false): SupportSlaRuleForm {
  return {
    id: createSupportSlaLocalId('rule'),
    code: isFallback ? 'DEFAULT' : '',
    priorities: [],
    caseTypes: [],
    groupCodesText: '',
    targetsMinutes: {
      firstHumanResponse: null,
      nextHumanResponse: null,
      resolution: null,
    },
    atRiskRemainingPercent: null,
    firstHumanResponsePause: [],
    nextHumanResponsePause: ['WAITING_END_USER'],
    resolutionPause: ['WAITING_END_USER'],
  };
}

export function createEmptySupportSlaConfigurationForm(): SupportSlaConfigurationForm {
  return {
    timeZone: '',
    weekly: Array.from({ length: 7 }, (_, index) => ({
      isoWeekday: index + 1,
      intervals: [],
    })),
    exceptions: [],
    rules: [createEmptySupportSlaRule(true)],
  };
}

function formatMinute(value: number): string {
  if (value === 1440) return '24:00';
  return `${String(Math.floor(value / 60)).padStart(2, '0')}:${String(value % 60).padStart(2, '0')}`;
}

export function createSupportSlaConfigurationForm(
  configuration: Pick<ReplaceSupportSlaConfigurationDraftDto, 'calendar' | 'policy'>,
): SupportSlaConfigurationForm {
  const weekly = Array.from({ length: 7 }, (_, index) => {
    const day = configuration.calendar.weekly.find(
      (candidate) => candidate.isoWeekday === index + 1,
    );
    return {
      isoWeekday: index + 1,
      intervals: (day?.intervals ?? []).map((interval) => ({
        id: createSupportSlaLocalId('interval'),
        start: formatMinute(interval.startMinute),
        end: formatMinute(interval.endMinute),
      })),
    };
  });
  const rules = [...configuration.policy.rules]
    .sort((left, right) => left.order - right.order)
    .map((rule) => ({
      id: createSupportSlaLocalId('rule'),
      code: rule.code,
      priorities: [...(rule.when.priorities ?? [])],
      caseTypes: [...(rule.when.caseTypes ?? [])],
      groupCodesText: (rule.when.groupCodes ?? []).join('\n'),
      targetsMinutes: {
        firstHumanResponse: rule.targets.firstHumanResponseBusinessSeconds / 60,
        nextHumanResponse: rule.targets.nextHumanResponseBusinessSeconds / 60,
        resolution: rule.targets.resolutionBusinessSeconds / 60,
      },
      atRiskRemainingPercent: rule.atRiskRemainingPercent,
      firstHumanResponsePause: [...rule.pause.firstHumanResponseStatuses],
      nextHumanResponsePause: [...rule.pause.nextHumanResponseStatuses],
      resolutionPause: [...rule.pause.resolutionStatuses],
    }));
  return {
    timeZone: configuration.calendar.timeZone,
    weekly,
    exceptions: configuration.calendar.exceptions.map((exception) => ({
      id: createSupportSlaLocalId('exception'),
      localDate: exception.localDate,
      intervals: exception.intervals.map((interval) => ({
        id: createSupportSlaLocalId('interval'),
        start: formatMinute(interval.startMinute),
        end: formatMinute(interval.endMinute),
      })),
    })),
    rules: rules.length ? rules : [createEmptySupportSlaRule(true)],
  };
}

function validTimeZone(value: string): boolean {
  if (!value.trim()) return false;
  try {
    new Intl.DateTimeFormat('en', { timeZone: value }).format();
    return value.includes('/') || value === 'UTC';
  } catch {
    return false;
  }
}

function parseTime(value: string, allowEndOfDay: boolean): number | null {
  if (allowEndOfDay && value === '24:00') return 1440;
  const match = /^(\d{2}):(\d{2})$/.exec(value);
  if (!match) return null;
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59 ? hour * 60 + minute : null;
}

function validLocalDate(value: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day
  );
}

function nextLocalDate(value: string): string {
  const date = new Date(`${value}T00:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function parseGroupCodes(value: string): string[] {
  return [
    ...new Set(
      value
        .split(/[\s,]+/u)
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ];
}

function isConditioned(rule: SupportSlaRuleForm): boolean {
  return Boolean(
    rule.priorities.length || rule.caseTypes.length || parseGroupCodes(rule.groupCodesText).length,
  );
}

function intervalIssue(issues: SupportSlaFormIssue[], path: string, message: string): void {
  issues.push({ code: 'INTERVAL_INVALID', path, message });
}

function validateIntervals(
  intervals: { startMinute: number; endMinute: number }[],
  path: string,
  issues: SupportSlaFormIssue[],
): void {
  intervals.sort((left, right) => left.startMinute - right.startMinute);
  if (intervals.length > 8) {
    issues.push({
      code: 'INTERVAL_LIMIT',
      path,
      message: 'На один день можно задать не больше восьми интервалов.',
    });
  }
  for (let index = 1; index < intervals.length; index += 1) {
    if (intervals[index]!.startMinute < intervals[index - 1]!.endMinute) {
      issues.push({
        code: 'INTERVAL_OVERLAP',
        path,
        message: 'Рабочие интервалы одного дня не должны пересекаться.',
      });
      break;
    }
  }
}

export function serializeSupportSlaConfiguration(
  form: SupportSlaConfigurationForm,
  catalogRevisionId = 'mock-sla-catalog-r1',
): SupportSlaSerializationResult {
  const issues: SupportSlaFormIssue[] = [];
  const timeZone = form.timeZone.trim();
  if (!timeZone) {
    issues.push({
      code: 'TIME_ZONE_REQUIRED',
      path: 'calendar.timeZone',
      message: 'Выберите часовой пояс рабочего календаря.',
    });
  } else if (!validTimeZone(timeZone)) {
    issues.push({
      code: 'TIME_ZONE_INVALID',
      path: 'calendar.timeZone',
      message: 'Укажите часовой пояс IANA, например Europe/Madrid.',
    });
  }

  const weekly = Array.from({ length: 7 }, (_, index) => ({
    isoWeekday: index + 1,
    intervals: [] as { startMinute: number; endMinute: number }[],
  }));
  for (const day of form.weekly) {
    for (const interval of day.intervals) {
      const startMinute = parseTime(interval.start, false);
      const endMinute = parseTime(interval.end, true);
      const path = `calendar.weekly.${day.isoWeekday}.${interval.id}`;
      if (startMinute === null || endMinute === null || startMinute === endMinute) {
        intervalIssue(issues, path, 'Проверьте начало и конец рабочего интервала.');
        continue;
      }
      const current = weekly[day.isoWeekday - 1];
      if (!current) continue;
      if (endMinute > startMinute) {
        current.intervals.push({ startMinute, endMinute });
      } else {
        current.intervals.push({ startMinute, endMinute: 1440 });
        const next = weekly[day.isoWeekday % 7];
        next?.intervals.push({ startMinute: 0, endMinute });
      }
    }
  }
  for (const day of weekly)
    validateIntervals(day.intervals, `calendar.weekly.${day.isoWeekday}`, issues);
  if (!weekly.some((day) => day.intervals.length)) {
    issues.push({
      code: 'CALENDAR_COVERAGE_REQUIRED',
      path: 'calendar.weekly',
      message: 'Добавьте хотя бы один рабочий интервал.',
    });
  }

  if (form.exceptions.length > 730) {
    issues.push({
      code: 'EXCEPTION_LIMIT',
      path: 'calendar.exceptions',
      message: 'Календарь поддерживает не больше 730 исключений.',
    });
  }
  const exceptionDates = new Set<string>();
  const exceptionMap = new Map<string, { startMinute: number; endMinute: number }[]>();
  for (const exception of form.exceptions) {
    const datePath = `calendar.exceptions.${exception.id}`;
    if (!validLocalDate(exception.localDate)) {
      issues.push({
        code: 'EXCEPTION_DATE_INVALID',
        path: datePath,
        message: 'Укажите корректную дату исключения.',
      });
      continue;
    }
    if (exceptionDates.has(exception.localDate)) {
      issues.push({
        code: 'EXCEPTION_DATE_DUPLICATE',
        path: datePath,
        message: 'Для одной даты можно задать только одно исключение.',
      });
      continue;
    }
    exceptionDates.add(exception.localDate);
    const current = exceptionMap.get(exception.localDate) ?? [];
    exceptionMap.set(exception.localDate, current);
    for (const interval of exception.intervals) {
      const startMinute = parseTime(interval.start, false);
      const endMinute = parseTime(interval.end, true);
      if (startMinute === null || endMinute === null || startMinute === endMinute) {
        intervalIssue(issues, `${datePath}.${interval.id}`, 'Проверьте интервал исключения.');
        continue;
      }
      if (endMinute > startMinute) {
        current.push({ startMinute, endMinute });
      } else {
        current.push({ startMinute, endMinute: 1440 });
        const nextDate = nextLocalDate(exception.localDate);
        const next = exceptionMap.get(nextDate) ?? [];
        next.push({ startMinute: 0, endMinute });
        exceptionMap.set(nextDate, next);
      }
    }
  }
  for (const [date, intervals] of exceptionMap)
    validateIntervals(intervals, `calendar.exceptions.${date}`, issues);

  if (!form.rules.length) {
    issues.push({
      code: 'RULE_REQUIRED',
      path: 'policy.rules',
      message: 'Добавьте обязательное правило для остальных обращений.',
    });
  }
  const ruleCodes = new Set<string>();
  const rules = form.rules.map((rule, index) => {
    const path = `policy.rules.${rule.id}`;
    const code = rule.code.trim();
    if (!/^[A-Z][A-Z0-9_]{1,63}$/.test(code)) {
      issues.push({
        code: 'RULE_CODE_INVALID',
        path,
        message: 'Код правила: 2–64 заглавных латинских символа, цифры или _.',
      });
    } else if (ruleCodes.has(code)) {
      issues.push({
        code: 'RULE_CODE_DUPLICATE',
        path,
        message: 'Коды правил не должны повторяться.',
      });
    }
    ruleCodes.add(code);

    const groupCodes = parseGroupCodes(rule.groupCodesText);
    if (groupCodes.some((groupCode) => !/^[A-Z][A-Z0-9_]{1,63}$/.test(groupCode))) {
      issues.push({
        code: 'GROUP_CODE_INVALID',
        path,
        message: 'Проверьте коды групп в условии.',
      });
    }
    const targets = Object.values(rule.targetsMinutes);
    if (
      targets.some(
        (value) => value === null || !Number.isInteger(value) || value < 1 || value > 43_200,
      )
    ) {
      issues.push({
        code: 'RULE_TARGET_INVALID',
        path,
        message: 'Каждая цель должна быть от 1 минуты до 30 дней.',
      });
    }
    if (
      rule.atRiskRemainingPercent === null ||
      !Number.isInteger(rule.atRiskRemainingPercent) ||
      rule.atRiskRemainingPercent < 1 ||
      rule.atRiskRemainingPercent > 90
    ) {
      issues.push({
        code: 'AT_RISK_INVALID',
        path,
        message: 'Порог риска должен быть от 1 до 90%.',
      });
    }
    if (index === form.rules.length - 1 && isConditioned(rule)) {
      issues.push({
        code: 'FALLBACK_CONDITIONED',
        path,
        message: 'Последнее правило для остальных обращений не может содержать условия.',
      });
    }

    return {
      code,
      order: index,
      when: {
        ...(rule.priorities.length ? { priorities: [...rule.priorities] } : {}),
        ...(rule.caseTypes.length ? { caseTypes: [...rule.caseTypes] } : {}),
        ...(groupCodes.length ? { groupCodes } : {}),
      },
      targets: {
        firstHumanResponseBusinessSeconds: (rule.targetsMinutes.firstHumanResponse ?? 0) * 60,
        nextHumanResponseBusinessSeconds: (rule.targetsMinutes.nextHumanResponse ?? 0) * 60,
        resolutionBusinessSeconds: (rule.targetsMinutes.resolution ?? 0) * 60,
      },
      atRiskRemainingPercent: rule.atRiskRemainingPercent ?? 0,
      pause: {
        firstHumanResponseStatuses: [...rule.firstHumanResponsePause],
        nextHumanResponseStatuses: [...rule.nextHumanResponsePause],
        resolutionStatuses: [...rule.resolutionPause],
      },
    };
  });

  const configuration: ReplaceSupportSlaConfigurationDraftDto = {
    catalogRevisionId,
    calendar: {
      timeZone,
      weekly,
      exceptions: [...exceptionMap.entries()]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([localDate, intervals]) => ({ localDate, intervals })),
    },
    policy: { rules },
  };
  return {
    configuration: issues.length ? null : configuration,
    issues,
  };
}
