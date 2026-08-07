import { describe, expect, it, vi } from "vitest";
import { ApiError } from "@/shared/api/http/api-error";
import type {
  SupportInboxMode,
  SupportWorkspaceCaseRow,
  SupportWorkspaceConversation,
} from "@/features/support-workspace/api/support-workspace-source";
import { createSupportInboxController } from "./use-support-inbox";

function conversation(id: string): SupportWorkspaceConversation {
  return {
    id,
    endUserId: `user-${id}`,
    title: id,
    status: "OPEN",
    createdAt: "2026-08-06T10:00:00.000Z",
    updatedAt: "2026-08-06T10:00:00.000Z",
    messageCount: 1,
    isCurrent: true,
    currentInteractionSessionCount: 0,
    lastMessageAt: null,
  };
}

function supportCase(id: string): SupportWorkspaceCaseRow {
  return {
    id,
    endUserId: `user-${id}`,
    projectSequence: id,
    title: `Case ${id}`,
    status: "OPEN",
    priority: "NORMAL",
    groupCode: "GENERAL",
    attentionRequired: false,
    lastActivityAt: "2026-08-06T10:00:00.000Z",
    updatedAt: "2026-08-06T10:00:00.000Z",
    version: 1,
  };
}

describe("support inbox controller", () => {
  it("does not commit a page that resolves after the workspace was reset", async () => {
    let resolvePage: (value: { items: []; nextCursor: null }) => void = () => {
      throw new Error("The inbox request did not start");
    };
    const source = {
      readCases: vi.fn(
        () =>
          new Promise<{ items: SupportWorkspaceCaseRow[]; nextCursor: null }>(
            (resolve) => {
              resolvePage = resolve;
            },
          ),
      ),
      readConversations: vi.fn(),
    };
    const mode: SupportInboxMode = "CASES";
    const controller = createSupportInboxController(
      { projectId: () => "project-1", mode: () => mode },
      source,
    );

    const pending = controller.load();
    controller.reset();
    resolvePage({ items: [], nextCursor: null });
    await pending;

    expect(controller.items.value).toEqual([]);
    expect(controller.loading.value).toBe(false);
    expect(controller.nextCursor.value).toBeNull();
  });

  it("appends the next cursor page without duplicate conversations", async () => {
    const source = {
      readCases: vi.fn(),
      readConversations: vi
        .fn()
        .mockResolvedValueOnce({
          items: [conversation("one"), conversation("two")],
          nextCursor: "cursor-2",
        })
        .mockResolvedValueOnce({
          items: [conversation("two"), conversation("three")],
          nextCursor: null,
        }),
    };
    const controller = createSupportInboxController(
      { projectId: () => "project-1", mode: () => "ALL_CONVERSATIONS" },
      source,
    );

    await controller.load();
    await controller.loadMore();

    expect(source.readConversations).toHaveBeenNthCalledWith(1, "project-1", {
      limit: 30,
    });
    expect(source.readConversations).toHaveBeenNthCalledWith(2, "project-1", {
      cursor: "cursor-2",
      limit: 30,
    });
    expect(controller.items.value.map((item) => item.id)).toEqual([
      "one",
      "two",
      "three",
    ]);
    expect(controller.nextCursor.value).toBeNull();
  });

  it("keeps Case and Conversation cursor pages scoped to the active mode", async () => {
    let mode: SupportInboxMode = "CASES";
    const source = {
      readCases: vi.fn().mockResolvedValue({
        items: [supportCase("42")],
        nextCursor: "cases-next",
      }),
      readConversations: vi.fn().mockResolvedValue({
        items: [conversation("conversation-1")],
        nextCursor: "conversations-next",
      }),
    };
    const controller = createSupportInboxController(
      { projectId: () => "project-1", mode: () => mode },
      source,
    );

    await controller.load();
    expect(controller.items.value).toEqual([
      expect.objectContaining({ kind: "CASE", id: "42" }),
    ]);
    expect(source.readCases).toHaveBeenCalledWith("project-1", { limit: 30 });

    mode = "ALL_CONVERSATIONS";
    await controller.load();
    expect(controller.items.value).toEqual([
      expect.objectContaining({ kind: "CONVERSATION", id: "conversation-1" }),
    ]);
    expect(source.readConversations).toHaveBeenCalledWith("project-1", {
      limit: 30,
    });
  });

  it("ignores a Case page that resolves after mode changed to Conversations", async () => {
    let mode: SupportInboxMode = "CASES";
    let resolveCases!: (value: {
      items: SupportWorkspaceCaseRow[];
      nextCursor: null;
    }) => void;
    const source = {
      readCases: vi.fn(
        () =>
          new Promise<{ items: SupportWorkspaceCaseRow[]; nextCursor: null }>(
            (resolve) => {
              resolveCases = resolve;
            },
          ),
      ),
      readConversations: vi.fn().mockResolvedValue({
        items: [conversation("conversation-1")],
        nextCursor: null,
      }),
    };
    const controller = createSupportInboxController(
      { projectId: () => "project-1", mode: () => mode },
      source,
    );

    const stale = controller.load();
    mode = "ALL_CONVERSATIONS";
    await controller.load();
    resolveCases({ items: [supportCase("42")], nextCursor: null });
    await stale;

    expect(controller.items.value).toEqual([
      expect.objectContaining({ kind: "CONVERSATION", id: "conversation-1" }),
    ]);
  });

  it("keeps loaded rows when the next cursor page fails", async () => {
    const source = {
      readCases: vi.fn(),
      readConversations: vi
        .fn()
        .mockResolvedValueOnce({
          items: [conversation("conversation-1")],
          nextCursor: "next-page",
        })
        .mockRejectedValueOnce(new Error("network")),
    };
    const controller = createSupportInboxController(
      { projectId: () => "project-1", mode: () => "ALL_CONVERSATIONS" },
      source,
    );

    await controller.load();
    await controller.loadMore();

    expect(controller.items.value).toEqual([
      expect.objectContaining({ id: "conversation-1" }),
    ]);
    expect(controller.error.value).toBe(
      "Не удалось загрузить следующую страницу диалогов",
    );
    expect(controller.nextCursor.value).toBe("next-page");
  });

  it("purges loaded rows and refreshes authority after a forbidden response", async () => {
    const onForbidden = vi.fn();
    const source = {
      readCases: vi.fn(),
      readConversations: vi
        .fn()
        .mockResolvedValueOnce({
          items: [conversation("conversation-1")],
          nextCursor: "next-page",
        })
        .mockRejectedValueOnce(new ApiError(403, "Forbidden")),
    };
    const controller = createSupportInboxController(
      {
        projectId: () => "project-1",
        mode: () => "ALL_CONVERSATIONS",
        onForbidden,
      },
      source,
    );

    await controller.load();
    await controller.load();

    expect(controller.items.value).toEqual([]);
    expect(controller.nextCursor.value).toBeNull();
    expect(controller.failure.value).toBe("FORBIDDEN");
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it("purges loaded rows when pagination loses target authority", async () => {
    const onForbidden = vi.fn();
    const source = {
      readCases: vi.fn(),
      readConversations: vi
        .fn()
        .mockResolvedValueOnce({
          items: [conversation("conversation-1")],
          nextCursor: "next-page",
        })
        .mockRejectedValueOnce(new ApiError(404, "Concealed")),
    };
    const controller = createSupportInboxController(
      {
        projectId: () => "project-1",
        mode: () => "ALL_CONVERSATIONS",
        onForbidden,
      },
      source,
    );

    await controller.load();
    await controller.loadMore();

    expect(controller.items.value).toEqual([]);
    expect(controller.nextCursor.value).toBeNull();
    expect(controller.failure.value).toBe("FORBIDDEN");
    expect(onForbidden).toHaveBeenCalledOnce();
  });

  it("retains authorized rows for a recoverable server conflict", async () => {
    const source = {
      readCases: vi.fn(),
      readConversations: vi
        .fn()
        .mockResolvedValueOnce({
          items: [conversation("conversation-1")],
          nextCursor: null,
        })
        .mockRejectedValueOnce(new ApiError(409, "Conflict")),
    };
    const controller = createSupportInboxController(
      { projectId: () => "project-1", mode: () => "ALL_CONVERSATIONS" },
      source,
    );

    await controller.load();
    await controller.load();

    expect(controller.items.value).toHaveLength(1);
    expect(controller.failure.value).toBe("CONFLICT");
  });
});
