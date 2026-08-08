import {
  supportInternalNoteCorrect,
  supportInternalNoteCreate,
  supportInternalNoteList,
  supportInternalNoteRevisions,
  supportInternalNoteTombstone,
} from "@/shared/api/generated/retenive-backend";
import type {
  CorrectSupportInternalNoteDtoReasonCode,
  SupportInternalNoteResponseDto,
  SupportInternalNotePageResponseDto,
  SupportInternalNoteRevisionResponseDto,
  SupportInternalNoteRevisionPageResponseDto,
  TombstoneSupportInternalNoteDtoReasonCode,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { isMockMode } from "@/shared/config/data-mode";

export interface SupportInternalNote {
  id: string;
  caseId: string;
  /** Opaque version authority used only for the next Case-scoped mutation. */
  actionEtag: string;
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
  reasonCode:
    | "INITIAL"
    | "FACTUAL_CORRECTION"
    | "CLARIFICATION"
    | "REMOVE_SENSITIVE_DATA"
    | "LEGACY_OTHER";
  authorName: string;
  createdAt: string;
}

export type SupportInternalNoteCorrectionReason =
  | "FACTUAL_CORRECTION"
  | "CLARIFICATION"
  | "REMOVE_SENSITIVE_DATA";

export type SupportInternalNoteTombstoneReason =
  | "CREATED_IN_ERROR"
  | "DUPLICATE"
  | "POLICY_VIOLATION"
  | "PRIVACY_REQUEST";

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
  create(
    projectId: string,
    caseId: string,
    input: {
      body: string;
      conversationId?: string;
      messageId?: string;
      macroRevisionId?: string;
      knowledgeDocumentId?: string;
      idempotencyKey: string;
    },
  ): Promise<SupportInternalNote>;
  correct(
    projectId: string,
    caseId: string,
    noteId: string,
    input: {
      body: string;
      reasonCode: SupportInternalNoteCorrectionReason;
      actionEtag: string;
      idempotencyKey: string;
    },
  ): Promise<SupportInternalNote>;
  tombstone(
    projectId: string,
    caseId: string,
    noteId: string,
    input: {
      reasonCode: SupportInternalNoteTombstoneReason;
      actionEtag: string;
      idempotencyKey: string;
    },
  ): Promise<SupportInternalNote>;
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
    actionEtag: value.actionEtag,
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
    reasonCode: value.reasonCode,
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
  async create(projectId, caseId, input) {
    try {
      const response = await supportInternalNoteCreate(
        projectId,
        caseId,
        {
          body: input.body,
          ...(input.conversationId ? { conversationId: input.conversationId } : {}),
          ...(input.messageId ? { messageId: input.messageId } : {}),
          ...(input.macroRevisionId ? { macroRevisionId: input.macroRevisionId } : {}),
          ...(input.knowledgeDocumentId
            ? { knowledgeDocumentId: input.knowledgeDocumentId }
            : {}),
        },
        { headers: { "Idempotency-Key": input.idempotencyKey } },
      );
      return mapNote(response, caseId);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async correct(projectId, caseId, noteId, input) {
    try {
      const response = await supportInternalNoteCorrect(
        projectId,
        caseId,
        noteId,
        {
          body: input.body,
          reasonCode: input.reasonCode as CorrectSupportInternalNoteDtoReasonCode,
        },
        {
          headers: {
            "Idempotency-Key": input.idempotencyKey,
            "If-Match": input.actionEtag,
          },
        },
      );
      return mapNote(response, caseId);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async tombstone(projectId, caseId, noteId, input) {
    try {
      const response = await supportInternalNoteTombstone(
        projectId,
        caseId,
        noteId,
        {
          reasonCode: input.reasonCode as TombstoneSupportInternalNoteDtoReasonCode,
        },
        {
          headers: {
            "Idempotency-Key": input.idempotencyKey,
            "If-Match": input.actionEtag,
          },
        },
      );
      return mapNote(response, caseId);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockNotes = new Map<string, SupportInternalNote[]>();

function mockCaseNotes(caseId: string): SupportInternalNote[] {
  const existing = mockNotes.get(caseId);
  if (existing) return existing;
  const seeded: SupportInternalNote[] = [
    {
      id: globalThis.crypto.randomUUID(),
      caseId,
      actionEtag: '"sin1.mock-note"',
      body: "Проверить историю платежа перед публичным ответом.",
      lifecycle: "ACTIVE",
      currentRevisionNumber: 1,
      creatorName: "Алина · Support",
      createdAt: new Date(Date.now() - 12 * 60_000).toISOString(),
      updatedAt: new Date(Date.now() - 12 * 60_000).toISOString(),
      tombstonedAt: null,
      hasUnavailableReferences: false,
    },
  ];
  mockNotes.set(caseId, seeded);
  return seeded;
}

const mockSource: SupportInternalNotesSource = {
  async list(_projectId, caseId, _request, signal) {
    if (signal?.aborted) throw signal.reason;
    return { items: [...mockCaseNotes(caseId)], nextCursor: null };
  },
  async revisions(_projectId, caseId, noteId, _request, signal) {
    if (signal?.aborted) throw signal.reason;
    const note = mockCaseNotes(caseId).find((item) => item.id === noteId);
    return {
      items: note?.body
        ? [
            {
              id: `${note.id}:1`,
              noteId: note.id,
              revisionNumber: note.currentRevisionNumber,
              body: note.body,
              reasonCode: "INITIAL",
              authorName: note.creatorName,
              createdAt: note.updatedAt,
            },
          ]
        : [],
      nextCursor: null,
    };
  },
  async create(_projectId, caseId, input) {
    const now = new Date().toISOString();
    const note: SupportInternalNote = {
      id: globalThis.crypto.randomUUID(),
      caseId,
      actionEtag: '"sin1.mock-created"',
      body: input.body,
      lifecycle: "ACTIVE",
      currentRevisionNumber: 1,
      creatorName: "Вы",
      createdAt: now,
      updatedAt: now,
      tombstonedAt: null,
      hasUnavailableReferences: false,
    };
    mockNotes.set(caseId, [note, ...mockCaseNotes(caseId)]);
    return note;
  },
  async correct(_projectId, caseId, noteId, input) {
    const current = mockCaseNotes(caseId).find((item) => item.id === noteId);
    if (!current) throw new Error("Mock internal note is unavailable");
    const updated = {
      ...current,
      body: input.body,
      currentRevisionNumber: current.currentRevisionNumber + 1,
      updatedAt: new Date().toISOString(),
      actionEtag: '"sin1.mock-corrected"',
    };
    mockNotes.set(
      caseId,
      mockCaseNotes(caseId).map((item) => (item.id === noteId ? updated : item)),
    );
    return updated;
  },
  async tombstone(_projectId, caseId, noteId) {
    const current = mockCaseNotes(caseId).find((item) => item.id === noteId);
    if (!current) throw new Error("Mock internal note is unavailable");
    const now = new Date().toISOString();
    const updated: SupportInternalNote = {
      ...current,
      body: null,
      lifecycle: "TOMBSTONED",
      updatedAt: now,
      tombstonedAt: now,
      actionEtag: '"sin1.mock-tombstoned"',
    };
    mockNotes.set(
      caseId,
      mockCaseNotes(caseId).map((item) => (item.id === noteId ? updated : item)),
    );
    return updated;
  },
};

export const supportInternalNotesSource: SupportInternalNotesSource = isMockMode
  ? mockSource
  : apiSource;
