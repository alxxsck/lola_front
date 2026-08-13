import type {
  ReportingCatalogDatasetDto,
  ReportingCatalogMetricDto,
  ReportingQueryFilterDto,
} from '@/shared/api/generated/models';

export function parseSupportAnalyticsFilterValue(value: string): string[] {
  return [
    ...new Set(
      value
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ].slice(0, 100);
}

export function compatibleSupportAnalyticsFilters(
  dataset: ReportingCatalogDatasetDto,
  metric: ReportingCatalogMetricDto | undefined,
  applied: Record<string, string[]>,
): ReportingQueryFilterDto[] {
  if (!metric) return [];
  return Object.entries(applied)
    .filter(
      ([dimension, values]) =>
        values.length > 0 &&
        dataset.dimensions.some(({ code }) => code === dimension) &&
        metric.compatibleDimensions.includes(dimension),
    )
    .map(([dimension, values]) => ({
      dimension,
      operator: values.length === 1 ? 'EQUALS' : 'IN',
      value: (values.length === 1
        ? values[0]
        : values) as unknown as ReportingQueryFilterDto['value'],
    }));
}
