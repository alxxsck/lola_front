import { describe, expect, it, vi } from "vitest";
import { reportSupportWorkspaceTelemetry } from "./support-workspace-telemetry";

describe("Support Workspace operational telemetry", () => {
  it("emits only bounded low-cardinality fields without content or identifiers", () => {
    const listener = vi.fn();
    window.addEventListener("retenive:analytics", listener);

    reportSupportWorkspaceTelemetry("support_workspace_core_feedback", {
      operation: "reply_feedback",
      outcome: "accepted",
      duration_ms: 417,
      duplicate_prevented: true,
      recovered: false,
      mismatch_count: 0,
      viewport: "mobile",
      project_id: "project-secret",
      end_user_id: "end-user-secret",
      message_text: "private content",
      draft: "private draft",
      filename: "private.pdf",
      raw_error: "backend stack",
    });

    expect((listener.mock.calls[0]?.[0] as CustomEvent).detail).toEqual({
      name: "support_workspace_core_feedback",
      payload: {
        operation: "reply_feedback",
        outcome: "accepted",
        duration_ms: 417,
        duplicate_prevented: true,
        recovered: false,
        mismatch_count: 0,
        viewport: "mobile",
      },
    });
    window.removeEventListener("retenive:analytics", listener);
  });
});
