import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportInternalNote,
  SupportInternalNoteRevision,
  SupportInternalNotesPage,
  SupportInternalNotesSource,
} from "@/features/support-internal-notes/api/support-internal-notes-source";
import { createSupportInternalNotesController } from "./use-support-internal-notes";

function note(id = "note-1"): SupportInternalNote {
  return {
    id,
    caseId: "case-1",
    body: "Проверить подтверждение оплаты",
    lifecycle: "ACTIVE",
    currentRevisionNumber: 1,
    creatorName: "Алина",
    createdAt: "2026-08-06T10:00:00.000Z",
    updatedAt: "2026-08-06T10:00:00.000Z",
    tombstonedAt: null,
    hasUnavailableReferences: false,
  };
}

function revision(id = "revision-1"): SupportInternalNoteRevision {
  return {
    id,
    noteId: "note-1",
    revisionNumber: 1,
    body: "Проверить подтверждение оплаты",
    authorName: "Алина",
    createdAt: "2026-08-06T10:00:00.000Z",
  };
}

function source(
  overrides: Partial<SupportInternalNotesSource> = {},
): SupportInternalNotesSource {
  return {
    list: vi.fn().mockResolvedValue({ items: [note()], nextCursor: null }),
    revisions: vi
      .fn()
      .mockResolvedValue({ items: [revision()], nextCursor: null }),
    ...overrides,
  };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

describe("support internal notes controller", () => {
  it("does not request or retain notes without the exact read grant", async () => {
    const list = vi.fn();
    const controller = createSupportInternalNotesController(
      {
        projectId: () => "project-1",
        caseId: () => "case-1",
        canRead: () => false,
        canReadHistory: () => false,
      },
      source({ list }),
    );

    await controller.load();

    expect(list).not.toHaveBeenCalled();
    expect(controller.notes.value).toEqual([]);
  });

  it("uses only the current Case scope and merges a cursor page", async () => {
    const list = vi
      .fn()
      .mockResolvedValueOnce({ items: [note()], nextCursor: "notes-2" })
      .mockResolvedValueOnce({ items: [note("note-2")], nextCursor: null });
    const controller = createSupportInternalNotesController(
      {
        projectId: () => "project-1",
        caseId: () => "case-1",
        canRead: () => true,
        canReadHistory: () => true,
      },
      source({ list }),
    );

    await controller.load();
    await controller.load(controller.nextCursor.value ?? undefined);

    expect(list).toHaveBeenNthCalledWith(
      1,
      "project-1",
      "case-1",
      {},
      expect.any(AbortSignal),
    );
    expect(list).toHaveBeenNthCalledWith(
      2,
      "project-1",
      "case-1",
      { cursor: "notes-2" },
      expect.any(AbortSignal),
    );
    expect(controller.notes.value.map((item) => item.id)).toEqual([
      "note-1",
      "note-2",
    ]);
  });

  it("does not commit note text after the selected Case changes", async () => {
    let caseId = "case-1";
    const pending = deferred<SupportInternalNotesPage<SupportInternalNote>>();
    const controller = createSupportInternalNotesController(
      {
        projectId: () => "project-1",
        caseId: () => caseId,
        canRead: () => true,
        canReadHistory: () => true,
      },
      source({ list: vi.fn().mockReturnValue(pending.promise) }),
    );

    const load = controller.load();
    caseId = "case-2";
    pending.resolve({ items: [note()], nextCursor: null });
    await load;

    expect(controller.notes.value).toEqual([]);
    expect(controller.error.value).toBe("");
  });

  it("purges note and history text then asks for authority recovery after a concealed denial", async () => {
    const onForbidden = vi.fn();
    const controller = createSupportInternalNotesController(
      {
        projectId: () => "project-1",
        caseId: () => "case-1",
        canRead: () => true,
        canReadHistory: () => true,
        onForbidden,
      },
      source({
        list: vi
          .fn()
          .mockResolvedValueOnce({ items: [note()], nextCursor: null })
          .mockRejectedValueOnce(new ApiError(403, "hidden")),
      }),
    );

    await controller.load();
    expect(controller.notes.value).toHaveLength(1);
    await controller.reconcile();

    expect(controller.notes.value).toEqual([]);
    expect(controller.history.value).toEqual([]);
    expect(controller.error.value).toBe("");
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it("requires history authority and discards history when that grant changes in flight", async () => {
    let canReadHistory = true;
    const pending = deferred<SupportInternalNotesPage<SupportInternalNoteRevision>>();
    const revisions = vi.fn().mockReturnValue(pending.promise);
    const controller = createSupportInternalNotesController(
      {
        projectId: () => "project-1",
        caseId: () => "case-1",
        canRead: () => true,
        canReadHistory: () => canReadHistory,
      },
      source({ revisions }),
    );

    await controller.load();
    const loadHistory = controller.openHistory("note-1");
    canReadHistory = false;
    pending.resolve({ items: [revision()], nextCursor: null });
    await loadHistory;

    expect(revisions).toHaveBeenCalledWith(
      "project-1",
      "case-1",
      "note-1",
      {},
      expect.any(AbortSignal),
    );
    expect(controller.history.value).toEqual([]);
  });

  it("does not start a history request without the distinct history permission", async () => {
    const revisions = vi.fn();
    const controller = createSupportInternalNotesController(
      {
        projectId: () => "project-1",
        caseId: () => "case-1",
        canRead: () => true,
        canReadHistory: () => false,
      },
      source({ revisions }),
    );

    await controller.load();
    await controller.openHistory("note-1");

    expect(revisions).not.toHaveBeenCalled();
    expect(controller.historyNoteId.value).toBeNull();
  });
});
