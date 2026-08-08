import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import { createSupportAttachmentsController } from "./use-support-attachments";
import type {
  SupportAttachmentScope,
  SupportAttachmentsSource,
} from "../api/support-attachments-source";

const capabilities = {
  state: "AVAILABLE" as const,
  upload: true,
  download: true,
  maxFiles: 10,
  maxFileBytes: 20 * 1024 * 1024,
  maxTotalBytes: 50 * 1024 * 1024,
  contentTypes: ["image/png", "text/plain"],
};

function file(name = "proof.png", type = "image/png") {
  return new File([new Uint8Array([1, 2, 3])], name, { type });
}

function source(): SupportAttachmentsSource {
  return {
    listDraft: vi.fn().mockResolvedValue([]),
    startUpload: vi.fn().mockResolvedValue({
      id: "attachment-1",
      uploadUrl: "https://uploads.invalid/attachment-1",
      requiredHeaders: { "content-type": "image/png" },
    }),
    uploadBinary: vi.fn().mockResolvedValue(undefined),
    completeUpload: vi.fn().mockResolvedValue({
      id: "attachment-1",
      filename: "proof.png",
      contentType: "image/png",
      sizeBytes: 3,
      state: "READY",
      canAttach: true,
      failureCode: null,
    }),
    status: vi.fn(),
    revoke: vi.fn().mockResolvedValue(undefined),
    grantDownload: vi.fn().mockResolvedValue({
      url: "https://downloads.invalid/attachment-1",
      expiresAt: "2026-08-08T12:00:00.000Z",
    }),
  };
}

describe("support attachments controller", () => {
  beforeEach(() => sessionStorage.clear());

  it("uploads and completes a public attachment before exposing it to send", async () => {
    const api = source();
    const scope: SupportAttachmentScope = {
      visibility: "PUBLIC_REPLY",
      projectId: "project-1",
      actorId: "operator-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
    };
    const controller = createSupportAttachmentsController(api, {
      scope: () => scope,
      capabilities: () => capabilities,
      sha256: vi.fn().mockResolvedValue("a".repeat(64)),
    });

    await controller.select();
    await controller.addFiles([file()]);

    expect(api.startUpload).toHaveBeenCalledWith(
      scope,
      expect.objectContaining({
        checksumSha256: "a".repeat(64),
        filename: "proof.png",
        draftKey: expect.any(String),
      }),
      expect.any(String),
    );
    expect(api.uploadBinary).toHaveBeenCalled();
    expect(controller.readyIds.value).toEqual(["attachment-1"]);
    expect(controller.canSend.value).toBe(true);
  });

  it("keeps public and internal-note drafts isolated for the same conversation", async () => {
    const api = source();
    const publicScope: SupportAttachmentScope = {
      visibility: "PUBLIC_REPLY",
      projectId: "project-1",
      actorId: "operator-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
    };
    const noteScope: SupportAttachmentScope = {
      visibility: "INTERNAL_NOTE",
      projectId: "project-1",
      actorId: "operator-1",
      caseId: "case-1",
    };
    let scope: SupportAttachmentScope = publicScope;
    const controller = createSupportAttachmentsController(api, {
      scope: () => scope,
      capabilities: () => capabilities,
      sha256: vi.fn().mockResolvedValue("a".repeat(64)),
    });

    await controller.select();
    const publicKey = controller.draftKey.value;
    scope = noteScope;
    await controller.select();

    expect(controller.draftKey.value).not.toBe(publicKey);
    expect(api.listDraft).toHaveBeenLastCalledWith(
      noteScope,
      controller.draftKey.value,
      expect.any(AbortSignal),
    );
  });

  it("rejects unsupported and oversized files locally without upload", async () => {
    const api = source();
    const scope: SupportAttachmentScope = {
      visibility: "PUBLIC_REPLY",
      projectId: "project-1",
      actorId: "operator-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
    };
    const controller = createSupportAttachmentsController(api, {
      scope: () => scope,
      capabilities: () => ({ ...capabilities, maxFileBytes: 2 }),
      sha256: vi.fn(),
    });

    await controller.select();
    await controller.addFiles([
      file("malware.exe", "application/octet-stream"),
      file(),
    ]);

    expect(api.startUpload).not.toHaveBeenCalled();
    expect(controller.items.value.map((item) => item.state)).toEqual([
      "REJECTED",
      "REJECTED",
    ]);
  });

  it("restores a server draft and purges it synchronously on revoke", async () => {
    const api = source();
    vi.mocked(api.listDraft).mockResolvedValue([
      {
        id: "attachment-7",
        filename: "shift.txt",
        contentType: "text/plain",
        sizeBytes: 12,
        state: "SCANNING",
        canAttach: false,
        failureCode: null,
      },
    ]);
    const scope: SupportAttachmentScope = {
      visibility: "INTERNAL_NOTE",
      projectId: "project-1",
      actorId: "operator-1",
      caseId: "case-1",
    };
    let allowed = true;
    const controller = createSupportAttachmentsController(api, {
      scope: () => scope,
      capabilities: () => ({ ...capabilities, upload: allowed }),
      sha256: vi.fn(),
      pollDelayMs: 60_000,
    });

    await controller.select();
    expect(controller.items.value[0]?.filename).toBe("shift.txt");
    allowed = false;
    controller.purge();

    expect(controller.items.value).toEqual([]);
    expect(controller.draftKey.value).toBe("");
    expect(sessionStorage.length).toBe(0);
  });

  it("retries a failed local file without asking the operator to select it again", async () => {
    const api = source();
    vi.mocked(api.uploadBinary)
      .mockRejectedValueOnce(new Error("network"))
      .mockResolvedValueOnce(undefined);
    const scope: SupportAttachmentScope = {
      visibility: "PUBLIC_REPLY",
      projectId: "project-1",
      actorId: "operator-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
    };
    const controller = createSupportAttachmentsController(api, {
      scope: () => scope,
      capabilities: () => capabilities,
      sha256: vi.fn().mockResolvedValue("a".repeat(64)),
    });
    await controller.select();
    await controller.addFiles([file()]);
    const failed = controller.items.value[0]!;
    expect(failed.state).toBe("FAILED");

    await controller.retry(failed.localId);

    expect(api.startUpload).toHaveBeenCalledTimes(2);
    expect(controller.items.value[0]?.state).toBe("READY");
  });

  it("does not spend quota on restored terminal rows", async () => {
    const api = source();
    vi.mocked(api.listDraft).mockResolvedValue([{
      id: "attachment-failed",
      filename: "failed.txt",
      contentType: "text/plain",
      sizeBytes: 50,
      state: "FAILED",
      canAttach: false,
      failureCode: "SCAN_FAILED",
    }]);
    const scope: SupportAttachmentScope = {
      visibility: "PUBLIC_REPLY",
      projectId: "project-1",
      actorId: "operator-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
    };
    const controller = createSupportAttachmentsController(api, {
      scope: () => scope,
      capabilities: () => ({ ...capabilities, maxFiles: 1, maxTotalBytes: 50 }),
      sha256: vi.fn().mockResolvedValue("a".repeat(64)),
    });

    await controller.select();
    expect(controller.items.value[0]?.canRetry).toBe(false);
    await controller.addFiles([file("replacement.txt", "text/plain")]);

    expect(api.startUpload).toHaveBeenCalledOnce();
    expect(controller.readyIds.value).toContain("attachment-1");
  });

  it("purges stale attachment metadata and refreshes authority after a denied grant", async () => {
    const api = source();
    vi.mocked(api.listDraft).mockResolvedValue([{
      id: "attachment-ready",
      filename: "private.txt",
      contentType: "text/plain",
      sizeBytes: 3,
      state: "READY",
      canAttach: true,
      failureCode: null,
    }]);
    vi.mocked(api.grantDownload).mockRejectedValue(new ApiError(403, "Forbidden"));
    const onForbidden = vi.fn();
    const scope: SupportAttachmentScope = {
      visibility: "INTERNAL_NOTE",
      projectId: "project-1",
      actorId: "operator-1",
      caseId: "case-1",
    };
    const controller = createSupportAttachmentsController(api, {
      scope: () => scope,
      capabilities: () => capabilities,
      onForbidden,
    });
    await controller.select();

    await controller.download("attachment-ready");

    expect(controller.items.value).toEqual([]);
    expect(controller.draftKey.value).toBe("");
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it("purges a scanning row instead of polling forever after authority is denied", async () => {
    const api = source();
    vi.mocked(api.listDraft).mockResolvedValue([{
      id: "attachment-scanning",
      filename: "scan.txt",
      contentType: "text/plain",
      sizeBytes: 3,
      state: "SCANNING",
      canAttach: false,
      failureCode: null,
    }]);
    vi.mocked(api.status).mockRejectedValue(new ApiError(403, "Forbidden"));
    const onForbidden = vi.fn();
    const scope: SupportAttachmentScope = {
      visibility: "PUBLIC_REPLY",
      projectId: "project-1",
      actorId: "operator-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
    };
    const controller = createSupportAttachmentsController(api, {
      scope: () => scope,
      capabilities: () => capabilities,
      pollDelayMs: 1,
      onForbidden,
    });

    await controller.select();
    await vi.waitFor(() => expect(onForbidden).toHaveBeenCalledOnce());

    expect(controller.items.value).toEqual([]);
    expect(api.status).toHaveBeenCalledOnce();
  });

  it("refreshes authority when revoking a draft row is denied", async () => {
    const api = source();
    vi.mocked(api.listDraft).mockResolvedValue([{
      id: "attachment-ready",
      filename: "ready.txt",
      contentType: "text/plain",
      sizeBytes: 3,
      state: "READY",
      canAttach: true,
      failureCode: null,
    }]);
    vi.mocked(api.revoke).mockRejectedValue(new ApiError(403, "Forbidden"));
    const onForbidden = vi.fn();
    const scope: SupportAttachmentScope = {
      visibility: "PUBLIC_REPLY",
      projectId: "project-1",
      actorId: "operator-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
    };
    const controller = createSupportAttachmentsController(api, {
      scope: () => scope,
      capabilities: () => capabilities,
      onForbidden,
    });
    await controller.select();

    await controller.remove("attachment-ready");

    expect(onForbidden).toHaveBeenCalledOnce();
    expect(controller.items.value).toEqual([]);
  });

  it("aborts a stale binary upload and never completes it after scope purge", async () => {
    const api = source();
    vi.mocked(api.uploadBinary).mockImplementation(
      (_url, _file, _headers, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const scope: SupportAttachmentScope = {
      visibility: "PUBLIC_REPLY",
      projectId: "project-1",
      actorId: "operator-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
    };
    const controller = createSupportAttachmentsController(api, {
      scope: () => scope,
      capabilities: () => capabilities,
      sha256: vi.fn().mockResolvedValue("a".repeat(64)),
    });
    await controller.select();
    const pending = controller.addFiles([file()]);
    await vi.waitFor(() => expect(api.uploadBinary).toHaveBeenCalled());

    controller.purge();
    await pending;

    expect(api.completeUpload).not.toHaveBeenCalled();
    expect(controller.items.value).toEqual([]);
  });

  it("aborts an in-flight upload when the operator removes its row", async () => {
    const api = source();
    vi.mocked(api.uploadBinary).mockImplementation(
      (_url, _file, _headers, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const scope: SupportAttachmentScope = {
      visibility: "PUBLIC_REPLY",
      projectId: "project-1",
      actorId: "operator-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
    };
    const controller = createSupportAttachmentsController(api, {
      scope: () => scope,
      capabilities: () => capabilities,
      sha256: vi.fn().mockResolvedValue("a".repeat(64)),
    });
    await controller.select();
    const pending = controller.addFiles([file()]);
    await vi.waitFor(() => expect(api.uploadBinary).toHaveBeenCalled());
    const uploading = controller.items.value[0]!;

    await controller.remove(uploading.localId);
    await pending;

    expect(api.completeUpload).not.toHaveBeenCalled();
    expect(api.revoke).toHaveBeenCalledWith(scope, "attachment-1");
    expect(controller.items.value).toEqual([]);
  });

  it("revokes a start intent resolved after the operator removed its queued row", async () => {
    const api = source();
    let resolveStart!: (value: Awaited<ReturnType<SupportAttachmentsSource["startUpload"]>>) => void;
    vi.mocked(api.startUpload).mockReturnValue(new Promise((resolve) => { resolveStart = resolve; }));
    const scope: SupportAttachmentScope = {
      visibility: "PUBLIC_REPLY",
      projectId: "project-1",
      actorId: "operator-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
    };
    const controller = createSupportAttachmentsController(api, {
      scope: () => scope,
      capabilities: () => capabilities,
      sha256: vi.fn().mockResolvedValue("a".repeat(64)),
    });
    await controller.select();
    const pending = controller.addFiles([file()]);
    await vi.waitFor(() => expect(api.startUpload).toHaveBeenCalled());
    const queued = controller.items.value[0]!;

    await controller.remove(queued.localId);
    resolveStart({
      id: "late-intent",
      uploadUrl: "https://uploads.invalid/late-intent",
      requiredHeaders: {},
    });
    await pending;

    expect(api.uploadBinary).not.toHaveBeenCalled();
    expect(api.revoke).toHaveBeenCalledWith(scope, "late-intent");
    expect(controller.items.value).toEqual([]);
  });

  it.each(["consumeDraft", "purge"] as const)(
    "keeps an upload in draft A alive when draft B runs %s",
    async (finalizeDraftB) => {
    const api = source();
    let finishBinary!: () => void;
    vi.mocked(api.uploadBinary).mockReturnValue(new Promise((resolve) => { finishBinary = resolve; }));
    const firstScope: SupportAttachmentScope = {
      visibility: "PUBLIC_REPLY",
      projectId: "project-1",
      actorId: "operator-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
    };
    const secondScope: SupportAttachmentScope = { ...firstScope, conversationId: "conversation-2" };
    let currentScope = firstScope;
    const controller = createSupportAttachmentsController(api, {
      scope: () => currentScope,
      capabilities: () => capabilities,
      sha256: vi.fn().mockResolvedValue("a".repeat(64)),
    });
    await controller.select();
    const pending = controller.addFiles([file()]);
    await vi.waitFor(() => expect(api.uploadBinary).toHaveBeenCalled());

    currentScope = secondScope;
    await controller.select();
    controller[finalizeDraftB]();
    finishBinary();
    await pending;

    expect(api.completeUpload).toHaveBeenCalledWith(firstScope, "attachment-1");
    expect(controller.items.value).toEqual([]);
    },
  );

  it("cancels background uploads from every draft after an authority denial", async () => {
    const api = source();
    vi.mocked(api.uploadBinary).mockImplementation(
      (_url, _file, _headers, signal) =>
        new Promise((_resolve, reject) => {
          signal?.addEventListener("abort", () => reject(new DOMException("Aborted", "AbortError")));
        }),
    );
    const firstScope: SupportAttachmentScope = {
      visibility: "PUBLIC_REPLY",
      projectId: "project-1",
      actorId: "operator-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
    };
    const secondScope: SupportAttachmentScope = { ...firstScope, conversationId: "conversation-2" };
    let currentScope = firstScope;
    const controller = createSupportAttachmentsController(api, {
      scope: () => currentScope,
      capabilities: () => capabilities,
      sha256: vi.fn().mockResolvedValue("a".repeat(64)),
    });
    await controller.select();
    const pending = controller.addFiles([file()]);
    await vi.waitFor(() => expect(api.uploadBinary).toHaveBeenCalled());

    currentScope = secondScope;
    await controller.select();
    controller.dispose();
    await pending;

    expect(api.completeUpload).not.toHaveBeenCalled();
    expect(api.revoke).toHaveBeenCalledWith(firstScope, "attachment-1");
  });

  it("revokes a READY result that resolves after the controller was disposed", async () => {
    const api = source();
    let resolveComplete!: (value: Awaited<ReturnType<SupportAttachmentsSource["completeUpload"]>>) => void;
    vi.mocked(api.completeUpload).mockReturnValue(
      new Promise((resolve) => { resolveComplete = resolve; }),
    );
    const scope: SupportAttachmentScope = {
      visibility: "PUBLIC_REPLY",
      projectId: "project-1",
      actorId: "operator-1",
      endUserId: "user-1",
      conversationId: "conversation-1",
    };
    const controller = createSupportAttachmentsController(api, {
      scope: () => scope,
      capabilities: () => capabilities,
      sha256: vi.fn().mockResolvedValue("a".repeat(64)),
    });
    await controller.select();
    const pending = controller.addFiles([file()]);
    await vi.waitFor(() => expect(api.completeUpload).toHaveBeenCalled());

    controller.dispose();
    resolveComplete({
      id: "attachment-1",
      filename: "proof.png",
      contentType: "image/png",
      sizeBytes: 3,
      state: "READY",
      canAttach: true,
      failureCode: null,
    });
    await pending;

    expect(api.revoke).toHaveBeenCalledWith(scope, "attachment-1");
    expect(controller.items.value).toEqual([]);
  });
});
