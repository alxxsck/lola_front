import type {
  ApplyEventQueryPolicyItemDto,
  EventQueryPolicyFieldDto,
  EventQueryPolicyFieldDtoSemanticType,
  EventQueryPolicyItemDto,
} from "@/shared/api/generated/models";

export interface SchemaField {
  path: string;
  schemaType: string;
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

const modes = new Set(["SUMMARY", "AGGREGATE", "LATEST"]);
const semanticTypes = new Set([
  "STRING",
  "BOOLEAN",
  "INTEGER",
  "DECIMAL",
  "MONEY",
  "CURRENCY",
  "DATETIME",
  "BUSINESS_TIME",
]);
const sensitivities = new Set([
  "PUBLIC_TO_END_USER",
  "PRIVATE_DERIVED",
  "FORBIDDEN",
]);
const operations = new Set([
  "PROJECT",
  "FILTER",
  "GROUP_BY",
  "SUM",
  "MIN",
  "MAX",
  "AVG",
]);

function policyField(value: unknown): EventQueryPolicyFieldDto | null {
  const field = record(value);
  if (
    !field ||
    typeof field.path !== "string" ||
    typeof field.semanticType !== "string" ||
    !semanticTypes.has(field.semanticType) ||
    typeof field.sensitivity !== "string" ||
    !sensitivities.has(field.sensitivity) ||
    !Array.isArray(field.operations) ||
    !field.operations.every(
      (operation) => typeof operation === "string" && operations.has(operation),
    ) ||
    (field.currencyPath !== undefined && typeof field.currencyPath !== "string")
  ) {
    return null;
  }
  return field as unknown as EventQueryPolicyFieldDto;
}

export function eventQueryPolicyItemFromConfiguration(
  stableCode: string,
  value: unknown,
): EventQueryPolicyItemDto | null {
  const configuration = record(value);
  if (
    !configuration ||
    typeof configuration.descriptionForAI !== "string" ||
    !Array.isArray(configuration.allowedModes) ||
    configuration.allowedModes.length === 0 ||
    !configuration.allowedModes.every(
      (mode) => typeof mode === "string" && modes.has(mode),
    ) ||
    !Array.isArray(configuration.safeFields) ||
    typeof configuration.maxInteractiveLookbackHours !== "number" ||
    typeof configuration.maxVerificationLookbackHours !== "number"
  ) {
    return null;
  }
  const safeFields = configuration.safeFields.map(policyField);
  if (safeFields.some((field) => field === null)) return null;
  return {
    stableCode,
    descriptionForAI: configuration.descriptionForAI,
    allowedModes:
      configuration.allowedModes as EventQueryPolicyItemDto["allowedModes"],
    safeFields: safeFields as EventQueryPolicyFieldDto[],
    maxInteractiveLookbackHours: configuration.maxInteractiveLookbackHours,
    maxVerificationLookbackHours: configuration.maxVerificationLookbackHours,
  };
}

export function eventQueryPolicyItemApply(
  item: EventQueryPolicyItemDto,
  enabled: boolean,
  endUserConversationEnabled: boolean,
  concurrencyToken: string,
): ApplyEventQueryPolicyItemDto {
  return {
    concurrencyToken,
    enabled,
    endUserConversationEnabled,
    descriptionForAI: item.descriptionForAI,
    allowedModes: [...item.allowedModes],
    safeFields: item.safeFields.map((field) => ({
      ...field,
      operations: [...field.operations],
    })),
    maxInteractiveLookbackHours: item.maxInteractiveLookbackHours,
    maxVerificationLookbackHours: item.maxVerificationLookbackHours,
  };
}

export function mergeRecommendedSafeFields(
  item: EventQueryPolicyItemDto,
  recommendations: readonly EventQueryPolicyFieldDto[],
): EventQueryPolicyItemDto {
  const existingPaths = new Set(item.safeFields.map((field) => field.path));
  const additions = recommendations
    .filter((field) => !existingPaths.has(field.path))
    .map((field) => ({ ...field, operations: [...field.operations] }));
  const aggregateEnabled = item.allowedModes.includes("AGGREGATE");
  if (additions.length === 0 && aggregateEnabled) return item;
  return {
    ...item,
    allowedModes: aggregateEnabled
      ? item.allowedModes
      : [...item.allowedModes, "AGGREGATE"],
    safeFields: [...item.safeFields, ...additions],
  };
}
