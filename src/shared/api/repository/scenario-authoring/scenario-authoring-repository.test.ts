import { beforeEach, describe, expect, expectTypeOf, it, vi } from "vitest";

import {
  scenarioAudienceArchive,
  scenarioAudienceCreate,
  scenarioAudienceDetail,
  scenarioAudienceEvaluationEvaluateUser,
  scenarioAudiencePublishRevision,
  scenarioAudienceRevision,
  scenarioAudienceSearch,
  scenarioAuthoringCatalog,
  scenarioAuthoringPreview,
  scenarioAuthoringPreviewGoal,
  scenarioAuthoringPublishScenario,
  scenarioAuthoringRollbackScenario,
  scenarioAuthoringSaveDraft,
  scenarioAuthoringScenarioDocument,
  scenarioAuthoringScenarioRevision,
  scenarioAuthoringScenarioRevisions,
  scenarioAuthoringValidate,
  scenarioAuthoringValidateScenarioDraft,
  scenarioRunsExplain,
} from "@/shared/api/generated/lola-backend";
import type {
  AudienceRuleDto,
  ConditionCatalogResponseDto,
  PublishScenarioResponseDto,
  ScenarioRuleDto,
  ScenarioRunExplainResponseDto,
} from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";

import { scenarioAuthoringRepository } from "./index";
import type { ScenarioPublishInput } from "./index";

vi.mock("@/shared/api/generated/lola-backend", () => ({
  scenarioAudienceArchive: vi.fn(),
  scenarioAudienceCreate: vi.fn(),
  scenarioAudienceDetail: vi.fn(),
  scenarioAudienceEvaluationEvaluateUser: vi.fn(),
  scenarioAudiencePublishRevision: vi.fn(),
  scenarioAudienceRevision: vi.fn(),
  scenarioAudienceSearch: vi.fn(),
  scenarioAuthoringCatalog: vi.fn(),
  scenarioAuthoringPreview: vi.fn(),
  scenarioAuthoringPreviewGoal: vi.fn(),
  scenarioAuthoringPublishScenario: vi.fn(),
  scenarioAuthoringRollbackScenario: vi.fn(),
  scenarioAuthoringSaveDraft: vi.fn(),
  scenarioAuthoringScenarioDocument: vi.fn(),
  scenarioAuthoringScenarioRevision: vi.fn(),
  scenarioAuthoringScenarioRevisions: vi.fn(),
  scenarioAuthoringValidate: vi.fn(),
  scenarioAuthoringValidateScenarioDraft: vi.fn(),
  scenarioRunsExplain: vi.fn(),
}));

const catalog: ConditionCatalogResponseDto = {
  projectId: "project-1",
  revision: "catalog-revision-1",
  version: 1,
  events: [],
};

const rule: ScenarioRuleDto = {
  version: 1,
  root: {
    kind: "eventField",
    eventCode: "deposit.succeeded",
    fieldKey: "deposit.currency",
    operator: "eq",
    value: "EUR",
  },
};

const audience: AudienceRuleDto = {
  version: 1,
  root: { kind: "locale", operator: "eq", value: "ru-RU" },
};

const publishDraft: ScenarioPublishInput = {
  catalogRevision: "catalog-revision-1",
  deliveryPolicy: { kind: "IMMEDIATE" },
  expectedCurrentRevisionId: null,
  rule,
};

const publishResponse: PublishScenarioResponseDto = {
  conflictMetadata: {
    currentRevisionId: "scenario-revision-1",
    expectedCurrentRevisionId: null,
  },
  cost: { aggregateLeaves: 0, class: "LOW", historyWindowDays: 0, leaves: 1 },
  deliveryPolicy: { kind: "IMMEDIATE" },
  dependencies: {
    actionTypes: [],
    conditionPaths: [],
    eventDefinitionRevisionIds: ["event-revision-1"],
  },
  revision: {
    catalogRevision: "catalog-revision-1",
    contentHash: "content-hash-1",
    id: "scenario-revision-1",
    publishedAt: "2026-07-18T00:00:00.000Z",
    revisionNumber: 1,
    scenarioId: "scenario-1",
    triggerEventDefinitionRevisionId: "event-revision-1",
  },
  warnings: [],
};

const explainResponse: ScenarioRunExplainResponseDto = {
  actions: [],
  continuations: [],
  delivery: { policy: { kind: "IMMEDIATE" }, waits: [] },
  eligibility: {
    decision: "MATCHED",
    fidelity: "LEGACY",
    root: { kind: "legacy", matched: true },
  },
  audience: {
    attributeRevisionIds: [],
    decision: "MATCHED",
    evaluatedAt: "2026-07-18T00:00:00.000Z",
    fidelity: "V2",
    lastRecheck: null,
    root: { kind: "locale", matched: true },
    segmentRevisionIds: [],
  },
  goalResolutions: [],
  run: {
    id: "run-1",
    startedAt: "2026-07-18T00:00:00.000Z",
    status: "SUCCEEDED",
  },
  timeline: [],
  trigger: {
    code: "deposit.succeeded",
    definitionRevisionId: "event-revision-1",
    eventLogId: "event-log-1",
    occurredAt: "2026-07-18T00:00:00.000Z",
    receivedAt: "2026-07-18T00:00:00.000Z",
    schemaVersion: 1,
    source: "SERVER",
  },
};

describe("scenario authoring repository", () => {
  beforeEach(() => vi.clearAllMocks());

  it("loads the generated catalog through the normalized contract adapter", async () => {
    vi.mocked(scenarioAuthoringCatalog).mockResolvedValue(catalog);

    await expect(
      scenarioAuthoringRepository.getContract("project-1"),
    ).resolves.toEqual(catalog);
    expect(scenarioAuthoringCatalog).toHaveBeenCalledWith("project-1");
  });

  it("validates a generated rule DTO", async () => {
    const response = {
      valid: true,
      issues: [],
      dependencies: [],
      cost: null,
      warnings: [],
    };
    vi.mocked(scenarioAuthoringValidate).mockResolvedValue(response);

    await expect(
      scenarioAuthoringRepository.validateRule("project-1", rule),
    ).resolves.toBe(response);
    expect(scenarioAuthoringValidate).toHaveBeenCalledWith("project-1", {
      rule,
    });
  });

  it("validates Audience separately from behavioral Eligibility", async () => {
    const response = {
      valid: true,
      issues: [],
      dependencies: [],
      cost: null,
      warnings: [],
      audience: {
        valid: true,
        issues: [],
        dependencies: { attributeRevisionIds: [], segmentRevisionIds: [] },
        cost: { leaves: 1, segmentLeaves: 0 },
        warnings: [],
      },
    };
    vi.mocked(scenarioAuthoringValidate).mockResolvedValue(response);

    await expect(
      scenarioAuthoringRepository.validateRule(
        "project-1",
        rule,
        undefined,
        audience,
      ),
    ).resolves.toBe(response);
    expect(scenarioAuthoringValidate).toHaveBeenCalledWith("project-1", {
      rule,
      audience,
    });
  });

  it("forwards a cancellation signal to rule validation", async () => {
    const controller = new AbortController();
    const response = {
      valid: true,
      issues: [],
      dependencies: [],
      cost: null,
      warnings: [],
    };
    vi.mocked(scenarioAuthoringValidate).mockResolvedValue(response);

    await expect(
      scenarioAuthoringRepository.validateRule("project-1", rule, {
        signal: controller.signal,
      }),
    ).resolves.toBe(response);
    expect(scenarioAuthoringValidate).toHaveBeenCalledWith(
      "project-1",
      { rule },
      { signal: controller.signal },
    );
  });

  it("previews a generated rule against an Event Log scope", async () => {
    const response = {
      valid: true,
      matched: true,
      issues: [],
      dependencies: [],
      cost: null,
      warnings: [],
    };
    vi.mocked(scenarioAuthoringPreview).mockResolvedValue(response);

    await expect(
      scenarioAuthoringRepository.previewRule("project-1", rule, {
        kind: "eventLog",
        eventLogId: "event-log-1",
      }),
    ).resolves.toBe(response);
    expect(scenarioAuthoringPreview).toHaveBeenCalledWith("project-1", {
      rule,
      scope: { kind: "eventLog", eventLogId: "event-log-1" },
    });
  });

  it("previews Audience on the same project-owned Event Log anchor", async () => {
    const scope = { kind: "eventLog" as const, eventLogId: "event-log-1" };
    const response = {
      valid: true,
      matched: true,
      issues: [],
      dependencies: [],
      cost: null,
      warnings: [],
      audience: {
        valid: true,
        matched: true,
        issues: [],
        dependencies: { attributeRevisionIds: [], segmentRevisionIds: [] },
        cost: { leaves: 1, segmentLeaves: 0 },
        warnings: [],
        explanation: { kind: "locale" as const, matched: true },
      },
    };
    vi.mocked(scenarioAuthoringPreview).mockResolvedValue(response);

    await expect(
      scenarioAuthoringRepository.previewRule(
        "project-1",
        rule,
        scope,
        undefined,
        audience,
      ),
    ).resolves.toBe(response);
    expect(scenarioAuthoringPreview).toHaveBeenCalledWith("project-1", {
      rule,
      scope,
      audience,
    });
  });

  it("uses generated project-scoped Segment lifecycle endpoints", async () => {
    const searchResponse = { items: [], nextCursor: null };
    const segment = {
      segmentId: "segment-1",
      key: "vip",
      name: "VIP",
      status: "ACTIVE" as const,
      revisions: [],
    };
    const revision = {
      segmentRevisionId: "segment-revision-1",
      revision: 1,
      catalogRevision: "audience-revision-1",
      contentHash: "hash",
      publishedAt: "2026-07-18T00:00:00.000Z",
      rule: audience,
    };
    const publishDraft = {
      catalogRevision: "audience-revision-1",
      expectedCurrentRevisionId: null,
      key: "vip",
      name: "VIP",
      rule: audience,
    };
    vi.mocked(scenarioAudienceSearch).mockResolvedValue(searchResponse);
    vi.mocked(scenarioAudienceDetail).mockResolvedValue(segment);
    vi.mocked(scenarioAudienceRevision).mockResolvedValue(revision);
    vi.mocked(scenarioAudienceCreate).mockResolvedValue({
      ...segment,
      revision,
    });
    vi.mocked(scenarioAudiencePublishRevision).mockResolvedValue({
      ...segment,
      revision,
    });
    vi.mocked(scenarioAudienceArchive).mockResolvedValue({
      segmentId: "segment-1",
      status: "ARCHIVED",
    });

    await expect(
      scenarioAuthoringRepository.searchSegments("project-1", {
        query: "vip",
        limit: 25,
      }),
    ).resolves.toBe(searchResponse);
    await expect(
      scenarioAuthoringRepository.getSegment("project-1", "segment-1"),
    ).resolves.toBe(segment);
    await expect(
      scenarioAuthoringRepository.getSegmentRevision(
        "project-1",
        "segment-1",
        "segment-revision-1",
      ),
    ).resolves.toBe(revision);
    await expect(
      scenarioAuthoringRepository.createSegment("project-1", publishDraft),
    ).resolves.toMatchObject({ segmentId: "segment-1" });
    await expect(
      scenarioAuthoringRepository.publishSegmentRevision(
        "project-1",
        "segment-1",
        publishDraft,
      ),
    ).resolves.toMatchObject({ segmentId: "segment-1" });
    await expect(
      scenarioAuthoringRepository.archiveSegment("project-1", "segment-1"),
    ).resolves.toEqual({ segmentId: "segment-1", status: "ARCHIVED" });

    expect(scenarioAudienceSearch).toHaveBeenCalledWith("project-1", {
      query: "vip",
      limit: 25,
    });
    expect(scenarioAudienceDetail).toHaveBeenCalledWith(
      "project-1",
      "segment-1",
    );
    expect(scenarioAudienceRevision).toHaveBeenCalledWith(
      "project-1",
      "segment-1",
      "segment-revision-1",
    );
    expect(scenarioAudienceCreate).toHaveBeenCalledWith(
      "project-1",
      publishDraft,
    );
    expect(scenarioAudiencePublishRevision).toHaveBeenCalledWith(
      "project-1",
      "segment-1",
      publishDraft,
    );
    expect(scenarioAudienceArchive).toHaveBeenCalledWith(
      "project-1",
      "segment-1",
    );
  });

  it("evaluates one End User without inventing a Segment population count", async () => {
    const response = {
      valid: true,
      matched: true,
      truth: "TRUE" as const,
      issues: [],
      warnings: [],
      dependencies: { attributeRevisionIds: [], segmentRevisionIds: [] },
    };
    vi.mocked(scenarioAudienceEvaluationEvaluateUser).mockResolvedValue(
      response,
    );

    await expect(
      scenarioAuthoringRepository.evaluateAudienceForUser(
        "project-1",
        "end-user-1",
        "audience-revision-1",
        audience,
      ),
    ).resolves.toBe(response);
    expect(scenarioAudienceEvaluationEvaluateUser).toHaveBeenCalledWith(
      "project-1",
      {
        endUserId: "end-user-1",
        catalogRevision: "audience-revision-1",
        rule: audience,
      },
    );
  });

  it("forwards a cancellation signal to rule preview", async () => {
    const controller = new AbortController();
    const response = {
      valid: true,
      matched: true,
      issues: [],
      dependencies: [],
      cost: null,
      warnings: [],
    };
    vi.mocked(scenarioAuthoringPreview).mockResolvedValue(response);

    await expect(
      scenarioAuthoringRepository.previewRule(
        "project-1",
        rule,
        { kind: "eventLog", eventLogId: "event-log-1" },
        { signal: controller.signal },
      ),
    ).resolves.toBe(response);
    expect(scenarioAuthoringPreview).toHaveBeenCalledWith(
      "project-1",
      {
        rule,
        scope: { kind: "eventLog", eventLogId: "event-log-1" },
      },
      { signal: controller.signal },
    );
  });

  it("publishes through the atomic generated command", async () => {
    expectTypeOf<
      Parameters<typeof scenarioAuthoringRepository.publishScenario>[2]
    >().toEqualTypeOf<ScenarioPublishInput>();
    vi.mocked(scenarioAuthoringPublishScenario).mockResolvedValue(
      publishResponse,
    );

    await expect(
      scenarioAuthoringRepository.publishScenario(
        "project-1",
        "scenario-1",
        publishDraft,
      ),
    ).resolves.toBe(publishResponse);
    expect(scenarioAuthoringPublishScenario).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
      publishDraft,
    );
  });

  it("loads and saves the durable authoring document with observed versions", async () => {
    const source = {
      catalogRevision: "catalog-revision-1",
      deliveryPolicy: { kind: "IMMEDIATE" as const },
      graph: { actions: [] },
      rule,
    };
    const document = {
      scenarioId: "scenario-1",
      projectId: "project-1",
      code: "welcome",
      name: "Welcome",
      status: "ACTIVE",
      triggerEventDefinitionRevisionId: "event-revision-1",
      currentRevisionId: "scenario-revision-1",
      editable: true,
      source,
      draft: undefined,
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    };
    const draft = {
      ...source,
      id: "draft-1",
      version: 2,
      baseRevisionId: "scenario-revision-1",
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z",
    };
    const request = {
      ...source,
      expectedDraftVersion: 1,
      expectedCurrentRevisionId: "scenario-revision-1",
    };
    vi.mocked(scenarioAuthoringScenarioDocument).mockResolvedValue(
      document as never,
    );
    vi.mocked(scenarioAuthoringSaveDraft).mockResolvedValue(draft as never);

    await expect(
      scenarioAuthoringRepository.getScenarioDocument(
        "project-1",
        "scenario-1",
      ),
    ).resolves.toBe(document);
    await expect(
      scenarioAuthoringRepository.saveScenarioDraft(
        "project-1",
        "scenario-1",
        request,
      ),
    ).resolves.toBe(draft);
    expect(scenarioAuthoringScenarioDocument).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
    );
    expect(scenarioAuthoringSaveDraft).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
      request,
    );
  });

  it("validates the full source graph and previews a typed Goal on an Event anchor", async () => {
    const source = {
      catalogRevision: "catalog-revision-1",
      deliveryPolicy: { kind: "IMMEDIATE" as const },
      graph: { actions: [] },
      rule,
    };
    const validation = {
      valid: true,
      issues: [],
      dependencies: [],
      cost: null,
      warnings: [],
      deliveryPolicy: { kind: "IMMEDIATE" as const },
    };
    const goalRequest = {
      goal: {
        version: 1 as const,
        eventCode: "deposit.succeeded",
        measure: "count" as const,
        filters: [],
        compare: { operator: "gte" as const, value: "1" },
      },
      timeoutMs: 86_400_000,
      scope: { kind: "eventLog" as const, eventLogId: "event-log-1" },
    };
    const goalPreview = {
      valid: true,
      matched: true,
      issues: [],
      matchedCount: "1",
      actual: { visibility: "REDACTED" as const },
    };
    vi.mocked(scenarioAuthoringValidateScenarioDraft).mockResolvedValue(
      validation,
    );
    vi.mocked(scenarioAuthoringPreviewGoal).mockResolvedValue(goalPreview);

    await expect(
      scenarioAuthoringRepository.validateScenarioDraft(
        "project-1",
        "scenario-1",
        source,
      ),
    ).resolves.toBe(validation);
    await expect(
      scenarioAuthoringRepository.previewGoal("project-1", goalRequest),
    ).resolves.toBe(goalPreview);
    expect(scenarioAuthoringValidateScenarioDraft).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
      source,
    );
    expect(scenarioAuthoringPreviewGoal).toHaveBeenCalledWith(
      "project-1",
      goalRequest,
    );
  });

  it("loads immutable revision history with cursor pagination and detail", async () => {
    const page = {
      items: [
        {
          id: "scenario-revision-2",
          scenarioId: "scenario-1",
          revisionNumber: 2,
          contentHash: "hash-2",
          catalogRevision: "catalog-revision-1",
          publishedAt: "2026-07-18T00:00:00.000Z",
          publishedByAdminId: "admin-1",
          current: true,
          editable: true,
        },
      ],
      nextCursor: "scenario-revision-2",
    };
    const detail = {
      ...page.items[0]!,
      source: {
        catalogRevision: "catalog-revision-1",
        deliveryPolicy: { kind: "IMMEDIATE" as const },
        graph: { actions: [] },
        rule,
      },
      runtime: {},
    };
    vi.mocked(scenarioAuthoringScenarioRevisions).mockResolvedValue(page);
    vi.mocked(scenarioAuthoringScenarioRevision).mockResolvedValue(
      detail as never,
    );

    await expect(
      scenarioAuthoringRepository.getScenarioRevisions(
        "project-1",
        "scenario-1",
        { limit: 25, cursor: "cursor-1" },
      ),
    ).resolves.toBe(page);
    await expect(
      scenarioAuthoringRepository.getScenarioRevision(
        "project-1",
        "scenario-1",
        "scenario-revision-2",
      ),
    ).resolves.toBe(detail);
    expect(scenarioAuthoringScenarioRevisions).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
      { limit: 25, cursor: "cursor-1" },
    );
    expect(scenarioAuthoringScenarioRevision).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
      "scenario-revision-2",
    );
  });

  it("rolls back a revision with the observed scenario head", async () => {
    vi.mocked(scenarioAuthoringRollbackScenario).mockResolvedValue(undefined);

    await expect(
      scenarioAuthoringRepository.rollbackScenario(
        "project-1",
        "scenario-1",
        "scenario-revision-1",
        "scenario-revision-2",
      ),
    ).resolves.toBeUndefined();
    expect(scenarioAuthoringRollbackScenario).toHaveBeenCalledWith(
      "project-1",
      "scenario-1",
      "scenario-revision-1",
      { expectedCurrentRevisionId: "scenario-revision-2" },
    );
  });

  it("loads the generated explanation for a pinned run", async () => {
    vi.mocked(scenarioRunsExplain).mockResolvedValue(explainResponse);

    await expect(
      scenarioAuthoringRepository.explainRun("project-1", "run-1"),
    ).resolves.toBe(explainResponse);
    expect(scenarioRunsExplain).toHaveBeenCalledWith("project-1", "run-1");
  });

  it("maps generated client failures to the shared API error", async () => {
    vi.mocked(scenarioAuthoringValidate).mockRejectedValue(
      new Error("connection lost"),
    );

    const request = scenarioAuthoringRepository.validateRule("project-1", rule);

    await expect(request).rejects.toBeInstanceOf(ApiError);
    await expect(request).rejects.toMatchObject({
      status: 0,
      message: "connection lost",
    });
  });
});
