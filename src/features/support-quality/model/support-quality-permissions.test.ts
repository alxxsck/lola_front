import { describe, expect, it } from "vitest";
import { qualityQueueAccess } from "./support-quality-permissions";

describe("qualityQueueAccess", () => {
  it("keeps a reviewer on the task queue without issuing a forbidden review read", () => {
    expect(qualityQueueAccess(["project.support.quality.review"])).toEqual({
      tasks: true,
      reviews: "NONE",
    });
  });

  it("uses the correct review scope for operator and lead permissions", () => {
    expect(qualityQueueAccess(["project.support.quality.self_read"])).toEqual({
      tasks: false,
      reviews: "SELF",
    });
    expect(qualityQueueAccess(["project.support.quality.read"])).toEqual({
      tasks: false,
      reviews: "PROJECT",
    });
  });
});
