import { describe, expect, it } from "vitest";
import {
  hasPlatformPermission,
  hasProjectPermission,
  hasProjectOrPlatformPermission,
} from "./permission-access";

describe("permission access", () => {
  it("uses only the selected Project effective Permissions", () => {
    expect(
      hasProjectPermission(
        ["project.knowledge.write"],
        "project.knowledge.write",
      ),
    ).toBe(true);
    expect(
      hasProjectPermission(
        ["project.knowledge.read"],
        "project.knowledge.write",
      ),
    ).toBe(false);
    expect(hasProjectPermission([], "project.knowledge.write")).toBe(false);
  });

  it("does not infer Project authority from a role-shaped value", () => {
    const legacyContext = { role: "OWNER", effectivePermissionCodes: [] };
    expect(
      hasProjectPermission(
        legacyContext.effectivePermissionCodes,
        "project.settings.write",
      ),
    ).toBe(false);
  });

  it("accepts a Platform alternative only when the caller names it explicitly", () => {
    const platform = ["platform.memberships.read"];
    const project: string[] = [];

    expect(hasPlatformPermission(platform, "platform.memberships.read")).toBe(
      true,
    );
    expect(
      hasProjectOrPlatformPermission(
        platform,
        project,
        "project.members.read",
        "platform.memberships.read",
      ),
    ).toBe(true);
    expect(hasProjectPermission(project, "project.members.read")).toBe(false);
  });

  it("keeps notification read and manage authority independent", () => {
    expect(
      hasProjectPermission(
        ["project.notifications.read"],
        "project.notifications.read",
      ),
    ).toBe(true);
    expect(
      hasProjectPermission(
        ["project.notifications.read"],
        "project.notifications.manage",
      ),
    ).toBe(false);
  });

  it("keeps product Telegram installation and link-summary authority independent", () => {
    const permissions = [
      "project.integrations.read",
      "project.telegram.links.read",
    ];
    expect(hasProjectPermission(permissions, "project.integrations.read")).toBe(
      true,
    );
    expect(
      hasProjectPermission(permissions, "project.integrations.manage"),
    ).toBe(false);
    expect(
      hasProjectPermission(permissions, "project.telegram.links.read"),
    ).toBe(true);
    expect(
      hasProjectPermission(
        ["project.notifications.read"],
        "project.integrations.read",
      ),
    ).toBe(false);
  });

  it("does not infer personal Telegram send authority from link read or conversation reply", () => {
    expect(
      hasProjectPermission(
        ["project.telegram.personal_messages.send"],
        "project.telegram.personal_messages.send",
      ),
    ).toBe(true);
    expect(
      hasProjectPermission(
        ["project.telegram.links.read", "project.conversations.reply"],
        "project.telegram.personal_messages.send",
      ),
    ).toBe(false);
  });
});
