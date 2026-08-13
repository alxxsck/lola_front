import { computed, ref } from 'vue';
import { ApiError } from '@/shared/api/http/api-error';
import type {
  SupportConversationCollaborationSnapshot,
  SupportConversationCollaborationSource,
  SupportConversationCollision,
  SupportConversationTyper,
  SupportConversationViewer,
} from '../api/support-conversation-collaboration-source';

interface CollaborationContext {
  actorId(): string | undefined;
  onAccessRevoked?(): void | Promise<void>;
}

export interface SupportConversationTypingHint {
  projectId: string;
  conversationId: string;
  generation: string;
  watchGeneration: string;
  isTyping: boolean;
  expiresAt: string;
  actor: SupportConversationViewer;
}

function isNewerTyping(
  current: { watchGeneration: string; revision: string } | undefined,
  watchGeneration: string,
  revision: string,
): boolean {
  if (!current) return true;
  const nextWatch = BigInt(watchGeneration);
  const currentWatch = BigInt(current.watchGeneration);
  return (
    nextWatch > currentWatch ||
    (nextWatch === currentWatch && BigInt(revision) > BigInt(current.revision))
  );
}

export function createSupportConversationCollaborationController(
  source: SupportConversationCollaborationSource,
  context: CollaborationContext,
) {
  const viewers = ref<SupportConversationViewer[]>([]);
  const typersByActor = new Map<string, SupportConversationTyper>();
  const typingVersions = new Map<string, { watchGeneration: string; revision: string }>();
  const typers = ref<SupportConversationTyper[]>([]);
  const collision = ref<SupportConversationCollision>({ state: 'NOT_ARMED' });
  const loading = ref(false);
  const error = ref('');
  let projectId: string | undefined;
  let conversationId: string | undefined;
  let requestGeneration = 0;
  let draftBaseline: number | undefined;
  let lastViewerGeneration = 0n;
  let eventRevision = 0;
  let accessRevoked = false;
  let abort: AbortController | undefined;
  let expiryTimer: ReturnType<typeof setTimeout> | undefined;

  const otherViewers = computed(() =>
    viewers.value.filter((viewer) => viewer.cmsUserId !== context.actorId()),
  );
  const otherTypers = computed(() =>
    typers.value.filter((typer) => typer.cmsUserId !== context.actorId()),
  );

  function scheduleExpiry(): void {
    if (expiryTimer) clearTimeout(expiryTimer);
    const expiries = [
      ...viewers.value.map((item) => Date.parse(item.expiresAt)),
      ...typers.value.map((item) => Date.parse(item.expiresAt)),
    ].filter(Number.isFinite);
    if (!expiries.length) {
      expiryTimer = undefined;
      return;
    }
    const delay = Math.min(2_147_483_647, Math.max(0, Math.min(...expiries) - Date.now() + 1));
    expiryTimer = setTimeout(pruneExpired, delay);
    (expiryTimer as ReturnType<typeof setTimeout> & { unref?: () => void }).unref?.();
  }

  function pruneExpired(): void {
    const now = Date.now();
    viewers.value = viewers.value.filter((item) => Date.parse(item.expiresAt) > now);
    for (const [actorId, item] of typersByActor) {
      if (Date.parse(item.expiresAt) <= now) typersByActor.delete(actorId);
    }
    typers.value = [...typersByActor.values()];
    scheduleExpiry();
  }

  function applySnapshot(snapshot: SupportConversationCollaborationSnapshot): void {
    const snapshotGeneration = BigInt(snapshot.generation);
    if (snapshotGeneration < lastViewerGeneration) return;
    lastViewerGeneration = snapshotGeneration;
    viewers.value = snapshot.viewers;
    typersByActor.clear();
    for (const typer of snapshot.typers) {
      typersByActor.set(typer.cmsUserId, typer);
      typingVersions.set(typer.cmsUserId, {
        watchGeneration: typer.watchGeneration,
        revision: typer.revision,
      });
    }
    typers.value = [...typersByActor.values()];
    collision.value = draftBaseline === undefined ? { state: 'NOT_ARMED' } : snapshot.collision;
    pruneExpired();
  }

  async function reconcile(): Promise<void> {
    const expectedProjectId = projectId;
    const expectedConversationId = conversationId;
    if (!expectedProjectId || !expectedConversationId || accessRevoked) return;
    const generation = ++requestGeneration;
    const expectedEventRevision = eventRevision;
    abort?.abort();
    abort = new AbortController();
    const requestAbort = abort;
    loading.value = true;
    error.value = '';
    try {
      const snapshot = await source.read(
        expectedProjectId,
        expectedConversationId,
        draftBaseline,
        requestAbort.signal,
      );
      if (
        generation !== requestGeneration ||
        expectedProjectId !== projectId ||
        expectedConversationId !== conversationId
      )
        return;
      if (expectedEventRevision === eventRevision) applySnapshot(snapshot);
      else if (draftBaseline !== undefined) collision.value = snapshot.collision;
    } catch (cause) {
      if (generation !== requestGeneration || requestAbort.signal.aborted) return;
      if (cause instanceof ApiError && [401, 403, 404].includes(cause.status)) {
        accessRevoked = true;
        purgeProjection();
        void context.onAccessRevoked?.();
      }
      error.value =
        cause instanceof Error ? cause.message : 'Не удалось обновить совместную работу';
    } finally {
      if (generation === requestGeneration) loading.value = false;
    }
  }

  async function select(
    nextProjectId: string | undefined,
    nextConversationId: string | undefined,
  ): Promise<void> {
    if (projectId === nextProjectId && conversationId === nextConversationId) return;
    reset();
    projectId = nextProjectId;
    conversationId = nextConversationId;
    accessRevoked = false;
    if (projectId && conversationId) await reconcile();
  }

  function setDraftActive(active: boolean, currentMessageOrdinal: number): void {
    if (active && draftBaseline === undefined) draftBaseline = currentMessageOrdinal;
    if (!active) {
      draftBaseline = undefined;
      collision.value = { state: 'NOT_ARMED' };
    }
  }

  function applyTypingHint(value: SupportConversationTypingHint): void {
    if (accessRevoked) return;
    if (value.projectId !== projectId || value.conversationId !== conversationId) return;
    const actorId = value.actor.cmsUserId;
    const current = typingVersions.get(actorId);
    if (!isNewerTyping(current, value.watchGeneration, value.generation)) return;
    typingVersions.set(actorId, {
      watchGeneration: value.watchGeneration,
      revision: value.generation,
    });
    if (value.isTyping) {
      typersByActor.set(actorId, {
        cmsUserId: actorId,
        displayName: value.actor.displayName,
        watchGeneration: value.watchGeneration,
        revision: value.generation,
        expiresAt: value.expiresAt,
      });
    } else typersByActor.delete(actorId);
    eventRevision += 1;
    typers.value = [...typersByActor.values()];
    pruneExpired();
  }

  function applyViewers(
    nextProjectId: string,
    nextConversationId: string,
    generation: string,
    next: SupportConversationViewer[],
  ): void {
    if (accessRevoked) return;
    if (nextProjectId !== projectId || nextConversationId !== conversationId) return;
    const nextGeneration = BigInt(generation);
    if (nextGeneration <= lastViewerGeneration) return;
    lastViewerGeneration = nextGeneration;
    eventRevision += 1;
    viewers.value = next;
    pruneExpired();
  }

  function revoke(nextProjectId: string, nextConversationId: string): void {
    if (nextProjectId !== projectId || nextConversationId !== conversationId) return;
    reset();
  }

  function purgeProjection(): void {
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = undefined;
    viewers.value = [];
    typersByActor.clear();
    typingVersions.clear();
    typers.value = [];
    collision.value = { state: 'NOT_ARMED' };
    draftBaseline = undefined;
  }

  function reset(): void {
    requestGeneration += 1;
    abort?.abort();
    abort = undefined;
    if (expiryTimer) clearTimeout(expiryTimer);
    expiryTimer = undefined;
    projectId = undefined;
    conversationId = undefined;
    accessRevoked = false;
    draftBaseline = undefined;
    lastViewerGeneration = 0n;
    purgeProjection();
    loading.value = false;
    error.value = '';
  }

  return {
    viewers: otherViewers,
    typers: otherTypers,
    collision,
    loading,
    error,
    select,
    reconcile,
    setDraftActive,
    applyTypingHint,
    applyViewers,
    revoke,
    reset,
  };
}
