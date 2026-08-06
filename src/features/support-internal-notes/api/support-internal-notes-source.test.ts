import { beforeEach, describe, expect, it, vi } from "vitest";
import type {
  SupportInternalNoteResponseDto,
  SupportInternalNoteRevisionResponseDto,
} from "@/shared/api/generated/models";

const generated = vi.hoisted(() => ({
  list: vi.fn(),
  revisions: vi.fn(),
}));

vi.mock("@/shared/api/generated/retenive-backend", () => ({
  supportInternalNoteList: generated.list,
  supportInternalNoteRevisions: generated.revisions,
}));

vi.mock("@/shared/config/data-mode", () => ({ isMockMode: false }));

import {
  SupportInternalNotesContractError,
  supportInternalNotesSource,
} from "./support-internal-notes-source";

function note(
  overrides: Partial<SupportInternalNoteResponseDto> = {},
): SupportInternalNoteResponseDto {
  return {
    actionEtag: '"sin1.opaque"',
    body: "Проверить историю платежа",
    conversationId: null,
    createdAt: "2026-08-06T10:00:00.000Z",
    creator: { actorId: "operator-1", displayName: "Алина" },
    currentRevisionNumber: 2,
    endUserCaseId: "case-1",
    hasUnavailableReferences: false,
    id: "note-1",
    knowledgeDocumentId: null,
    lifecycle: "ACTIVE",
    macroRevisionId: null,
    messageId: null,
    tombstonedAt: null,
    updatedAt: "2026-08-06T10:10:00.000Z",
    version: 2,
    ...overrides,
  };
}

function revision(
  overrides: Partial<SupportInternalNoteRevisionResponseDto> = {},
): SupportInternalNoteRevisionResponseDto {
  return {
    author: { actorId: "operator-2", displayName: "Борис" },
    body: "Уточнить номер заказа",
    createdAt: "2026-08-06T10:05:00.000Z",
    id: "revision-1",
    noteId: "note-1",
    reasonCode: "CLARIFICATION",
    revisionNumber: 1,
    ...overrides,
  };
}

describe("support internal notes source", () => {
  beforeEach(() => vi.clearAllMocks());

  it("uses the generated Case-scoped read endpoints and removes opaque command data", async () => {
    generated.list.mockResolvedValue({ items: [note()], nextCursor: "notes-2" });
    generated.revisions.mockResolvedValue({
      items: [revision()],
      nextCursor: null,
    });
    const signal = new AbortController().signal;

    await expect(
      supportInternalNotesSource.list(
        "project-1",
        "case-1",
        { cursor: "notes-1", limit: 10 },
        signal,
      ),
    ).resolves.toEqual({
      items: [
        {
          id: "note-1",
          caseId: "case-1",
          body: "Проверить историю платежа",
          lifecycle: "ACTIVE",
          currentRevisionNumber: 2,
          creatorName: "Алина",
          createdAt: "2026-08-06T10:00:00.000Z",
          updatedAt: "2026-08-06T10:10:00.000Z",
          tombstonedAt: null,
          hasUnavailableReferences: false,
        },
      ],
      nextCursor: "notes-2",
    });
    await expect(
      supportInternalNotesSource.revisions("project-1", "case-1", "note-1"),
    ).resolves.toMatchObject({
      items: [
        {
          id: "revision-1",
          noteId: "note-1",
          revisionNumber: 1,
          body: "Уточнить номер заказа",
          authorName: "Борис",
          createdAt: "2026-08-06T10:05:00.000Z",
        },
      ],
      nextCursor: null,
    });

    expect(generated.list).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      { cursor: "notes-1", limit: 10 },
      { signal },
    );
    expect(generated.revisions).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "note-1",
      { limit: 20 },
      { signal: undefined },
    );
  });

  it("rejects a note with an untyped actor snapshot instead of rendering unknown data", async () => {
    generated.list.mockResolvedValue({
      items: [note({ creator: { actorId: "operator-1" } })],
      nextCursor: null,
    });

    await expect(
      supportInternalNotesSource.list("project-1", "case-1"),
    ).rejects.toBeInstanceOf(SupportInternalNotesContractError);
  });

  it("rejects history that is not for the requested note", async () => {
    generated.revisions.mockResolvedValue({
      items: [revision({ noteId: "other-note" })],
      nextCursor: null,
    });

    await expect(
      supportInternalNotesSource.revisions("project-1", "case-1", "note-1"),
    ).rejects.toBeInstanceOf(SupportInternalNotesContractError);
  });
});
