import { shallowMount } from "@vue/test-utils";
import { describe, expect, it } from "vitest";
import AIOperationDetailPanel from "./AIOperationDetailPanel.vue";

const detail = {
  operationId: "operation-1",
  projectSequence: "42",
  rootCorrelationId: "root-1",
  category: "AI_ANALYSIS" as const,
  status: "SUCCEEDED" as const,
  title: "Депозиты",
  purpose: "Проверяемая агрегация",
  sourceKind: "AI_ANALYSIS_RUN",
  sourceId: "run-1",
  initiator: {
    type: "CMS_USER" as const,
    id: "admin-1",
    displayName: "Анна",
  },
  chargedAccount: "PROJECT_BUDGET" as const,
  responsibleCmsUserId: "admin-1",
  responsibleCmsUserDisplayName: "Анна",
  chargedEndUserId: null,
  subjectSummary: { availability: "EXACT" as const, count: 1 },
  resultReference: {
    kind: "AI_ANALYSIS" as const,
    id: "analysis-1",
    endUserId: null,
  },
  usageRecords: 1,
  cost: {
    providerReportedCost: "0.25",
    estimatedFallbackCost: "0",
    effectiveCost: "0.25",
    state: "KNOWN" as const,
    unknownUsageRecords: 0,
    reservedCostUsdTicks: "0",
  },
  dbWorkUnits: "20",
  limitationCodes: [],
  restrictedSections: [],
  startedAt: "2026-07-31T08:00:00.000Z",
  timeline: [
    {
      sequence: "1",
      kind: "DATA_ACCESS",
      occurredAt: "2026-07-31T08:00:01.000Z",
      eventType: "DATA_ACCESS_COMPLETED",
      actor: { type: "SYSTEM" as const },
      status: "SUCCEEDED",
      modelAttempt: null,
      toolCall: null,
      dataAccess: {
        bytesRead: "10",
        complete: true,
        groupsReturned: 1,
        limitationCodes: [],
        rangeEndedAt: null,
        rangeStartedAt: null,
        rowsRead: 20,
        sourceReceiptId: "receipt-1",
        sourceType: "PROJECT_ANALYSIS_QUERY",
        toolCallStepId: "step-1",
        truncated: false,
        workUnits: "20",
      },
    },
  ],
  timelinePageInfo: { hasMore: false },
  usage: {
    attempts: [],
    pageInfo: { hasMore: false },
    totals: {
      providerReportedCost: "0.25",
      estimatedFallbackCost: "0",
      effectiveCost: "0.25",
      state: "KNOWN" as const,
      unknownUsageRecords: 0,
      reservedCostUsdTicks: "0",
    },
  },
};

describe("AIOperationDetailPanel", () => {
  it("labels analysis participation independently from user charges", () => {
    const wrapper = shallowMount(AIOperationDetailPanel, {
      props: {
        projectId: "project-1",
        detail,
        subjects: {
          availability: "EXACT",
          items: [
            {
              subjectRowId: "subject-1",
              endUserId: "user-1",
              subjectReference: "user-1",
              charged: false,
              roles: ["DATA_CONTRIBUTOR"],
            },
          ],
          pageInfo: { hasMore: false },
        },
        accessHistory: {
          items: [
            {
              accessEventId: "access-1",
              accessKind: "SUBJECT_MANIFEST",
              outcome: "SUCCESS",
              actor: {
                type: "CMS_USER",
                cmsUserId: "admin-audit-1",
                displayName: "Auditor",
                externalId: null,
              },
              requiredPermissionCode: "project.ai_operations.subjects.read",
              requestId: "request-audit-1",
              correlationId: "correlation-audit-1",
              occurredAt: "2026-07-31T08:00:03.000Z",
            },
          ],
          pageInfo: { hasMore: false },
        },
        loading: false,
        timelineLoading: false,
        usageLoading: false,
        subjectsLoading: false,
        accessLoading: false,
        error: "",
        canReadCost: true,
        canReadSubjects: true,
        canReadAudit: true,
        canReadAnalysisResult: true,
        canReadCaseResult: true,
        canReadConversationResult: true,
      },
      global: {
        stubs: {
          ...renderedPrimeStubs,
          RouterLink: {
            name: "RouterLink",
            props: ["to"],
            template: "<a><slot /></a>",
          },
        },
      },
    });

    expect(wrapper.text()).toContain("данные участвовали");
    expect(wrapper.text()).toContain("Не списано с пользователя");
    expect(wrapper.text()).toContain("PROJECT_ANALYSIS_QUERY");
    expect(wrapper.text()).toContain("Открыть AI_ANALYSIS");
    expect(wrapper.text()).toContain("$0.25");
    expect(wrapper.text()).toContain("admin-audit-1");
    expect(wrapper.text()).toContain("project.ai_operations.subjects.read");
    expect(wrapper.text()).toContain("request-audit-1");
    expect(wrapper.text()).toContain("correlation-audit-1");
    expect(wrapper.findComponent({ name: "RouterLink" }).props("to")).toEqual({
      name: "ai-analysis-detail",
      params: { analysisId: "analysis-1" },
      query: { projectId: "project-1" },
    });
  });

  it("requires explicit protected reads and hides monetary values without permission", () => {
    const wrapper = shallowMount(AIOperationDetailPanel, {
      props: {
        projectId: "project-1",
        detail,
        subjects: null,
        accessHistory: null,
        loading: false,
        timelineLoading: false,
        usageLoading: false,
        subjectsLoading: false,
        accessLoading: false,
        error: "",
        canReadCost: false,
        canReadSubjects: true,
        canReadAudit: true,
        canReadAnalysisResult: false,
        canReadCaseResult: false,
        canReadConversationResult: false,
      },
      global: { stubs: renderedPrimeStubs },
    });

    expect(wrapper.text()).toContain("Запросить доступ");
    expect(wrapper.text()).toContain("Открыть аудит");
    expect(wrapper.text()).not.toContain("$0.25");
  });

  it("renders missing provider cost as unknown instead of zero", () => {
    const wrapper = shallowMount(AIOperationDetailPanel, {
      props: {
        projectId: "project-1",
        detail: {
          ...detail,
          usage: {
            ...detail.usage,
            attempts: [
              {
                id: "attempt-1",
                provider: "xai",
                model: "grok",
                operation: "responses",
                providerRequestId: "provider-request-1",
                status: "SUCCEEDED",
                costStatus: "INCOMPLETE_USAGE",
                billedCost: null,
                estimatedCost: null,
                totalTokens: 10,
                inputTokens: 8,
                outputTokens: 2,
                occurredAt: "2026-07-31T08:00:02.000Z",
                modelAttemptStepId: null,
              },
            ],
          },
        },
        subjects: null,
        accessHistory: null,
        loading: false,
        timelineLoading: false,
        usageLoading: false,
        subjectsLoading: false,
        accessLoading: false,
        error: "",
        canReadCost: true,
        canReadSubjects: false,
        canReadAudit: false,
        canReadAnalysisResult: true,
        canReadCaseResult: false,
        canReadConversationResult: false,
      },
      global: { stubs: renderedPrimeStubs },
    });

    const attempt = wrapper.find(".usage-list");
    expect(attempt.text()).toContain("стоимость неизвестна");
    expect(attempt.text()).not.toContain("$0");
  });

  it("uses canonical End User context for a Conversation result link", () => {
    const wrapper = shallowMount(AIOperationDetailPanel, {
      props: {
        projectId: "project-1",
        detail: {
          ...detail,
          resultReference: {
            kind: "CONVERSATION",
            id: "conversation-1",
            endUserId: "end-user-1",
          },
        },
        subjects: null,
        accessHistory: null,
        loading: false,
        timelineLoading: false,
        usageLoading: false,
        subjectsLoading: false,
        accessLoading: false,
        error: "",
        canReadCost: false,
        canReadSubjects: false,
        canReadAudit: false,
        canReadAnalysisResult: false,
        canReadCaseResult: false,
        canReadConversationResult: true,
      },
      global: {
        stubs: {
          ...renderedPrimeStubs,
          RouterLink: {
            name: "RouterLink",
            props: ["to"],
            template: "<a><slot /></a>",
          },
        },
      },
    });

    expect(wrapper.findComponent({ name: "RouterLink" }).props("to")).toEqual({
      name: "users",
      params: { endUserId: "end-user-1" },
      query: { conversationId: "conversation-1", projectId: "project-1" },
    });
  });

  it("preserves Project context for Case result links", () => {
    const wrapper = shallowMount(AIOperationDetailPanel, {
      props: {
        projectId: "project-2",
        detail: {
          ...detail,
          resultReference: {
            kind: "END_USER_CASE",
            id: "case-1",
            endUserId: "end-user-1",
          },
        },
        subjects: null,
        accessHistory: null,
        loading: false,
        timelineLoading: false,
        usageLoading: false,
        subjectsLoading: false,
        accessLoading: false,
        error: "",
        canReadCost: false,
        canReadSubjects: false,
        canReadAudit: false,
        canReadAnalysisResult: false,
        canReadCaseResult: true,
        canReadConversationResult: false,
      },
      global: {
        stubs: {
          ...renderedPrimeStubs,
          RouterLink: {
            name: "RouterLink",
            props: ["to"],
            template: "<a><slot /></a>",
          },
        },
      },
    });

    expect(wrapper.findComponent({ name: "RouterLink" }).props("to")).toEqual({
      name: "end-user-case-detail",
      params: { caseId: "case-1" },
      query: { projectId: "project-2" },
    });
  });
});

const renderedPrimeStubs = {
  Button: {
    props: ["label"],
    template: "<button>{{ label }}<slot /></button>",
  },
  Tag: {
    props: ["value"],
    template: "<span>{{ value }}</span>",
  },
  Message: {
    template: "<div><slot /></div>",
  },
  Skeleton: {
    template: "<span />",
  },
};
