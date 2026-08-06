import { describe, expect, it, vi } from "vitest";
import { createSupportInboxController } from "./use-support-inbox";

describe("support inbox controller", () => {
  it("does not commit a page that resolves after the workspace was reset", async () => {
    let resolvePage: (value: { items: []; nextCursor: null }) => void = () => {
      throw new Error("The inbox request did not start");
    };
    const source = {
      getProjectConversations: vi.fn(
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
});
