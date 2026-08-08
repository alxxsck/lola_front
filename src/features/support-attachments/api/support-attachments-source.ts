import {
  adminChatAttachmentCompleteUpload,
  adminChatAttachmentGrantDownload,
  adminChatAttachmentListDraft,
  adminChatAttachmentRevoke,
  adminChatAttachmentStartUpload,
  adminChatAttachmentStatus,
  supportInternalNoteAttachmentCompleteUpload,
  supportInternalNoteAttachmentGrantDownload,
  supportInternalNoteAttachmentListDraft,
  supportInternalNoteAttachmentRevoke,
  supportInternalNoteAttachmentStartUpload,
  supportInternalNoteAttachmentStatus,
} from "@/shared/api/generated/retenive-backend";
import type {
  ChatAttachmentStatusResponseDto,
  SupportInternalNoteAttachmentStatusResponseDto,
} from "@/shared/api/generated/models";
import { normalizeApiError } from "@/shared/api/http/api-error";
import { isMockMode } from "@/shared/config/data-mode";

export type SupportAttachmentScope =
  | {
      visibility: "PUBLIC_REPLY";
      projectId: string;
      actorId: string;
      endUserId: string;
      conversationId: string;
    }
  | {
      visibility: "INTERNAL_NOTE";
      projectId: string;
      actorId: string;
      caseId: string;
    };

export type SupportAttachmentServerState =
  | "UPLOADING"
  | "SCANNING"
  | "READY"
  | "REJECTED"
  | "FAILED"
  | "EXPIRED"
  | "REVOKED";

export interface SupportAttachmentStatus {
  id: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  state: SupportAttachmentServerState;
  canAttach: boolean;
  failureCode: string | null;
}

export interface SupportAttachmentUploadIntent {
  id: string;
  uploadUrl: string;
  requiredHeaders: Record<string, string>;
}

export interface SupportAttachmentsSource {
  listDraft(
    scope: SupportAttachmentScope,
    draftKey: string,
    signal?: AbortSignal,
  ): Promise<SupportAttachmentStatus[]>;
  startUpload(
    scope: SupportAttachmentScope,
    input: {
      draftKey: string;
      filename: string;
      contentType: string;
      sizeBytes: number;
      checksumSha256: string;
    },
    idempotencyKey: string,
  ): Promise<SupportAttachmentUploadIntent>;
  uploadBinary(
    url: string,
    file: File,
    headers: Record<string, string>,
    signal?: AbortSignal,
  ): Promise<void>;
  completeUpload(
    scope: SupportAttachmentScope,
    attachmentId: string,
  ): Promise<SupportAttachmentStatus>;
  status(
    scope: SupportAttachmentScope,
    attachmentId: string,
    signal?: AbortSignal,
  ): Promise<SupportAttachmentStatus>;
  revoke(
    scope: SupportAttachmentScope,
    attachmentId: string,
  ): Promise<void>;
  grantDownload(
    scope: SupportAttachmentScope,
    attachmentId: string,
  ): Promise<{ url: string; expiresAt: string }>;
}

function status(
  value:
    | ChatAttachmentStatusResponseDto
    | SupportInternalNoteAttachmentStatusResponseDto,
): SupportAttachmentStatus {
  return {
    id: value.id,
    filename: value.displayFilename,
    contentType: value.contentType,
    sizeBytes: value.sizeBytes,
    state: value.state,
    canAttach: value.canAttach,
    failureCode: value.failureCode,
  };
}

function publicParams(scope: Extract<SupportAttachmentScope, { visibility: "PUBLIC_REPLY" }>) {
  return { conversationId: scope.conversationId };
}

const apiSource: SupportAttachmentsSource = {
  async listDraft(scope, draftKey, signal) {
    try {
      if (scope.visibility === "PUBLIC_REPLY") {
        const response = await adminChatAttachmentListDraft(
          scope.projectId,
          scope.endUserId,
          draftKey,
          publicParams(scope),
          { signal },
        );
        return response.items.map(status);
      }
      const response = await supportInternalNoteAttachmentListDraft(
        scope.projectId,
        scope.caseId,
        draftKey,
        { signal },
      );
      return response.items.map(status);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async startUpload(scope, input, idempotencyKey) {
    try {
      const options = { headers: { "Idempotency-Key": idempotencyKey } };
      const response =
        scope.visibility === "PUBLIC_REPLY"
          ? await adminChatAttachmentStartUpload(
              scope.projectId,
              scope.endUserId,
              {
                conversationId: scope.conversationId,
                draftKey: input.draftKey,
                displayFilename: input.filename,
                contentType: input.contentType as never,
                sizeBytes: input.sizeBytes,
                checksumSha256: input.checksumSha256,
              },
              options,
            )
          : await supportInternalNoteAttachmentStartUpload(
              scope.projectId,
              scope.caseId,
              {
                draftKey: input.draftKey,
                displayFilename: input.filename,
                contentType: input.contentType as never,
                sizeBytes: input.sizeBytes,
                checksumSha256: input.checksumSha256,
              },
              options,
            );
      return {
        id: response.id,
        uploadUrl: response.uploadUrl,
        requiredHeaders: Object.fromEntries(
          Object.entries(response.requiredHeaders).flatMap(([key, value]) =>
            typeof value === "string" ? [[key, value]] : [],
          ),
        ),
      };
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async uploadBinary(url, file, headers, signal) {
    const response = await fetch(url, {
      method: "PUT",
      body: file,
      headers,
      signal,
    });
    if (!response.ok) throw new Error(`Attachment upload failed (${response.status})`);
  },
  async completeUpload(scope, attachmentId) {
    try {
      const response =
        scope.visibility === "PUBLIC_REPLY"
          ? await adminChatAttachmentCompleteUpload(
              scope.projectId,
              scope.endUserId,
              attachmentId,
              publicParams(scope),
            )
          : await supportInternalNoteAttachmentCompleteUpload(
              scope.projectId,
              scope.caseId,
              attachmentId,
            );
      return status(response);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async status(scope, attachmentId, signal) {
    try {
      const response =
        scope.visibility === "PUBLIC_REPLY"
          ? await adminChatAttachmentStatus(
              scope.projectId,
              scope.endUserId,
              attachmentId,
              publicParams(scope),
              { signal },
            )
          : await supportInternalNoteAttachmentStatus(
              scope.projectId,
              scope.caseId,
              attachmentId,
              { signal },
            );
      return status(response);
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async revoke(scope, attachmentId) {
    try {
      if (scope.visibility === "PUBLIC_REPLY")
        await adminChatAttachmentRevoke(
          scope.projectId,
          scope.endUserId,
          attachmentId,
          publicParams(scope),
        );
      else
        await supportInternalNoteAttachmentRevoke(
          scope.projectId,
          scope.caseId,
          attachmentId,
        );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
  async grantDownload(scope, attachmentId) {
    try {
      return scope.visibility === "PUBLIC_REPLY"
        ? await adminChatAttachmentGrantDownload(
            scope.projectId,
            scope.endUserId,
            attachmentId,
            publicParams(scope),
          )
        : await supportInternalNoteAttachmentGrantDownload(
            scope.projectId,
            scope.caseId,
            attachmentId,
          );
    } catch (cause) {
      throw normalizeApiError(cause);
    }
  },
};

const mockItems = new Map<string, SupportAttachmentStatus>();
const mockDrafts = new Map<string, string[]>();
function mockScope(scope: SupportAttachmentScope, draftKey: string): string {
  return scope.visibility === "PUBLIC_REPLY"
    ? `${scope.projectId}:${scope.conversationId}:${draftKey}`
    : `${scope.projectId}:${scope.caseId}:${draftKey}`;
}
const mockSource: SupportAttachmentsSource = {
  async listDraft(scope, draftKey) {
    return (mockDrafts.get(mockScope(scope, draftKey)) ?? []).flatMap((id) => {
      const item = mockItems.get(id);
      return item ? [item] : [];
    });
  },
  async startUpload(scope, input) {
    const id = globalThis.crypto.randomUUID();
    mockItems.set(id, {
      id,
      filename: input.filename,
      contentType: input.contentType,
      sizeBytes: input.sizeBytes,
      state: "UPLOADING",
      canAttach: false,
      failureCode: null,
    });
    const key = mockScope(scope, input.draftKey);
    mockDrafts.set(key, [...(mockDrafts.get(key) ?? []), id]);
    return { id, uploadUrl: `mock://attachments/${id}`, requiredHeaders: {} };
  },
  async uploadBinary() {},
  async completeUpload(_scope, attachmentId) {
    const current = mockItems.get(attachmentId);
    if (!current) throw new Error("Mock attachment not found");
    const ready = { ...current, state: "READY" as const, canAttach: true };
    mockItems.set(attachmentId, ready);
    return ready;
  },
  async status(_scope, attachmentId) {
    const current = mockItems.get(attachmentId);
    if (!current) throw new Error("Mock attachment not found");
    return current;
  },
  async revoke(_scope, attachmentId) {
    const current = mockItems.get(attachmentId);
    if (current)
      mockItems.set(attachmentId, {
        ...current,
        state: "REVOKED",
        canAttach: false,
      });
  },
  async grantDownload() {
    return { url: "about:blank", expiresAt: new Date(Date.now() + 60_000).toISOString() };
  },
};

export const supportAttachmentsSource = isMockMode ? mockSource : apiSource;
