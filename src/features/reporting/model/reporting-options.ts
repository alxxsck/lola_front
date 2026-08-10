import type {
  ReportingArtifactSpace,
  ReportingDateRange,
} from "./reporting-types";

export const reportingDateRangeOptions: Array<{
  value: ReportingDateRange;
  label: string;
}> = [
  { value: "LAST_7_DAYS", label: "Последние 7 дней" },
  { value: "LAST_30_DAYS", label: "Последние 30 дней" },
  { value: "LAST_90_DAYS", label: "Последние 90 дней" },
];

export const reportingSpaceOptions: Array<{
  value: ReportingArtifactSpace;
  label: string;
}> = [
  { value: "PERSONAL", label: "Личное" },
  { value: "TEAM", label: "Команда" },
  { value: "PROJECT", label: "Проект" },
];

export function reportingSpaceLabel(space: ReportingArtifactSpace): string {
  return (
    reportingSpaceOptions.find(({ value }) => value === space)?.label ?? space
  );
}
