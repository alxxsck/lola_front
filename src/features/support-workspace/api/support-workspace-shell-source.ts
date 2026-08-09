import { supportWorkspaceReadAdmission } from "@/shared/api/generated/retenive-backend";
import type { SupportWorkspaceAdmissionResponseDto } from "@/shared/api/generated/models";
import { dataMode } from "@/shared/config/data-mode";

export interface SupportWorkspaceShellSource {
  readAdmission(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<SupportWorkspaceAdmissionResponseDto>;
}

export const apiSupportWorkspaceShellSource: SupportWorkspaceShellSource = {
  readAdmission(projectId, signal) {
    return supportWorkspaceReadAdmission(projectId, { signal });
  },
};

interface MockWorkspaceRolloutRoot {
  enabled: boolean;
  shellEnabled: boolean;
  hardOff: boolean;
  version: number;
}

const mockWorkspaceRolloutKey = "support-workspace-shell-mock:v1";
const defaultMockWorkspaceRollout: MockWorkspaceRolloutRoot = {
  enabled: true,
  shellEnabled: true,
  hardOff: false,
  version: 1,
};

export function readMockSupportWorkspaceRollout(): MockWorkspaceRolloutRoot {
  try {
    const raw = sessionStorage.getItem(mockWorkspaceRolloutKey);
    if (!raw) return { ...defaultMockWorkspaceRollout };
    const value = JSON.parse(raw) as Partial<MockWorkspaceRolloutRoot>;
    if (
      typeof value.enabled === "boolean" &&
      typeof value.shellEnabled === "boolean" &&
      typeof value.hardOff === "boolean" &&
      Number.isInteger(value.version) &&
      Number(value.version) > 0
    ) {
      return value as MockWorkspaceRolloutRoot;
    }
  } catch {
    // The deterministic default keeps mock navigation usable without storage.
  }
  return { ...defaultMockWorkspaceRollout };
}

export function writeMockSupportWorkspaceRollout(
  root: MockWorkspaceRolloutRoot,
): void {
  sessionStorage.setItem(mockWorkspaceRolloutKey, JSON.stringify(root));
}

export function resetMockSupportWorkspaceRollout(): void {
  try {
    sessionStorage.removeItem(mockWorkspaceRolloutKey);
  } catch {
    // The deterministic default already represents the reset state.
  }
}

export const mockSupportWorkspaceShellSource: SupportWorkspaceShellSource = {
  async readAdmission() {
    const root = readMockSupportWorkspaceRollout();
    const enabled = root.enabled && root.shellEnabled && !root.hardOff;
    return {
      rolloutState: root.hardOff
        ? "HARD_OFF"
        : enabled
          ? "ENABLED"
          : "DISABLED",
      rolloutVersion: root.version,
      entryPointMode: enabled ? "CANONICAL_SUPPORT" : "LEGACY_LAUNCHER",
      legacyAdapterMode: "LAUNCHER_ONLY",
      evaluatedAt: new Date().toISOString(),
      admissionRevision: (enabled ? "a" : root.hardOff ? "c" : "b").repeat(
        64,
      ),
      capabilities: {
        supportWorkspaceShell: enabled ? "AVAILABLE" : "UNAVAILABLE",
        cases: enabled ? "AVAILABLE" : "UNAVAILABLE",
        conversations: enabled ? "AVAILABLE" : "UNAVAILABLE",
      },
    };
  },
};

export const supportWorkspaceShellSource =
  dataMode === "mock" || import.meta.env.MODE === "test"
    ? mockSupportWorkspaceShellSource
    : apiSupportWorkspaceShellSource;
