import { describe, expect, it } from "vitest";
import {
  canonicalSupportLocation,
  isCanonicalSupportWorkspaceAdmission,
  legacySupportLocation,
} from "./support-workspace-entry-point";

const canonicalAdmission = {
  rolloutState: "ENABLED" as const,
  rolloutVersion: 3,
  entryPointMode: "CANONICAL_SUPPORT" as const,
  legacyAdapterMode: "LAUNCHER_ONLY" as const,
  evaluatedAt: "2026-08-09T10:00:00.000Z",
  admissionRevision: "a".repeat(64),
  capabilities: {
    supportWorkspaceShell: "AVAILABLE" as const,
    cases: "AVAILABLE" as const,
    conversations: "AVAILABLE" as const,
  },
};

describe("Support Workspace entry-point cutover", () => {
  it("admits only the exact server-owned canonical state and target capability", () => {
    expect(isCanonicalSupportWorkspaceAdmission(canonicalAdmission, "CASES")).toBe(true);
    expect(
      isCanonicalSupportWorkspaceAdmission(
        {
          ...canonicalAdmission,
          entryPointMode: "LEGACY_LAUNCHER",
          capabilities: {
            ...canonicalAdmission.capabilities,
            supportWorkspaceShell: "UNAVAILABLE",
          },
        },
        "CASES",
      ),
    ).toBe(false);
    expect(
      isCanonicalSupportWorkspaceAdmission(
        {
          ...canonicalAdmission,
          capabilities: {
            ...canonicalAdmission.capabilities,
            conversations: "UNAVAILABLE",
          },
        },
        "CONVERSATIONS",
      ),
    ).toBe(false);
  });

  it("converts legacy Case, Users and Live selections into canonical Support URLs", () => {
    expect(
      canonicalSupportLocation({
        entryPoint: "CASES",
        caseId: "case-1",
        query: { projectId: "project-2", panel: "inspector" },
      }),
    ).toEqual({
      name: "support-inbox-case",
      params: { caseId: "case-1" },
      query: { projectId: "project-2", panel: "inspector", mode: "cases" },
      replace: true,
    });
    expect(
      canonicalSupportLocation({
        entryPoint: "USERS",
        endUserId: "user-1",
        conversationId: "conversation-1",
        query: { projectId: "project-2", conversationId: "conversation-1" },
      }),
    ).toEqual({
      name: "support-inbox-conversation",
      params: { conversationId: "conversation-1" },
      query: { projectId: "project-2" },
      replace: true,
    });
    expect(
      canonicalSupportLocation({
        entryPoint: "LIVE",
        endUserId: "user-2",
        query: { projectId: "project-2" },
      }),
    ).toEqual({
      name: "support-inbox",
      query: {
        projectId: "project-2",
        endUserId: "user-2",
        entry: "live",
      },
      replace: true,
    });
  });

  it("copies only supported routing context and drops hostile capability parameters", () => {
    expect(
      canonicalSupportLocation({
        entryPoint: "CASES",
        caseId: "case-1",
        query: {
          projectId: "project-2",
          panel: "inspector",
          view: "system:MY_ACTIVE",
          token: "secret",
          access_token: "secret",
          capability: "secret",
          redirect: "/platform",
          unexpected: "value",
        },
      }),
    ).toEqual({
      name: "support-inbox-case",
      params: { caseId: "case-1" },
      query: {
        projectId: "project-2",
        panel: "inspector",
        view: "system:MY_ACTIVE",
        mode: "cases",
      },
      replace: true,
    });
  });

  it("returns disabled Support deep links to the matching legacy launcher without losing Project", () => {
    expect(
      legacySupportLocation({
        target: "CASES",
        caseId: "case-1",
        query: { projectId: "project-2", mode: "cases" },
      }),
    ).toEqual({
      name: "end-user-case-detail",
      params: { caseId: "case-1" },
      query: { projectId: "project-2" },
      replace: true,
    });
    expect(
      legacySupportLocation({
        target: "CONVERSATIONS",
        conversationId: "conversation-1",
        query: { projectId: "project-2" },
      }),
    ).toEqual({
      name: "users",
      query: {
        projectId: "project-2",
        conversationId: "conversation-1",
      },
      replace: true,
    });
    expect(
      legacySupportLocation({
        target: "CONVERSATIONS",
        query: {
          projectId: "project-2",
          entry: "live",
          endUserId: "user-2",
        },
      }),
    ).toEqual({
      name: "live",
      query: { projectId: "project-2", endUserId: "user-2" },
      replace: true,
    });
    expect(
      legacySupportLocation({
        target: "CONVERSATIONS",
        query: {
          projectId: "project-2",
          entry: "users",
          endUserId: "user-3",
        },
      }),
    ).toEqual({
      name: "users",
      params: { endUserId: "user-3" },
      query: { projectId: "project-2" },
      replace: true,
    });
  });
});
