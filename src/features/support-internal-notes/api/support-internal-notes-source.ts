import {
  supportInternalNoteList,
  supportInternalNoteRevisions,
} from "@/shared/api/generated/retenive-backend";
import type {
  SupportInternalNoteResponseDto,
  SupportInternalNotePageResponseDto,
  SupportInternalNoteRevisionResponseDto,
  SupportInternalNoteRevisionPageResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { isMockMode } from "@/shared/config/data-mode";

export interface SupportInternalNote {
  id: string;
  caseId: string;
  body: string | null;
  lifecycle: "ACTIVE" | "TOMBSTONED" | "PURGED";
  currentRevisionNumber: number;
  creatorName: string;
  createdAt: string;
  updatedAt: string;
  tombstonedAt: string | null;
  hasUnavailableReferences: boolean;
}

export interface SupportInternalNoteRevision {
  id: string;
  noteId: string;
  revisionNumber: number;
  body: string;
  authorName: string;
  createdAt: string;
}

export interface SupportInternalNotesPage<T> {
  items: T[];
  nextCursor: string | null;
}

export interface SupportInternalNotesSource {
  list(
    projectId: string,
    caseId: string,
    request?: { cursor?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<SupportInternalNotesPage<SupportInternalNote>>;
  revisions(
    projectId: string,
    caseId: string,
    noteId: string,
    request?: { cursor?: string; limit?: number },
    signal?: AbortSignal,
  ): Promise<SupportInternalNotesPage<SupportInternalNoteRevision>>;
}

export class SupportInternalNotesContractError extends Error {
  constructor(message: string) {
    super(message);
  }
}

function actorName(value: unknown, field: string): string {
  if (
    !value ||
    typeof value !== "object" ||
    !("displayName" in value) ||
    typeof value.displayName !== "string" ||
    !value.displayName.trim()
  )
    throw new SupportInternalNotesContractError(
      `Internal note returned an invalid ${field} snapshot`,
    );
  return value.displayName;
}

function date(value: string, field: string): string {
  if (!Number.isFinite(Date.parse(value)))
    throw new SupportInternalNotesContractError(
      `Internal note returned an invalid ${field}`,
    );
  return value;
}

function mapNote(
  value: SupportInternalNoteResponseDto,
  expectedCaseId: string,
): SupportInternalNote {
  if (value.endUserCaseId !== expectedCaseId)
    throw new SupportInternalNotesContractError(
      "Internal note returned a different Case",
    );
  if (
    value.lifecycle !== "ACTIVE" &&
    value.lifecycle !== "TOMBSTONED" &&
    value.lifecycle !== "PURGED"
  )
    throw new SupportInternalNotesContractError(
      "Internal note returned an unknown lifecycle",
    );
  return {
    id: value.id,
    caseId: value.endUserCaseId,
    body: value.body,
    lifecycle: value.lifecycle,
    currentRevisionNumber: value.currentRevisionNumber,
    creatorName: actorName(value.creator, "creator"),
    createdAt: date(value.createdAt, "createdAt"),
    updatedAt: date(value.updatedAt, "updatedAt"),
    tombstonedAt: value.tombstonedAt
      ? date(value.tombstonedAt, "tombstonedAt")
      : null,
    hasUnavailableReferences: value.hasUnavailableReferences,
  };
}

function mapRevision(
  value: SupportInternalNoteRevisionResponseDto,
  expectedNoteId: string,
): SupportInternalNoteRevision {
  if (value.noteId !== expectedNoteId)
    throw new SupportInternalNotesContractError(
      "Internal note history returned a different note",
    );
  return {
    id: value.id,
    noteId: value.noteId,
    revisionNumber: value.revisionNumber,
    body: value.body,
    authorName: actorName(value.author, "author"),
    createdAt: date(value.createdAt, "createdAt"),
  };
}

const apiSource: SupportInternalNotesSource = {
  async list(projectId, caseId, request, signal) {
    let response: SupportInternalNotePageResponseDto;
    try {
      response = await supportInternalNoteList(
        projectId,
        caseId,
        {
          limit: request?.limit ?? 30,
          ...(request?.cursor ? { cursor: request.cursor } : {}),
        },
        { signal },
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
    return {
      items: response.items.map((item) => mapNote(item, caseId)),
      nextCursor: response.nextCursor,
    };
  },
  async revisions(projectId, caseId, noteId, request, signal) {
    let response: SupportInternalNoteRevisionPageResponseDto;
    try {
      response = await supportInternalNoteRevisions(
        projectId,
        caseId,
        noteId,
        {
          limit: request?.limit ?? 20,
          ...(request?.cursor ? { cursor: request.cursor } : {}),
        },
        { signal },
      );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
    return {
      items: response.items.map((item) => mapRevision(item, noteId)),
      nextCursor: response.nextCursor,
    };
  },
};

const mockSource: SupportInternalNotesSource = {
  async list(_projectId, _caseId, _request, signal) {
    if (signal?.aborted) throw signal.reason;
    throw new Error("Mock internal notes are not configured");
  },
  async revisions(_projectId, _caseId, _noteId, _request, signal) {
    if (signal?.aborted) throw signal.reason;
    throw new Error("Mock internal notes are not configured");
  },
};

export const supportInternalNotesSource: SupportInternalNotesSource = isMockMode
  ? mockSource
  : apiSource;
