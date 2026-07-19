import type { AttributeContractDocumentDto } from "@/shared/api/generated/models";

function storageKey(projectId: string) {
  return `lola:demo:profile-fields:${projectId}`;
}

export function readDemoContractDraft(
  projectId: string,
  fallback: AttributeContractDocumentDto,
): AttributeContractDocumentDto {
  try {
    const saved = window.localStorage.getItem(storageKey(projectId));
    return saved
      ? (JSON.parse(saved) as AttributeContractDocumentDto)
      : structuredClone(fallback);
  } catch {
    return structuredClone(fallback);
  }
}

export function writeDemoContractDraft(
  projectId: string,
  document: AttributeContractDocumentDto,
) {
  window.localStorage.setItem(storageKey(projectId), JSON.stringify(document));
}
