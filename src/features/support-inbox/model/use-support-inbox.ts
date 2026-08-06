import { ref } from "vue";
import type {
  CursorPage,
  CursorPageRequest,
} from "@/shared/api/repository/contracts";
import type { SupportInboxConversation } from "@/shared/types/domain";

export interface SupportInboxSource {
  getProjectConversations(
    projectId: string,
    request?: CursorPageRequest,
  ): Promise<CursorPage<SupportInboxConversation>>;
}

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
  const items = ref<SupportInboxConversation[]>([]);
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
      const page = await source.getProjectConversations(projectId, {
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

  return { items, nextCursor, loading, error, load, reset };
}
