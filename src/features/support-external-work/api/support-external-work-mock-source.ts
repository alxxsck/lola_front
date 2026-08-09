import type {
  SupportExternalCatalogResponseDto,
  SupportExternalCommandStatusResponseDto,
  SupportExternalConnectionResponseDto,
  SupportExternalMappingDefinitionDto,
  SupportExternalMappingDraftResponseDto,
  SupportExternalMappingPublishedRevisionResponseDto,
  SupportExternalMappingRootResponseDto,
  SupportExternalProjectItemResponseDto,
  SupportExternalTimelineMessageResponseDto,
} from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportExternalMutation,
  SupportExternalWorkSource,
} from "./support-external-work-source";

const ids = {
  jsm: "10000000-0000-4000-8000-000000000001",
  helpdesk: "10000000-0000-4000-8000-000000000002",
  snapshotJsm: "20000000-0000-4000-8000-000000000001",
  snapshotHelpdesk: "20000000-0000-4000-8000-000000000002",
  mapping: "30000000-0000-4000-8000-000000000001",
  draft: "30000000-0000-4000-8000-000000000002",
  published: "30000000-0000-4000-8000-000000000003",
  attentionItem: "40000000-0000-4000-8000-000000000001",
  linkedItem: "40000000-0000-4000-8000-000000000002",
  case: "50000000-0000-4000-8000-000000000001",
  link: "50000000-0000-4000-8000-000000000002",
  command: "60000000-0000-4000-8000-000000000001",
};

const now = "2026-08-09T16:00:00.000Z";

const baseDefinition: SupportExternalMappingDefinitionDto = {
  rules: [
    {
      id: "urgent-support",
      when: { caseKinds: ["SUPPORT"], priorities: ["HIGH", "URGENT"] },
      destination: {
        destinationId: "jsm-service-desk-1",
        formId: "incident",
        fieldValues: {},
        operatorInputFieldIds: ["description"],
      },
    },
  ],
  fallback: {
    destinationId: "jsm-service-desk-1",
    formId: "request",
    fieldValues: {},
    operatorInputFieldIds: ["description"],
  },
};

let connections: SupportExternalConnectionResponseDto[] = [];
let mappingRoot: SupportExternalMappingRootResponseDto;
let mappingDraft: SupportExternalMappingDraftResponseDto;
let publishedRevisions: SupportExternalMappingPublishedRevisionResponseDto[];
let commands: SupportExternalCommandStatusResponseDto[];
const settingsAttempts = new Map<string, unknown>();

const catalogs: Record<string, SupportExternalCatalogResponseDto> = {
  [ids.jsm]: {
    snapshot: {
      id: ids.snapshotJsm,
      revision: 8,
      fetchedAt: "2026-08-09T15:48:00.000Z",
      expiresAt: "2026-08-10T15:48:00.000Z",
      stale: false,
    },
    catalog: {
      provider: "JSM",
      destinations: [
        {
          id: "jsm-service-desk-1",
          key: "SUP",
          label: "Support Operations",
          fields: [],
          forms: [
            { id: "incident", label: "Incident", fields: [] },
            { id: "request", label: "Service request", fields: [] },
          ],
        },
      ],
      agents: [{ id: "agent-1", label: "Support lead", kind: "AGENT" }],
      tags: [{ id: "tag-sync", label: "sync", kind: "TAG" }],
    },
    nextCursor: null,
  },
  [ids.helpdesk]: {
    snapshot: {
      id: ids.snapshotHelpdesk,
      revision: 3,
      fetchedAt: "2026-08-09T13:20:00.000Z",
      expiresAt: "2026-08-09T14:20:00.000Z",
      stale: true,
    },
    catalog: {
      provider: "HELPDESK",
      destinations: [
        {
          id: "helpdesk-team-1",
          label: "Tier 2",
          fields: [],
          forms: [],
        },
      ],
      agents: [],
      tags: [],
    },
    nextCursor: null,
  },
};

const attentionItem: SupportExternalProjectItemResponseDto = {
  itemId: ids.attentionItem,
  connectionId: ids.helpdesk,
  provider: "HELPDESK",
  remoteItemId: "HD-2048",
  remoteKey: "2048",
  remoteUrl: "https://helpdesk.example/tickets/2048",
  summary: "Webhook принят, authoritative refresh требует внимания",
  status: "OPEN",
  priority: "HIGH",
  team: { id: "helpdesk-team-1", label: "Tier 2" },
  assignee: null,
  requester: { label: "Customer" },
  tags: ["sync"],
  latestMessageAt: "2026-08-09T14:10:00.000Z",
  freshness: "STALE",
  remoteUpdatedAt: "2026-08-09T14:10:00.000Z",
  lastRefreshedAt: "2026-08-09T14:12:00.000Z",
  version: 4,
  linked: false,
  link: null,
  allowedActions: ["OPEN_REMOTE", "VIEW_TIMELINE", "LINK_TO_CASE"],
};

const linkedItem: SupportExternalProjectItemResponseDto = {
  itemId: ids.linkedItem,
  connectionId: ids.jsm,
  provider: "JSM",
  remoteItemId: "JSM-731",
  remoteKey: "SUP-731",
  remoteUrl: "https://jsm.example/browse/SUP-731",
  summary: "Provider outcome неизвестен после timeout",
  status: "IN_PROGRESS",
  priority: "URGENT",
  team: { id: "jsm-service-desk-1", label: "Support Operations" },
  assignee: { id: "agent-1", label: "Support lead" },
  requester: { label: "Customer" },
  tags: ["unknown-outcome"],
  latestMessageAt: "2026-08-09T15:41:00.000Z",
  freshness: "FRESH",
  remoteUpdatedAt: "2026-08-09T15:41:00.000Z",
  lastRefreshedAt: "2026-08-09T15:42:00.000Z",
  version: 9,
  linked: true,
  link: {
    linkId: ids.link,
    caseId: ids.case,
    linkedAt: "2026-08-09T15:00:00.000Z",
    version: 2,
  },
  allowedActions: ["OPEN_REMOTE", "VIEW_TIMELINE", "REFRESH"],
};

const timeline: SupportExternalTimelineMessageResponseDto[] = [
  {
    messageId: "message-2",
    remoteMessageId: "remote-message-2",
    remoteCreatedAt: "2026-08-09T15:41:00.000Z",
    remoteUpdatedAt: null,
    tombstonedAt: null,
    audience: "INTERNAL",
    body: "Reconciliation requested after provider timeout.",
  },
  {
    messageId: "message-1",
    remoteMessageId: "remote-message-1",
    remoteCreatedAt: "2026-08-09T15:02:00.000Z",
    remoteUpdatedAt: null,
    tombstonedAt: null,
    audience: "PUBLIC",
    bodyUnavailable: true,
  },
];

function resetState(): void {
  connections = [
    {
      id: ids.jsm,
      provider: "JSM",
      displayName: "JSM · Support cloud",
      lifecycle: "ACTIVE",
      tenantIdentity: "support-cloud",
      capabilities: {
        provider: "JSM",
        supported: ["CATALOG", "CREATE", "COMMENT_INTERNAL", "REFRESH"],
        verified: ["CATALOG", "REFRESH"],
      },
      credentialVersion: 4,
      version: 8,
      accessTokenExpiresAt: "2026-08-10T16:00:00.000Z",
      credentialConfigured: true,
    },
    {
      id: ids.helpdesk,
      provider: "HELPDESK",
      displayName: "HelpDesk · Tier 2",
      lifecycle: "REAUTH_REQUIRED",
      tenantIdentity: "tier-2",
      capabilities: {
        provider: "HELPDESK",
        supported: ["CATALOG", "CREATE", "COMMENT_INTERNAL", "REFRESH"],
        verified: ["CATALOG"],
      },
      credentialVersion: 2,
      version: 5,
      accessTokenExpiresAt: null,
      credentialConfigured: false,
    },
  ];
  mappingRoot = {
    id: ids.mapping,
    connectionId: ids.jsm,
    displayName: "Support routing",
    version: 3,
    draftRevisionId: ids.draft,
    publishedRevisionId: ids.published,
  };
  mappingDraft = {
    root: mappingRoot,
    draft: {
      id: ids.draft,
      rootId: ids.mapping,
      connectionId: ids.jsm,
      revisionNumber: 4,
      status: "DRAFT",
      catalogSnapshotId: ids.snapshotJsm,
      formRevision: "form-v8",
      definition: structuredClone(baseDefinition),
    },
  };
  publishedRevisions = [
    {
      ...mappingDraft.draft,
      id: ids.published,
      revisionNumber: 3,
      status: "PUBLISHED",
      publishedAt: "2026-08-08T12:00:00.000Z",
      publicationKind: "PUBLISH",
      sourceRevisionId: null,
      rollbackReasonCode: null,
    },
  ];
  commands = [
    {
      commandId: ids.command,
      intent: "CREATE",
      status: "UNKNOWN",
      errorCode: "SUPPORT_EXTERNAL_PROVIDER_OUTCOME_UNKNOWN",
      errorCategory: "UNKNOWN_OUTCOME",
      nextAttemptAt: null,
      version: 3,
      createdAt: "2026-08-09T15:40:00.000Z",
      resolvedAt: null,
      allowedActions: ["REFRESH_EVIDENCE", "RESOLVE_UNKNOWN"],
    },
  ];
  settingsAttempts.clear();
}

resetState();

export function resetMockSupportExternalWork(): void {
  resetState();
}

function safeClone<T>(value: T): T {
  return structuredClone(value);
}

function checkSignal(signal?: AbortSignal): void {
  if (signal?.aborted) throw new DOMException("Aborted", "AbortError");
}

function connection(connectionId: string): SupportExternalConnectionResponseDto {
  const value = connections.find((item) => item.id === connectionId);
  if (!value) throw new ApiError(404, "Not found");
  return value;
}

function mutation<T>(key: string, create: () => T): SupportExternalMutation<T> {
  const existing = settingsAttempts.get(key);
  if (existing) {
    return {
      value: safeClone(existing as T),
      metadata: { receiptId: `receipt-${key}`, replayed: true },
    };
  }
  const value = create();
  settingsAttempts.set(key, safeClone(value));
  return {
    value: safeClone(value),
    metadata: { receiptId: `receipt-${key}`, replayed: false },
  };
}

function expectVersion(value: { version: number }, version: number): void {
  if (value.version !== version)
    throw new ApiError(409, "Version conflict", undefined, undefined, "VERSION_CONFLICT");
}

export const mockSupportExternalWorkSource: SupportExternalWorkSource = {
  async listConnections(_projectId, _cursor, signal) {
    checkSignal(signal);
    return { items: safeClone(connections), nextCursor: null };
  },
  async startOAuth(_projectId, provider, key, signal) {
    checkSignal(signal);
    return mutation(key, () => ({
      sessionId: provider === "JSM" ? "70000000-0000-4000-8000-000000000001" : "70000000-0000-4000-8000-000000000002",
      launchPath: `/api/v1/support/external-work/oauth/launch/mock-${provider.toLowerCase()}`,
      expiresAt: "2026-08-09T16:10:00.000Z",
    }));
  },
  async listOAuthTenants(_projectId, _sessionId, signal) {
    checkSignal(signal);
    return {
      provider: "JSM",
      items: [
        { id: "support-cloud", label: "Support cloud", siteUrl: "https://support.example" },
        { id: "second-cloud", label: "Second cloud", siteUrl: "https://second.example" },
      ],
    };
  },
  async selectOAuthTenant(_projectId, _sessionId, body, key, signal) {
    checkSignal(signal);
    return mutation(key, () => {
      const value = connection(ids.jsm);
      value.tenantIdentity = body.tenantIdentity;
      value.version += 1;
      value.lifecycle = "ACTIVE";
      return value;
    });
  },
  async testConnection(_projectId, connectionId, key, signal) {
    checkSignal(signal);
    return mutation(key, () => {
      const value = connection(connectionId);
      if (value.lifecycle === "REAUTH_REQUIRED")
        throw new ApiError(409, "Reauthentication required");
      return { connection: value, capabilities: value.capabilities };
    });
  },
  async reconnectConnection(_projectId, connectionId, version, key, signal) {
    checkSignal(signal);
    return mutation(key, () => {
      expectVersion(connection(connectionId), version);
      return {
        sessionId: "70000000-0000-4000-8000-000000000003",
        launchPath: "/api/v1/support/external-work/oauth/launch/mock-reconnect",
        expiresAt: "2026-08-09T16:10:00.000Z",
      };
    });
  },
  async disableConnection(_projectId, connectionId, version, key, signal) {
    checkSignal(signal);
    return mutation(key, () => {
      const value = connection(connectionId);
      expectVersion(value, version);
      value.lifecycle = "DISABLED";
      value.version += 1;
      return value;
    });
  },
  async revokeConnection(_projectId, connectionId, version, key, signal) {
    checkSignal(signal);
    return mutation(key, () => {
      const value = connection(connectionId);
      expectVersion(value, version);
      value.lifecycle = "REVOKED";
      value.credentialConfigured = false;
      value.version += 1;
      return value;
    });
  },
  async readCatalog(_projectId, connectionId, _params, signal) {
    checkSignal(signal);
    const value = catalogs[connectionId];
    if (!value) throw new ApiError(404, "Catalog not found");
    return safeClone(value);
  },
  async refreshCatalog(_projectId, connectionId, key, signal) {
    checkSignal(signal);
    connection(connectionId);
    return mutation(key, () => ({
      jobId: "80000000-0000-4000-8000-000000000001",
      status: "PENDING",
      replayed: false,
      coalesced: false,
    }));
  },
  async readCatalogRefresh(_projectId, _jobId, signal) {
    checkSignal(signal);
    return {
      jobId: "80000000-0000-4000-8000-000000000001",
      status: "SUCCEEDED",
      attemptCount: 1,
      errorCode: null,
      snapshotId: ids.snapshotJsm,
      availableAt: now,
      completedAt: now,
      createdAt: now,
      updatedAt: now,
    };
  },
  async listMappings(_projectId, _params, signal) {
    checkSignal(signal);
    return { items: [safeClone(mappingRoot)], nextCursor: null };
  },
  async createMapping(_projectId, body, key, signal) {
    checkSignal(signal);
    return mutation(key, () => {
      mappingRoot = {
        id: ids.mapping,
        connectionId: body.connectionId,
        displayName: body.displayName,
        version: 1,
        draftRevisionId: ids.draft,
        publishedRevisionId: null,
      };
      mappingDraft = {
        root: mappingRoot,
        draft: {
          id: ids.draft,
          rootId: ids.mapping,
          connectionId: body.connectionId,
          revisionNumber: 1,
          status: "DRAFT",
          catalogSnapshotId: body.catalogSnapshotId,
          formRevision: body.formRevision,
          definition: safeClone(body.definition),
        },
      };
      return mappingDraft;
    });
  },
  async readMappingDraft(_projectId, mappingId, signal) {
    checkSignal(signal);
    if (mappingId !== mappingRoot.id) throw new ApiError(404, "Mapping not found");
    return safeClone(mappingDraft);
  },
  async replaceMappingDraft(_projectId, mappingId, version, body, key, signal) {
    checkSignal(signal);
    return mutation(key, () => {
      if (mappingId !== mappingRoot.id) throw new ApiError(404, "Mapping not found");
      expectVersion(mappingRoot, version);
      mappingRoot.version += 1;
      mappingDraft = {
        root: mappingRoot,
        draft: { ...mappingDraft.draft, ...safeClone(body) },
      };
      return mappingDraft;
    });
  },
  async beginMappingDraft(_projectId, mappingId, version, key, signal) {
    checkSignal(signal);
    return mutation(key, () => {
      if (mappingId !== mappingRoot.id) throw new ApiError(404, "Mapping not found");
      expectVersion(mappingRoot, version);
      mappingRoot.version += 1;
      mappingRoot.draftRevisionId = ids.draft;
      mappingDraft.root = mappingRoot;
      mappingDraft.draft.status = "DRAFT";
      mappingDraft.draft.revisionNumber += 1;
      return mappingDraft;
    });
  },
  async validateMapping(_projectId, mappingId, signal) {
    checkSignal(signal);
    if (mappingId !== mappingRoot.id) throw new ApiError(404, "Mapping not found");
    return {
      valid: true,
      definitionHash: "a".repeat(64),
      catalogSnapshotId: mappingDraft.draft.catalogSnapshotId ?? ids.snapshotJsm,
      formRevision: mappingDraft.draft.formRevision,
      ruleCount: mappingDraft.draft.definition.rules.length,
      validatedAt: now,
    };
  },
  async previewMapping(_projectId, mappingId, body, signal) {
    checkSignal(signal);
    if (mappingId !== mappingRoot.id) throw new ApiError(404, "Mapping not found");
    const matched = mappingDraft.draft.definition.rules.find(
      (rule) =>
        (!rule.when.caseKinds?.length || rule.when.caseKinds.includes(body.caseKind)) &&
        (!rule.when.priorities?.length || rule.when.priorities.includes(body.priority)),
    );
    const destination = matched?.destination ?? mappingDraft.draft.definition.fallback;
    return {
      mappingRootId: mappingRoot.id,
      draftRevisionId: mappingDraft.draft.id,
      catalogSnapshotId: mappingDraft.draft.catalogSnapshotId ?? ids.snapshotJsm,
      formRevision: mappingDraft.draft.formRevision,
      definitionHash: "a".repeat(64),
      validatedAt: now,
      matchedBy: matched ? "RULE" : "FALLBACK",
      ruleId: matched?.id ?? null,
      destination: {
        destinationId: destination.destinationId,
        formId: destination.formId ?? null,
        requesterRequired: destination.requesterRequired ?? false,
        operatorInputFieldIds: destination.operatorInputFieldIds ?? [],
        serverOwnedFieldIds: Object.keys(destination.fieldValues),
      },
    };
  },
  async diffMapping(_projectId, mappingId, signal) {
    checkSignal(signal);
    if (mappingId !== mappingRoot.id) throw new ApiError(404, "Mapping not found");
    return {
      fromRevisionId: mappingRoot.publishedRevisionId ?? null,
      fromRevisionNumber: publishedRevisions[0]?.revisionNumber ?? null,
      toDraftRevisionId: mappingDraft.draft.id,
      toRevisionNumber: mappingDraft.draft.revisionNumber,
      changed: true,
      changes: [{ kind: "RULE_CHANGED", ruleId: "urgent-support" }],
    };
  },
  async publishMapping(_projectId, mappingId, version, key, signal) {
    checkSignal(signal);
    return mutation(key, () => {
      if (mappingId !== mappingRoot.id) throw new ApiError(404, "Mapping not found");
      expectVersion(mappingRoot, version);
      mappingRoot.version += 1;
      mappingRoot.publishedRevisionId = mappingDraft.draft.id;
      mappingRoot.draftRevisionId = null;
      publishedRevisions.unshift({
        ...safeClone(mappingDraft.draft),
        status: "PUBLISHED",
        publishedAt: now,
        publicationKind: "PUBLISH",
        sourceRevisionId: null,
        rollbackReasonCode: null,
      });
      mappingDraft.root = mappingRoot;
      return mappingDraft;
    });
  },
  async listMappingRevisions(_projectId, mappingId, _params, signal) {
    checkSignal(signal);
    if (mappingId !== mappingRoot.id) throw new ApiError(404, "Mapping not found");
    return { items: safeClone(publishedRevisions), nextCursor: null };
  },
  async rollbackMapping(_projectId, mappingId, revisionId, version, body, key, signal) {
    checkSignal(signal);
    return mutation(key, () => {
      if (mappingId !== mappingRoot.id) throw new ApiError(404, "Mapping not found");
      expectVersion(mappingRoot, version);
      const source = publishedRevisions.find((item) => item.id === revisionId);
      if (!source) throw new ApiError(404, "Revision not found");
      mappingRoot.version += 1;
      const revision = {
        ...safeClone(source),
        id: crypto.randomUUID(),
        revisionNumber: (publishedRevisions[0]?.revisionNumber ?? 0) + 1,
        publishedAt: now,
        publicationKind: "ROLLBACK" as const,
        sourceRevisionId: source.id,
        rollbackReasonCode: body.reasonCode,
      };
      publishedRevisions.unshift(revision);
      mappingRoot.publishedRevisionId = revision.id;
      return {
        root: safeClone(mappingRoot),
        revision,
        receiptId: `receipt-${key}`,
        replayed: false,
      };
    });
  },
  async readSettingsMutation(_projectId, receiptId, signal) {
    checkSignal(signal);
    return {
      receiptId,
      operation: "TEST_CONNECTION",
      status: "SUCCEEDED",
      response: null,
      createdAt: now,
      updatedAt: now,
    };
  },
  async listInbox(_projectId, params, signal) {
    checkSignal(signal);
    const items = params?.freshness && params.freshness !== attentionItem.freshness
      ? []
      : [attentionItem];
    return { items: safeClone(items), nextCursor: null };
  },
  async readInboxItem(_projectId, itemId, signal) {
    checkSignal(signal);
    if (itemId !== attentionItem.itemId) throw new ApiError(404, "Item not found");
    return safeClone(attentionItem);
  },
  async readInboxTimeline(_projectId, itemId, _params, signal) {
    checkSignal(signal);
    if (itemId !== attentionItem.itemId) throw new ApiError(404, "Item not found");
    return { items: safeClone(timeline), nextCursor: null };
  },
  async readLinkedTimeline(_projectId, caseId, linkId, _params, signal) {
    checkSignal(signal);
    if (caseId !== ids.case || linkId !== ids.link)
      throw new ApiError(404, "Timeline not found");
    return { items: safeClone(timeline), nextCursor: null };
  },
  async listItems(_projectId, params, signal) {
    checkSignal(signal);
    let items = [linkedItem];
    if (params?.provider) items = items.filter((item) => item.provider === params.provider);
    if (params?.freshness) items = items.filter((item) => item.freshness === params.freshness);
    if (params?.status) items = items.filter((item) => item.status === params.status);
    return { items: safeClone(items), nextCursor: null };
  },
  async readItem(_projectId, itemId, signal) {
    checkSignal(signal);
    if (itemId !== linkedItem.itemId) throw new ApiError(404, "Item not found");
    return safeClone(linkedItem);
  },
  async listCaseCommands(_projectId, caseId, _params, signal) {
    checkSignal(signal);
    if (caseId !== ids.case) throw new ApiError(404, "Case not found");
    return { items: safeClone(commands), nextCursor: null };
  },
  async retryCommand(_projectId, caseId, commandId, version, _key, signal) {
    checkSignal(signal);
    if (caseId !== ids.case || commandId !== ids.command)
      throw new ApiError(404, "Command not found");
    expectVersion(commands[0]!, version);
    commands[0] = { ...commands[0]!, status: "RETRYING", allowedActions: [] };
    return { commandId, status: "RETRYING", replayed: false };
  },
  async refreshCommandEvidence(
    _projectId,
    caseId,
    commandId,
    _body,
    version,
    _key,
    signal,
  ) {
    checkSignal(signal);
    if (caseId !== ids.case || commandId !== ids.command)
      throw new ApiError(404, "Command not found");
    expectVersion(commands[0]!, version);
    commands[0] = {
      ...commands[0]!,
      status: "SUCCEEDED",
      errorCode: null,
      errorCategory: null,
      resolvedAt: now,
      allowedActions: [],
    };
    return { commandId, status: "SUCCEEDED", replayed: false };
  },
};
