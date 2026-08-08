import { describe, expect, it } from "vitest";
import { createSavedViewCommand } from "./support-view-draft";

describe("saved view draft", () => {
  it("builds the closed Case grammar and strips raw external IDs", () => {
    const command = createSavedViewCommand("VIP cases", "vip-cases", "PERSONAL", "", {
      phrase: "secret@example.test",
      scope: "CASES",
      filters: { statuses: ["OPEN"], externalEndUserIds: ["external-secret"] },
      sort: { field: "PRIORITY", direction: "DESC" },
    });
    expect(command?.draft).toMatchObject({ surface: "CASES", displayName: "VIP cases", filters: { statuses: ["OPEN"] } });
    expect(JSON.stringify(command)).not.toContain("external-secret");
    expect(JSON.stringify(command)).not.toContain("secret@example.test");
  });

  it("rejects unsupported End User views and TEAM without a team ID", () => {
    const base = { phrase: "", scope: "END_USERS" as const, filters: {}, sort: { field: "RELEVANCE" as const, direction: "DESC" as const } };
    expect(createSavedViewCommand("Users", "users", "PERSONAL", "", base)).toBeNull();
    expect(createSavedViewCommand("Cases", "cases", "TEAM", "", { ...base, scope: "CASES" })).toBeNull();
  });
});
