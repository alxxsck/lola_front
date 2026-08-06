import { describe, expect, it } from "vitest";
import {
  canManageOwnSupportAvailability,
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

  it("accepts only an explicit rollout enablement", () => {
    expect(isSupportWorkspaceRolloutEnabled(true)).toBe(true);
    expect(isSupportWorkspaceRolloutEnabled(false)).toBe(false);
    expect(isSupportWorkspaceRolloutEnabled(undefined)).toBe(false);
  });
});
