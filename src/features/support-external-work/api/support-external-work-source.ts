import {
  supportExternalCaseCreateOptionsRead,
  supportExternalCaseLinksList,
  supportExternalCaseLinksRead,
  supportExternalCatalogRead,
  supportExternalCatalogRefresh,
  supportExternalCatalogRefreshStatus,
  supportExternalCommandListForCase,
  supportExternalCommandRead,
  supportExternalCommandRefreshEvidence,
  supportExternalCommandResolveUnknown,
  supportExternalCommandRetry,
  supportExternalCommandSubmit,
  supportExternalConnectionDisable,
  supportExternalConnectionList,
  supportExternalConnectionListOAuthTenants,
  supportExternalConnectionReconnectOAuth,
  supportExternalConnectionRevoke,
  supportExternalConnectionSelectOAuthTenant,
  supportExternalConnectionStartOAuth,
  supportExternalConnectionTest,
  supportExternalInboxList,
  supportExternalInboxLinkToCase,
  supportExternalInboxRead,
  supportExternalInboxTimelineList,
  supportExternalItemList,
  supportExternalItemRead,
  supportExternalMappingBeginDraft,
  supportExternalMappingCreate,
  supportExternalMappingDiffDraft,
  supportExternalMappingList,
  supportExternalMappingListRevisions,
  supportExternalMappingPreviewDraft,
  supportExternalMappingPublish,
  supportExternalMappingReadDraft,
  supportExternalMappingReplaceDraft,
  supportExternalMappingRollback,
  supportExternalMappingValidateDraft,
  supportExternalSettingsMutationReadOutcome,
  supportExternalTimelineList,
} from '@/shared/api/generated/retenive-backend';
import type {
  CreateSupportExternalMappingDto,
  LinkHelpDeskCompatibilityTicketDto,
  LinkHelpDeskCompatibilityTicketResponseDto,
  PreviewSupportExternalMappingDto,
  ResolveSupportExternalWorkCommandDto,
  RollbackSupportExternalMappingDto,
  SelectSupportExternalOAuthTenantDto,
  SupportExternalCatalogReadParams,
  SupportExternalCatalogRefreshReceiptDto,
  SupportExternalCatalogRefreshStatusDto,
  SupportExternalCatalogResponseDto,
  SupportExternalCaseLinksListParams,
  SupportExternalCommandListForCaseParams,
  SupportExternalCommandPageResponseDto,
  SupportExternalCommandRefreshEvidenceBody,
  SupportExternalCommandStatusResponseDto,
  SupportExternalCommandSubmitBody,
  SupportExternalConnectionListResponseDto,
  SupportExternalConnectionResponseDto,
  SupportExternalConnectionTestResponseDto,
  SupportExternalCreateOptionsResponseDto,
  SupportExternalInboxListParams,
  SupportExternalInboxTimelineListParams,
  SupportExternalItemListParams,
  SupportExternalItemPageResponseDto,
  SupportExternalLinkListResponseDto,
  SupportExternalLinkResponseDto,
  SupportExternalMappingDiffResponseDto,
  SupportExternalMappingDraftResponseDto,
  SupportExternalMappingListParams,
  SupportExternalMappingListResponseDto,
  SupportExternalMappingListRevisionsParams,
  SupportExternalMappingPreviewResponseDto,
  SupportExternalMappingRevisionPageResponseDto,
  SupportExternalMappingRollbackResponseDto,
  SupportExternalMappingValidationResponseDto,
  SupportExternalMutationOutcomeResponseDto,
  SupportExternalOAuthStartResponseDto,
  SupportExternalOAuthTenantListResponseDto,
  SupportExternalProjectItemResponseDto,
  SupportExternalTimelinePageResponseDto,
  SupportExternalTimelineListParams,
  SupportExternalWorkCommandReceiptDto,
  UpdateSupportExternalMappingDraftDto,
} from '@/shared/api/generated/models';
import { noAuthRetryRequestOptions } from '@/shared/api/http/axios-instance';
import type { RequestOptions } from '@/shared/api/http/orval-mutator';
import { isMockMode } from '@/shared/config/data-mode';
import { mockSupportExternalWorkSource } from './support-external-work-mock-source';

export type SupportExternalProvider = 'JSM' | 'HELPDESK';

export interface SupportExternalMutationMetadata {
  receiptId: string | null;
  replayed: boolean;
}

export interface SupportExternalMutation<T> {
  value: T;
  metadata: SupportExternalMutationMetadata;
}

export interface SupportExternalWorkSource {
  readCaseCreateOptions(
    projectId: string,
    caseId: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalCreateOptionsResponseDto>;
  listCaseLinks(
    projectId: string,
    caseId: string,
    params?: SupportExternalCaseLinksListParams,
    signal?: AbortSignal,
  ): Promise<SupportExternalLinkListResponseDto>;
  readCaseLink(
    projectId: string,
    caseId: string,
    linkId: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalLinkResponseDto>;
  readCommand(
    projectId: string,
    caseId: string,
    commandId: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalCommandStatusResponseDto>;
  submitCaseCommand(
    projectId: string,
    caseId: string,
    body: SupportExternalCommandSubmitBody,
    expectedLinkVersion: number | undefined,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalWorkCommandReceiptDto>;
  resolveCommand(
    projectId: string,
    caseId: string,
    commandId: string,
    body: ResolveSupportExternalWorkCommandDto,
    expectedVersion: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalWorkCommandReceiptDto>;
  linkInboxItemToCase(
    projectId: string,
    remoteItemId: string,
    body: LinkHelpDeskCompatibilityTicketDto,
    expectedVersion: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<LinkHelpDeskCompatibilityTicketResponseDto>;
  listConnections(
    projectId: string,
    cursor?: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalConnectionListResponseDto>;
  startOAuth(
    projectId: string,
    provider: SupportExternalProvider,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMutation<SupportExternalOAuthStartResponseDto>>;
  listOAuthTenants(
    projectId: string,
    sessionId: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalOAuthTenantListResponseDto>;
  selectOAuthTenant(
    projectId: string,
    sessionId: string,
    body: SelectSupportExternalOAuthTenantDto,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMutation<SupportExternalConnectionResponseDto>>;
  testConnection(
    projectId: string,
    connectionId: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMutation<SupportExternalConnectionTestResponseDto>>;
  reconnectConnection(
    projectId: string,
    connectionId: string,
    expectedVersion: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMutation<SupportExternalOAuthStartResponseDto>>;
  disableConnection(
    projectId: string,
    connectionId: string,
    expectedVersion: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMutation<SupportExternalConnectionResponseDto>>;
  revokeConnection(
    projectId: string,
    connectionId: string,
    expectedVersion: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMutation<SupportExternalConnectionResponseDto>>;
  readCatalog(
    projectId: string,
    connectionId: string,
    params?: SupportExternalCatalogReadParams,
    signal?: AbortSignal,
  ): Promise<SupportExternalCatalogResponseDto>;
  refreshCatalog(
    projectId: string,
    connectionId: string,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMutation<SupportExternalCatalogRefreshReceiptDto>>;
  readCatalogRefresh(
    projectId: string,
    jobId: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalCatalogRefreshStatusDto>;
  listMappings(
    projectId: string,
    params?: SupportExternalMappingListParams,
    signal?: AbortSignal,
  ): Promise<SupportExternalMappingListResponseDto>;
  createMapping(
    projectId: string,
    body: CreateSupportExternalMappingDto,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMutation<SupportExternalMappingDraftResponseDto>>;
  readMappingDraft(
    projectId: string,
    mappingId: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMappingDraftResponseDto>;
  replaceMappingDraft(
    projectId: string,
    mappingId: string,
    expectedVersion: number,
    body: UpdateSupportExternalMappingDraftDto,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMutation<SupportExternalMappingDraftResponseDto>>;
  beginMappingDraft(
    projectId: string,
    mappingId: string,
    expectedVersion: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMutation<SupportExternalMappingDraftResponseDto>>;
  validateMapping(
    projectId: string,
    mappingId: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMappingValidationResponseDto>;
  previewMapping(
    projectId: string,
    mappingId: string,
    body: PreviewSupportExternalMappingDto,
    signal?: AbortSignal,
  ): Promise<SupportExternalMappingPreviewResponseDto>;
  diffMapping(
    projectId: string,
    mappingId: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMappingDiffResponseDto>;
  publishMapping(
    projectId: string,
    mappingId: string,
    expectedVersion: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMutation<SupportExternalMappingDraftResponseDto>>;
  listMappingRevisions(
    projectId: string,
    mappingId: string,
    params?: SupportExternalMappingListRevisionsParams,
    signal?: AbortSignal,
  ): Promise<SupportExternalMappingRevisionPageResponseDto>;
  rollbackMapping(
    projectId: string,
    mappingId: string,
    revisionId: string,
    expectedVersion: number,
    body: RollbackSupportExternalMappingDto,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMutation<SupportExternalMappingRollbackResponseDto>>;
  readSettingsMutation(
    projectId: string,
    receiptId: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalMutationOutcomeResponseDto>;
  listInbox(
    projectId: string,
    params?: SupportExternalInboxListParams,
    signal?: AbortSignal,
  ): Promise<SupportExternalItemPageResponseDto>;
  readInboxItem(
    projectId: string,
    itemId: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalProjectItemResponseDto>;
  readInboxTimeline(
    projectId: string,
    itemId: string,
    params?: SupportExternalInboxTimelineListParams,
    signal?: AbortSignal,
  ): Promise<SupportExternalTimelinePageResponseDto>;
  readLinkedTimeline(
    projectId: string,
    caseId: string,
    linkId: string,
    params?: SupportExternalTimelineListParams,
    signal?: AbortSignal,
  ): Promise<SupportExternalTimelinePageResponseDto>;
  listItems(
    projectId: string,
    params?: SupportExternalItemListParams,
    signal?: AbortSignal,
  ): Promise<SupportExternalItemPageResponseDto>;
  readItem(
    projectId: string,
    itemId: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalProjectItemResponseDto>;
  listCaseCommands(
    projectId: string,
    caseId: string,
    params?: SupportExternalCommandListForCaseParams,
    signal?: AbortSignal,
  ): Promise<SupportExternalCommandPageResponseDto>;
  retryCommand(
    projectId: string,
    caseId: string,
    commandId: string,
    expectedVersion: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalWorkCommandReceiptDto>;
  refreshCommandEvidence(
    projectId: string,
    caseId: string,
    commandId: string,
    body: SupportExternalCommandRefreshEvidenceBody,
    expectedVersion: number,
    idempotencyKey: string,
    signal?: AbortSignal,
  ): Promise<SupportExternalWorkCommandReceiptDto>;
}

function responseHeader(headers: unknown, name: string): string | null {
  if (!headers || typeof headers !== 'object') return null;
  const getter = 'get' in headers ? headers.get : undefined;
  if (typeof getter === 'function') {
    const value = getter.call(headers, name);
    return typeof value === 'string' ? value : null;
  }
  const value = (headers as Record<string, unknown>)[name.toLowerCase()];
  return typeof value === 'string' ? value : null;
}

function auditedOptions(
  idempotencyKey: string,
  signal?: AbortSignal,
  expectedVersion?: number,
): { options: RequestOptions; metadata: SupportExternalMutationMetadata } {
  const metadata: SupportExternalMutationMetadata = {
    receiptId: null,
    replayed: false,
  };
  return {
    metadata,
    options: {
      ...noAuthRetryRequestOptions(),
      signal,
      headers: {
        'Idempotency-Key': idempotencyKey,
        ...(expectedVersion ? { 'If-Match': `"${expectedVersion}"` } : {}),
      },
      onResponse({ headers }) {
        metadata.receiptId = responseHeader(
          headers,
          'x-support-external-settings-mutation-receipt-id',
        );
        metadata.replayed = responseHeader(headers, 'x-idempotent-replay') === 'true';
      },
    },
  };
}

async function audited<T>(
  idempotencyKey: string,
  signal: AbortSignal | undefined,
  expectedVersion: number | undefined,
  run: (options: RequestOptions) => Promise<T>,
): Promise<SupportExternalMutation<T>> {
  const attempt = auditedOptions(idempotencyKey, signal, expectedVersion);
  return { value: await run(attempt.options), metadata: attempt.metadata };
}

export const apiSupportExternalWorkSource: SupportExternalWorkSource = {
  readCaseCreateOptions: (projectId, caseId, signal) =>
    supportExternalCaseCreateOptionsRead(projectId, caseId, { signal }),
  listCaseLinks: (projectId, caseId, params, signal) =>
    supportExternalCaseLinksList(projectId, caseId, { limit: 50, ...params }, { signal }),
  readCaseLink: (projectId, caseId, linkId, signal) =>
    supportExternalCaseLinksRead(projectId, caseId, linkId, { signal }),
  readCommand: (projectId, caseId, commandId, signal) =>
    supportExternalCommandRead(projectId, caseId, commandId, { signal }),
  submitCaseCommand: (projectId, caseId, body, version, key, signal) =>
    supportExternalCommandSubmit(projectId, caseId, body, {
      ...noAuthRetryRequestOptions(),
      signal,
      headers: {
        'Idempotency-Key': key,
        ...(version ? { 'If-Match': `"${version}"` } : {}),
      },
    }),
  resolveCommand: (projectId, caseId, commandId, body, version, key, signal) =>
    supportExternalCommandResolveUnknown(projectId, caseId, commandId, body, {
      ...noAuthRetryRequestOptions(),
      signal,
      headers: { 'Idempotency-Key': key, 'If-Match': `"${version}"` },
    }),
  linkInboxItemToCase: (projectId, remoteItemId, body, version, key, signal) =>
    supportExternalInboxLinkToCase(projectId, remoteItemId, body, {
      ...noAuthRetryRequestOptions(),
      signal,
      headers: { 'Idempotency-Key': key, 'If-Match': `"${version}"` },
    }),
  listConnections: (projectId, cursor, signal) =>
    supportExternalConnectionList(
      projectId,
      { limit: 50, ...(cursor ? { cursor } : {}) },
      { signal },
    ),
  startOAuth: (projectId, provider, key, signal) =>
    audited(key, signal, undefined, (options) =>
      supportExternalConnectionStartOAuth(projectId, provider, {}, options),
    ),
  listOAuthTenants: (projectId, sessionId, signal) =>
    supportExternalConnectionListOAuthTenants(projectId, sessionId, { signal }),
  selectOAuthTenant: (projectId, sessionId, body, key, signal) =>
    audited(key, signal, undefined, (options) =>
      supportExternalConnectionSelectOAuthTenant(projectId, sessionId, body, options),
    ),
  testConnection: (projectId, connectionId, key, signal) =>
    audited(key, signal, undefined, (options) =>
      supportExternalConnectionTest(projectId, connectionId, {}, options),
    ),
  reconnectConnection: (projectId, connectionId, version, key, signal) =>
    audited(key, signal, version, (options) =>
      supportExternalConnectionReconnectOAuth(projectId, connectionId, {}, options),
    ),
  disableConnection: (projectId, connectionId, version, key, signal) =>
    audited(key, signal, version, (options) =>
      supportExternalConnectionDisable(projectId, connectionId, {}, options),
    ),
  revokeConnection: (projectId, connectionId, version, key, signal) =>
    audited(key, signal, version, (options) =>
      supportExternalConnectionRevoke(projectId, connectionId, {}, options),
    ),
  readCatalog: (projectId, connectionId, params, signal) =>
    supportExternalCatalogRead(projectId, connectionId, params, { signal }),
  refreshCatalog: (projectId, connectionId, key, signal) =>
    audited(key, signal, undefined, (options) =>
      supportExternalCatalogRefresh(projectId, connectionId, options),
    ),
  readCatalogRefresh: (projectId, jobId, signal) =>
    supportExternalCatalogRefreshStatus(projectId, jobId, { signal }),
  listMappings: (projectId, params, signal) =>
    supportExternalMappingList(projectId, params, { signal }),
  createMapping: (projectId, body, key, signal) =>
    audited(key, signal, undefined, (options) =>
      supportExternalMappingCreate(projectId, body, options),
    ),
  readMappingDraft: (projectId, mappingId, signal) =>
    supportExternalMappingReadDraft(projectId, mappingId, { signal }),
  replaceMappingDraft: (projectId, mappingId, version, body, key, signal) =>
    audited(key, signal, version, (options) =>
      supportExternalMappingReplaceDraft(projectId, mappingId, body, options),
    ),
  beginMappingDraft: (projectId, mappingId, version, key, signal) =>
    audited(key, signal, version, (options) =>
      supportExternalMappingBeginDraft(projectId, mappingId, {}, options),
    ),
  validateMapping: (projectId, mappingId, signal) =>
    supportExternalMappingValidateDraft(projectId, mappingId, {}, { signal }),
  previewMapping: (projectId, mappingId, body, signal) =>
    supportExternalMappingPreviewDraft(projectId, mappingId, body, { signal }),
  diffMapping: (projectId, mappingId, signal) =>
    supportExternalMappingDiffDraft(projectId, mappingId, { signal }),
  publishMapping: (projectId, mappingId, version, key, signal) =>
    audited(key, signal, version, (options) =>
      supportExternalMappingPublish(projectId, mappingId, {}, options),
    ),
  listMappingRevisions: (projectId, mappingId, params, signal) =>
    supportExternalMappingListRevisions(projectId, mappingId, params, {
      signal,
    }),
  rollbackMapping: (projectId, mappingId, revisionId, version, body, key, signal) =>
    audited(key, signal, version, (options) =>
      supportExternalMappingRollback(projectId, mappingId, revisionId, body, options),
    ),
  readSettingsMutation: (projectId, receiptId, signal) =>
    supportExternalSettingsMutationReadOutcome(projectId, receiptId, {
      signal,
    }),
  listInbox: (projectId, params, signal) => supportExternalInboxList(projectId, params, { signal }),
  readInboxItem: (projectId, itemId, signal) =>
    supportExternalInboxRead(projectId, itemId, { signal }),
  readInboxTimeline: (projectId, itemId, params, signal) =>
    supportExternalInboxTimelineList(projectId, itemId, params, { signal }),
  readLinkedTimeline: (projectId, caseId, linkId, params, signal) =>
    supportExternalTimelineList(projectId, caseId, linkId, params, { signal }),
  listItems: (projectId, params, signal) => supportExternalItemList(projectId, params, { signal }),
  readItem: (projectId, itemId, signal) => supportExternalItemRead(projectId, itemId, { signal }),
  listCaseCommands: (projectId, caseId, params, signal) =>
    supportExternalCommandListForCase(projectId, caseId, params, { signal }),
  retryCommand: (projectId, caseId, commandId, version, key, signal) =>
    supportExternalCommandRetry(projectId, caseId, commandId, {
      ...noAuthRetryRequestOptions(),
      signal,
      headers: { 'Idempotency-Key': key, 'If-Match': `"${version}"` },
    }),
  refreshCommandEvidence: (projectId, caseId, commandId, body, version, key, signal) =>
    supportExternalCommandRefreshEvidence(projectId, caseId, commandId, body, {
      ...noAuthRetryRequestOptions(),
      signal,
      headers: { 'Idempotency-Key': key, 'If-Match': `"${version}"` },
    }),
};

export const supportExternalWorkSource = isMockMode
  ? mockSupportExternalWorkSource
  : apiSupportExternalWorkSource;
