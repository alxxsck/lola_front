import { describe, expect, it, vi } from "vitest";
import { supportWorkspaceReadAdmission } from "@/shared/api/generated/retenive-backend";
import { apiSupportWorkspaceShellSource } from "./support-workspace-shell-source";

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  supportWorkspaceReadAdmission: vi.fn(),
}));

describe("Support Workspace shell source", () => {
  it("reads the CMS-only Project admission with the caller signal", async () => {
    const controller = new AbortController();
    vi.mocked(supportWorkspaceReadAdmission).mockResolvedValue({
      entryPointMode: "LEGACY_LAUNCHER",
    } as never);

    await apiSupportWorkspaceShellSource.readAdmission(
      "project-1",
      controller.signal,
    );

    expect(supportWorkspaceReadAdmission).toHaveBeenCalledWith("project-1", {
      signal: controller.signal,
    });
  });
});
