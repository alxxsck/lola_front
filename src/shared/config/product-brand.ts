export const productBrand = {
  name: 'Retenive',
  mark: 'R',
  cmsName: 'Retenive CMS',
} as const;

export function productDocumentTitle(projectName?: string): string {
  return projectName ? `${productBrand.name} | ${projectName}` : `${productBrand.name} | CMS`;
}
