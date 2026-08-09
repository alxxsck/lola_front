import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupportWorkspaceAdmissionResponseDto } from "@/shared/api/generated/models";
import type { SupportWorkspaceShellSource } from "../api/support-workspace-shell-source";
import {
  clearSupportWorkspaceShellAdmission,
  ensureSupportWorkspaceShellAdmission,
  supportWorkspaceShellAdmissionState,
} from "./support-workspace-shell-admission";

function admission(
  mode: "CANONICAL_SUPPORT" | "LEGACY_LAUNCHER" = "CANONICAL_SUPPORT",
): SupportWorkspaceAdmissionResponseDto {
  const enabled = mode === "CANONICAL_SUPPORT";
  return {
    rolloutState: enabled ? "ENABLED" : "DISABLED",
    rolloutVersion: 2,
    entryPointMode: mode,
    legacyAdapterMode: "LAUNCHER_ONLY",
    evaluatedAt: "2026-08-09T10:00:00.000Z",
    admissionRevision: (enabled ? "a" : "b").repeat(64),
    capabilities: {
      supportWorkspaceShell: enabled ? "AVAILABLE" : "UNAVAILABLE",
      cases: enabled ? "AVAILABLE" : "UNAVAILABLE",
      conversations: enabled ? "AVAILABLE" : "UNAVAILABLE",
    },
  };
}

const scope = (projectId: string) => ({
  actorId: "operator-1",
  projectId,
  effectivePermissionCodes: ["project.conversations.read"],
});

describe("Support Workspace shell admission", () => {
  beforeEach(() => clearSupportWorkspaceShellAdmission());

  it("deduplicates one authoritative read for the same actor and Project scope", async () => {
    const source: SupportWorkspaceShellSource = {
      readAdmission: vi.fn().mockResolvedValue(admission()),
    };

    const [first, second] = await Promise.all([
      ensureSupportWorkspaceShellAdmission(scope("project-1"), source),
      ensureSupportWorkspaceShellAdmission(scope("project-1"), source),
    ]);

    expect(first?.entryPointMode).toBe("CANONICAL_SUPPORT");
    expect(second).toEqual(first);
    expect(source.readAdmission).toHaveBeenCalledTimes(1);
    expect(supportWorkspaceShellAdmissionState.value.status).toBe("READY");
  });

  it("revalidates a ready scope so a live hard-off wins without reload", async () => {
    const hardOff = {
      ...admission("LEGACY_LAUNCHER"),
      rolloutState: "HARD_OFF" as const,
    };
    const source: SupportWorkspaceShellSource = {
      readAdmission: vi
        .fn()
        .mockResolvedValueOnce(admission())
        .mockResolvedValueOnce(hardOff),
    };

    const first = await ensureSupportWorkspaceShellAdmission(
      scope("project-1"),
      source,
    );
    const second = await ensureSupportWorkspaceShellAdmission(
      scope("project-1"),
      source,
    );

    expect(first?.rolloutState).toBe("ENABLED");
    expect(second?.rolloutState).toBe("HARD_OFF");
    expect(source.readAdmission).toHaveBeenCalledTimes(2);
    expect(supportWorkspaceShellAdmissionState.value.admission?.rolloutState).toBe(
      "HARD_OFF",
    );
  });

  it("does not publish a late admission from the previous Project", async () => {
    let resolveFirst!: (value: SupportWorkspaceAdmissionResponseDto) => void;
    const source: SupportWorkspaceShellSource = {
      readAdmission: vi
        .fn()
        .mockImplementationOnce(
          () =>
            new Promise<SupportWorkspaceAdmissionResponseDto>((resolve) => {
              resolveFirst = resolve;
            }),
        )
        .mockResolvedValueOnce(admission("LEGACY_LAUNCHER")),
    };

    const first = ensureSupportWorkspaceShellAdmission(scope("project-1"), source);
    const second = await ensureSupportWorkspaceShellAdmission(
      scope("project-2"),
      source,
    );
    resolveFirst(admission());
    await first;

    expect(second?.entryPointMode).toBe("LEGACY_LAUNCHER");
    expect(supportWorkspaceShellAdmissionState.value.scope?.projectId).toBe(
      "project-2",
    );
    expect(
      supportWorkspaceShellAdmissionState.value.admission?.entryPointMode,
    ).toBe("LEGACY_LAUNCHER");
  });

  it("does not reuse a pre-logout pending read for the same actor and Project", async () => {
    let resolveOld!: (value: SupportWorkspaceAdmissionResponseDto) => void;
    const oldSource: SupportWorkspaceShellSource = {
      readAdmission: vi.fn(
        () =>
          new Promise<SupportWorkspaceAdmissionResponseDto>((resolve) => {
            resolveOld = resolve;
          }),
      ),
    };
    const nextSource: SupportWorkspaceShellSource = {
      readAdmission: vi.fn().mockResolvedValue(admission("LEGACY_LAUNCHER")),
    };

    const oldSession = ensureSupportWorkspaceShellAdmission(
      scope("project-1"),
      oldSource,
    );
    clearSupportWorkspaceShellAdmission();
    const nextSession = ensureSupportWorkspaceShellAdmission(
      scope("project-1"),
      nextSource,
    );
    resolveOld(admission());

    expect(await oldSession).toBeNull();
    expect((await nextSession)?.entryPointMode).toBe("LEGACY_LAUNCHER");
    expect(nextSource.readAdmission).toHaveBeenCalledTimes(1);
  });

  it("fails closed without retaining a prior Project admission", async () => {
    const source: SupportWorkspaceShellSource = {
      readAdmission: vi
        .fn()
        .mockResolvedValueOnce(admission())
        .mockRejectedValueOnce(new Error("concealed")),
    };

    await ensureSupportWorkspaceShellAdmission(scope("project-1"), source);
    const result = await ensureSupportWorkspaceShellAdmission(
      scope("project-2"),
      source,
    );

    expect(result).toBeNull();
    expect(supportWorkspaceShellAdmissionState.value.status).toBe("ERROR");
    expect(supportWorkspaceShellAdmissionState.value.admission).toBeNull();
  });
});
