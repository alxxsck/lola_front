import { onMounted, ref, type Ref } from "vue";

function message(cause: unknown, fallback: string): string {
  return cause instanceof Error ? cause.message : fallback;
}

export function useSettingsResource<T>(
  loadResource: () => Promise<T>,
  loadError: string,
): {
  resource: Ref<T | null>;
  loading: Ref<boolean>;
  saving: Ref<boolean>;
  error: Ref<string>;
  reload: () => Promise<void>;
  save: (
    operation: () => Promise<T>,
    fallback: string,
  ) => Promise<T | undefined>;
} {
  const resource = ref<T | null>(null) as Ref<T | null>;
  const loading = ref(true);
  const saving = ref(false);
  const error = ref("");

  async function reload(): Promise<void> {
    loading.value = true;
    error.value = "";
    try {
      resource.value = await loadResource();
    } catch (cause) {
      error.value = message(cause, loadError);
    } finally {
      loading.value = false;
    }
  }

  async function save(
    operation: () => Promise<T>,
    fallback: string,
  ): Promise<T | undefined> {
    saving.value = true;
    error.value = "";
    try {
      const saved = await operation();
      resource.value = saved;
      return saved;
    } catch (cause) {
      error.value = message(cause, fallback);
      return undefined;
    } finally {
      saving.value = false;
    }
  }

  onMounted(reload);
  return { resource, loading, saving, error, reload, save };
}
