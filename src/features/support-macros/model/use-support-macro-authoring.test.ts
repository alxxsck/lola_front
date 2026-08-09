import { describe, expect, it, vi } from "vitest";
import type { SupportMacroSource } from "@/features/support-macros/api/support-macros-source";
import { ApiError } from "@/shared/api/http/api-error";
import type { SupportMacroResponseDto } from "@/shared/api/generated/models";
import { createSupportMacroAuthoringController } from "./use-support-macro-authoring";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

const macro: SupportMacroResponseDto = {
  id: "macro-1",
  stableCode: "payment-check",
  lifecycle: "ACTIVE",
  version: 4,
  draft: {
    generation: 4,
    version: 4,
    contentHash: "b".repeat(64),
    configuration: {
      compilerRevision: 1,
      title: "Проверка платежа",
      locale: "ru",
      body: "Проверяю статус платежа.",
      shortcuts: ["deposit"],
      visibility: { mode: "PROJECT", teamIds: [], topicCodes: ["PAYMENTS"] },
      variables: [],
      contentHash: "b".repeat(64),
    },
  },
  publishedRevision: null,
  actionEtag: '"sm1.4"',
  applicability: {
    visibility: "PROJECT",
    teamIds: [],
    categoryCodes: ["PAYMENTS"],
    locale: "ru",
  },
};

function setup() {
  const source = {
    catalog: vi.fn(),
    createDraft: vi.fn(),
    editDraft: vi.fn(),
    authoringCatalog: vi.fn().mockResolvedValue({ items: [macro], nextCursor: null }),
    readAuthoring: vi.fn().mockResolvedValue(macro),
    preview: vi.fn().mockResolvedValue({
      compilerRevision: 1,
      contentHash: "c".repeat(64),
      draft: macro.draft!.configuration,
      validatedAt: "2026-08-09T10:00:00.000Z",
      warningCodes: [],
    }),
    create: vi.fn().mockResolvedValue(macro),
    replaceDraft: vi.fn().mockResolvedValue(macro),
    publish: vi.fn().mockResolvedValue({ ...macro, draft: null, publishedRevision: macro.draft }),
    archive: vi.fn().mockResolvedValue({ ...macro, lifecycle: "ARCHIVED" }),
    revisions: vi.fn().mockResolvedValue({ items: [], nextCursor: null }),
    rollback: vi.fn().mockResolvedValue(macro),
  } satisfies SupportMacroSource;
  const onForbidden = vi.fn();
  return {
    source,
    onForbidden,
    controller: createSupportMacroAuthoringController(
      { projectId: () => "project-1", canManage: () => true, onForbidden },
      source,
    ),
  };
}

describe("support macro authoring", () => {
  it("previews and publishes through versioned server actions", async () => {
    const { controller, source } = setup();
    await controller.load();
    await controller.select(macro);

    expect(await controller.validatePreview()).toBe(true);
    expect(source.preview).toHaveBeenCalledWith(
      "project-1",
      expect.objectContaining({ body: "Проверяю статус платежа." }),
    );
    expect(await controller.publish()).toBe(true);
    expect(source.publish).toHaveBeenCalledWith(
      "project-1",
      "macro-1",
      '"sm1.4"',
      expect.any(String),
    );
  });

  it("keeps local text after an OCC conflict and refreshes the authoritative etag", async () => {
    const { controller, source } = setup();
    await controller.select(macro);
    controller.form.value.body = "Моя несохранённая правка";
    vi.mocked(source.replaceDraft).mockRejectedValueOnce(new ApiError(409, "conflict"));
    vi.mocked(source.readAuthoring).mockResolvedValueOnce({ ...macro, actionEtag: '"sm1.5"' });

    expect(await controller.saveDraft()).toBe(false);
    expect(controller.form.value.body).toBe("Моя несохранённая правка");
    expect(controller.selected.value?.actionEtag).toBe('"sm1.5"');
    expect(controller.conflict.value).toContain("Ваш текст сохранён");
    expect(controller.saving.value).toBe(false);
  });

  it("reuses the same command key after an unknown create outcome", async () => {
    const { controller, source } = setup();
    controller.createNew();
    controller.form.value.stableCode = "payment-check";
    controller.form.value.title = "Проверка платежа";
    controller.form.value.body = "Проверяю статус платежа.";
    vi.mocked(source.create)
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(macro);

    expect(await controller.saveDraft()).toBe(false);
    expect(await controller.saveDraft()).toBe(true);
    expect(vi.mocked(source.create).mock.calls[0]?.[3]).toBe(
      vi.mocked(source.create).mock.calls[1]?.[3],
    );
  });

  it("purges the authoring projection on concealed access loss", async () => {
    const { controller, source, onForbidden } = setup();
    await controller.load();
    vi.mocked(source.readAuthoring).mockRejectedValueOnce(new ApiError(404, "not found"));

    await controller.select(macro);
    expect(onForbidden).toHaveBeenCalledOnce();
    expect(controller.items.value).toEqual([]);
    expect(controller.selected.value).toBeNull();
  });

  it("fences rapid selection and keeps only the newest macro detail", async () => {
    const { controller, source } = setup();
    const older = deferred<SupportMacroResponseDto>();
    const newer = { ...macro, id: "macro-2", stableCode: "account-check" };
    vi.mocked(source.readAuthoring)
      .mockReturnValueOnce(older.promise)
      .mockResolvedValueOnce(newer);

    const first = controller.select(macro);
    const second = controller.select(newer);
    await second;
    older.resolve(macro);
    await first;

    expect(controller.selected.value?.id).toBe("macro-2");
  });

  it("purges the previous project and ignores its delayed command result", async () => {
    let projectId = "project-1";
    const { source } = setup();
    const pending = deferred<SupportMacroResponseDto>();
    vi.mocked(source.replaceDraft).mockReturnValueOnce(pending.promise);
    const controller = createSupportMacroAuthoringController(
      { projectId: () => projectId, canManage: () => true },
      source,
    );
    await controller.load();
    await controller.select(macro);
    const save = controller.saveDraft();

    projectId = "project-2";
    await controller.load();
    pending.resolve({ ...macro, actionEtag: '"sm1.late"' });
    await save;

    expect(controller.selected.value).toBeNull();
    expect(controller.form.value.body).toBe("");
  });

  it("preserves edits typed while a save is in flight", async () => {
    const { controller, source } = setup();
    const pending = deferred<SupportMacroResponseDto>();
    await controller.select(macro);
    vi.mocked(source.replaceDraft).mockReturnValueOnce(pending.promise);
    const save = controller.saveDraft();
    controller.form.value.body = "Следующая правка оператора";
    pending.resolve({ ...macro, actionEtag: '"sm1.5"' });

    expect(await save).toBe(true);
    expect(controller.form.value.body).toBe("Следующая правка оператора");
    expect(controller.conflict.value).toContain("новые правки");
  });

  it("loads every catalog and revision page and retains the refreshed cursor after rollback", async () => {
    const { controller, source } = setup();
    const second = { ...macro, id: "macro-2", stableCode: "second" };
    vi.mocked(source.authoringCatalog)
      .mockResolvedValueOnce({ items: [macro], nextCursor: "catalog-2" })
      .mockResolvedValueOnce({ items: [second], nextCursor: null });
    vi.mocked(source.revisions)
      .mockResolvedValueOnce({ items: [], nextCursor: "history-2" })
      .mockResolvedValueOnce({ items: [], nextCursor: null })
      .mockResolvedValueOnce({ items: [], nextCursor: "history-after-rollback" });

    await controller.load();
    await controller.load(controller.nextCursor.value ?? undefined);
    expect(controller.items.value.map((item) => item.id)).toEqual(["macro-1", "macro-2"]);
    await controller.select(macro);
    await controller.loadMoreRevisions();
    await controller.rollback(
      {
        id: "revision-1",
        macroId: macro.id,
        revisionNumber: 1,
        publicationKind: "PUBLISH",
        rollbackReasonCode: null,
        sourceRevisionId: null,
        publishedAt: "2026-08-09T10:00:00.000Z",
        contentHash: "a".repeat(64),
        configuration: macro.draft!.configuration,
      },
      "CONTENT_REGRESSION",
    );
    expect(controller.revisionsNextCursor.value).toBe("history-after-rollback");
  });

  it("purges protected authoring data when conflict recovery loses access", async () => {
    const { controller, source, onForbidden } = setup();
    await controller.select(macro);
    vi.mocked(source.replaceDraft).mockRejectedValueOnce(new ApiError(409, "conflict"));
    vi.mocked(source.readAuthoring).mockRejectedValueOnce(new ApiError(403, "revoked"));

    expect(await controller.saveDraft()).toBe(false);
    expect(onForbidden).toHaveBeenCalledOnce();
    expect(controller.selected.value).toBeNull();
    expect(controller.form.value.body).toBe("");
  });

  it("purges revision history when a cursor conflict recovery is concealed", async () => {
    const { controller, source, onForbidden } = setup();
    vi.mocked(source.revisions)
      .mockResolvedValueOnce({ items: [], nextCursor: "history-2" })
      .mockRejectedValueOnce(new ApiError(409, "cursor stale"))
      .mockRejectedValueOnce(new ApiError(404, "concealed"));
    await controller.select(macro);

    await controller.loadMoreRevisions();

    expect(onForbidden).toHaveBeenCalledOnce();
    expect(controller.revisions.value).toEqual([]);
    expect(controller.selected.value).toBeNull();
  });
});
