import type {
  EventQueryPolicyDiagnosticDto,
  EventQueryPolicyDocumentDto,
  EventQueryPolicyFieldDtoSemanticType,
} from "@/shared/api/generated/models";

export interface SchemaField {
  path: string;
  schemaType: string;
}

interface PolicyItemIdentity {
  stableCode: string;
}

function record(value: unknown): Record<string, unknown> | null {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

export function flattenSchemaFields(
  schema: Record<string, unknown>,
  prefix = "",
): SchemaField[] {
  const properties = record(schema.properties);
  if (!properties) return [];

  return Object.entries(properties).flatMap(([key, value]) => {
    const field = record(value);
    const path = prefix ? `${prefix}.${key}` : key;
    if (!field || typeof field.type !== "string") return [];
    if (field.type === "object") {
      return flattenSchemaFields(field, path);
    }
    if (!["string", "number", "integer", "boolean"].includes(field.type)) {
      return [];
    }
    return [{ path, schemaType: field.type }];
  });
}

export function schemaTypeToSemanticType(
  schemaType: string,
): EventQueryPolicyFieldDtoSemanticType {
  if (schemaType === "integer") return "INTEGER";
  if (schemaType === "number") return "DECIMAL";
  if (schemaType === "boolean") return "BOOLEAN";
  return "STRING";
}

export function eventPolicyState(
  code: string,
  draftItems: readonly PolicyItemIdentity[],
  publishedItems: readonly PolicyItemIdentity[],
  diagnostics: readonly Pick<EventQueryPolicyDiagnosticDto, "location">[],
): "disabled" | "draft" | "published" | "invalid" {
  const draftIndex = draftItems.findIndex((item) => item.stableCode === code);
  if (draftIndex < 0) return "disabled";
  if (
    diagnostics.some((diagnostic) =>
      diagnostic.location.startsWith(`items[${draftIndex}]`),
    )
  ) {
    return "invalid";
  }
  return publishedItems.some((item) => item.stableCode === code)
    ? "published"
    : "draft";
}

export interface EventQueryPolicyImpact {
  enabledChanged: boolean;
  addedEvents: number;
  changedEvents: number;
  removedEvents: number;
}

export function eventQueryPolicyImpact(
  published: EventQueryPolicyDocumentDto | null,
  draft: EventQueryPolicyDocumentDto,
): EventQueryPolicyImpact {
  const publishedByCode = new Map(
    (published?.items ?? []).map((item) => [item.stableCode, item]),
  );
  const draftByCode = new Map(
    draft.items.map((item) => [item.stableCode, item]),
  );
  let addedEvents = 0;
  let changedEvents = 0;
  for (const [code, item] of draftByCode) {
    const previous = publishedByCode.get(code);
    if (!previous) addedEvents += 1;
    else if (JSON.stringify(previous) !== JSON.stringify(item))
      changedEvents += 1;
  }
  let removedEvents = 0;
  for (const code of publishedByCode.keys()) {
    if (!draftByCode.has(code)) removedEvents += 1;
  }
  return {
    enabledChanged: published !== null && published.enabled !== draft.enabled,
    addedEvents,
    changedEvents,
    removedEvents,
  };
}

export function eventQueryPolicyHardLimitViolations(
  document: EventQueryPolicyDocumentDto,
): string[] {
  const violations: string[] = [];
  if (document.items.length > 50) {
    violations.push("Не более 50 типов событий в одной политике.");
  }
  for (const item of document.items) {
    if (item.safeFields.length > 50) {
      violations.push(
        `${item.stableCode}: не более 50 безопасных полей на тип события.`,
      );
    }
    if (item.descriptionForAI.length > 500) {
      violations.push(
        `${item.stableCode}: описание для ИИ не должно превышать 500 символов.`,
      );
    }
  }
  return violations;
}
