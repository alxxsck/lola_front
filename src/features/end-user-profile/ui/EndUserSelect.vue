<script setup lang="ts">
import { ref, watch } from "vue";
import { endUserProfileRepository } from "@/features/end-user-profile/api/end-user-profile-repository";
import { repository } from "@/shared/api/repository";
import { isMockMode } from "@/shared/config/data-mode";
import { paginateByCursor } from "@/shared/lib/paged-search";
import PagedSearchSelect, {
  type PagedSearchOption,
  type PagedSearchPage,
  type PagedSearchRequest,
} from "@/shared/ui/PagedSearchSelect.vue";

const props = defineProps<{
  projectId: string;
  modelValue: string;
  disabled?: boolean;
}>();

const emit = defineEmits<{
  "update:modelValue": [value: string];
}>();
const selectedOption = ref<PagedSearchOption>();

watch(
  () => [props.projectId, props.modelValue] as const,
  async ([projectId, modelValue]) => {
    selectedOption.value = undefined;
    if (!projectId || !modelValue) return;
    try {
      const option = await loadSelectedOption(projectId, modelValue);
      if (projectId === props.projectId && modelValue === props.modelValue)
        selectedOption.value = option;
    } catch {
      // The selected user can still be changed through the searchable list.
    }
  },
  { immediate: true },
);

async function load(input: PagedSearchRequest): Promise<PagedSearchPage> {
  if (isMockMode) return loadMock(input);
  const query = input.query.trim();
  if (query) {
    const user = await endUserProfileRepository.profile(props.projectId, query);
    return {
      items: [
        {
          value: user.endUserId,
          label: `Пользователь · ${user.endUserId.slice(0, 8)}`,
        },
      ],
      nextCursor: null,
    };
  }
  const response = await endUserProfileRepository.list(props.projectId, {
    limit: input.limit,
    ...(input.cursor ? { cursor: input.cursor } : {}),
  });
  return {
    items: response.items.map((user) => ({
      value: user.endUserId,
      label: `Пользователь · ${user.endUserId.slice(0, 8)}`,
      description: user.locale ?? undefined,
    })),
    nextCursor: response.nextCursor ?? null,
  };
}

async function loadMock(input: PagedSearchRequest): Promise<PagedSearchPage> {
  const response = await repository.getUsersPage(props.projectId, {
    limit: 100,
  });
  const query = input.query.toLocaleLowerCase("ru-RU");
  const filtered = response.items.filter(
    (user) =>
      !query || user.externalId.toLocaleLowerCase("ru-RU").includes(query),
  );
  const page = paginateByCursor(filtered, input.cursor, input.limit);
  return {
    items: page.items.map((user) => ({
      value: user.id,
      label: user.externalId,
      description: user.locale ?? undefined,
    })),
    nextCursor: page.nextCursor,
  };
}

async function loadSelectedOption(
  projectId: string,
  endUserId: string,
): Promise<PagedSearchOption | undefined> {
  if (isMockMode) {
    const response = await repository.getUsersPage(projectId, { limit: 100 });
    const user = response.items.find((candidate) => candidate.id === endUserId);
    return user
      ? {
          value: user.id,
          label: user.externalId,
          description: user.locale ?? undefined,
        }
      : undefined;
  }
  const user = await endUserProfileRepository.profile(projectId, endUserId);
  return {
    value: endUserId,
    label: `Пользователь · ${user.endUserId.slice(0, 8)}`,
  };
}
</script>

<template>
  <PagedSearchSelect
    :model-value="modelValue"
    :reload-key="projectId"
    :load="load"
    :selected-option="selectedOption"
    :disabled="disabled"
    label="Пользователь"
    placeholder="Найдите и выберите пользователя"
    search-placeholder="Введите точный внутренний ID"
    empty-text="Пользователи не найдены"
    @update:model-value="emit('update:modelValue', $event)"
  />
</template>
