import { describe, expect, it } from "vitest";
import {
  canReadSupportWorkspace,
  isSupportWorkspaceShellEnabled,
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

  it("requires the project rollout flag independently of permission", () => {
    expect(
      isSupportWorkspaceShellEnabled({
        settings: { support_workspace_shell: true },
      }),
    ).toBe(true);
    expect(
      isSupportWorkspaceShellEnabled({
        settings: { support_workspace_shell: false },
      }),
    ).toBe(false);
    expect(isSupportWorkspaceShellEnabled(undefined)).toBe(false);
  });
});
