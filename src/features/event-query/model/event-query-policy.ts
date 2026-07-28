import type {
  EventQueryPolicyDiagnosticDto,
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
