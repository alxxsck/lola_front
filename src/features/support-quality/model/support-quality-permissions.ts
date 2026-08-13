export type QualityReviewScope = 'NONE' | 'SELF' | 'PROJECT';

export function qualityQueueAccess(permissionCodes: string[]): {
  tasks: boolean;
  reviews: QualityReviewScope;
} {
  const permissions = new Set(permissionCodes);
  return {
    tasks: permissions.has('project.support.quality.review'),
    reviews: permissions.has('project.support.quality.read')
      ? 'PROJECT'
      : permissions.has('project.support.quality.self_read')
        ? 'SELF'
        : 'NONE',
  };
}
