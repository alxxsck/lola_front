import type { ReportingDrilldownSubjectDto } from '@/shared/api/generated/models';

export type SupportAnalyticsDrilldownTarget =
  | { name: 'support-inbox-case'; params: { caseId: string } }
  | { name: 'support-quality-review'; params: { reviewId: string } };

/** Maps only capability-bearing server subjects; unknown combinations stay inert. */
export function supportAnalyticsDrilldownTarget(
  subject: ReportingDrilldownSubjectDto,
): SupportAnalyticsDrilldownTarget | null {
  if (subject.kind === 'CASE' && subject.capability === 'SUPPORT_CASE_DETAIL') {
    return { name: 'support-inbox-case', params: { caseId: subject.id } };
  }
  if (subject.kind === 'REVIEW' && subject.capability === 'SUPPORT_QUALITY_REVIEW_DETAIL') {
    return {
      name: 'support-quality-review',
      params: { reviewId: subject.id },
    };
  }
  return null;
}
