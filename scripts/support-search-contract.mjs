function requiredSchema(contract, name) {
  const schema = contract.components?.schemas?.[name];
  if (!schema) throw new Error(`Support Search requires schema ${name}`);
  return schema;
}

function operation(contract, operationId) {
  for (const pathItem of Object.values(contract.paths ?? {})) {
    for (const value of Object.values(pathItem ?? {})) {
      if (value?.operationId === operationId) return value;
    }
  }
  throw new Error(`Support Search requires operation ${operationId}`);
}

function requireFields(schema, name, fields) {
  for (const field of fields) {
    if (!schema.required?.includes(field))
      throw new Error(`${name} must require ${field}`);
  }
}

function requireEnum(schema, name, values) {
  for (const value of values) {
    if (!schema.enum?.includes(value))
      throw new Error(`${name} must include ${value}`);
  }
}

export function validateSupportSearchContract(contract) {
  const operations = [
    ["SupportSearch_cases", "SupportSearchCasePageResponseDto"],
    ["SupportSearch_conversations", "SupportSearchConversationPageResponseDto"],
    ["SupportSearch_messages", "SupportSearchMessagePageResponseDto"],
    ["SupportSearch_users", "SupportSearchEndUserPageResponseDto"],
  ];
  for (const [operationId, responseName] of operations) {
    const target = operation(contract, operationId);
    if (!target["x-iam-permission"])
      throw new Error(`${operationId} must retain IAM authority`);
    if (target.requestBody?.content?.["application/json"]?.schema?.$ref === undefined)
      throw new Error(`${operationId} must publish a typed request body`);
    if (
      target.responses?.["200"]?.content?.["application/json"]?.schema?.$ref !==
      `#/components/schemas/${responseName}`
    )
      throw new Error(`${operationId} must publish ${responseName}`);
  }

  const caseQuery = requiredSchema(contract, "SupportCaseSearchQueryDto");
  for (const field of [
    "statuses",
    "waitingSides",
    "assignmentStates",
    "assigneeCmsUserIds",
    "teamIds",
    "priorities",
    "slaStates",
    "queueIds",
    "topicCodes",
    "categoryCodes",
    "languages",
    "channels",
    "unreadState",
    "draftState",
    "deliveryState",
    "timeRange",
    "sort",
    "cursor",
  ]) {
    if (!caseQuery.properties?.[field])
      throw new Error(`SupportCaseSearchQueryDto must publish ${field}`);
  }
  if (caseQuery.properties.cursor.maxLength !== 2048)
    throw new Error("SupportCaseSearchQueryDto cursor must stay bounded");

  requireEnum(requiredSchema(contract, "SupportCaseSearchSortDto").properties.field, "SupportCaseSearchSortDto.field", [
    "RELEVANCE",
    "ACTIVITY_AT",
    "PRIORITY",
    "SLA_DUE_AT",
    "WAITING_SINCE",
    "UNREAD_COUNT",
    "CREATED_AT",
  ]);
  requireEnum(
    requiredSchema(contract, "SupportSearchFreshnessResponseDto").properties.state,
    "SupportSearchFreshnessResponseDto.state",
    ["READY", "BUILDING", "DEGRADED"],
  );

  for (const name of [
    "SupportSearchCasePageResponseDto",
    "SupportSearchConversationPageResponseDto",
    "SupportSearchMessagePageResponseDto",
    "SupportSearchEndUserPageResponseDto",
  ])
    requireFields(requiredSchema(contract, name), name, ["items", "freshness"]);
  requireFields(
    requiredSchema(contract, "SupportSearchCanonicalTargetResponseDto"),
    "SupportSearchCanonicalTargetResponseDto",
    ["kind", "id"],
  );
}
