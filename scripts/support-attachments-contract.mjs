function operationIds(document) {
  return new Set(
    Object.values(document.paths ?? {}).flatMap((path) =>
      Object.values(path).flatMap((operation) =>
        operation?.operationId ? [operation.operationId] : [],
      ),
    ),
  );
}

function schema(document, name) {
  const value = document.components?.schemas?.[name];
  if (!value) throw new Error(`Attachment contract is missing schema ${name}`);
  return value;
}

function requireProperties(document, name, properties) {
  const available = schema(document, name).properties ?? {};
  const missing = properties.filter((property) => !available[property]);
  if (missing.length)
    throw new Error(`${name} is missing attachment fields: ${missing.join(', ')}`);
}

export function validateSupportAttachmentsContract(document) {
  const operations = operationIds(document);
  const requiredOperations = [
    'AdminChatAttachment_startUpload',
    'AdminChatAttachment_listDraft',
    'AdminChatAttachment_status',
    'AdminChatAttachment_completeUpload',
    'AdminChatAttachment_grantDownload',
    'AdminChatAttachment_revoke',
    'SupportInternalNoteAttachment_startUpload',
    'SupportInternalNoteAttachment_listDraft',
    'SupportInternalNoteAttachment_status',
    'SupportInternalNoteAttachment_completeUpload',
    'SupportInternalNoteAttachment_grantDownload',
    'SupportInternalNoteAttachment_revoke',
  ];
  const missing = requiredOperations.filter((operation) => !operations.has(operation));
  if (missing.length)
    throw new Error(`Support attachment operations are missing: ${missing.join(', ')}`);

  requireProperties(document, 'SendAdminMessageDto', [
    'text',
    'attachmentIds',
    'attachmentDraftKey',
  ]);
  requireProperties(document, 'CreateSupportInternalNoteDto', [
    'body',
    'attachmentIds',
    'attachmentDraftKey',
  ]);
  requireProperties(document, 'SupportWorkspaceCapabilitiesResponseDto', [
    'attachments',
    'internalNotes',
  ]);
  requireProperties(document, 'SupportWorkspaceInternalNoteCapabilitiesResponseDto', [
    'attachmentUpload',
    'attachmentDownload',
  ]);
  requireProperties(document, 'AdminStoredMessageResponseDto', ['attachments']);
  requireProperties(document, 'SupportInternalNoteResponseDto', ['attachments']);

  if ((schema(document, 'SendAdminMessageDto').required ?? []).includes('text'))
    throw new Error('SendAdminMessageDto.text must remain optional for attachment-only replies');
  if ((schema(document, 'CreateSupportInternalNoteDto').required ?? []).includes('body'))
    throw new Error(
      'CreateSupportInternalNoteDto.body must remain optional for attachment-only notes',
    );
}
