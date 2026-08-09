import {
  supportWorkspaceReadRollout,
  supportWorkspaceUpdateRollout,
} from "@/shared/api/generated/retenive-backend";
import type {
  SupportWorkspaceRolloutResponseDto,
  UpdateSupportWorkspaceRolloutDto,
} from "@/shared/api/generated/models";
import { ApiError } from "@/shared/api/http/api-error";
import { noAuthRetryRequestOptions } from "@/shared/api/http/axios-instance";
import { dataMode } from "@/shared/config/data-mode";
import {
  mockSupportWorkspaceRolloutEtag,
  readMockSupportWorkspaceRollout,
  writeMockSupportWorkspaceRollout,
} from "./support-workspace-shell-source";

export interface SupportWorkspaceRolloutCommand {
  actionEtag: string;
  idempotencyKey: string;
  body: UpdateSupportWorkspaceRolloutDto;
}

export interface SupportWorkspaceRolloutSource {
  read(
    projectId: string,
    signal?: AbortSignal,
  ): Promise<SupportWorkspaceRolloutResponseDto>;
  update(
    projectId: string,
    command: SupportWorkspaceRolloutCommand,
    signal?: AbortSignal,
  ): Promise<SupportWorkspaceRolloutResponseDto>;
}

export const apiSupportWorkspaceRolloutSource: SupportWorkspaceRolloutSource = {
  read(projectId, signal) {
    return supportWorkspaceReadRollout(projectId, { signal });
  },
  update(projectId, command, signal) {
    return supportWorkspaceUpdateRollout(projectId, command.body, {
      ...noAuthRetryRequestOptions(),
      signal,
      headers: {
        "If-Match": command.actionEtag,
        "Idempotency-Key": command.idempotencyKey,
      },
    });
  },
};

interface MockAttempt {
  fingerprint: string;
  receipt: SupportWorkspaceRolloutResponseDto;
}

const mockAttempts = new Map<string, MockAttempt>();

function mockRoot(projectId: string): SupportWorkspaceRolloutResponseDto {
  const root = readMockSupportWorkspaceRollout(projectId);
  return {
    ...root,
    actionEtag: mockSupportWorkspaceRolloutEtag(root.version),
  };
}

export function resetMockSupportWorkspaceRolloutCommands(): void {
  mockAttempts.clear();
}

export const mockSupportWorkspaceRolloutSource: SupportWorkspaceRolloutSource = {
  async read(projectId) {
    return mockRoot(projectId);
  },
  async update(projectId, command) {
    if (!/^[\x21-\x7E]{8,200}$/.test(command.idempotencyKey))
      throw new ApiError(
        400,
        "Idempotency key is invalid",
        undefined,
        undefined,
        "SUPPORT_WORKSPACE_IDEMPOTENCY_KEY_INVALID",
      );
    const attemptKey = `${projectId}\u0000${command.idempotencyKey}`;
    const fingerprint = JSON.stringify({
      actionEtag: command.actionEtag,
      body: command.body,
    });
    const previous = mockAttempts.get(attemptKey);
    if (previous) {
      if (previous.fingerprint !== fingerprint)
        throw new ApiError(
          409,
          "Idempotency key was reused",
          undefined,
          undefined,
          "SUPPORT_WORKSPACE_IDEMPOTENCY_KEY_REUSED",
        );
      return structuredClone(previous.receipt);
    }

    const current = mockRoot(projectId);
    if (command.actionEtag !== current.actionEtag)
      throw new ApiError(
        409,
        "Rollout root changed",
        undefined,
        undefined,
        "SUPPORT_WORKSPACE_VERSION_CONFLICT",
      );
    const nextVersion = current.version + 1;
    const receipt: SupportWorkspaceRolloutResponseDto = {
      enabled: command.body.enabled,
      shellEnabled: command.body.shellEnabled,
      hardOff: command.body.hardOff,
      version: nextVersion,
      actionEtag: mockSupportWorkspaceRolloutEtag(nextVersion),
    };
    writeMockSupportWorkspaceRollout(
      {
        enabled: receipt.enabled,
        shellEnabled: receipt.shellEnabled,
        hardOff: receipt.hardOff,
        version: receipt.version,
      },
      projectId,
    );
    mockAttempts.set(attemptKey, { fingerprint, receipt });
    return structuredClone(receipt);
  },
};

export const supportWorkspaceRolloutSource =
  dataMode === "mock" || import.meta.env.MODE === "test"
    ? mockSupportWorkspaceRolloutSource
    : apiSupportWorkspaceRolloutSource;
