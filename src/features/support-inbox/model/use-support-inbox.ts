import { ref } from "vue";
import type {
  SupportWorkspaceConversation,
  SupportWorkspaceSource,
} from "@/features/support-workspace/api/support-workspace-source";

export type SupportInboxSource = Pick<
  SupportWorkspaceSource,
  "readConversations"
>;

export interface SupportInboxContext {
  projectId(): string | undefined;
}

/**
 * Owns project-scoped inbox loading and prevents a stale request from writing
 * into a newly selected project/workspace.
 */
export function createSupportInboxController(
  context: SupportInboxContext,
  source: SupportInboxSource,
) {
  const items = ref<SupportWorkspaceConversation[]>([]);
  const nextCursor = ref<string | null>(null);
  const loading = ref(false);
  const error = ref("");
  let generation = 0;

  function reset(): void {
    generation += 1;
    items.value = [];
    nextCursor.value = null;
    loading.value = false;
    error.value = "";
  }

  function append(pageItems: readonly SupportWorkspaceConversation[]): void {
    const knownIds = new Set(items.value.map((item) => item.id));
    const unseen = pageItems.filter((item) => !knownIds.has(item.id));
    if (unseen.length) items.value = [...items.value, ...unseen];
  }

  function upsert(item: SupportWorkspaceConversation): void {
    const index = items.value.findIndex((current) => current.id === item.id);
    if (index === -1) {
      items.value = [...items.value, item];
      return;
    }
    const next = [...items.value];
    next[index] = item;
    items.value = next;
  }

  async function load(): Promise<void> {
    const projectId = context.projectId();
    const requestGeneration = ++generation;
    if (!projectId) {
      reset();
      return;
    }
    loading.value = true;
    error.value = "";
    try {
      const page = await source.readConversations(projectId, {
        limit: 30,
      });
      if (requestGeneration !== generation) return;
      items.value = page.items;
      nextCursor.value = page.nextCursor;
    } catch {
      if (requestGeneration !== generation) return;
      error.value = "Не удалось загрузить список диалогов";
    } finally {
      if (requestGeneration === generation) loading.value = false;
    }
  }

  async function loadMore(): Promise<void> {
    const projectId = context.projectId();
    const cursor = nextCursor.value;
    if (!projectId || !cursor || loading.value) return;
    const requestGeneration = ++generation;
    loading.value = true;
    error.value = "";
    try {
      const page = await source.readConversations(projectId, { cursor, limit: 30 });
      if (requestGeneration !== generation) return;
      append(page.items);
      nextCursor.value = page.nextCursor;
    } catch {
      if (requestGeneration !== generation) return;
      error.value = "Не удалось загрузить следующую страницу диалогов";
    } finally {
      if (requestGeneration === generation) loading.value = false;
    }
  }

  return { items, nextCursor, loading, error, load, loadMore, upsert, reset };
}
