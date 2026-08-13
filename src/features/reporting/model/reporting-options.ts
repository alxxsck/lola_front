import type { ReportingArtifactSpace, ReportingDateRange } from './reporting-types';

export const reportingDateRangeOptions: Array<{
  value: ReportingDateRange;
  label: string;
}> = [
  { value: 'LAST_2_DAYS', label: 'Последние 2 полных дня' },
  { value: 'LAST_7_DAYS', label: 'Последние 7 полных дней' },
  { value: 'LAST_30_DAYS', label: 'Последние 30 полных дней' },
  { value: 'LAST_90_DAYS', label: 'Последние 90 полных дней' },
];

export function reportingPeriodDays(range: ReportingDateRange): number {
  switch (range) {
    case 'LAST_2_DAYS':
      return 2;
    case 'LAST_7_DAYS':
      return 7;
    case 'LAST_30_DAYS':
      return 30;
    case 'LAST_90_DAYS':
      return 90;
  }
}

export const reportingSpaceOptions: Array<{
  value: ReportingArtifactSpace;
  label: string;
}> = [
  { value: 'PERSONAL', label: 'Личное' },
  { value: 'TEAM', label: 'Команда' },
  { value: 'PROJECT', label: 'Проект' },
];

export function reportingSpaceLabel(space: ReportingArtifactSpace): string {
  return reportingSpaceOptions.find(({ value }) => value === space)?.label ?? space;
}
