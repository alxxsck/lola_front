import { ref } from "vue";
import type {
  SupportWorkspaceCaseRow,
  SupportWorkspaceSource,
} from "@/features/support-workspace/api/support-workspace-source";

export type SupportCaseInboxSource = Pick<SupportWorkspaceSource, "readCases">;

export interface SupportCaseInboxContext {
  projectId(): string | undefined;
}

/** Keeps the Cases view independent from the Conversations cursor and state. */
export function createSupportCaseInboxController(
  context: SupportCaseInboxContext,
  source: SupportCaseInboxSource,
) {
  const items = ref<SupportWorkspaceCaseRow[]>([]);
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
      const page = await source.readCases(projectId, { limit: 30 });
      if (requestGeneration !== generation) return;
      items.value = page.items;
      nextCursor.value = page.nextCursor;
    } catch {
      if (requestGeneration !== generation) return;
      error.value = "Не удалось загрузить список обращений";
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
      const page = await source.readCases(projectId, { cursor, limit: 30 });
      if (requestGeneration !== generation) return;
      const known = new Set(items.value.map((item) => item.id));
      items.value = [
        ...items.value,
        ...page.items.filter((item) => !known.has(item.id)),
      ];
      nextCursor.value = page.nextCursor;
    } catch {
      if (requestGeneration !== generation) return;
      error.value = "Не удалось загрузить следующую страницу обращений";
    } finally {
      if (requestGeneration === generation) loading.value = false;
    }
  }

  return { items, nextCursor, loading, error, load, loadMore, reset };
}
