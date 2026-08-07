export function contractSchema(document, name) {
  const value = document?.components?.schemas?.[name];
  if (!value) throw new Error(`OpenAPI is missing ${name}`);
  return value;
}

export function contractOperation(document, operationId) {
  for (const pathItem of Object.values(document?.paths ?? {})) {
    for (const value of Object.values(pathItem ?? {})) {
      if (value?.operationId === operationId) return value;
    }
  }
  throw new Error(`OpenAPI is missing operation ${operationId}`);
}

export function operationParameter(operationValue, name) {
  const value = operationValue.parameters?.find(
    (candidate) => candidate.name === name,
  );
  if (!value)
    throw new Error(`${operationValue.operationId} is missing ${name}`);
  return value;
}

export function requireOperationPermission(operationValue, code) {
  if (operationValue["x-iam-permission"]?.code !== code) {
    throw new Error(`${operationValue.operationId} must require ${code}`);
  }
}

export function requireSchemaProperties(document, schemaName, properties) {
  const required = new Set(contractSchema(document, schemaName).required ?? []);
  for (const property of properties) {
    if (!required.has(property)) {
      throw new Error(`${schemaName} must require ${property}`);
    }
  }
}

export function requireSchemaFields(document, schemaName, fields) {
  const properties = contractSchema(document, schemaName).properties ?? {};
  for (const field of fields) {
    if (!(field in properties)) {
      throw new Error(`${schemaName} must publish ${field}`);
    }
  }
}

export function requireSchemaPropertyEnum(
  document,
  schemaName,
  propertyName,
  values,
) {
  const actual = new Set(
    contractSchema(document, schemaName).properties?.[propertyName]?.enum ?? [],
  );
  for (const value of values) {
    if (!actual.has(value)) {
      throw new Error(`${schemaName}.${propertyName} must retain ${value}`);
    }
  }
}

export function requireSchemaEnum(document, schemaName, values) {
  const actual = new Set(contractSchema(document, schemaName).enum ?? []);
  for (const value of values) {
    if (!actual.has(value))
      throw new Error(`${schemaName} must retain ${value}`);
  }
}
