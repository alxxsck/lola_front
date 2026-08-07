export interface ConversationSurfaceScrollAnchor {
  messageId: string;
  offset: number;
  atLatest: boolean;
}

const anchors = new Map<string, ConversationSurfaceScrollAnchor>();
const MAX_ANCHORS = 100;
const SEPARATOR = "\u001f";

export function conversationSurfaceSessionKey(scope: {
  projectId: string;
  actorId: string;
  conversationId: string;
}): string {
  return [scope.projectId, scope.actorId, scope.conversationId].join(SEPARATOR);
}

export function readConversationSurfaceScrollAnchor(
  key: string,
): ConversationSurfaceScrollAnchor | undefined {
  const anchor = anchors.get(key);
  if (!anchor) return undefined;
  anchors.delete(key);
  anchors.set(key, anchor);
  return { ...anchor };
}

export function writeConversationSurfaceScrollAnchor(
  key: string,
  anchor: ConversationSurfaceScrollAnchor,
): void {
  anchors.delete(key);
  anchors.set(key, { ...anchor });
  while (anchors.size > MAX_ANCHORS) {
    const oldest = anchors.keys().next().value as string | undefined;
    if (!oldest) break;
    anchors.delete(oldest);
  }
}

export function clearConversationSurfaceProjectSession(
  projectId: string,
): void {
  const prefix = `${projectId}${SEPARATOR}`;
  for (const key of anchors.keys()) {
    if (key.startsWith(prefix)) anchors.delete(key);
  }
}
