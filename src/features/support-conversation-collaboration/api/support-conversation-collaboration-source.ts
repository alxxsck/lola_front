import { supportConversationCollaborationRead } from "@/shared/api/generated/retenive-backend";
import type { CmsConversationCollaborationResponseDto } from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { isMockMode } from "@/shared/config/data-mode";

export interface SupportConversationViewer {
  cmsUserId: string;
  displayName: string;
  generation: string;
  expiresAt: string;
}

export interface SupportConversationTyper {
  cmsUserId: string;
  displayName: string;
  watchGeneration: string;
  revision: string;
  expiresAt: string;
}

export type SupportConversationCollision =
  | { state: "NOT_ARMED" }
  | { state: "CLEAR"; observedMessageOrdinal: number }
  | {
      state: "OTHER_OPERATOR_REPLIED";
      observedMessageOrdinal: number;
      messageId: string;
      messageOrdinal: number;
      cmsUserId: string;
      createdAt: string;
    };

export interface SupportConversationCollaborationSnapshot {
  conversationId: string;
  generation: string;
  observedAt: string;
  currentMessageOrdinal: number;
  viewers: SupportConversationViewer[];
  typers: SupportConversationTyper[];
  collision: SupportConversationCollision;
}

export interface SupportConversationCollaborationSource {
  read(
    projectId: string,
    conversationId: string,
    observedMessageOrdinal?: number,
    signal?: AbortSignal,
  ): Promise<SupportConversationCollaborationSnapshot>;
}

export class SupportConversationCollaborationContractError extends Error {}

function int64(value: string, field: string, allowZero = false): string {
  const pattern = allowZero ? /^(?:0|[1-9][0-9]{0,18})$/ : /^[1-9][0-9]{0,18}$/;
  if (!pattern.test(value) || BigInt(value) > 9_223_372_036_854_775_807n)
    throw new SupportConversationCollaborationContractError(
      `Collaboration returned invalid ${field}`,
    );
  return value;
}

function date(value: string, field: string): string {
  if (!Number.isFinite(Date.parse(value)))
    throw new SupportConversationCollaborationContractError(
      `Collaboration returned invalid ${field}`,
    );
  return value;
}

function displayName(value: string): string {
  const normalized = value.trim();
  if (!normalized || normalized.length > 160)
    throw new SupportConversationCollaborationContractError(
      "Collaboration returned an invalid operator name",
    );
  return normalized;
}

function mapSnapshot(
  value: CmsConversationCollaborationResponseDto,
  expectedConversationId: string,
): SupportConversationCollaborationSnapshot {
  if (value.conversationId !== expectedConversationId)
    throw new SupportConversationCollaborationContractError(
      "Collaboration returned a different Conversation",
    );
  const collision = value.collision;
  let mappedCollision: SupportConversationCollision;
  if (collision.state === "NOT_ARMED") mappedCollision = { state: "NOT_ARMED" };
  else if (
    collision.state === "CLEAR" &&
    Number.isSafeInteger(collision.observedMessageOrdinal) &&
    (collision.observedMessageOrdinal ?? -1) >= 0
  ) {
    mappedCollision = {
      state: "CLEAR",
      observedMessageOrdinal: collision.observedMessageOrdinal!,
    };
  } else if (
    collision.state === "OTHER_OPERATOR_REPLIED" &&
    Number.isSafeInteger(collision.observedMessageOrdinal) &&
    Number.isSafeInteger(collision.messageOrdinal) &&
    (collision.observedMessageOrdinal ?? -1) >= 0 &&
    (collision.messageOrdinal ?? 0) > 0 &&
    collision.messageId &&
    collision.cmsUserId &&
    collision.createdAt
  ) {
    mappedCollision = {
      state: "OTHER_OPERATOR_REPLIED",
      observedMessageOrdinal: collision.observedMessageOrdinal!,
      messageId: collision.messageId,
      messageOrdinal: collision.messageOrdinal!,
      cmsUserId: collision.cmsUserId,
      createdAt: date(collision.createdAt, "collision timestamp"),
    };
  } else {
    throw new SupportConversationCollaborationContractError(
      "Collaboration returned an invalid collision state",
    );
  }
  return {
    conversationId: value.conversationId,
    generation: int64(value.generation, "generation", true),
    observedAt: date(value.observedAt, "observed timestamp"),
    currentMessageOrdinal: value.currentMessageOrdinal,
    viewers: value.viewers.map((viewer) => ({
      cmsUserId: viewer.cmsUserId,
      displayName: displayName(viewer.displayName),
      generation: int64(viewer.generation, "viewer generation"),
      expiresAt: date(viewer.expiresAt, "viewer expiry"),
    })),
    typers: value.typers.map((typer) => ({
      cmsUserId: typer.cmsUserId,
      displayName: displayName(typer.displayName),
      watchGeneration: int64(typer.watchGeneration, "typing watch generation"),
      revision: int64(typer.revision, "typing revision"),
      expiresAt: date(typer.expiresAt, "typing expiry"),
    })),
    collision: mappedCollision,
  };
}

const apiSource: SupportConversationCollaborationSource = {
  async read(projectId, conversationId, observedMessageOrdinal, signal) {
    try {
      const value = await supportConversationCollaborationRead(
        projectId,
        conversationId,
        observedMessageOrdinal === undefined ? undefined : { observedMessageOrdinal },
        { signal },
      );
      return mapSnapshot(value, conversationId);
    } catch (cause) {
      if (cause instanceof SupportConversationCollaborationContractError) throw cause;
      throw normalizeApiError(cause);
    }
  },
};

const mockSource: SupportConversationCollaborationSource = {
  async read(_projectId, conversationId, observedMessageOrdinal, signal) {
    if (signal?.aborted) throw signal.reason;
    const now = Date.now();
    return {
      conversationId,
      generation: "1",
      observedAt: new Date(now).toISOString(),
      currentMessageOrdinal: observedMessageOrdinal ?? 0,
      viewers: [
        {
          cmsUserId: "mock-support-lead",
          displayName: "Анна · лид поддержки",
          generation: "1",
          expiresAt: new Date(now + 60_000).toISOString(),
        },
      ],
      typers: [
        {
          cmsUserId: "mock-support-operator",
          displayName: "Илья Соколов",
          watchGeneration: "1",
          revision: "1",
          expiresAt: new Date(now + 5_000).toISOString(),
        },
      ],
      collision:
        observedMessageOrdinal === undefined
          ? { state: "NOT_ARMED" }
          : { state: "CLEAR", observedMessageOrdinal },
    };
  },
};

export const supportConversationCollaborationSource = isMockMode
  ? mockSource
  : apiSource;
