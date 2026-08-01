import { describe, expect, it } from "vitest";
import { cmsUserDetailRoute } from "./cms-user-route";

describe("cmsUserDetailRoute", () => {
  it("links to the CMS user when the viewer has platform access", () => {
    expect(cmsUserDetailRoute("admin-1", true)).toEqual({
      name: "platform-cms-users",
      params: { cmsUserId: "admin-1" },
    });
  });

  it("keeps the identifier copy-only without platform access", () => {
    expect(cmsUserDetailRoute("admin-1", false)).toBeUndefined();
  });
});
