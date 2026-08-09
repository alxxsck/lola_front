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

export interface MockWorkspaceRolloutRoot {
  enabled: boolean;
  shellEnabled: boolean;
  hardOff: boolean;
  version: number;
}

export function mockSupportWorkspaceRolloutEtag(version: number): string {
  return `"swr1.${version.toString(36).padStart(43, "0")}"`;
}

const mockWorkspaceRolloutKey = "support-workspace-shell-mock:v1";
function mockWorkspaceRolloutStorageKey(projectId?: string): string {
  return !projectId || projectId === "prj_retenive_demo"
    ? mockWorkspaceRolloutKey
    : `${mockWorkspaceRolloutKey}:${projectId}`;
}
const defaultMockWorkspaceRollout: MockWorkspaceRolloutRoot = {
  enabled: true,
  shellEnabled: true,
  hardOff: false,
  version: 1,
};

export function readMockSupportWorkspaceRollout(
  projectId?: string,
): MockWorkspaceRolloutRoot {
  try {
    const raw = sessionStorage.getItem(
      mockWorkspaceRolloutStorageKey(projectId),
    );
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
  projectId?: string,
): void {
  sessionStorage.setItem(
    mockWorkspaceRolloutStorageKey(projectId),
    JSON.stringify(root),
  );
}

export function resetMockSupportWorkspaceRollout(): void {
  try {
    for (let index = sessionStorage.length - 1; index >= 0; index -= 1) {
      const key = sessionStorage.key(index);
      if (
        key === mockWorkspaceRolloutKey ||
        key?.startsWith(`${mockWorkspaceRolloutKey}:`)
      )
        sessionStorage.removeItem(key);
    }
  } catch {
    // The deterministic default already represents the reset state.
  }
}

export const mockSupportWorkspaceShellSource: SupportWorkspaceShellSource = {
  async readAdmission(projectId) {
    const root = readMockSupportWorkspaceRollout(projectId);
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
