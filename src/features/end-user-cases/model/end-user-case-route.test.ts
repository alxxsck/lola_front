import { describe, expect, it } from "vitest";
import {
  endUserCaseFiltersFromRoute,
  endUserCaseRouteQuery,
} from "./end-user-case-route";

describe("End User Case route codec", () => {
  it("normalizes untrusted query values and preserves supported arrays", () => {
    expect(
      endUserCaseFiltersFromRoute({
        view: "ATTENTION",
        sort: "PRIORITY",
        status: ["WAITING_ADMIN", "invalid"],
        priority: ["CRITICAL", "invalid"],
        impact: ["HIGH", "invalid"],
        urgency: "IMMEDIATE",
        resolution: "LIKELY_RESOLVED",
        resolutionSource: "AI_INFERENCE",
        group: "DEPOSIT",
        assignment: "UNASSIGNED",
        endUser: "user-id",
        assignee: "admin-id",
        language: "es",
        channel: ["VOICE", "invalid"],
        capability: "check_deposit",
        capabilityOutcome: ["COMPLETED", "invalid"],
        recontacted: "YES",
        adminAttention: "OPEN",
        cmsParticipation: "YES",
        reopened: "NO",
        stale: "YES",
        degraded: "NO",
        createdFrom: "2026-07-01T00:00:00.000Z",
        activityTo: "2026-07-31T23:59:59.000Z",
      }),
    ).toEqual({
      preset: "ATTENTION",
      sort: "PRIORITY",
      status: ["WAITING_ADMIN"],
      priority: ["CRITICAL"],
      impact: ["HIGH"],
      urgency: ["IMMEDIATE"],
      resolutionAssessment: ["LIKELY_RESOLVED"],
      resolutionSource: ["AI_INFERENCE"],
      groupCode: "DEPOSIT",
      assignment: "UNASSIGNED",
      endUserId: "user-id",
      assignedCmsUserId: "admin-id",
      primaryLanguage: "es",
      channel: ["VOICE"],
      aiCapabilityCode: "check_deposit",
      aiCapabilityOutcome: ["COMPLETED"],
      recontacted: "YES",
      adminAttention: "OPEN",
      cmsParticipation: "YES",
      reopened: "NO",
      stale: "YES",
      degraded: "NO",
      createdFrom: "2026-07-01T00:00:00.000Z",
      lastActivityTo: "2026-07-31T23:59:59.000Z",
    });
  });

  it("uses safe defaults and removes defaults from a shareable query", () => {
    expect(
      endUserCaseFiltersFromRoute({
        view: "invalid",
        sort: null,
        priority: "HIGH",
        group: [],
      }),
    ).toEqual({
      preset: "ACTIVE",
      sort: "ATTENTION_FIRST",
      priority: ["HIGH"],
    });
    expect(
      endUserCaseRouteQuery({
        preset: "ACTIVE",
        sort: "ATTENTION_FIRST",
      }),
    ).toEqual({});
  });

  it("serializes every supported non-default filter", () => {
    expect(
      endUserCaseRouteQuery({
        preset: "ALL",
        sort: "LAST_ACTIVITY",
        status: ["OPEN"],
        priority: ["HIGH"],
        impact: ["MEDIUM"],
        urgency: ["HIGH"],
        resolutionAssessment: ["NOT_ASSESSED"],
        resolutionSource: ["CMS_USER"],
        groupCode: "PAYMENT",
        assignment: "ASSIGNED",
        endUserId: "user-id",
        assignedCmsUserId: "admin-id",
        primaryLanguage: "ru",
        channel: ["TEXT"],
        aiCapabilityCode: "lookup",
        aiCapabilityOutcome: ["FAILED"],
        recontacted: "NO",
        adminAttention: "NONE",
        cmsParticipation: "NO",
        reopened: "YES",
        stale: "NO",
        degraded: "YES",
        createdFrom: "2026-07-01T00:00:00Z",
        createdTo: "2026-07-02T00:00:00Z",
        lastActivityFrom: "2026-07-03T00:00:00Z",
        lastActivityTo: "2026-07-04T00:00:00Z",
      }),
    ).toEqual({
      view: "ALL",
      sort: "LAST_ACTIVITY",
      status: ["OPEN"],
      priority: ["HIGH"],
      impact: ["MEDIUM"],
      urgency: ["HIGH"],
      resolution: ["NOT_ASSESSED"],
      resolutionSource: ["CMS_USER"],
      group: "PAYMENT",
      assignment: "ASSIGNED",
      endUser: "user-id",
      assignee: "admin-id",
      language: "ru",
      channel: ["TEXT"],
      capability: "lookup",
      capabilityOutcome: ["FAILED"],
      recontacted: "NO",
      adminAttention: "NONE",
      cmsParticipation: "NO",
      reopened: "YES",
      stale: "NO",
      degraded: "YES",
      createdFrom: "2026-07-01T00:00:00Z",
      createdTo: "2026-07-02T00:00:00Z",
      activityFrom: "2026-07-03T00:00:00Z",
      activityTo: "2026-07-04T00:00:00Z",
    });
  });
});
