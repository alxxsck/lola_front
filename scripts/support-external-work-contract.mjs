function operations(document) {
  const result = new Map();
  for (const [path, pathItem] of Object.entries(document.paths ?? {})) {
    for (const [method, operation] of Object.entries(pathItem ?? {})) {
      if (operation?.operationId) result.set(operation.operationId, { ...operation, path, method });
    }
  }
  return result;
}

function requireOperation(index, operationId) {
  const operation = index.get(operationId);
  if (!operation) throw new Error(`Support External Work operation is missing: ${operationId}`);
  return operation;
}

function requireSchemaProperties(document, name, properties) {
  const schema = document.components?.schemas?.[name];
  if (!schema) throw new Error(`Support External Work schema is missing: ${name}`);
  const missing = properties.filter((property) => !schema.properties?.[property]);
  if (missing.length) throw new Error(`${name} is missing fields: ${missing.join(', ')}`);
}

function requireHeader(operation, name) {
  const header = operation.parameters?.find(
    (parameter) => parameter.in === 'header' && parameter.name === name,
  );
  if (!header?.required) throw new Error(`${operation.operationId} must require ${name}`);
}

export function validateSupportExternalWorkContract(document) {
  const index = operations(document);
  const reads = [
    ['SupportExternalConnection_list', 'project.support.external_work.manage'],
    ['SupportExternalCatalog_read', 'project.support.external_work.manage'],
    ['SupportExternalMapping_list', 'project.support.external_work.manage'],
    ['SupportExternalInbox_list', 'project.support.external_work.inbox_read'],
    ['SupportExternalItem_list', 'project.support.external_work.read_linked'],
    ['SupportExternalTimeline_list', 'project.support.external_work.read_linked'],
    ['SupportExternalCommand_listForCase', 'project.support.external_work.read_linked'],
    ['SupportExternalCommand_read', 'project.support.external_work.read_linked'],
    ['SupportExternalCaseCreateOptions_read', 'project.support.external_work.create'],
    ['SupportExternalCaseLinks_list', 'project.support.external_work.read_linked'],
    ['SupportExternalCaseLinks_read', 'project.support.external_work.read_linked'],
  ];
  for (const [operationId, permission] of reads) {
    const operation = requireOperation(index, operationId);
    if (operation['x-iam-permission']?.code !== permission)
      throw new Error(`${operationId} must require exact permission ${permission}`);
  }

  const auditedSettingsMutations = [
    'SupportExternalConnection_startOAuth',
    'SupportExternalConnection_selectOAuthTenant',
    'SupportExternalConnection_test',
    'SupportExternalConnection_reconnectOAuth',
    'SupportExternalConnection_disable',
    'SupportExternalConnection_revoke',
    'SupportExternalMapping_create',
    'SupportExternalMapping_replaceDraft',
    'SupportExternalMapping_beginDraft',
    'SupportExternalMapping_publish',
    'SupportExternalMapping_rollback',
  ];
  for (const operationId of auditedSettingsMutations) {
    const operation = requireOperation(index, operationId);
    if (operation['x-iam-permission']?.code !== 'project.support.external_work.manage')
      throw new Error(`${operationId} must require External Work manage`);
    if (operation['x-iam-fresh-strong-authentication'] !== true)
      throw new Error(`${operationId} must require fresh strong authentication`);
    requireHeader(operation, 'Idempotency-Key');
    const responseHeaders =
      operation.responses?.['200']?.headers ??
      operation.responses?.['201']?.headers ??
      operation.responses?.['202']?.headers ??
      {};
    for (const name of ['X-Idempotent-Replay', 'X-Support-External-Settings-Mutation-Receipt-Id']) {
      if (!responseHeaders[name])
        throw new Error(`${operationId} must publish response header ${name}`);
    }
  }

  const catalogRefresh = requireOperation(index, 'SupportExternalCatalog_refresh');
  if (catalogRefresh['x-iam-permission']?.code !== 'project.support.external_work.manage')
    throw new Error('SupportExternalCatalog_refresh must require External Work manage');
  requireHeader(catalogRefresh, 'Idempotency-Key');

  for (const operationId of [
    'SupportExternalConnection_reconnectOAuth',
    'SupportExternalConnection_disable',
    'SupportExternalConnection_revoke',
    'SupportExternalMapping_replaceDraft',
    'SupportExternalMapping_beginDraft',
    'SupportExternalMapping_publish',
    'SupportExternalMapping_rollback',
  ])
    requireHeader(requireOperation(index, operationId), 'If-Match');

  const submit = requireOperation(index, 'SupportExternalCommand_submit');
  requireHeader(submit, 'Idempotency-Key');
  const submitPermissions = new Set(
    (submit['x-iam-any-permission'] ?? []).map((item) => item.code),
  );
  for (const permission of [
    'project.support.external_work.create',
    'project.support.external_work.comment_internal',
    'project.support.external_work.comment_public',
    'project.support.external_work.read_linked',
  ]) {
    if (!submitPermissions.has(permission))
      throw new Error(`SupportExternalCommand_submit must publish ${permission}`);
  }
  if (!submit.responses?.['202'])
    throw new Error('SupportExternalCommand_submit must return async 202');
  const submitVariants = submit.requestBody?.content?.['application/json']?.schema?.oneOf ?? [];
  const intents = new Set(
    submitVariants.flatMap((variant) => variant.properties?.intent?.enum ?? []),
  );
  for (const intent of ['CREATE', 'COMMENT', 'REFRESH', 'UNLINK'])
    if (!intents.has(intent))
      throw new Error(`SupportExternalCommand_submit must support ${intent}`);

  for (const [operationId, permission] of [
    ['SupportExternalCommand_retry', 'project.support.external_work.retry'],
    ['SupportExternalCommand_refreshEvidence', 'project.support.external_work.resolve_unknown'],
    ['SupportExternalCommand_resolveUnknown', 'project.support.external_work.resolve_unknown'],
    ['SupportExternalInbox_linkToCase', 'project.support.external_work.inbox_read'],
  ]) {
    const operation = requireOperation(index, operationId);
    if (operation['x-iam-permission']?.code !== permission)
      throw new Error(`${operationId} must require exact permission ${permission}`);
    requireHeader(operation, 'If-Match');
    requireHeader(operation, 'Idempotency-Key');
  }

  requireSchemaProperties(document, 'SupportExternalConnectionResponseDto', [
    'provider',
    'lifecycle',
    'tenantIdentity',
    'displayName',
    'capabilities',
    'version',
  ]);
  requireSchemaProperties(document, 'SupportExternalProjectItemResponseDto', [
    'remoteItemId',
    'lastRefreshedAt',
    'allowedActions',
    'link',
  ]);
  requireSchemaProperties(document, 'SupportExternalCommandStatusResponseDto', [
    'status',
    'errorCategory',
    'nextAttemptAt',
    'allowedActions',
  ]);
  requireSchemaProperties(document, 'SupportExternalCreateOptionResponseDto', [
    'optionId',
    'mappingRevisionId',
    'formRevision',
    'allowedActions',
    'fields',
  ]);
  requireSchemaProperties(document, 'SupportExternalLinkResponseDto', [
    'linkId',
    'version',
    'item',
  ]);
  requireSchemaProperties(document, 'SupportExternalWorkCommandReceiptDto', [
    'commandId',
    'status',
    'replayed',
  ]);
  requireSchemaProperties(document, 'SupportExternalMappingDraftResponseDto', ['root', 'draft']);
}
