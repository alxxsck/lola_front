import { describe, expect, it } from "vitest";
import {
  canManageOwnSupportAvailability,
  canManageOwnSupportAssignments,
  canManageSupportConversationAiSuspension,
  canReceiveSupportRoutingOffers,
  canReadSupportConversationAiSuspension,
  canReadSupportInternalNoteHistory,
  canReadSupportInternalNotes,
  canWriteSupportInternalNotes,
  canRedactSupportInternalNotes,
  canReleaseSupportCaseAssignment,
  canReadSupportAvailability,
  canReadSupportControl,
  canReadSupportWorkspace,
  isSupportWorkspaceRolloutEnabled,
} from "./support-workspace-access";

describe("support workspace access", () => {
  it("requires the exact conversation read permission", () => {
    expect(canReadSupportWorkspace(["project.conversations.read"])).toBe(true);
    expect(canReadSupportWorkspace(["project.conversations.reply"])).toBe(
      false,
    );
  });

  it("does not infer workspace access from a role-shaped value", () => {
    const legacyContext = {
      role: "SUPPORT_LEAD",
      effectivePermissionCodes: [],
    };

    expect(
      canReadSupportWorkspace(legacyContext.effectivePermissionCodes),
    ).toBe(false);
  });

  it("requires the exact lead-control permission for operational statistics", () => {
    expect(canReadSupportControl(["project.support.lead_control.read"])).toBe(
      true,
    );
    expect(canReadSupportControl(["project.conversations.read"])).toBe(false);
  });

  it("requires a read grant before exposing or changing self availability", () => {
    expect(canReadSupportAvailability(["project.support.availability.read"])).toBe(
      true,
    );
    expect(
      canManageOwnSupportAvailability([
        "project.support.availability.read",
        "project.support.availability.self_manage",
      ]),
    ).toBe(true);
    expect(
      canManageOwnSupportAvailability([
        "project.support.availability.self_manage",
      ]),
    ).toBe(false);
  });

  it("does not infer own assignment authority from case or lead permissions", () => {
    expect(
      canManageOwnSupportAssignments([
        "project.support.assignments.self_manage",
      ]),
    ).toBe(true);
    expect(canManageOwnSupportAssignments(["project.cases.assign"])).toBe(
      false,
    );
    expect(
      canManageOwnSupportAssignments(["project.support.assignments.override"]),
    ).toBe(false);
  });

  it("requires both self-assignment authority and routing-receive permission for offers", () => {
    expect(
      canReceiveSupportRoutingOffers([
        "project.support.assignments.self_manage",
        "project.support.routing.receive",
      ]),
    ).toBe(true);
    expect(
      canReceiveSupportRoutingOffers([
        "project.support.assignments.self_manage",
      ]),
    ).toBe(false);
  });

  it("permits self-release only for the assignment owner, unless override is granted", () => {
    expect(
      canReleaseSupportCaseAssignment(
        ["project.support.assignments.self_manage"],
        "operator-1",
        "operator-1",
      ),
    ).toBe(true);
    expect(
      canReleaseSupportCaseAssignment(
        ["project.support.assignments.self_manage"],
        "operator-1",
        "operator-2",
      ),
    ).toBe(false);
    expect(
      canReleaseSupportCaseAssignment(
        ["project.support.assignments.override"],
        "operator-1",
        "operator-2",
      ),
    ).toBe(true);
  });

  it("separates AI state read access from mutation authority", () => {
    expect(
      canReadSupportConversationAiSuspension([
        "project.conversations.read",
      ]),
    ).toBe(true);
    expect(
      canReadSupportConversationAiSuspension([
        "project.conversations.ai_suspend",
      ]),
    ).toBe(false);
    expect(
      canManageSupportConversationAiSuspension(
        ["project.conversations.ai_suspend"],
        true,
      ),
    ).toBe(true);
    expect(
      canManageSupportConversationAiSuspension(
        ["project.conversations.ai_suspend"],
        false,
      ),
    ).toBe(false);
    expect(
      canManageSupportConversationAiSuspension(
        ["project.conversations.read"],
        true,
      ),
    ).toBe(false);
  });

  it("requires the separate history grant in addition to internal-note read", () => {
    expect(
      canReadSupportInternalNotes(["project.support.internal_notes.read"]),
    ).toBe(true);
    expect(
      canReadSupportInternalNotes(["project.support.internal_notes.write"]),
    ).toBe(false);
    expect(
      canReadSupportInternalNoteHistory([
        "project.support.internal_notes.read",
        "project.support.internal_notes.history_read",
      ]),
    ).toBe(true);
    expect(
      canReadSupportInternalNoteHistory([
        "project.support.internal_notes.history_read",
      ]),
    ).toBe(false);
  });

  it("keeps note creation and redaction behind their distinct grants", () => {
    expect(
      canWriteSupportInternalNotes(["project.support.internal_notes.write"]),
    ).toBe(true);
    expect(
      canWriteSupportInternalNotes(["project.support.internal_notes.read"]),
    ).toBe(false);
    expect(
      canRedactSupportInternalNotes(["project.support.internal_notes.redact"]),
    ).toBe(true);
    expect(
      canRedactSupportInternalNotes(["project.support.internal_notes.write"]),
    ).toBe(false,
    );
  });

  it("accepts only an explicit rollout enablement", () => {
    expect(isSupportWorkspaceRolloutEnabled(true)).toBe(true);
    expect(isSupportWorkspaceRolloutEnabled(false)).toBe(false);
    expect(isSupportWorkspaceRolloutEnabled(undefined)).toBe(false);
  });
});
