import { describe, expect, it, vi } from "vitest";
import type { SupportWorkspaceConversation } from "@/features/support-workspace/api/support-workspace-source";
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

describe("support inbox controller", () => {
  it("does not commit a page that resolves after the workspace was reset", async () => {
    let resolvePage: (value: { items: []; nextCursor: null }) => void = () => {
      throw new Error("The inbox request did not start");
    };
    const source = {
      readConversations: vi.fn(
        () =>
          new Promise<{ items: []; nextCursor: null }>((resolve) => {
            resolvePage = resolve;
          }),
      ),
    };
    const controller = createSupportInboxController(
      { projectId: () => "project-1" },
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
      { projectId: () => "project-1" },
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
});
