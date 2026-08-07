import { beforeEach, describe, expect, it } from "vitest";
import {
  clearConversationSurfaceProjectSession,
  conversationSurfaceSessionKey,
  readConversationSurfaceScrollAnchor,
  writeConversationSurfaceScrollAnchor,
} from "./conversation-surface-session";

describe("conversation surface session", () => {
  beforeEach(() => {
    clearConversationSurfaceProjectSession("project-a");
  });

  it("rejects a late anchor write from an invalidated project surface", () => {
    const staleKey = conversationSurfaceSessionKey({
      projectId: "project-a",
      actorId: "operator-1",
      conversationId: "conversation-1",
    });

    clearConversationSurfaceProjectSession("project-a");
    writeConversationSurfaceScrollAnchor(staleKey, {
      messageId: "sensitive-message",
      offset: 12,
      atLatest: false,
    });

    const currentKey = conversationSurfaceSessionKey({
      projectId: "project-a",
      actorId: "operator-1",
      conversationId: "conversation-1",
    });
    expect(readConversationSurfaceScrollAnchor(currentKey)).toBeUndefined();
  });
});
