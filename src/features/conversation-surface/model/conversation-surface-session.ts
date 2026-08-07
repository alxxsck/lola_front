export interface ConversationSurfaceScrollAnchor {
  messageId: string;
  offset: number;
  atLatest: boolean;
}

const anchors = new Map<string, ConversationSurfaceScrollAnchor>();
const projectGenerations = new Map<string, number>();
const MAX_ANCHORS = 100;
const SEPARATOR = "\u001f";

function currentProjectGeneration(projectId: string): number {
  return projectGenerations.get(projectId) ?? 0;
}

function isCurrentSessionKey(key: string): boolean {
  const [projectId, generation] = key.split(SEPARATOR, 2);
  if (!projectId) return false;
  return generation === String(currentProjectGeneration(projectId));
}

export function conversationSurfaceSessionKey(scope: {
  projectId: string;
  actorId: string;
  conversationId: string;
}): string {
  return [
    scope.projectId,
    currentProjectGeneration(scope.projectId),
    scope.actorId,
    scope.conversationId,
  ].join(SEPARATOR);
}

export function readConversationSurfaceScrollAnchor(
  key: string,
): ConversationSurfaceScrollAnchor | undefined {
  if (!isCurrentSessionKey(key)) return undefined;
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
  if (!isCurrentSessionKey(key)) return;
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
  projectGenerations.set(projectId, currentProjectGeneration(projectId) + 1);
}
