import { xaiVoiceCatalogList } from "@/shared/api/generated/lola-backend";

export interface ProjectVoiceCatalogItem {
  id: string;
  name: string;
  language: string;
}

export interface ProjectVoiceCatalog {
  items: ProjectVoiceCatalogItem[];
  stale: boolean;
}

function boundedText(value: unknown, maximum: number): value is string {
  return (
    typeof value === "string" &&
    value.length > 0 &&
    value.length <= maximum &&
    value.trim() === value
  );
}

export function parseProjectVoiceCatalog(
  value: unknown,
): ProjectVoiceCatalog | undefined {
  if (
    typeof value !== "object" ||
    value === null ||
    !("items" in value) ||
    !Array.isArray(value.items) ||
    value.items.length > 100 ||
    !("stale" in value) ||
    typeof value.stale !== "boolean"
  ) {
    return undefined;
  }

  const ids = new Set<string>();
  const items: ProjectVoiceCatalogItem[] = [];
  for (const item of value.items) {
    if (
      typeof item !== "object" ||
      item === null ||
      !("id" in item) ||
      !boundedText(item.id, 64) ||
      !("name" in item) ||
      !boundedText(item.name, 100) ||
      !("language" in item) ||
      !boundedText(item.language, 64) ||
      ids.has(item.id)
    ) {
      return undefined;
    }
    ids.add(item.id);
    items.push({ id: item.id, name: item.name, language: item.language });
  }
  return { items, stale: value.stale };
}

export async function fetchProjectVoiceCatalog(
  projectId: string,
  signal?: AbortSignal,
): Promise<ProjectVoiceCatalog> {
  const response: unknown = await xaiVoiceCatalogList(projectId, { signal });
  const catalog = parseProjectVoiceCatalog(response);
  if (!catalog) {
    throw new Error("Сервер вернул некорректный каталог голосов xAI");
  }
  return catalog;
}
